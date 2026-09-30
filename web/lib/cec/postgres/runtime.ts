import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient, QueryResult } from 'pg';
import { createPostgresPool, postgresTransaction } from './connection';
import { schemaIdentifier } from './migrate';
import tables from './schema-tables';

type Context = { client: PoolClient; depth: number };
const context = new AsyncLocalStorage<Context>();
let pool: ReturnType<typeof createPostgresPool> | undefined;
export function usesPostgres() { return process.env.CEC_STORAGE === 'postgres'; }
let sqliteTail = Promise.resolve();
/** One club, serialized transactions: retains the existing SQLite single-writer
 * contract across serverless instances. The lock is transaction-scoped for pooling.
 * Remove this coarse lock only after replacing each read/check/write with row locks.
 */
export async function databaseRequest<T>(work: () => Promise<T>): Promise<T> {
  if (context.getStore()) return work();
  if (!usesPostgres()) {
    const previous = sqliteTail; let release!: () => void;
    sqliteTail = new Promise<void>(r => { release = r; });
    await previous; try { return await work(); } finally { release(); }
  }
  pool ||= createPostgresPool();
  const schema = process.env.CEC_POSTGRES_SCHEMA || 'club_os';
  const quoted = schemaIdentifier(schema);
  return postgresTransaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['club-os-runtime:' + schema]);
    await client.query(`SET LOCAL search_path TO ${quoted}, pg_catalog`);
    return context.run({ client, depth: 0 }, work);
  });
}
export async function postgresSavepoint<T>(work: () => T | Promise<T>): Promise<T> {
  const state = context.getStore();
  if (!state) return databaseRequest(() => postgresSavepoint(work));
  const savepoint = 'cec_nested_' + state.depth++;
  await state.client.query('SAVEPOINT ' + savepoint);
  try { const result = await work(); await state.client.query('RELEASE SAVEPOINT ' + savepoint); return result; }
  catch(error) { await state.client.query('ROLLBACK TO SAVEPOINT ' + savepoint); await state.client.query('RELEASE SAVEPOINT ' + savepoint); throw error; }
  finally { state.depth--; }
}
export function translatePostgresSQL(sql: string) {
  let i = 0, quoted = false, result = '';
  for (let p = 0; p < sql.length; p++) {
    const ch = sql[p];
    if (ch === "'") { if (quoted && sql[p+1] === "'") { result += "''"; p++; continue; } quoted = !quoted; }
    result += ch === '?' && !quoted ? '$' + (++i) : ch;
  }
  result = result.replace(/json_extract\(([^,]+),\s*'\$\.([^']+)'\)/g, "($1::jsonb ->> '$2')");
  if (/^\s*INSERT OR IGNORE/i.test(result)) result = result.replace(/INSERT OR IGNORE/i,'INSERT') + ' ON CONFLICT DO NOTHING';
  if (/INSERT OR REPLACE INTO pipeline_status/i.test(result)) result = result.replace(/INSERT OR REPLACE/i,'INSERT') + ' ON CONFLICT(key) DO UPDATE SET value=excluded.value';
  return result.replace(/\browid\b/gi, "pg_sequence").replace(/\bMAX\(ever_accepted,/gi,"GREATEST(ever_accepted,").replace(/\bMIN\(observed_at,/gi,"LEAST(observed_at,");
}
async function execute(sql: string, values: unknown[] = []): Promise<QueryResult<any>> {
  const state = context.getStore();
  if (!state) return databaseRequest(() => execute(sql,values));
  // SQLite metadata consumers remain supported; all actual data lives in Postgres.
  if (/^PRAGMA foreign_key_check$/i.test(sql)) return state.client.query("SELECT conname FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype='f' AND NOT convalidated");
  const info = sql.match(/^PRAGMA table_info\(["']?([a-z_]+)["']?\)$/i);
  if (info) return state.client.query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position",[info[1]]);
  if (/sqlite_master/i.test(sql)) sql=sql.replace(/sqlite_master/gi,"(SELECT tablename AS name,'table' AS type FROM pg_tables WHERE schemaname=current_schema()) catalog");
  const result = await state.client.query(translatePostgresSQL(sql),values);
  // pg returns int8 as strings. App counters and millisecond timestamps are safe integers.
  for(const field of result.fields || []) if(field.dataTypeID===20) for(const row of result.rows) {
    if(row[field.name]!==null) { const value=Number(row[field.name]); if(!Number.isSafeInteger(value)) throw new Error('Database integer exceeds safe application range.'); row[field.name]=value; }
  }
  return result;
}
export const postgresDb = {
  close() {},
  prepare(sql: string) { return {
    async get(...values: unknown[]) { return (await execute(sql,values)).rows[0]; },
    async all(...values: unknown[]) { return (await execute(sql,values)).rows; },
    async run(...values: unknown[]) { const result=await execute(sql,values); return {changes: result.rowCount || 0}; }
  }; },
  async exec(sql: string) {
    if (/^\s*PRAGMA\s+(foreign_keys|busy_timeout)/i.test(sql)) return;
    if (/CREATE\s+(TABLE|TRIGGER|INDEX)/i.test(sql)) {
      // Schema is migrated before deployment, never by a request. Assert that all
      // declared tables exist rather than silently creating unguarded runtime tables.
      const names=[...sql.matchAll(/CREATE\s+TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_]+)/gi)].map(m=>m[1]);
      if(names.some(name=>!tables.includes(name))) throw new Error('Missing explicit PostgreSQL table migration.');
      if(names.length) {
        const missing=await execute('SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NULL',[names]);
        if(missing.rowCount) throw new Error('Apply PostgreSQL migrations before running Club OS.');
      }
      return;
    }
    await execute(sql);
  }
};

import { readFileSync } from 'node:fs';
import { Pool, type PoolClient, type PoolConfig } from 'pg';

/** Server-only PostgreSQL access. No named statements: compatible with transaction pooling. */
export function postgresConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  if (!env.DATABASE_URL || env.DATABASE_URL.includes('[YOUR-PASSWORD]'))
    throw new Error('Configure DATABASE_URL before using PostgreSQL.');
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URI.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  // pg connection-string SSL options override the explicit TLS object. Never allow that.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl', 'uselibpqcompat']) url.searchParams.delete(key);
  const ca = env.DATABASE_SSL_CA_PEM || (env.DATABASE_SSL_CA_FILE ? readFileSync(env.DATABASE_SSL_CA_FILE, 'utf8') : undefined);
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    allowExitOnIdle: true, max: 2, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000,
    statement_timeout: 30000, query_timeout: 35000, application_name: 'club-os' };
}
export function createPostgresPool(env: NodeJS.ProcessEnv = process.env) {
  const pool = new Pool(postgresConfig(env));
  // Idle socket errors must not become uncaught exceptions or log connection details.
  pool.on('error', () => { console.error('Club OS PostgreSQL idle connection failed.'); });
  return pool;
}

/** Pin the transaction to one checked-out connection; never use pool.query inside it.
 * Callbacks must not perform external side effects. No automatic replay after an
 * ambiguous COMMIT: domain idempotency keys must resolve the actual outcome.
 */
export async function postgresTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}

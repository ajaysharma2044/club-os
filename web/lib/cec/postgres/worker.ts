import {createPostgresPool} from './connection';
import {schemaIdentifier} from './migrate';
import {translatePostgresSQL} from './runtime';
/** Dedicated worker connection: short claim and completion transactions, with
 * provider I/O between them so a mail request never holds a database lock. */
export async function openPostgresWorker(env: NodeJS.ProcessEnv) {
  const pool=createPostgresPool(env);const client=await pool.connect();let active=false;
  const schema=env.CEC_POSTGRES_SCHEMA||'club_os';const quoted=schemaIdentifier(schema);
  async function begin(){await client.query('BEGIN');active=true;await client.query('SET LOCAL search_path TO '+quoted+', pg_catalog');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['club-os-runtime:'+schema]);}
  async function query(sql:string,values:unknown[]){const own=!active;if(own)await begin();try{const r=await client.query(translatePostgresSQL(sql),values);for(const f of r.fields||[])if(f.dataTypeID===20)for(const row of r.rows)if(row[f.name]!==null){const n=Number(row[f.name]);if(!Number.isSafeInteger(n))throw Error('Database integer exceeds safe range');row[f.name]=n;}if(own){await client.query('COMMIT');active=false;}return r;}catch(e){if(own){await client.query('ROLLBACK');active=false;}throw e;}}
  return {
    prepare(sql:string){return {async get(...v:unknown[]){return (await query(sql,v)).rows[0];},async all(...v:unknown[]){return (await query(sql,v)).rows;},async run(...v:unknown[]){return {changes:(await query(sql,v)).rowCount||0};}};},
    async exec(sql:string){if(/^PRAGMA/i.test(sql))return;if(sql==='BEGIN IMMEDIATE')return begin();if(sql==='COMMIT'||sql==='ROLLBACK'){if(active)await client.query(sql);active=false;return;}await query(sql,[]);},
    async close(){try{if(active)await client.query('ROLLBACK');}finally{client.release();await pool.end();}}
  };
}

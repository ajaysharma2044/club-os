// Import a consistent SQLite backup into an empty, explicitly migrated schema.
// No defaults point at the live SQLite database: pass the backup path explicitly.
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createPostgresPool,postgresTransaction} from '../lib/cec/postgres/connection.ts';
import {schemaIdentifier} from '../lib/cec/postgres/migrate.ts';
const source=process.argv[2];if(!source)throw Error('Pass the path to a consistent SQLite backup.');
const sqlite=new DatabaseSync(resolve(source),{readOnly:true});
const pool=createPostgresPool();const schema=process.env.CEC_POSTGRES_SCHEMA||'club_os';const q=s=>'"'+s.replaceAll('"','""')+'"';
let currentTable="";
const skipped=new Set(['schema_migrations','sessions','ratelimits','email_tokens','pipeline_retry']);
try {
 if(sqlite.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||sqlite.prepare('PRAGMA foreign_key_check').all().length)throw Error('Source database integrity check failed.');
 const sourceTables=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
 const pending=new Set(sourceTables.filter(n=>!skipped.has(n)));const ordered=[];
 while(pending.size){let progress=false;for(const name of pending){const refs=sqlite.prepare('PRAGMA foreign_key_list('+q(name)+')').all().map(r=>r.table);if(name==='records')refs.push('memberships');if(!['organizations','accounts','memberships','records'].includes(name))refs.push('memberships','records');if(refs.every(r=>r===name||!pending.has(r))){ordered.push(name);pending.delete(name);progress=true;}}if(!progress)throw Error('Source contains circular dependencies.');}
 const counts={};
 await postgresTransaction(pool,async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['club-os-runtime:'+schema]);
  await c.query('SET LOCAL search_path TO '+schemaIdentifier(schema)+', pg_catalog');
  // Verify every destination table before any data writes. Refuse partial imports.
  for(const name of ordered){
   const exists=await c.query('SELECT to_regclass($1) AS name',[name]);if(!exists.rows[0].name)throw Error('Missing destination table: '+name);
   if(!['organizations','organization_tables'].includes(name)&&(await c.query('SELECT 1 FROM '+q(name)+' LIMIT 1')).rowCount)throw Error('Destination is not empty: '+name);
  }
  for(const name of ordered){
   currentTable=name;
   let rows=sqlite.prepare('SELECT * FROM '+q(name)).all();
   if(name==='records'){const priority={contact:0,project:0,event:0,slot:0,course:0,form:0,task:2,deal:2};rows.sort((a,b)=>(priority[a.kind]||0)-(priority[b.kind]||0));}
   for(const original of rows){const row={...original};
    if(name==='email_jobs'){row.status='cancelled';row.payload='';row.token_hash=null;row.lease=null;row.lease_until=0;row.error='Cancelled during database migration';}
    const cols=Object.keys(row);const values=cols.map(k=>row[k]);
    const conflict=name==='organizations'?' ON CONFLICT(id) DO UPDATE SET '+cols.filter(k=>k!=='id').map(k=>q(k)+'=excluded.'+q(k)).join(','):name==='organization_tables'?' ON CONFLICT(table_name) DO NOTHING':'';
    await c.query('INSERT INTO '+q(name)+'('+cols.map(q).join(',')+') VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+')'+conflict,values);
    // Compare all fields after normalization; avoids claiming counts alone prove transfer.
    const where=cols.map((col,i)=>q(col)+' IS NOT DISTINCT FROM $'+(i+1)).join(' AND ');
    if(!(await c.query('SELECT 1 FROM '+q(name)+' WHERE '+where+' LIMIT 1',values)).rowCount)throw Error('Post-import row verification failed: '+name);
   }
   counts[name]=rows.length;
   const identities=await c.query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND is_identity='YES'",[name]);
   for(const col of identities.rows){const max=await c.query('SELECT max('+q(col.column_name)+')::text AS value FROM '+q(name));if(max.rows[0].value)await c.query('SELECT setval(pg_get_serial_sequence($1,$2),$3,true)',[name,col.column_name,max.rows[0].value]);}
  }
 });
 console.log(JSON.stringify({imported:true,tables:counts,sessions:'invalidated',email:'queued jobs cancelled',calendar:'subscription tokens preserved'}));
}catch(e){console.error('Import rolled back at '+currentTable+': '+(e.code||e.message)+(e.code==='23514'?' '+e.message:''));process.exitCode=1;}finally{sqlite.close();await pool.end();}

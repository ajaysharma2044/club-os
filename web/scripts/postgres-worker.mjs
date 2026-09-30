import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
import {createPostgresPool,postgresTransaction} from '../lib/cec/postgres/connection.ts';
import {schemaIdentifier} from '../lib/cec/postgres/migrate.ts';
const pool=createPostgresPool();const schema=process.env.CEC_POSTGRES_SCHEMA||'club_os';
const quoted=schemaIdentifier(schema);
async function transaction(fn){return postgresTransaction(pool,async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['club-os-runtime:'+schema]);await c.query('SET LOCAL search_path TO '+quoted+', pg_catalog');return fn(c);});}
function ingest(body){return new Promise((yes,no)=>{
 const event=JSON.parse(body);if(event.organization_id!=='cornell-ec')return no(Error('Organization mismatch'));delete event.organization_id;
 const database=process.env.CEC_QUANT_DATABASE;if(!database)return no(Error('Configure durable CEC_QUANT_DATABASE for the worker.'));
 const child=spawn(process.env.PYTHON_BINARY||'python3',[resolve('../services/quant/bridge.py')],{env:{...process.env,CEC_QUANT_DATABASE:resolve(database)},stdio:['pipe','pipe','ignore']});
 let output='';const timer=setTimeout(()=>child.kill(),15000);
 child.stdout.on('data',b=>{output+=b;if(output.length>1024*1024)child.kill();});
 child.on('error',e=>{clearTimeout(timer);no(e);});child.on('close',code=>{clearTimeout(timer);if(code!==0)return no(Error('Ingest failed'));try{JSON.parse(output);yes();}catch{no(Error('Invalid ingest response'));}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({action:'ingest',event}));
});}
async function once(){
 const row=await transaction(async c=>{
  const r=await c.query("SELECT o.*,COALESCE(r.attempts,0)::integer AS attempts,COALESCE(r.next_attempt,0) AS next_attempt FROM outbox o LEFT JOIN pipeline_retry r ON r.id=o.id WHERE delivered=0 ORDER BY o.pg_sequence LIMIT 1");
  const row=r.rows[0];if(!row)return null;
  if(row.attempts>=8||Number(row.next_attempt)>Date.now()/1000)return null;
  await c.query('INSERT INTO pipeline_retry VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET attempts=excluded.attempts,next_attempt=excluded.next_attempt',[row.id,row.attempts+1,Date.now()/1000+60]);return row;
 });
 if(!row)return {status:'idle'};
 let success=false;try{await ingest(row.body);success=true;}catch{/* Store only a safe summary. */}
 await transaction(async c=>{
  if(success){await c.query("UPDATE outbox SET delivered=1,error='' WHERE id=$1",[row.id]);await c.query('DELETE FROM pipeline_retry WHERE id=$1',[row.id]);}
  else{await c.query('UPDATE outbox SET error=$1 WHERE id=$2',[row.attempts>=7?'Delivery failed; manual retry required':'Delivery failed; automatic retry scheduled',row.id]);await c.query('UPDATE pipeline_retry SET next_attempt=$1 WHERE id=$2',[Date.now()/1000+Math.min(3600,5*2**row.attempts),row.id]);}
  await c.query("INSERT INTO pipeline_status VALUES('last_delivery_scan',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[String(Date.now()/1000)]);
 });return {status:success?'delivered':'failed'};
}
let stopped=false;process.on('SIGTERM',()=>stopped=true);process.on('SIGINT',()=>stopped=true);
try{if(!process.env.CEC_QUANT_DATABASE)throw Error('Configure durable CEC_QUANT_DATABASE.');do{const result=await once();if(process.argv[2]!=='work')console.log(JSON.stringify(result));if(process.argv[2]==='work'&&result.status!=='delivered')await new Promise(r=>setTimeout(r,process.env.CEC_WORKER_TEST_POLL==='1'?100:5000));}while(process.argv[2]==='work'&&!stopped);}
catch{console.error('Postgres worker failed; check server configuration.');process.exitCode=1;}finally{await pool.end();}

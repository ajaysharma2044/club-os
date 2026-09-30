import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createPostgresPool,postgresTransaction} from '../lib/cec/postgres/connection.ts';
import {migratePostgres,schemaIdentifier} from '../lib/cec/postgres/migrate.ts';
import {databaseRequest} from '../lib/cec/postgres/runtime.ts';
const pool=createPostgresPool();const schema='club_os_test_'+randomBytes(8).toString('hex');
process.env.CEC_STORAGE='postgres';process.env.CEC_POSTGRES_SCHEMA=schema;process.env.CEC_EMAIL_MODE='disabled';process.env.CEC_BOOTSTRAP_TOKEN=randomBytes(32).toString('hex');
let created=false;
try {
 await postgresTransaction(pool,c=>migratePostgres(c,schema));created=true;
 const {auth,state,mutate}=await import('../lib/cec/service.ts');
 const {user,db}=await import('../lib/cec/db.ts');
 const {toolsState,toolsAction}=await import('../lib/cec/officer-tools.ts');
 await databaseRequest(async()=>{
  const signed=await auth('setup',{name:'Synthetic Officer',email:'synthetic-pg@example.test',password:'Synthetic-password-2026!',bootstrap:process.env.CEC_BOOTSTRAP_TOKEN});
  const u=await user(signed.token);assert.equal(u.role,'officer');
  assert((await state(u)).items.length>=2);
  const event=await mutate(u,'create',{kind:'event',data:{title:'Postgres event',description:'Synthetic test',location:'Room',starts_at:'2027-01-01T12:00:00Z',ends_at:'2027-01-01T13:00:00Z',capacity:3,status:'published'}});
  assert(event.id);assert((await state(u)).items.some(r=>r.id===event.id));
  assert.equal((await toolsState(u)).upcoming.length,1);
  const key=await toolsAction(u,'calendar/enable',{});assert(key.token);
  assert.equal((await db().prepare('SELECT COUNT(*) AS n FROM outbox').get()).n>0,true);
 });
 console.log('Postgres native setup, login/session, state, create event, officer dashboard and calendar: PASS');
}catch(e){console.error('Workflow failed: '+e.code+' '+e.message+'\n'+e.stack?.split('\n').slice(1,4).join('\n'));process.exitCode=1;}
finally{if(created)await pool.query('DROP SCHEMA '+schemaIdentifier(schema)+' CASCADE');await pool.end();}

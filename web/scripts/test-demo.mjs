import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createPostgresPool,postgresTransaction} from '../lib/cec/postgres/connection.ts';
import {migratePostgres,schemaIdentifier} from '../lib/cec/postgres/migrate.ts';
import {databaseRequest} from '../lib/cec/postgres/runtime.ts';
import {auth,state} from '../lib/cec/service.ts';
import {db,user} from '../lib/cec/db.ts';
import {seedDemo} from './demo-data.mjs';
const pool=createPostgresPool(),schema='club_os_test_'+randomBytes(8).toString('hex');
process.env.CEC_STORAGE='postgres';process.env.CEC_POSTGRES_SCHEMA=schema;process.env.CEC_EMAIL_MODE='disabled';process.env.CEC_BOOTSTRAP_TOKEN=randomBytes(24).toString('hex');
try {
 await postgresTransaction(pool,c=>migratePostgres(c,schema));
 await databaseRequest(async()=>{
  const result=await seedDemo('Synthetic-demo-pass-2026');
  assert.equal(result.items.length,9);
  assert.deepEqual((await seedDemo('Do-not-reset-password')).items,result.items);
  const login=await auth('login',{email:'tester@demo.club-os.example.test',password:'Synthetic-demo-pass-2026'});
  const tester=await user(login.token); assert.equal(tester.role,'member');
  const memberState=await state(tester);assert.equal(memberState.items.filter(x=>x.kind==='task').length,3);
  const publicState=await state(null); assert.equal(publicState.items.filter(x=>x.kind==='event').length,3);
  assert(!publicState.items.some(x=>x.kind==='task'));
  const task=memberState.items.find(x=>x.kind==='task'&&x.data.status==='submitted');assert.equal(task.data.work_history.length,1);
  assert.equal((await db().prepare('SELECT COUNT(*) n FROM conversations').get()).n,1);
  assert.equal((await db().prepare("SELECT COUNT(*) n FROM users WHERE role='officer'").get()).n,0);
  console.log('PASS: real Postgres seed, replay, password preservation, role boundary, public events, task history and conversation.');
 });
}finally {await pool.query('DROP SCHEMA IF EXISTS '+schemaIdentifier(schema)+' CASCADE');await pool.end();}

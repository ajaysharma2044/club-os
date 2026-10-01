import {randomBytes} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
import {databaseRequest} from '../lib/cec/postgres/runtime.ts';
import {seedDemo,batch} from './demo-data.mjs';
import {db} from '../lib/cec/db.ts';
if(!process.argv.includes('--apply') || process.env.CEC_STORAGE!=='postgres') throw Error('Use --apply with an explicitly configured PostgreSQL database.');
process.env.CEC_EMAIL_MODE='disabled';
const path='../work/demo/login.txt';
try {
 const result=await databaseRequest(async()=>{
  const prior=await db().prepare("SELECT details FROM audit WHERE action='demo.seeded' AND object_id=?").get(batch);
  if(prior)return {...JSON.parse(prior.details),replayed:true};
  if(existsSync(path))throw Error('Credential file already exists; inspect the previous attempt before retrying.');
  const password=randomBytes(24).toString('base64url');
  // Write before COMMIT, so a lost connection cannot lose access to committed data.
  writeFileSync(path,`Demo member login\nEmail: tester@demo.club-os.example.test\nPassword: ${password}\n\nSynthetic member account; no officer access.\n`,{mode:0o600,flag:'wx'});
  return seedDemo(password);
 });
 console.log(JSON.stringify({batch:result.batch,counts:result.counts,replayed:!!result.replayed,credentials:path}));
}catch(error){console.error('Demo seeding failed: '+error.message);process.exitCode=1;}

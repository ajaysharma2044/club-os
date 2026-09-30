import {DatabaseSync} from 'node:sqlite';
import {postgresDb} from '../lib/cec/postgres/runtime.ts';
export function openTestDatabase(file){return process.env.CEC_STORAGE==='postgres'?postgresDb:new DatabaseSync(file);}
export async function waitForOutbox(){
 if(process.env.CEC_STORAGE!=='postgres')return;
 for(let i=0;i<120;i++){const row=await postgresDb.prepare('SELECT count(*) AS n FROM outbox WHERE delivered=0').get();if(!row.n)return;await new Promise(r=>setTimeout(r,500));}
 throw Error('Postgres outbox worker did not finish within 60 seconds.');
}

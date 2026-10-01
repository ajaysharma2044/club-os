import {randomBytes} from 'node:crypto';
import {createPostgresPool,postgresTransaction} from '../lib/cec/postgres/connection.ts';
import {migratePostgres,schemaIdentifier} from '../lib/cec/postgres/migrate.ts';
import {databaseRequest} from '../lib/cec/postgres/runtime.ts';
const suite=process.argv[2];if(!['officer-tools','email','messaging','portal'].includes(suite))throw Error('Choose officer-tools or email.');
const pool=createPostgresPool();const schema='club_os_test_'+randomBytes(8).toString('hex');let created=false;
process.env.CEC_STORAGE='postgres';process.env.CEC_POSTGRES_SCHEMA=schema;
try{await postgresTransaction(pool,c=>migratePostgres(c,schema));created=true;
 if(suite==='portal')await databaseRequest(()=>import('../tests/portal.mjs'));
 else if(suite==='messaging')await databaseRequest(()=>import('../tests/messaging.mjs'));
 else if(suite==='officer-tools')await databaseRequest(()=>import('../tests/officer-tools.mjs'));
 else await import('../tests/email.mjs');
 console.log('PostgreSQL '+suite+' regression suite passed.');
}catch(e){console.error('PostgreSQL suite failed: '+(e.code||e.name)+' '+e.message);process.exitCode=1;}
finally{if(created)await pool.query('DROP SCHEMA '+schemaIdentifier(schema)+' CASCADE');await pool.end();}

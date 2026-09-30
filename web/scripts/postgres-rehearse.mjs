import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createPostgresPool,postgresTransaction} from '../lib/cec/postgres/connection.ts';
import {migratePostgres,schemaIdentifier} from '../lib/cec/postgres/migrate.ts';
if(!process.argv[2])throw Error('Pass a consistent SQLite backup path.');
const pool=createPostgresPool();const schema='club_os_test_'+randomBytes(8).toString('hex');let created=false;
try{await postgresTransaction(pool,c=>migratePostgres(c,schema));created=true;
 const child=spawn(process.execPath,['--experimental-strip-types','scripts/postgres-import.mjs',process.argv[2]],{env:{...process.env,CEC_POSTGRES_SCHEMA:schema},stdio:'inherit'});
 const code=await new Promise(r=>child.on('exit',r));if(code)process.exitCode=1;else console.log('Import rehearsal passed. Temporary schema removed.');
}finally{if(created)await pool.query('DROP SCHEMA '+schemaIdentifier(schema)+' CASCADE');await pool.end();}

import { createPostgresPool, postgresTransaction } from '../lib/cec/postgres/connection.ts';
import { migratePostgres } from '../lib/cec/postgres/migrate.ts';
const pool=createPostgresPool();
try {
  const files=await postgresTransaction(pool,c=>migratePostgres(c,process.env.CEC_POSTGRES_SCHEMA || 'club_os'));
  console.log('Applied/verified '+files.length+' PostgreSQL migrations.');
}catch(e){console.error('Migration failed: '+(e.code||e.name));process.exitCode=1;}finally{await pool.end();}

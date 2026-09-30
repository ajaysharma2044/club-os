import { createPostgresPool } from '../lib/cec/postgres/connection.ts';
const pool = createPostgresPool();
try {
  await pool.query('SELECT 1');
  console.log('PostgreSQL authentication and verified TLS: PASS');
} catch (error) {
  console.error('PostgreSQL check failed. Code: ' + (/^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'CONNECTION_FAILED'));
  process.exitCode = 1;
} finally { await pool.end(); }

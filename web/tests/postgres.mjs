import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createPostgresPool, postgresTransaction, postgresConfig } from '../lib/cec/postgres/connection.ts';
import { migratePostgres, schemaIdentifier } from '../lib/cec/postgres/migrate.ts';
assert.throws(() => postgresConfig({}), /Configure/);
assert.throws(() => schemaIdentifier('public'), /private/);
const unsafe = postgresConfig({DATABASE_URL:'postgresql://u:p@localhost/db?sslmode=disable'});
assert.equal(unsafe.ssl.rejectUnauthorized, true);
assert.equal(new URL(unsafe.connectionString).searchParams.has('sslmode'), false);
const pool = createPostgresPool();
const schema = 'club_os_test_' + randomBytes(8).toString('hex');
const quoted = schemaIdentifier(schema);
let created = false;
try {
  await postgresTransaction(pool, async c => {
    await migratePostgres(c, schema);
    await migratePostgres(c, schema); // DDL replay is idempotent.
    assert.equal((await c.query('SELECT count(*)::integer AS n FROM postgres_migrations')).rows[0].n, 1);
    for (const role of ['anon','authenticated']) {
      assert.equal((await c.query('SELECT has_schema_privilege($1,$2,\'USAGE\') AS allowed',[role,schema])).rows[0].allowed, false);
    }
    assert.equal((await c.query('SELECT count(*)::integer AS n FROM pg_tables WHERE schemaname=$1 AND NOT rowsecurity',[schema])).rows[0].n,0);
    await c.query("INSERT INTO organizations VALUES('test','test','Synthetic test club','active','2026-01-01')");
    await c.query("INSERT INTO accounts(id,name,email,password) VALUES('synthetic','Synthetic','synthetic@example.test','not-a-real-password')");
    await c.query("INSERT INTO memberships(organization_id,user_id,role,status,joined_at) VALUES('test','synthetic','officer','active','2026-01-01')");
    await c.query("INSERT INTO records VALUES('record','doc','synthetic','{}','2026-01-01','2026-01-01',1,'test')");
  });
  created = true;
  await assert.rejects(postgresTransaction(pool, async c => {
    await c.query(`SET LOCAL search_path TO ${quoted}, pg_catalog`);
    await c.query("INSERT INTO accounts(id,name,email,password) VALUES('rollback','Rollback','rollback@example.test','synthetic')");
    throw new Error('intentional rollback');
  }),/intentional rollback/);
  assert.equal((await pool.query(`SELECT count(*)::integer AS n FROM ${quoted}.accounts WHERE id='rollback'`)).rows[0].n,0);
  await assert.rejects(postgresTransaction(pool, async c => {
    await c.query(`SET LOCAL search_path TO ${quoted}, pg_catalog`);
    await c.query("INSERT INTO organizations VALUES('other','other','Other','active','2026-01-01')");
    await c.query("INSERT INTO records VALUES('bad','doc','synthetic','{}','2026-01-01','2026-01-01',1,'other')");
  }), e=>e.code==='23514' && e.message==='Record owner must belong to organization');
  const results = await Promise.all([0,1].map(() => postgresTransaction(pool, async c=> {
    const updated = await c.query(`UPDATE ${quoted}.memberships SET version=version+1 WHERE user_id='synthetic' AND version=1`);
    return updated.rowCount;
  })));
  assert.deepEqual(results.sort(),[0,1]);
  assert.equal(Number((await pool.query(`SELECT version FROM ${quoted}.memberships WHERE user_id='synthetic'`)).rows[0].version),2);
  await assert.rejects(postgresTransaction(pool, async c=> {
    await c.query(`UPDATE ${quoted}.postgres_migrations SET checksum='tampered'`);
    await migratePostgres(c,schema);
  }),/has changed/);
  console.log('PostgreSQL TLS, migrations, replay, role isolation, RLS, foreign keys, rollback and concurrent version checks: PASS');
} catch(error) {
  console.error('PostgreSQL integration failed: '+ (error.code || error.name || 'FAILED'));
  process.exitCode=1;
} finally {
  if(created) await pool.query(`DROP SCHEMA ${quoted} CASCADE`);
  await pool.end();
}

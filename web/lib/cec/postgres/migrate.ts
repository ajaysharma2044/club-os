import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';

export function schemaIdentifier(schema: string) {
  if (!/^club_os(?:_test_[a-f0-9]{16})?$/.test(schema)) throw new Error('Only the private Club OS schema or isolated test schemas are allowed.');
  return '"' + schema + '"';
}
/** Run only inside postgresTransaction. Transaction advisory lock serializes DDL.
 * Checksums reject edits to already applied migrations. Rollback covers DDL too.
 */
export async function migratePostgres(client: PoolClient, schema: string, directory = resolve(process.cwd(), 'postgres/migrations')) {
  const quoted = schemaIdentifier(schema);
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['club-os-migrations:' + schema]);
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoted}`);
  await client.query(`REVOKE ALL ON SCHEMA ${quoted} FROM PUBLIC, anon, authenticated`);
  await client.query(`SET LOCAL search_path TO ${quoted}, pg_catalog`);
  await client.query('CREATE TABLE IF NOT EXISTS postgres_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  await client.query('ALTER TABLE postgres_migrations ENABLE ROW LEVEL SECURITY');
  const files = readdirSync(directory).filter(f => /^\d{3}-[a-z0-9-]+\.sql$/.test(f)).sort();
  for (const file of files) {
    const sql = readFileSync(resolve(directory, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT checksum FROM postgres_migrations WHERE version=$1', [file]);
    if (previous.rowCount) {
      if (previous.rows[0].checksum !== checksum) throw new Error('An applied Postgres migration has changed: ' + file);
      continue;
    }
    await client.query(sql.replaceAll(':schema', quoted));
    await client.query('INSERT INTO postgres_migrations(version,checksum) VALUES($1,$2)', [file, checksum]);
  }
  return files;
}

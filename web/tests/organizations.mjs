import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateOrganizations, installCECGuards } from '../lib/cec/migrations.ts';

const source = readFileSync(new URL('../lib/cec/db.ts', import.meta.url), 'utf8');
const legacyDDL = source.match(/connection\.exec\(`([\s\S]*?)`\);/)[1];
function legacy(invalid = false) {
  const d = new DatabaseSync(':memory:');
  d.exec(legacyDDL);
  d.exec(`INSERT INTO users VALUES('old','Old member','old@test','unusable','member','',0);
    INSERT INTO items VALUES('p','project','old','{"title":"Existing project"}','2026-01-01','2026-01-01',1);
    INSERT INTO items VALUES('t','task','old','{"title":"Old task","assignee":"${invalid ? 'missing' : 'old'}","project_id":"p","status":"accepted"}','2026-01-01','2026-01-01',2);`);
  return d;
}
{
  const d = legacy();
  migrateOrganizations(d); installCECGuards(d, d.exec.bind(d));
  assert.equal(d.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  assert.equal(d.prepare("SELECT organization_id FROM records WHERE id='t'").get().organization_id, 'cornell-ec');
  assert.equal(d.prepare("SELECT role FROM memberships WHERE user_id='old'").get().role, 'member');
  assert.equal(d.prepare("SELECT version FROM items WHERE id='t'").get().version, 2);
  assert.equal(JSON.parse(d.prepare("SELECT data FROM items WHERE id='t'").get().data).project_id, 'p');
  migrateOrganizations(d);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 1);
  assert.equal(d.prepare('PRAGMA foreign_key_check').all().length, 0);
  d.close();
}
{
  const d = legacy(true);
  assert.throws(() => migrateOrganizations(d), /invalid legacy/);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
  assert.equal(d.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, 0);
  assert.equal(d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='accounts'").get().n, 0);
  d.close();
}
process.env.CEC_DATABASE = join(mkdtempSync(join(tmpdir(),'cec-org-')), 'cec.sqlite');
const {db, item, items, officer, member, session, user} = await import('../lib/cec/db.ts');
const {state, mutate} = await import('../lib/cec/service.ts');
const d = db();
d.exec(`INSERT INTO users(id,name,email,password,role) VALUES('a','CEC officer','a@test','unused','officer');
  INSERT INTO users(id,name,email,password,role) VALUES('dual','Dual member','dual@test','unused','member');
  INSERT INTO organizations(id,slug,name,status) VALUES('other','other','Other club','active');
  INSERT INTO accounts(id,name,email,password) VALUES('b','Other officer','b@test','unused');
  INSERT INTO memberships(organization_id,user_id,role,status) VALUES('other','b','officer','active');
  INSERT INTO memberships(organization_id,user_id,role,status) VALUES('other','dual','officer','active');
  INSERT INTO records(id,kind,owner,data,created_at,updated_at,organization_id) VALUES
    ('other-project','project','b','{"title":"Private project"}','2026-01-01','2026-01-01','other'),
    ('other-task','task','b','{"title":"Private task","assignee":"b","project_id":"other-project","status":"assigned"}','2026-01-01','2026-01-01','other');`);
const a = {id:'a',role:'officer'}, b={id:'b',role:'officer'}, dual={id:'dual',role:'officer'};
assert.equal(items().length, 0);
assert.throws(() => item('other-task'), /not found/);
assert.throws(() => state(b), /no current membership/);
assert.throws(() => officer(b), /Officer access/);
assert.throws(() => officer(dual), /Officer access/);
assert.doesNotThrow(() => member(dual));
assert.equal(user(session('b')), null);
assert.equal(user(session('dual')).role, 'member');
assert.throws(() => mutate(a,'task.status',{id:'other-task',status:'cancelled'}), /not found/);
assert.throws(() => mutate(a,'create',{organization_id:'other',kind:'project',data:{}}), /belongs to CEC/);
assert.throws(() => d.exec(`INSERT INTO items(id,kind,owner,data,created_at,updated_at)
  VALUES('bad','task','a','{"assignee":"b"}','now','now')`), /assignee/);
assert.throws(() => d.exec(`INSERT INTO items(id,kind,owner,data,created_at,updated_at)
  VALUES('bad','task','a','{"assignee":"dual","project_id":"other-project"}','now','now')`), /project/);
assert.throws(() => d.exec(`INSERT INTO rsvps(event_id,user_id,status,created_at) VALUES('other-project','a','yes','now')`), /organization|type/);
const task = mutate(a,'create',{kind:'task',data:{title:'CEC task',assignee:'dual',status:'assigned',due_at:'2026-10-01T00:00:00Z'}});
assert.equal(item(task.id).organization_id, 'cornell-ec');
assert.equal(JSON.parse(d.prepare('SELECT body FROM outbox LIMIT 1').get().body).organization_id,'cornell-ec');
assert.throws(() => d.prepare("UPDATE records SET organization_id='other' WHERE id=?").run(task.id), /immutable/);
assert.equal(state(a).people.some(p=>p.id==='b'), false);
d.exec("UPDATE memberships SET status='left',left_at='2026-09-16' WHERE user_id='dual' AND organization_id='cornell-ec'");
assert.equal(user(session('dual')), null);
assert.throws(()=>d.exec("DELETE FROM memberships WHERE user_id='dual'"), /Preserve membership/);
assert.throws(()=>member(dual), /membership/);
assert.throws(()=>mutate(dual,'task.status',{id:task.id,status:'accepted'}), /no current membership/);
assert.equal(item(task.id).data.assignee, 'dual');
// Newly loaded module tables get CEC account/record guards too.
d.exec('CREATE TABLE scoped_test(id TEXT PRIMARY KEY, person TEXT REFERENCES accounts(id), record TEXT REFERENCES records(id))');
assert.throws(()=>d.exec("INSERT INTO scoped_test VALUES('x','b','other-task')"), /outside this organization/);
assert.equal(d.prepare("SELECT organization_id FROM organization_tables WHERE table_name='scoped_test'").get().organization_id, 'cornell-ec');
assert.equal(d.prepare('PRAGMA foreign_key_check').all().length, 0);
console.log('Organization isolation and populated migration checks passed.');

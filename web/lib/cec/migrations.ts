import type { DatabaseSync } from "node:sqlite";

export const CEC_ORGANIZATION = "cornell-ec";

/** Versioned, transactional migration of the single-club schema.
 * users/items remain writable CEC-scoped compatibility views. Physical accounts
 * and records are global; foreign keys always target physical tables.
 */
export function migrateOrganizations(d: DatabaseSync) {
  d.exec(`CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  if (d.prepare("SELECT 1 FROM schema_migrations WHERE version=1").get()) return;
  d.exec("BEGIN IMMEDIATE");
  try {
    // Another process may have completed the migration while we waited.
    if (d.prepare("SELECT 1 FROM schema_migrations WHERE version=1").get()) {
      d.exec("COMMIT"); return;
    }
    d.exec(`
      CREATE TABLE organizations(
        id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','inactive')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      INSERT INTO organizations(id,slug,name,status)
        VALUES('cornell-ec','cec','Cornell Entrepreneurship Club','active');
      ALTER TABLE users RENAME TO accounts;
      CREATE TABLE memberships(
        organization_id TEXT NOT NULL REFERENCES organizations(id),
        user_id TEXT NOT NULL REFERENCES accounts(id),
        role TEXT NOT NULL CHECK(role IN ('applicant','member','officer')),
        status TEXT NOT NULL CHECK(status IN ('pending','active','left','suspended')),
        joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        left_at TEXT,
        PRIMARY KEY(organization_id,user_id),
        CHECK((status='pending' AND role='applicant') OR status!='pending'));
      INSERT INTO memberships(organization_id,user_id,role,status)
        SELECT 'cornell-ec',id,CASE WHEN role='alumni' THEN 'member' ELSE role END,CASE WHEN role='applicant' THEN 'pending' WHEN role='alumni' THEN 'left' ELSE 'active' END FROM accounts;
      ALTER TABLE accounts DROP COLUMN role;
      CREATE INDEX membership_person ON memberships(user_id,organization_id,status);
      CREATE VIEW users AS SELECT a.id,a.name,a.email,a.password,
        CASE WHEN m.status='pending' THEN 'applicant' WHEN m.status IN ('left','suspended') THEN 'alumni' ELSE m.role END role,a.interests,a.shared
        FROM accounts a JOIN memberships m ON m.user_id=a.id
        JOIN organizations o ON o.id=m.organization_id
        WHERE m.organization_id='cornell-ec' AND o.status='active';
      CREATE TRIGGER cec_user_insert INSTEAD OF INSERT ON users BEGIN
        INSERT INTO accounts(id,name,email,password,interests,shared)
          VALUES(NEW.id,NEW.name,NEW.email,NEW.password,COALESCE(NEW.interests,''),COALESCE(NEW.shared,0));
        INSERT INTO memberships(organization_id,user_id,role,status)
          VALUES('cornell-ec',NEW.id,CASE WHEN NEW.role='alumni' THEN 'member' ELSE NEW.role END,CASE WHEN NEW.role='applicant' THEN 'pending' WHEN NEW.role='alumni' THEN 'left' ELSE 'active' END);
      END;
      CREATE TRIGGER cec_user_update INSTEAD OF UPDATE ON users BEGIN
        SELECT CASE WHEN NEW.id!=OLD.id THEN RAISE(ABORT,'Account identity is immutable') END;
        UPDATE accounts SET name=NEW.name,email=NEW.email,password=NEW.password,
          interests=NEW.interests,shared=NEW.shared WHERE id=OLD.id;
        UPDATE memberships SET role=CASE WHEN NEW.role='alumni' THEN 'member' ELSE NEW.role END,
          status=CASE WHEN NEW.role='applicant' THEN 'pending' WHEN NEW.role='alumni' THEN 'left' ELSE 'active' END
          WHERE organization_id='cornell-ec' AND user_id=OLD.id AND NEW.role!=OLD.role;
      END;
      ALTER TABLE items RENAME TO records;
      ALTER TABLE records ADD COLUMN organization_id TEXT REFERENCES organizations(id);
      UPDATE records SET organization_id='cornell-ec';
      CREATE UNIQUE INDEX record_org_identity ON records(organization_id,id);
      CREATE INDEX record_org_kind ON records(organization_id,kind,created_at);
      CREATE VIEW items AS SELECT id,kind,owner,data,created_at,updated_at,version,organization_id
        FROM records WHERE organization_id='cornell-ec' AND EXISTS(SELECT 1 FROM organizations WHERE id='cornell-ec' AND status='active');
      CREATE TRIGGER cec_item_insert INSTEAD OF INSERT ON items BEGIN
        SELECT CASE WHEN COALESCE(NEW.organization_id,'cornell-ec')!='cornell-ec'
          THEN RAISE(ABORT,'Organization mismatch') END;
        INSERT INTO records(id,kind,owner,data,created_at,updated_at,version,organization_id)
          VALUES(NEW.id,NEW.kind,NEW.owner,NEW.data,NEW.created_at,NEW.updated_at,COALESCE(NEW.version,1),'cornell-ec');
      END;
      CREATE TRIGGER cec_item_update INSTEAD OF UPDATE ON items BEGIN
        SELECT CASE WHEN NEW.organization_id!='cornell-ec' OR NEW.id!=OLD.id
          THEN RAISE(ABORT,'Record identity and organization are immutable') END;
        UPDATE records SET kind=NEW.kind,owner=NEW.owner,data=NEW.data,
          created_at=NEW.created_at,updated_at=NEW.updated_at,version=NEW.version WHERE id=OLD.id AND organization_id='cornell-ec';
      END;
      CREATE TRIGGER cec_item_delete INSTEAD OF DELETE ON items BEGIN
        DELETE FROM records WHERE id=OLD.id AND organization_id='cornell-ec';
      END;
    `);
    for (const operation of ["INSERT", "UPDATE"]) {
      d.exec(`CREATE TRIGGER record_relations_${operation.toLowerCase()} BEFORE ${operation} ON records BEGIN
        SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=NEW.organization_id AND user_id=NEW.owner)
          THEN RAISE(ABORT,'Record owner must belong to organization') END;
        SELECT CASE WHEN NEW.kind='task' AND NOT EXISTS(SELECT 1 FROM memberships
          WHERE organization_id=NEW.organization_id AND user_id=json_extract(NEW.data,'$.assignee') AND role IN ('member','officer'))
          THEN RAISE(ABORT,'Task assignee must belong to organization') END;
        SELECT CASE WHEN NEW.kind='task' AND COALESCE(json_extract(NEW.data,'$.project_id'),'')!=''
          AND NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.project_id') AND kind='project' AND organization_id=NEW.organization_id)
          THEN RAISE(ABORT,'Task project must belong to organization') END;
        SELECT CASE WHEN NEW.kind='deal' AND NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.contact_id')
          AND kind='contact' AND organization_id=NEW.organization_id) THEN RAISE(ABORT,'Deal contact must belong to organization') END;
      END;`);
    }
    d.exec(`CREATE TRIGGER membership_identity BEFORE UPDATE ON memberships
      WHEN NEW.organization_id!=OLD.organization_id OR NEW.user_id!=OLD.user_id
      BEGIN SELECT RAISE(ABORT,'Membership identity is immutable'); END;
      CREATE TRIGGER membership_preserve BEFORE DELETE ON memberships
      BEGIN SELECT RAISE(ABORT,'Preserve membership history; change status instead'); END;
      CREATE TRIGGER record_identity BEFORE UPDATE ON records
      WHEN NEW.organization_id!=OLD.organization_id OR NEW.kind!=OLD.kind OR NEW.id!=OLD.id
      BEGIN SELECT RAISE(ABORT,'Record organization, kind and identity are immutable'); END;
      CREATE TRIGGER record_project_delete BEFORE DELETE ON records
      WHEN EXISTS(SELECT 1 FROM records WHERE kind='task' AND json_extract(data,'$.project_id')=OLD.id)
      OR EXISTS(SELECT 1 FROM records WHERE kind='deal' AND json_extract(data,'$.contact_id')=OLD.id)
      BEGIN SELECT RAISE(ABORT,'Record is referenced'); END;`);
    // These interfaces remain CEC-only. Enforce that fact in storage, not just URLs.
    // SQLite cannot ADD a non-null REFERENCES column with a non-null default on
    // populated tables: ownership is checked by triggers below instead.
    for (const table of ["rsvps", "applications", "bookings", "responses", "submissions", "messages", "audit", "outbox"]) {
      d.exec(`ALTER TABLE ${table} ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'cornell-ec' CHECK(organization_id='cornell-ec')`);
      for (const operation of ["INSERT", "UPDATE"]) {
        d.exec(`CREATE TRIGGER ${table}_organization_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN
          SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM organizations WHERE id=NEW.organization_id)
            THEN RAISE(ABORT,'Unknown organization') END;
        END;`);
      }
    }
    for (const [table, column, kind] of [["rsvps","event_id","event"], ["bookings","slot_id","slot"],
      ["responses","form_id","form"], ["submissions","course_id","course"]]) {
      for (const operation of ["INSERT","UPDATE"]) d.exec(`
        CREATE TRIGGER ${table}_relations_${operation.toLowerCase()} BEFORE ${operation} ON ${table} BEGIN
          SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.${column} AND kind='${kind}' AND organization_id=NEW.organization_id)
            THEN RAISE(ABORT,'Wrong record type or organization') END;
          SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=NEW.user_id AND organization_id=NEW.organization_id)
            THEN RAISE(ABORT,'User must belong to organization') END;
        END;`);
    }
    d.exec("UPDATE outbox SET body=json_set(body,'$.organization_id','cornell-ec')");
    // Fail atomically instead of silently blessing invalid legacy task relations.
    const invalid = d.prepare(`SELECT id FROM records r WHERE
      NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=r.owner AND m.organization_id=r.organization_id)
      OR (kind='task' AND (NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=json_extract(r.data,'$.assignee') AND m.organization_id=r.organization_id AND m.role IN ('member','officer'))
      OR (COALESCE(json_extract(data,'$.project_id'),'')!='' AND NOT EXISTS(SELECT 1 FROM records p WHERE p.id=json_extract(r.data,'$.project_id') AND p.kind='project' AND p.organization_id=r.organization_id)))) LIMIT 1`).get();
    if (invalid) throw new Error("Organization migration found invalid legacy relationships; restore backup and repair before retrying.");
    if (d.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Organization migration failed foreign key validation.");
    d.prepare("INSERT INTO schema_migrations VALUES(1,?)").run(new Date().toISOString());
    d.exec("COMMIT");
  } catch (error) {
    d.exec("ROLLBACK");
    throw error;
  }
}

/** Auxiliary modules are still CEC-only. Register their table ownership and
 * enforce their account/record foreign keys against CEC memberships/records.
 * Called after lazy CREATE TABLE statements so load order cannot bypass guards.
 */
export function installCECGuards(d: DatabaseSync, exec: (sql: string) => void) {
  exec(`CREATE TABLE IF NOT EXISTS organization_tables(
    table_name TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id)
      CHECK(organization_id='cornell-ec'))`);
  const global = new Set(["accounts", "records", "memberships", "organizations", "sessions",
    "schema_migrations", "organization_tables", "pipeline_retry", "pipeline_status"]);
  const names = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[];
  for (const {name} of names) {
    if (global.has(name)) continue;
    // Names originate in our schema, never user input; quote identifiers anyway.
    const quote = (s: string) => '"' + s.replaceAll('"','""') + '"';
    const table = quote(name);
    d.prepare("INSERT OR IGNORE INTO organization_tables VALUES(?,'cornell-ec')").run(name);
    const keys = d.prepare(`PRAGMA foreign_key_list(${table})`).all() as any[];
    const columns = d.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const checks: string[] = [];
    for (const fk of keys) {
      const value = `NEW.${quote(fk.from)}`;
      if (fk.table === 'accounts') checks.push(`SELECT CASE WHEN ${value} IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM memberships WHERE user_id=${value} AND organization_id='cornell-ec')
        THEN RAISE(ABORT,'Account is outside this organization') END;`);
      if (fk.table === 'records') checks.push(`SELECT CASE WHEN ${value} IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM records WHERE id=${value} AND organization_id='cornell-ec')
        THEN RAISE(ABORT,'Record is outside this organization') END;`);
    }
    // Some older polymorphic relations use plain text instead of foreign keys.
    // They must still reject IDs known to belong only to another organization.
    const relationNames = new Set(['actor','actor_id','subject_id','person_id','user_id',
      'created_by','offered_by','offered_to','owner','holder_id','object_id','source_id',
      'project_id','task_id','event_id','course_id','form_id','record_id','recorded_by','resolver','reporter']);
    for (const column of columns) if (relationNames.has(column.name)) {
      const value = `NEW.${quote(column.name)}`;
      checks.push(`SELECT CASE WHEN
        (EXISTS(SELECT 1 FROM accounts WHERE id=${value}) AND NOT EXISTS(
          SELECT 1 FROM memberships WHERE user_id=${value} AND organization_id='cornell-ec'))
        OR EXISTS(SELECT 1 FROM records WHERE id=${value} AND organization_id!='cornell-ec')
        THEN RAISE(ABORT,'Related identity is outside this organization') END;`);
    }
    if (columns.some(c => c.name === 'organization_id')) checks.push(`SELECT CASE WHEN NEW.organization_id!='cornell-ec'
      THEN RAISE(ABORT,'Organization mismatch') END;`);
    if (!checks.length) continue;
    for (const operation of ['INSERT','UPDATE']) exec(`CREATE TRIGGER IF NOT EXISTS ${quote('cec_scope_'+name+'_'+operation)}
      BEFORE ${operation} ON ${table} BEGIN ${checks.join('\n')} END;`);
  }
}

export function migrateMembershipControls(d: DatabaseSync) {
  if (d.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) return;
  d.exec('BEGIN IMMEDIATE');
  try {
    if (d.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) { d.exec('COMMIT'); return; }
    d.exec(`ALTER TABLE memberships ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
      CREATE TRIGGER membership_version AFTER UPDATE ON memberships WHEN NEW.version=OLD.version BEGIN
        UPDATE memberships SET version=version+1 WHERE organization_id=NEW.organization_id AND user_id=NEW.user_id;
      END;
      CREATE TRIGGER membership_last_officer BEFORE UPDATE ON memberships
      WHEN OLD.role='officer' AND OLD.status='active' AND (NEW.role!='officer' OR NEW.status!='active')
        AND NOT EXISTS(SELECT 1 FROM memberships WHERE organization_id=OLD.organization_id AND user_id!=OLD.user_id AND role='officer' AND status='active')
      BEGIN SELECT RAISE(ABORT,'Transfer leadership before removing the last officer'); END;`);
    d.prepare('INSERT INTO schema_migrations VALUES(2,?)').run(new Date().toISOString());
    d.exec('COMMIT');
  } catch (error) { d.exec('ROLLBACK'); throw error; }
}

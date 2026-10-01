// Additive CEC-only tables, shared by SQLite initialization and the PostgreSQL migration.
export const portalSchema = `
CREATE TABLE IF NOT EXISTS portal_profiles (
 organization_id TEXT NOT NULL DEFAULT 'cornell-ec' CHECK(organization_id='cornell-ec'),
 user_id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL, PRIMARY KEY(organization_id,user_id),
 FOREIGN KEY(organization_id,user_id) REFERENCES memberships(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS portal_content (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'cornell-ec' CHECK(organization_id='cornell-ec'),
 owner TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(organization_id,owner) REFERENCES memberships(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS portal_requests (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'cornell-ec' CHECK(organization_id='cornell-ec'),
 owner TEXT NOT NULL, request_key TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('submitted','in_review','needs_info','approved','declined','cancelled')),
 history TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(organization_id,owner,request_key),
 FOREIGN KEY(organization_id,owner) REFERENCES memberships(organization_id,user_id)
);
CREATE TABLE IF NOT EXISTS portal_followups (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT 'cornell-ec' CHECK(organization_id='cornell-ec'),
 owner TEXT NOT NULL, person_id TEXT, contact_id TEXT, data TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 CHECK ((person_id IS NOT NULL AND contact_id IS NULL) OR (person_id IS NULL AND contact_id IS NOT NULL)),
 FOREIGN KEY(organization_id,owner) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(organization_id,person_id) REFERENCES memberships(organization_id,user_id),
 FOREIGN KEY(contact_id) REFERENCES records(id)
);
`;

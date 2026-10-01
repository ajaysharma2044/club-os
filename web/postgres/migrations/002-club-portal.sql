
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

CREATE OR REPLACE FUNCTION check_portal_contact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.contact_id AND organization_id=NEW.organization_id AND kind='contact') THEN
 RAISE EXCEPTION 'Choose a contact in this organization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_contact_scope BEFORE INSERT OR UPDATE ON portal_followups FOR EACH ROW EXECUTE FUNCTION check_portal_contact();
ALTER TABLE portal_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal_profiles FROM PUBLIC, anon, authenticated;
ALTER TABLE portal_content ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal_content FROM PUBLIC, anon, authenticated;
ALTER TABLE portal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal_requests FROM PUBLIC, anon, authenticated;
ALTER TABLE portal_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON portal_followups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION check_portal_contact() FROM PUBLIC, anon, authenticated;

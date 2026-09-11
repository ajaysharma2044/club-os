// Invite-link onboarding.
//
// The existing path asks a new member for a 12-character password, makes them
// an applicant, then requires an application and an officer review before they
// can do anything. For someone who is already in the club that is four steps
// too many, and the field evidence (docs/12) is clear about where these
// students actually coordinate: an officer drops a link in the group chat.
//
// So: an officer generates a link, pastes it into GroupMe, and a member gives
// their name and Cornell email and is in. One screen, no password, no
// application. Email verification can harden this later; today the honest
// security model is the same as the group chat the link was shared in, which
// is what it replaces.

import {
  db,
  fail,
  id,
  text,
  timestamp,
  hash,
  session,
  officer,
  audit,
  emit,
  password,
  type User,
} from "./db";
import { randomBytes } from "node:crypto";

let ready = false;
export function invitesInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS invites(
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  email_domain TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 200,
  uses INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS invite_claims(
  code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY(code,user_id));
`);
  ready = true;
}

/** Short, unambiguous, safe to read aloud or paste into a chat. */
function makeCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return out.slice(0, 4) + "-" + out.slice(4);
}

export type InviteInfo = {
  code: string;
  label: string;
  role: string;
  email_domain: string;
  valid: boolean;
  reason: string;
  remaining: number;
  expires_at: string;
};

export function inviteInfo(code: string): InviteInfo {
  invitesInit();
  const row = db()
    .prepare("SELECT * FROM invites WHERE code=?")
    .get(text(code, 32).toUpperCase()) as any;
  if (!row)
    return {
      code: "",
      label: "",
      role: "",
      email_domain: "",
      valid: false,
      reason: "That invite link is not recognised.",
      remaining: 0,
      expires_at: "",
    };
  const now = timestamp();
  const remaining = Math.max(0, row.max_uses - row.uses);
  const valid = !row.revoked && row.expires_at > now && remaining > 0;
  return {
    code: row.code,
    label: row.label,
    role: row.role,
    email_domain: row.email_domain,
    valid,
    reason: row.revoked
      ? "That invite has been turned off."
      : row.expires_at <= now
        ? "That invite has expired. Ask an officer for a new link."
        : remaining <= 0
          ? "That invite has been used up. Ask an officer for a new link."
          : "",
    remaining,
    expires_at: row.expires_at,
  };
}

/** Join with an invite: name + email, no password, straight to member. */
export function claim(b: any): { token: string; name: string } {
  invitesInit();
  const info = inviteInfo(String(b.code || ""));
  if (!info.valid) fail(info.reason || "That invite link is not valid.", 403);

  const name = text(b.name, 100);
  const email = text(b.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email.");
  if (info.email_domain && !email.endsWith("@" + info.email_domain))
    fail(`Use your @${info.email_domain} address.`);

  const existing = db()
    .prepare("SELECT * FROM users WHERE email=?")
    .get(email) as any;

  // An existing account just signs in and is upgraded to member if it was
  // still sitting at applicant. Nobody is ever asked to make a second account.
  if (existing) {
    if (existing.role === "applicant")
      db().prepare("UPDATE users SET role=? WHERE id=?").run(info.role, existing.id);
    db()
      .prepare("INSERT OR IGNORE INTO invite_claims VALUES (?,?,?)")
      .run(info.code, existing.id, timestamp());
    return { token: session(existing.id), name: existing.name };
  }

  const uid = id();
  // Passwordless: store an unusable credential rather than a guessable one.
  // A member can set a real password later from settings.
  const unusable = password(randomBytes(32).toString("hex"));
  db()
    .prepare("INSERT INTO users(id,name,email,password,role) VALUES (?,?,?,?,?)")
    .run(uid, name, email, unusable, info.role);
  db()
    .prepare("UPDATE invites SET uses=uses+1 WHERE code=?")
    .run(info.code);
  db()
    .prepare("INSERT OR IGNORE INTO invite_claims VALUES (?,?,?)")
    .run(info.code, uid, timestamp());

  const u = {
    id: uid,
    name,
    email,
    role: info.role,
    interests: "",
    shared: 0,
  } as User;
  audit(u, "account.created", uid, { role: info.role, via: "invite" });
  emit(u, "membership", uid, "cornell-ec", {
    status: "active",
    role: info.role,
  });
  return { token: session(uid), name };
}

export function inviteState(u: User) {
  officer(u);
  invitesInit();
  const rows = db()
    .prepare("SELECT * FROM invites WHERE revoked=0 ORDER BY created_at DESC LIMIT 20")
    .all() as any[];
  const now = timestamp();
  return {
    invites: rows.map((r) => ({
      code: r.code,
      label: r.label,
      role: r.role,
      uses: r.uses,
      max_uses: r.max_uses,
      expires_at: r.expires_at,
      active: r.expires_at > now && r.uses < r.max_uses,
    })),
  };
}

export function invites(u: User, action: string, b: any) {
  officer(u);
  invitesInit();
  if (action === "create") {
    const code = makeCode();
    const days = Math.max(1, Math.min(90, Number(b.days) || 14));
    db()
      .prepare(
        "INSERT INTO invites(code,label,role,email_domain,created_by,created_at,expires_at,max_uses) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        code,
        typeof b.label === "string" ? b.label.slice(0, 80) : "",
        b.role === "officer" ? "officer" : "member",
        typeof b.email_domain === "string" ? b.email_domain.slice(0, 60) : "cornell.edu",
        u.id,
        timestamp(),
        new Date(Date.now() + days * 86400e3).toISOString(),
        Math.max(1, Math.min(500, Number(b.max_uses) || 200)),
      );
    audit(u, "invite.create", code, { days });
    return { code };
  }
  if (action === "revoke") {
    const code = text(b.code, 32).toUpperCase();
    db().prepare("UPDATE invites SET revoked=1 WHERE code=?").run(code);
    audit(u, "invite.revoke", code, {});
    return { ok: true };
  }
  fail("Unknown invite action.", 404);
}

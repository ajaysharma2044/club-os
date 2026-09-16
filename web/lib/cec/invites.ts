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
  verify,
  throttle,
  tx,
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
  const valid = row.role === "member" && !row.revoked && row.expires_at > now && remaining > 0;
  return {
    code: row.code,
    label: row.label,
    role: row.role,
    email_domain: row.email_domain,
    valid,
    reason: row.role !== "member" ? "Ask an officer for a new member invitation." : row.revoked
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

/** A bearer invitation grants membership, never proof of account ownership. */
export function claim(b: any): { token: string; name: string } {
  invitesInit();
  const code = text(b.code, 32).toUpperCase();
  const email = text(b.email, 254).toLowerCase();
  throttle("invite:email:" + hash(email), 10);
  throttle("invite:claims", 500);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email.");
  const suppliedPassword = text(b.password, 256);
  return tx(() => {
    const invitation = db().prepare("SELECT * FROM invites WHERE code=?").get(code) as any;
    if (!invitation || invitation.revoked || invitation.expires_at <= timestamp() || invitation.role !== "member")
      fail("This invitation is unavailable. Ask an officer for a new member invitation.", 403);
    if (invitation.email_domain && !email.endsWith("@" + invitation.email_domain))
      fail(`Use your @${invitation.email_domain} address.`);
    const existing = db().prepare("SELECT * FROM accounts WHERE email=?").get(email) as any;
    if (existing && !verify(suppliedPassword, existing.password))
      fail("Unable to join. Use your existing account password, or contact an officer for account recovery.", 401);
    const membership = existing ? db().prepare(
      "SELECT * FROM memberships WHERE organization_id='cornell-ec' AND user_id=?").get(existing.id) as any : null;
    if (membership && ["left", "suspended"].includes(membership.status))
      fail("An officer must restore your membership before you can rejoin.", 403);
    const alreadyClaimed = existing && db().prepare(
      "SELECT 1 FROM invite_claims WHERE code=? AND user_id=?").get(code, existing.id);
    if (!alreadyClaimed && invitation.uses >= invitation.max_uses)
      fail("This invitation has reached its limit. Ask an officer for another.", 409);
    const uid = existing?.id || id();
    const name = existing?.name || text(b.name, 100);
    if (!existing) {
      db().prepare("INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,'member')")
        .run(uid, name, email, password(suppliedPassword));
    } else if (!membership) {
      db().prepare("INSERT INTO memberships(organization_id,user_id,role,status) VALUES('cornell-ec',?,'member','active')").run(uid);
    } else if (membership.status === "pending") {
      db().prepare("UPDATE memberships SET role='member',status='active',joined_at=? WHERE organization_id='cornell-ec' AND user_id=?")
        .run(timestamp(), uid);
    }
    const actor = { id: uid, name, email, role: membership?.role === "officer" ? "officer" : "member", interests: "", shared: 0 } as User;
    if (!existing) audit(actor, "account.created", uid, {role:"member",via:"invite"});
    if (!alreadyClaimed) {
      db().prepare("INSERT INTO invite_claims(code,user_id,claimed_at) VALUES(?,?,?)").run(code, uid, timestamp());
      db().prepare("UPDATE invites SET uses=uses+1 WHERE code=?").run(code);
      audit(actor, "invite.claim", uid, { code });
      if (!membership || membership.status === "pending") emit(actor, "membership", uid, "cornell-ec", { status: "active", role: "member" });
    }
    return { token: session(uid), name };
  });
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
      active: r.role === "member" && r.expires_at > now && r.uses < r.max_uses,
    })),
  };
}

export function invites(u: User, action: string, b: any) {
  officer(u);
  invitesInit();
  if (action === "create") {
    if (b.role && b.role !== "member") fail("Invite members first, then promote them from membership controls.", 400);
    const code = makeCode();
    const days = b.days === undefined ? 14 : Number(b.days);
    const maxUses = b.max_uses === undefined ? 200 : Number(b.max_uses);
    const domain = b.email_domain === undefined ? "cornell.edu" : String(b.email_domain).trim().toLowerCase();
    if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500)
      fail("Choose 1–90 days and 1–500 members.");
    if (domain && (domain.length > 60 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))) fail("Enter an email domain, such as cornell.edu.");
    db()
      .prepare(
        "INSERT INTO invites(code,label,role,email_domain,created_by,created_at,expires_at,max_uses) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        code,
        typeof b.label === "string" ? b.label.slice(0, 80) : "",
        "member",
        domain,
        u.id,
        timestamp(),
        new Date(Date.now() + days * 86400e3).toISOString(),
        maxUses,
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

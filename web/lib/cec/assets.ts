// The asset register: every club-owned thing, who holds it, and who can get in.
//
// The evidence this exists for (docs/12 §11): `cornellec.com` sits on a
// graduated president's personal Porkbun account, and he is not in the channel
// where its transfer was being discussed. There is still no club email, so a
// 100-applicant funnel runs from personal student addresses. A shared social
// password was pasted into the group chat (docs/12 §8). Officers ask each other
// who has access to what and get "u shd have access" back.
//
// The fix, per docs/13 §2.4, is that an asset belongs to a POSITION, not a
// person: `role_key` is the media chair, the treasurer, the president; the
// holder is whoever occupies that seat this term. When the seat changes hands,
// the asset moves with it. Everything else here exists to make the gap between
// those two facts visible before it becomes a lapsed renewal.
//
// ---------------------------------------------------------------------------
// WE DO NOT STORE CREDENTIALS. NOT ENCRYPTED, NOT "TEMPORARILY", NOT EVER.
//
// This module records WHERE a credential lives (`location`: a password-manager
// item, a registrar account, a vault entry) and WHO currently holds it
// (`asset_access`). It never records the credential itself. A password column
// here would recreate the exact failure this register exists to prevent: one
// more place the Instagram password is readable by everyone who can scroll
// back, surviving every graduation, revocable from nobody.
//
// The fix for a plaintext password in a group chat is a password manager plus a
// record of who holds it — not a second place to leak it. So `location` points
// at the vault, `asset_access` says who can open it, and revoking someone means
// removing their access in the real system and recording that here. If a
// future reader is tempted to add `secret` to the `assets` table: the club
// already tried storing secrets in a chat log, and that is the bug.
// ---------------------------------------------------------------------------
//
// Behavioural emissions. The quant store (services/quant/club_quant/store.py)
// has a CLOSED schema: only declared kinds, with exactly their declared payload
// keys. Nothing there describes "an asset was registered", and inventing a kind
// would be rejected at ingest. What genuinely fits is `commitment_offer`, whose
// declared vocabulary already contains `ownership` and `handoff` — because a
// person taking owner-or-admin control of a club asset IS a commitment, and
// `reassigned` is defined there as "moved to someone else; not the person's
// choice", which is precisely what a handoff does to the outgoing officer. So:
//
//   owner/admin access starts  -> commitment_offer {accepted,   ownership}
//   owner/admin access ends    -> commitment_offer {withdrawn,  ownership}
//   asset handed to a new holder -> commitment_offer {accepted, handoff}
//                                 + {reassigned, ownership} for the outgoing one
//
// Editor/viewer grants emit nothing: looking at a Drive folder is not a
// commitment, and padding the behavioural log with non-commitments would make
// every take rate downstream a lie. Those are recorded with audit() only.

import {
  db,
  fail,
  id,
  text,
  date,
  timestamp,
  officer,
  member,
  audit,
  emit,
  type User,
} from "./db";

export const ASSET_KINDS = [
  "domain",
  "social_account",
  "drive_folder",
  "email_account",
  "payment_account",
  "form",
  "subscription",
  "document",
  "other",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ACCESS_LEVELS = ["owner", "admin", "editor", "viewer"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * Levels that can actually save the asset: reset the registrar, add a new
 * admin, pay the renewal. Editors and viewers cannot, so they do not count
 * toward the bus factor however many of them there are.
 */
export const CONTINUITY_LEVELS: AccessLevel[] = ["owner", "admin"];

/**
 * "Current" means someone still in the club. The users table carries the role
 * and 'alumni' is how a departed member is recorded; an applicant has not
 * joined. Either way they cannot be relied on to renew a domain, so neither
 * counts as continuity.
 */
const CURRENT_ROLES = "('officer','member')";

const MONTH_MS = 30.436875 * 86400e3; // mean Gregorian month

let ready = false;
export function assetsInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS assets(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  holder_id TEXT REFERENCES users(id),
  role_key TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS asset_identity ON assets(kind,name);
CREATE INDEX IF NOT EXISTS asset_role ON assets(role_key);
-- Who can get into the thing. Deliberately no credential column; see the file
-- header. 'level' is what they can do in the real system, recorded here so
-- "who has access" is a page instead of a question in the group chat.
CREATE TABLE IF NOT EXISTS asset_access(
  asset_id TEXT NOT NULL REFERENCES assets(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  level TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  PRIMARY KEY(asset_id,user_id));
CREATE INDEX IF NOT EXISTS asset_access_user ON asset_access(user_id);
`);
  ready = true;
}

export type AssetRow = {
  id: string;
  kind: string;
  name: string;
  location: string;
  holder_id: string | null;
  role_key: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export function asset(key: string): AssetRow {
  assetsInit();
  const row = db().prepare("SELECT * FROM assets WHERE id=?").get(key) as
    | AssetRow
    | undefined;
  if (!row) fail("That asset is not in the register.", 404);
  return row!;
}

function person(userId: string): { id: string; name: string; role: string } {
  const row = db()
    .prepare("SELECT id,name,role FROM users WHERE id=?")
    .get(userId) as { id: string; name: string; role: string } | undefined;
  if (!row) fail("That person is not in the directory.", 404);
  return row!;
}

// --- expected departure ----------------------------------------------------
//
// Succession math needs one fact per person: when we expect them to leave.
// The roster does not carry a class year yet (docs/13, build item 6, "roster
// with real fields"), and a person-level fact does not belong in an asset
// table — duplicating it per asset would go stale the first time anything is
// reassigned. So it lives as one key per person in the existing settings
// store, and moves onto the roster record the day that record grows the field.

function departureKey(userId: string) {
  return `continuity.departure:${userId}`;
}

/** ISO date we expect this person to leave, or "" if nobody has recorded one. */
export function departureOf(userId: string): string {
  assetsInit();
  const row = db()
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(departureKey(userId)) as { value: string } | undefined;
  return row?.value || "";
}

export function setDeparture(u: User, userId: string, when: string): string {
  assetsInit();
  person(userId);
  const at = date(when);
  db()
    .prepare(
      "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(departureKey(userId), at);
  audit(u, "asset.departure", userId, { expected_departure: at });
  return at;
}

/** Months from now until an ISO date; negative once it has passed. */
export function monthsUntil(iso: string, from = Date.now()): number {
  return Math.round(((new Date(iso).getTime() - from) / MONTH_MS) * 10) / 10;
}

// --- register --------------------------------------------------------------

/**
 * Put a thing in the register. `location` is where it lives — a registrar
 * account, a vault item, a URL — never a secret. Naming a holder grants them
 * owner access, because whoever controls the thing is by definition an owner
 * of it, and a register that says otherwise is describing a club that does not
 * exist.
 */
export function registerAsset(
  u: User,
  a: {
    kind: AssetKind;
    name: string;
    location?: string;
    holder?: string; // omit when nobody knows who has it; that is its own alarm
    roleKey?: string;
    notes?: string;
  },
): string {
  assetsInit();
  if (!ASSET_KINDS.includes(a.kind)) fail("Unknown asset kind.");
  const name = text(a.name, 160);
  if (
    db().prepare("SELECT id FROM assets WHERE kind=? AND name=?").get(a.kind, name)
  )
    fail("That asset is already in the register.");
  const holder = a.holder ? person(a.holder).id : null;
  const key = id();
  const now = timestamp();
  db()
    .prepare(
      "INSERT INTO assets(id,kind,name,location,holder_id,role_key,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
    .run(
      key,
      a.kind,
      name,
      String(a.location || "").slice(0, 2000),
      holder,
      String(a.roleKey || "").slice(0, 64),
      String(a.notes || "").slice(0, 2000),
      now,
      now,
    );
  audit(u, "asset.register", key, {
    kind: a.kind,
    name,
    role_key: a.roleKey || "",
    holder: holder || "",
  });
  if (holder) {
    putAccess(u, key, holder, "owner");
    emit(u, "commitment_offer", holder, key, {
      status: "accepted",
      offer_kind: "ownership",
    });
  }
  return key;
}

/** The write half of a grant: row plus audit, no emission. */
function putAccess(
  u: User,
  assetId: string,
  userId: string,
  level: AccessLevel,
): string {
  const prev = db()
    .prepare("SELECT level FROM asset_access WHERE asset_id=? AND user_id=?")
    .get(assetId, userId) as { level: string } | undefined;
  db()
    .prepare(
      `INSERT INTO asset_access(asset_id,user_id,level,granted_at,granted_by) VALUES (?,?,?,?,?)
       ON CONFLICT(asset_id,user_id) DO UPDATE SET level=excluded.level,granted_at=excluded.granted_at,granted_by=excluded.granted_by`,
    )
    .run(assetId, userId, level, timestamp(), u.id);
  audit(u, "asset.access.grant", assetId, {
    user_id: userId,
    level,
    previous: prev?.level || "",
  });
  return prev?.level || "";
}

export function grantAccess(
  u: User,
  assetId: string,
  userId: string,
  level: AccessLevel,
): boolean {
  assetsInit();
  asset(assetId);
  if (!ACCESS_LEVELS.includes(level)) fail("Unknown access level.");
  person(userId);
  const previous = putAccess(u, assetId, userId, level);
  const was = CONTINUITY_LEVELS.includes(previous as AccessLevel);
  const now = CONTINUITY_LEVELS.includes(level);
  if (now && !was)
    emit(u, "commitment_offer", userId, assetId, {
      status: "accepted",
      offer_kind: "ownership",
    });
  // A demotion ends the commitment as surely as a revocation does.
  if (was && !now)
    emit(u, "commitment_offer", userId, assetId, {
      status: "withdrawn",
      offer_kind: "ownership",
    });
  return previous !== level;
}

/**
 * Remove someone's access. The row goes; the append-only audit log is the
 * history, which is why `asset_access` carries no `revoked_at` — the register
 * must answer "who can get in right now" without the reader filtering out
 * rows that no longer mean anything.
 *
 * Revoking the holder's own access does not clear `holder_id`. Someone can be
 * recorded as the holder of a domain they can no longer open, and that state
 * — bus factor zero with a live holder — is exactly the alarm worth raising.
 */
export function revokeAccess(u: User, assetId: string, userId: string): boolean {
  assetsInit();
  asset(assetId);
  const row = db()
    .prepare("SELECT level FROM asset_access WHERE asset_id=? AND user_id=?")
    .get(assetId, userId) as { level: string } | undefined;
  if (!row) return false;
  db()
    .prepare("DELETE FROM asset_access WHERE asset_id=? AND user_id=?")
    .run(assetId, userId);
  audit(u, "asset.access.revoke", assetId, { user_id: userId, level: row.level });
  if (CONTINUITY_LEVELS.includes(row.level as AccessLevel))
    emit(u, "commitment_offer", userId, assetId, {
      status: "withdrawn",
      offer_kind: "ownership",
    });
  return true;
}

/**
 * Hand the asset to someone else. The outgoing holder's access row is left
 * alone on purpose: in the real world you cannot delete a graduated
 * president's registrar login by editing a database, and a register that
 * claims you did is worse than one that admits the truth. Revoking is a
 * separate, explicit act performed once it has actually happened.
 */
export function reassign(u: User, assetId: string, toUserId: string): boolean {
  assetsInit();
  const a = asset(assetId);
  const to = person(toUserId).id;
  if (a.holder_id === to) return false;
  db()
    .prepare("UPDATE assets SET holder_id=?,updated_at=? WHERE id=?")
    .run(to, timestamp(), assetId);
  putAccess(u, assetId, to, "owner");
  audit(u, "asset.reassign", assetId, {
    from: a.holder_id || "",
    to,
    role_key: a.role_key,
  });
  if (a.holder_id)
    emit(u, "commitment_offer", a.holder_id, assetId, {
      status: "reassigned",
      offer_kind: "ownership",
    });
  emit(u, "commitment_offer", to, assetId, {
    status: "accepted",
    offer_kind: "handoff",
  });
  return true;
}

// --- succession risk -------------------------------------------------------

/**
 * How many CURRENT people can actually save this asset — owner or admin, still
 * in the club. Zero means the only people who can get in have left: the domain
 * is one lapsed renewal from gone and nobody in the room can stop it. One means
 * the club is a single graduation away from zero. Both are alarms; zero is the
 * fire.
 */
export function busFactor(assetId: string): number {
  assetsInit();
  const row = db()
    .prepare(
      `SELECT COUNT(*) n FROM asset_access x JOIN users u ON u.id=x.user_id
       WHERE x.asset_id=? AND x.level IN ('owner','admin') AND u.role IN ${CURRENT_ROLES}`,
    )
    .get(assetId) as { n: number };
  return row.n;
}

export type OrphanRow = {
  asset_id: string;
  kind: string;
  name: string;
  location: string;
  role_key: string;
  holder_id: string;
  holder_name: string;
  holder_role: string;
  departs_at: string;
  /** months until the holder leaves; negative if past, null if unknown */
  months: number | null;
  /** the holder has already left, or there is no holder at all */
  gone: boolean;
  bus_factor: number;
  /** 0 nobody holds it, 1 holder has left, 2 holder is still here */
  rank: 0 | 1 | 2;
  line: string;
};

/**
 * Every asset ordered by how soon it loses its holder. Already-lost first,
 * then soonest to go. "That list, rendered as a page, is the entire pitch for
 * the transition flow" (docs/14 §5) — so it is built to be read top-down and
 * every row carries its own sentence.
 */
export function orphanRisk(asOf = Date.now()): OrphanRow[] {
  assetsInit();
  const rows = db()
    .prepare(
      `SELECT a.*, u.name holder_name, u.role holder_role
       FROM assets a LEFT JOIN users u ON u.id=a.holder_id`,
    )
    .all() as (AssetRow & { holder_name: string | null; holder_role: string | null })[];
  const counts = new Map<string, number>();
  for (const c of db()
    .prepare(
      `SELECT x.asset_id, COUNT(*) n FROM asset_access x JOIN users u ON u.id=x.user_id
       WHERE x.level IN ('owner','admin') AND u.role IN ${CURRENT_ROLES} GROUP BY x.asset_id`,
    )
    .all() as { asset_id: string; n: number }[])
    counts.set(c.asset_id, c.n);
  const departures = new Map<string, string>();
  for (const d of db()
    .prepare("SELECT key,value FROM settings WHERE key LIKE 'continuity.departure:%'")
    .all() as { key: string; value: string }[])
    departures.set(d.key.slice("continuity.departure:".length), d.value);

  const out = rows.map((r): OrphanRow => {
    const bus = counts.get(r.id) || 0;
    const holder = r.holder_id || "";
    const gone =
      !holder || !(r.holder_role === "officer" || r.holder_role === "member");
    const departs = holder ? departures.get(holder) || "" : "";
    const months = departs ? monthsUntil(departs, asOf) : null;
    const rank: 0 | 1 | 2 = !holder ? 0 : gone ? 1 : 2;
    const where = `${r.name} (${r.kind.replace(/_/g, " ")})`;
    const seat = r.role_key ? ` Should sit with ${r.role_key}.` : " No position owns it.";
    const line = !holder
      ? `${where} — nobody is recorded as holding it.${seat} Bus factor ${bus}.`
      : gone
        ? `${where} — held by ${r.holder_name}, who has left${
            months !== null ? ` (${Math.abs(months).toFixed(1)} months ago)` : ""
          }.${seat} Bus factor ${bus}.`
        : months === null
          ? `${where} — held by ${r.holder_name}; no expected departure recorded.${seat} Bus factor ${bus}.`
          : `${where} — held by ${r.holder_name}, leaving in ${months.toFixed(1)} months.${seat} Bus factor ${bus}.`;
    return {
      asset_id: r.id,
      kind: r.kind,
      name: r.name,
      location: r.location,
      role_key: r.role_key,
      holder_id: holder,
      holder_name: r.holder_name || "",
      holder_role: r.holder_role || "",
      departs_at: departs,
      months,
      gone,
      bus_factor: bus,
      rank,
      line,
    };
  });

  // Unheld first, then departed, then by time remaining. An unknown departure
  // sorts last within its group: it is a gap in the roster, not an emergency,
  // and putting it above a dated deadline would bury the real ones.
  return out.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.months ?? Infinity) - (b.months ?? Infinity) ||
      a.bus_factor - b.bus_factor ||
      a.name.localeCompare(b.name),
  );
}

export type AccessRow = {
  user_id: string;
  name: string;
  role: string;
  level: string;
  granted_at: string;
  granted_by: string;
  current: boolean;
};

/** Who can get into one asset. The answer to "who has access", as a list. */
export function accessList(assetId: string): AccessRow[] {
  assetsInit();
  const rows = db()
    .prepare(
      `SELECT x.user_id,x.level,x.granted_at,x.granted_by,u.name,u.role
       FROM asset_access x JOIN users u ON u.id=x.user_id WHERE x.asset_id=?
       ORDER BY CASE x.level WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.name`,
    )
    .all(assetId) as Omit<AccessRow, "current">[];
  return rows.map((r) => ({
    ...r,
    current: r.role === "officer" || r.role === "member",
  }));
}

/** What one member can get into, and what they are on the hook for. */
export function myAccess(u: User) {
  member(u);
  assetsInit();
  const rows = db()
    .prepare(
      `SELECT a.id,a.kind,a.name,a.location,a.role_key,x.level,(a.holder_id=?) holds
       FROM assets a JOIN asset_access x ON x.asset_id=a.id
       WHERE x.user_id=? ORDER BY a.kind,a.name`,
    )
    .all(u.id, u.id) as any[];
  return {
    assets: rows.map((r) => ({ ...r, holds: !!r.holds })),
  };
}

/**
 * The officer page. Counts by kind, the two alarm lists, and the orphan
 * ordering — enough to answer "what do we own, who has it, and what do we lose
 * in May" without asking anyone.
 */
export function assetState(u: User) {
  officer(u);
  assetsInit();
  const counts = db()
    .prepare("SELECT kind,COUNT(*) n FROM assets GROUP BY kind ORDER BY kind")
    .all() as { kind: string; n: number }[];
  const risk = orphanRisk();
  return {
    total: risk.length,
    counts,
    kinds: ASSET_KINDS,
    levels: ACCESS_LEVELS,
    /** nobody left who can get in: the fire */
    stranded: risk.filter((r) => r.bus_factor === 0),
    /** one person away from stranded */
    single_point: risk.filter((r) => r.bus_factor === 1),
    /** assets tied to no position, which is what breaks at handoff */
    unassigned_role: risk.filter((r) => !r.role_key).length,
    orphan_risk: risk,
  };
}

export function assets(u: User, action: string, b: any) {
  officer(u);
  assetsInit();
  if (action === "register") {
    const key = registerAsset(u, {
      kind: text(b.kind, 32) as AssetKind,
      name: text(b.name, 160),
      location: typeof b.location === "string" ? b.location : "",
      holder: b.holder ? text(b.holder, 64) : undefined,
      roleKey: typeof b.role_key === "string" ? b.role_key : "",
      notes: typeof b.notes === "string" ? b.notes : "",
    });
    return { id: key };
  }
  if (action === "grant")
    return {
      ok: grantAccess(
        u,
        text(b.asset_id, 64),
        text(b.user_id, 64),
        text(b.level, 16) as AccessLevel,
      ),
    };
  if (action === "revoke")
    return { ok: revokeAccess(u, text(b.asset_id, 64), text(b.user_id, 64)) };
  if (action === "reassign")
    return { ok: reassign(u, text(b.asset_id, 64), text(b.to, 64)) };
  if (action === "departure")
    return {
      expected_departure: setDeparture(u, text(b.user_id, 64), text(b.at, 40)),
    };
  fail("Unknown asset action.", 404);
}

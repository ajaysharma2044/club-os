// The opportunity ledger: what people were OFFERED, not just what they did.
//
// This is the load-bearing table in docs/15-behavioral-quant-layer.md. Every
// take-rate signal needs "offered" as its denominator; without it a model
// concludes presidents are excellent because presidents were handed every
// opportunity. The task workflow already had the semantics hiding in it —
// "assigned" is an offer, "accepted" is the response, and an assignment that
// was never accepted was previously invisible to the behavioral layer.

import { db, fail, id, text, timestamp, officer, audit, emit, type User } from "./db";

export const OPPORTUNITY_KINDS = [
  "task",
  "ownership",
  "panel",
  "coffee_chat",
  "speaker_outreach",
  "committee",
  "handoff",
] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const RESPONSES = [
  "pending",
  "accepted",
  "declined", // the person turned it down
  "expired", // the person never answered
  "withdrawn", // an officer pulled it; not the person's choice
  "reassigned", // moved to someone else; not the person's choice
] as const;
export type Response = (typeof RESPONSES)[number];

/** Responses that reflect the person's own choice (the fair denominator). */
export const OWN_CHOICE: Response[] = ["accepted", "declined", "expired"];

let ready = false;
export function opportunitiesInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS opportunities(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT NOT NULL,
  offered_to TEXT NOT NULL REFERENCES users(id),
  offered_by TEXT NOT NULL,
  episode_id TEXT NOT NULL DEFAULT '',
  offered_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  response TEXT NOT NULL DEFAULT 'pending',
  responded_at TEXT,
  context TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS opp_person ON opportunities(offered_to,kind,observed_at);
CREATE UNIQUE INDEX IF NOT EXISTS opp_open ON opportunities(kind,object_type,object_id,offered_to) WHERE response='pending';
`);
  ready = true;
}

function episodeFor(objectType: string, objectId: string): string {
  const row = db()
    .prepare(
      "SELECT episode_id FROM episode_objects WHERE object_type=? AND object_id=?",
    )
    .get(objectType, objectId) as { episode_id: string } | undefined;
  return row?.episode_id || "";
}

/** Record that something was offered to someone. Idempotent while pending. */
export function offer(
  u: User,
  o: {
    kind: OpportunityKind;
    objectType: string;
    objectId: string;
    to: string;
    episode?: string;
    context?: Record<string, unknown>;
    response?: Response; // for offers that are accepted in the same breath
  },
): string {
  opportunitiesInit();
  if (!OPPORTUNITY_KINDS.includes(o.kind)) fail("Unknown opportunity kind.");
  const existing = db()
    .prepare(
      "SELECT id FROM opportunities WHERE kind=? AND object_type=? AND object_id=? AND offered_to=? AND response='pending'",
    )
    .get(o.kind, o.objectType, o.objectId, o.to) as { id: string } | undefined;
  if (existing) return existing.id;
  const key = id();
  const now = timestamp();
  const response = o.response || "pending";
  db()
    .prepare(
      "INSERT INTO opportunities(id,kind,object_type,object_id,offered_to,offered_by,episode_id,offered_at,observed_at,response,responded_at,context) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      key,
      o.kind,
      o.objectType,
      o.objectId,
      o.to,
      u.id,
      o.episode ?? episodeFor(o.objectType, o.objectId),
      now,
      now,
      response,
      response === "pending" ? null : now,
      JSON.stringify(o.context || {}),
    );
  emit(u, "commitment_offer", o.to, key, {
    status: response === "pending" ? "offered" : response,
    offer_kind: o.kind,
  });
  return key;
}

/** Record the response to a pending offer. No-op if there is none. */
export function respond(
  u: User,
  r: { objectType: string; objectId: string; to: string; response: Response; kind?: OpportunityKind },
): boolean {
  opportunitiesInit();
  if (!RESPONSES.includes(r.response) || r.response === "pending")
    fail("Unknown response.");
  const row = db()
    .prepare(
      `SELECT id,kind FROM opportunities WHERE object_type=? AND object_id=? AND offered_to=? AND response='pending'${r.kind ? " AND kind=?" : ""} ORDER BY offered_at DESC LIMIT 1`,
    )
    .get(...([r.objectType, r.objectId, r.to, ...(r.kind ? [r.kind] : [])] as any[])) as
    | { id: string; kind: string }
    | undefined;
  if (!row) return false;
  const now = timestamp();
  db()
    .prepare("UPDATE opportunities SET response=?,responded_at=? WHERE id=?")
    .run(r.response, now, row.id);
  emit(u, "commitment_offer", r.to, row.id, {
    status: r.response,
    offer_kind: row.kind,
  });
  return true;
}

/**
 * Offers nobody answered. Silence is a response, and a systematically
 * different one from a decline — which is exactly why it gets its own state.
 */
export function expireStale(u: User, days = 14): number {
  opportunitiesInit();
  const cutoff = new Date(Date.now() - days * 86400e3).toISOString();
  const rows = db()
    .prepare(
      "SELECT id,offered_to,kind FROM opportunities WHERE response='pending' AND offered_at<?",
    )
    .all(cutoff) as { id: string; offered_to: string; kind: string }[];
  const now = timestamp();
  const upd = db().prepare(
    "UPDATE opportunities SET response='expired',responded_at=? WHERE id=?",
  );
  for (const r of rows) {
    upd.run(now, r.id);
    emit(u, "commitment_offer", r.offered_to, r.id, {
      status: "expired",
      offer_kind: r.kind,
    });
  }
  if (rows.length) audit(u, "opportunity.expire", "batch", { count: rows.length });
  return rows.length;
}

export type TakeRate = {
  kind: string;
  offered: number;
  accepted: number;
  declined: number;
  expired: number;
  pending: number;
  /** offers not attributable to the person's own choice; excluded from rates */
  excluded: number;
};

/** Per-kind take rates for a person as of a point in time (observed_at). */
export function takeRates(userId: string, asOf?: string): TakeRate[] {
  opportunitiesInit();
  const rows = db()
    .prepare(
      `SELECT kind,response FROM opportunities WHERE offered_to=?${asOf ? " AND observed_at<=?" : ""}`,
    )
    .all(...([userId, ...(asOf ? [asOf] : [])] as any[])) as {
    kind: string;
    response: Response;
  }[];
  const by = new Map<string, TakeRate>();
  for (const r of rows) {
    if (!by.has(r.kind))
      by.set(r.kind, {
        kind: r.kind,
        offered: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        pending: 0,
        excluded: 0,
      });
    const t = by.get(r.kind)!;
    t.offered++;
    if (r.response === "accepted") t.accepted++;
    else if (r.response === "declined") t.declined++;
    else if (r.response === "expired") t.expired++;
    else if (r.response === "pending") t.pending++;
    else t.excluded++;
  }
  return [...by.values()];
}

export function opportunityState(u: User) {
  officer(u);
  opportunitiesInit();
  const totals = db()
    .prepare(
      "SELECT kind,response,COUNT(*) n FROM opportunities GROUP BY kind,response",
    )
    .all() as { kind: string; response: string; n: number }[];
  const stale = db()
    .prepare(
      "SELECT COUNT(*) n FROM opportunities WHERE response='pending' AND offered_at<?",
    )
    .get(new Date(Date.now() - 14 * 86400e3).toISOString()) as { n: number };
  return { totals, stale_pending: stale.n, kinds: OPPORTUNITY_KINDS };
}

export function opportunities(u: User, action: string, b: any) {
  officer(u);
  if (action === "offer") {
    const key = offer(u, {
      kind: text(b.kind, 32) as OpportunityKind,
      objectType: text(b.object_type, 32),
      objectId: text(b.object_id, 64),
      to: text(b.to, 64),
      context: typeof b.context === "object" && b.context ? b.context : {},
    });
    audit(u, "opportunity.offer", key, { kind: b.kind, to: b.to });
    return { id: key };
  }
  if (action === "respond") {
    const done = respond(u, {
      objectType: text(b.object_type, 32),
      objectId: text(b.object_id, 64),
      to: text(b.to, 64),
      response: text(b.response, 16) as Response,
      kind: b.kind ? (text(b.kind, 32) as OpportunityKind) : undefined,
    });
    audit(u, "opportunity.respond", text(b.object_id, 64), { response: b.response });
    return { ok: done };
  }
  if (action === "expire") return { expired: expireStale(u, Number(b.days) || 14) };
  fail("Unknown opportunity action.", 404);
}

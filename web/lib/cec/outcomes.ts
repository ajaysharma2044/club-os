// Outcome labels: the thing a signal is supposed to predict.
//
// A signal with no outcome is decoration. Every row here is a (subject, kind,
// value) observed at a time, with `horizon_start` marking when the prediction
// window opened — which is what lets the registry compute a signal *as of* that
// moment and correlate it with what happened after, never the reverse.

import { db, fail, id, text, timestamp, officer, audit, emit, type User } from "./db";

export const OUTCOME_KINDS = [
  // person-level
  "member_active_next_term",
  "transition_completed",
  "candidate_reached_interview",
  "candidate_offered",
  "owned_episode_completed_on_time",
  // object-level (kept for later joins; the registry uses person-level today)
  "event_met_forecast",
  "sponsor_converted",
  "speaker_confirmed",
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

let ready = false;
export function outcomesInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS outcomes(
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  value REAL NOT NULL,
  horizon_start TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  UNIQUE(subject_type,subject_id,kind,horizon_start));
CREATE INDEX IF NOT EXISTS outcome_kind ON outcomes(kind,subject_type,observed_at);
`);
  ready = true;
}

export function label(
  u: User,
  o: {
    subjectType: "person" | "episode" | "event" | "candidate" | "team";
    subjectId: string;
    kind: OutcomeKind;
    value: number;
    horizonStart: string;
    occurredAt?: string;
    source?: string;
    evidenceLevel?: string;
    context?: Record<string, unknown>;
  },
): string {
  outcomesInit();
  if (!OUTCOME_KINDS.includes(o.kind)) fail("Unknown outcome kind.");
  const key = id();
  const now = timestamp();
  db()
    .prepare(
      `INSERT INTO outcomes(id,subject_type,subject_id,kind,value,horizon_start,occurred_at,observed_at,source,evidence_level,recorded_by,context)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(subject_type,subject_id,kind,horizon_start) DO NOTHING`,
    )
    .run(
      key,
      o.subjectType,
      o.subjectId,
      o.kind,
      o.value,
      o.horizonStart,
      o.occurredAt || now,
      now,
      o.source || "officer",
      o.evidenceLevel || "counterparty_confirmed",
      u.id,
      JSON.stringify(o.context || {}),
    );
  // Coarse label only. The quant store deliberately refuses raw scores.
  emit(u, "outcome", o.subjectId, key, {
    status: o.value >= 0.5 ? "positive" : "negative",
    measure: o.kind,
  });
  return key;
}

export type OutcomeRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  kind: string;
  value: number;
  horizon_start: string;
  occurred_at: string;
  observed_at: string;
  source: string;
  evidence_level: string;
};

/** Person-level outcomes of a kind, oldest first. */
export function personOutcomes(kind: OutcomeKind): OutcomeRow[] {
  outcomesInit();
  return db()
    .prepare(
      "SELECT * FROM outcomes WHERE kind=? AND subject_type='person' ORDER BY horizon_start",
    )
    .all(kind) as OutcomeRow[];
}

/**
 * Derive what we can observe without asking anyone. Today: whether an owner's
 * closed episodes finished with every deadlined task completed on time.
 * Labelled system_derived so its provenance is never mistaken for a human call.
 */
export function deriveOutcomes(u: User): number {
  outcomesInit();
  const episodes = db()
    .prepare(
      "SELECT id,owner,created_at,status FROM episodes WHERE status<>'active'",
    )
    .all() as { id: string; owner: string; created_at: string; status: string }[];
  const events = db()
    .prepare(
      "SELECT episode_id,event_type,object_id,occurred_at,context FROM activity_events WHERE object_type='task'",
    )
    .all() as {
    episode_id: string;
    event_type: string;
    object_id: string;
    occurred_at: string;
    context: string;
  }[];
  const byEpisode = new Map<string, typeof events>();
  for (const e of events) {
    if (!byEpisode.has(e.episode_id)) byEpisode.set(e.episode_id, []);
    byEpisode.get(e.episode_id)!.push(e);
  }
  let n = 0;
  for (const ep of episodes) {
    const evs = byEpisode.get(ep.id) || [];
    const due = new Map<string, string>();
    const done = new Map<string, string>();
    for (const e of evs) {
      let ctx: any = {};
      try {
        ctx = JSON.parse(e.context);
      } catch {}
      if (ctx.due_at) due.set(e.object_id, ctx.due_at);
      if (e.event_type === "task.completed") done.set(e.object_id, e.occurred_at);
    }
    if (!due.size) continue; // nothing deadlined; no honest label possible
    let onTime = 1;
    for (const [task, d] of due) {
      const c = done.get(task);
      if (!c || c > d) {
        onTime = 0;
        break;
      }
    }
    const before = (
      db().prepare("SELECT COUNT(*) n FROM outcomes").get() as { n: number }
    ).n;
    label(u, {
      subjectType: "person",
      subjectId: ep.owner,
      kind: "owned_episode_completed_on_time",
      value: onTime,
      horizonStart: ep.created_at,
      source: "system",
      evidenceLevel: "system_derived",
      context: { episode_id: ep.id },
    });
    const after = (
      db().prepare("SELECT COUNT(*) n FROM outcomes").get() as { n: number }
    ).n;
    n += after - before;
  }
  if (n) audit(u, "outcome.derive", "batch", { count: n });
  return n;
}

export function outcomes(u: User, action: string, b: any) {
  officer(u);
  if (action === "label") {
    const key = label(u, {
      subjectType: text(b.subject_type, 16) as any,
      subjectId: text(b.subject_id, 64),
      kind: text(b.kind, 48) as OutcomeKind,
      value: Number(b.value),
      horizonStart: text(b.horizon_start, 40),
      occurredAt: b.occurred_at ? text(b.occurred_at, 40) : undefined,
      source: b.source ? text(b.source, 32) : undefined,
      context: typeof b.context === "object" && b.context ? b.context : {},
    });
    audit(u, "outcome.label", key, { kind: b.kind, value: b.value });
    return { id: key };
  }
  if (action === "derive") return { derived: deriveOutcomes(u) };
  fail("Unknown outcome action.", 404);
}

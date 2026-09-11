// The behavioral signal library and its registry.
//
// Each signal is a fact sheet (definition, hypothesis, the outcome it claims
// to predict, a half-life) plus a computation over the point-in-time event
// log. Rates carry a Beta posterior with an empirical-Bayes peer prior, so a
// freshman with three events shows a wide interval and borrows strength from
// peers, and a veteran's record speaks for itself.
//
// The registry tests every signal against its declared outcome with a Spearman
// information coefficient, walk-forward: the signal is computed as of each
// outcome's horizon_start using only what was observed by then. With one club
// and a partial semester the honest verdict for most signals is
// "insufficient_data", and the registry is built to say exactly that.
//
// Mirror test (docs/11): a person sees only their own signals. Officers see the
// aggregate registry, never a per-person number beside a name.

import { db, fail, timestamp, officer, member, audit, type User } from "./db";
import {
  betaPosterior,
  peerPrior,
  peerZ,
  momentum,
  informationCoefficient,
  informationRatio,
  signalVerdict,
  type Posterior,
} from "./behavioral";
import { opportunitiesInit, OWN_CHOICE } from "./opportunities";
import { outcomesInit, personOutcomes, type OutcomeKind } from "./outcomes";

export const POLICY = "behavioral-signals-v1";

export type SignalDef = {
  key: string;
  family: "execution" | "ownership" | "adaptation" | "collaboration" | "learning" | "reliability";
  label: string;
  definition: string;
  hypothesis: string;
  /** whether the denominator is "what was offered", the fair one */
  opportunityAdjusted: boolean;
  /** the outcome this signal claims to predict; null = descriptive only */
  outcome: OutcomeKind | null;
  /** expected sign of the relationship, so a backwards result is flagged */
  expectedSign: 1 | -1;
  halfLifeDays: number;
  kind: "rate" | "latency";
};

export const SIGNALS: SignalDef[] = [
  {
    key: "commitment_follow_through",
    family: "execution",
    label: "Commitment follow-through",
    definition: "Accepted tasks completed ÷ accepted tasks that are resolved (completed, dropped, or past due). Open work is excluded, never counted against anyone.",
    hypothesis: "People who finish what they accept stay active the following term.",
    opportunityAdjusted: false,
    outcome: "member_active_next_term",
    expectedSign: 1,
    halfLifeDays: 180,
    kind: "rate",
  },
  {
    key: "task_take_rate",
    family: "ownership",
    label: "Task take rate",
    definition: "Tasks accepted ÷ tasks offered that the person answered or let expire. Withdrawn and reassigned offers are excluded because they were not the person's choice.",
    hypothesis: "Saying yes to offered work predicts staying active.",
    opportunityAdjusted: true,
    outcome: "member_active_next_term",
    expectedSign: 1,
    halfLifeDays: 120,
    kind: "rate",
  },
  {
    key: "ownership_take_rate",
    family: "ownership",
    label: "Ownership take rate",
    definition: "Ownership roles accepted ÷ ownership roles offered and answered.",
    hypothesis: "People who take ownership when offered complete officer transitions.",
    opportunityAdjusted: true,
    outcome: "transition_completed",
    expectedSign: 1,
    halfLifeDays: 365,
    kind: "rate",
  },
  {
    key: "panel_take_rate",
    family: "reliability",
    label: "Panel take rate",
    definition: "Interview-panel seats accepted ÷ seats offered and answered.",
    hypothesis: "Officers who staff panels when asked complete transitions.",
    opportunityAdjusted: true,
    outcome: "transition_completed",
    expectedSign: 1,
    halfLifeDays: 180,
    kind: "rate",
  },
  {
    key: "deadline_adherence",
    family: "execution",
    label: "Deadline adherence",
    definition: "Completed tasks finished on or before their due date ÷ completed tasks that had a due date.",
    hypothesis: "On-time completion predicts an owner's episodes finishing on time.",
    opportunityAdjusted: false,
    outcome: "owned_episode_completed_on_time",
    expectedSign: 1,
    halfLifeDays: 180,
    kind: "rate",
  },
  {
    key: "blocker_resolution",
    family: "adaptation",
    label: "Blocker resolution",
    definition: "Blockers on the person's tasks that were resolved ÷ blockers resolved or open more than 14 days. Young open blockers are excluded.",
    hypothesis: "Getting unblocked predicts episodes finishing on time.",
    opportunityAdjusted: false,
    outcome: "owned_episode_completed_on_time",
    expectedSign: 1,
    halfLifeDays: 120,
    kind: "rate",
  },
  {
    key: "early_blocker_rate",
    family: "adaptation",
    label: "Early blocker reporting",
    definition: "Blockers the person reported before the task's due date ÷ blockers they reported on deadlined tasks.",
    hypothesis: "Raising problems early predicts episodes finishing on time.",
    opportunityAdjusted: false,
    outcome: "owned_episode_completed_on_time",
    expectedSign: 1,
    halfLifeDays: 120,
    kind: "rate",
  },
  {
    key: "resolution_latency_hours",
    family: "adaptation",
    label: "Resolution latency",
    definition: "Median hours from a blocker being reported to the person resolving it.",
    hypothesis: "Faster resolution predicts episodes finishing on time (negative relationship).",
    opportunityAdjusted: false,
    outcome: "owned_episode_completed_on_time",
    expectedSign: -1,
    halfLifeDays: 120,
    kind: "latency",
  },
  {
    key: "feedback_response",
    family: "learning",
    label: "Feedback response",
    definition: "Reviews of the person's work followed by a revision within 14 days ÷ reviews received at least 14 days ago.",
    hypothesis: "Revising after feedback predicts staying active.",
    opportunityAdjusted: false,
    outcome: "member_active_next_term",
    expectedSign: 1,
    halfLifeDays: 180,
    kind: "rate",
  },
  {
    key: "help_response",
    family: "collaboration",
    label: "Help response",
    definition: "Help requests directed at the person answered with help within 7 days ÷ requests at least 7 days old.",
    hypothesis: "Answering requests for help predicts staying active.",
    opportunityAdjusted: true,
    outcome: "member_active_next_term",
    expectedSign: 1,
    halfLifeDays: 90,
    kind: "rate",
  },
  {
    key: "initiation_rate",
    family: "ownership",
    label: "Initiation",
    definition: "Episodes the person initiated ÷ episodes they participated in.",
    hypothesis: "Starting things predicts staying active.",
    opportunityAdjusted: false,
    outcome: "member_active_next_term",
    expectedSign: 1,
    halfLifeDays: 365,
    kind: "rate",
  },
  {
    key: "interview_reliability",
    family: "reliability",
    label: "Interview reliability",
    definition: "Interviews conducted ÷ interviews the person was assigned to that reached a terminal state (completed or no-show).",
    hypothesis: "Showing up to assigned interviews predicts completing a transition.",
    opportunityAdjusted: false,
    outcome: "transition_completed",
    expectedSign: 1,
    halfLifeDays: 180,
    kind: "rate",
  },
  {
    key: "handoff_completion",
    family: "collaboration",
    label: "Handoff completion",
    definition: "Handoffs the person created that were accepted ÷ handoffs created at least 14 days ago.",
    hypothesis: "Clean handoffs predict completing a transition.",
    opportunityAdjusted: false,
    outcome: "transition_completed",
    expectedSign: 1,
    halfLifeDays: 365,
    kind: "rate",
  },
];

// ------------------------------------------------------------- raw counts

type Ev = {
  id: string;
  episode_id: string;
  actor_id: string;
  subject_id: string;
  action_family: string;
  event_type: string;
  object_type: string;
  object_id: string;
  occurred_at: string;
  observed_at: string;
  context: any;
};

export type RawSignal = {
  successes: number;
  failures: number;
  /** per-observation points for recency and momentum */
  points: { value: number; ageDays: number }[];
  /** for latency signals */
  values: number[];
};

const DAY = 86400e3;
const ageDays = (at: string, asOf: string) =>
  Math.max(0, (Date.parse(asOf) - Date.parse(at)) / DAY);
const hoursBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 3600e3;

function loadEvents(asOf: string): Ev[] {
  return (
    db()
      .prepare("SELECT * FROM activity_events WHERE observed_at<=? ORDER BY seq")
      .all(asOf) as any[]
  ).map((e) => {
    let context = {};
    try {
      context = JSON.parse(e.context);
    } catch {}
    return { ...e, context };
  });
}

function empty(): RawSignal {
  return { successes: 0, failures: 0, points: [], values: [] };
}
function hit(r: RawSignal, ok: boolean, at: string, asOf: string) {
  if (ok) r.successes++;
  else r.failures++;
  r.points.push({ value: ok ? 1 : 0, ageDays: ageDays(at, asOf) });
}

/** Raw counts for every signal, for one person, as of a point in time. */
export function computeRaw(userId: string, asOf: string, events?: Ev[]): Record<string, RawSignal> {
  opportunitiesInit();
  const evs = events || loadEvents(asOf);
  const out: Record<string, RawSignal> = {};
  for (const s of SIGNALS) out[s.key] = empty();

  // Disputed tasks are excluded everywhere, matching the existing evidence policy.
  const disputed = new Set(
    evs
      .filter((e) => e.event_type === "evidence.correction" && e.object_type === "task")
      .map((e) => e.object_id),
  );
  const mine = evs.filter((e) => e.subject_id === userId || e.actor_id === userId);
  const taskDue = new Map<string, string>();
  for (const e of evs)
    if (e.object_type === "task" && e.context?.due_at) taskDue.set(e.object_id, e.context.due_at);

  // --- commitment_follow_through -----------------------------------------
  const accepted = new Map<string, string>(); // task -> accepted_at
  const completed = new Map<string, string>();
  const dropped = new Set<string>();
  for (const e of mine) {
    if (e.subject_id !== userId || e.object_type !== "task" || disputed.has(e.object_id)) continue;
    if (e.event_type === "task.accepted" && e.action_family === "COMMIT" && !accepted.has(e.object_id))
      accepted.set(e.object_id, e.occurred_at);
    if (e.event_type === "task.completed") completed.set(e.object_id, e.occurred_at);
    if (e.event_type === "task.cancelled" && accepted.has(e.object_id) && e.actor_id === userId)
      dropped.add(e.object_id);
  }
  for (const [task] of accepted) {
    const done = completed.get(task);
    if (done) hit(out.commitment_follow_through, true, done, asOf);
    else if (dropped.has(task)) hit(out.commitment_follow_through, false, asOf, asOf);
    else {
      const due = taskDue.get(task);
      if (due && due < asOf) hit(out.commitment_follow_through, false, due, asOf); // missed
      // else: open and not yet due — excluded
    }
  }

  // --- deadline_adherence ----------------------------------------------------
  for (const [task, done] of completed) {
    const due = taskDue.get(task);
    if (due) hit(out.deadline_adherence, done <= due, done, asOf);
  }

  // --- take rates from the opportunity ledger --------------------------------
  // `observed_at` is stamped when the offer is made and is never updated when
  // the response arrives, so filtering on it returns rows whose response was
  // recorded long after `asOf` — a point-in-time leak that also dated the
  // point at `asOf`, giving a leaked observation maximum recency weight.
  // Filter by offer time, then only count a response actually known by then.
  const opps = db()
    .prepare("SELECT kind,response,responded_at,offered_at FROM opportunities WHERE offered_to=? AND offered_at<=?")
    .all(userId, asOf) as { kind: string; response: string; responded_at: string | null; offered_at: string }[];
  const takeKey: Record<string, string> = { task: "task_take_rate", ownership: "ownership_take_rate", panel: "panel_take_rate" };
  for (const o of opps) {
    const key = takeKey[o.kind];
    if (!key) continue;
    const known = !!o.responded_at && o.responded_at <= asOf;
    if (!known) continue; // still pending as of asOf; carries no information
    if (!OWN_CHOICE.includes(o.response as any)) continue;
    hit(out[key], o.response === "accepted", o.responded_at as string, asOf);
  }

  // --- blockers ----------------------------------------------------------------
  const blockers = db()
    .prepare("SELECT * FROM work_blockers WHERE created_at<=?")
    .all(asOf) as any[];
  const myTasks = new Set([...accepted.keys()]);
  for (const b of blockers) {
    const resolved = b.resolved_at && b.resolved_at <= asOf ? b.resolved_at : null;
    if (myTasks.has(b.task_id)) {
      if (resolved) hit(out.blocker_resolution, true, resolved, asOf);
      else if (ageDays(b.created_at, asOf) > 14) hit(out.blocker_resolution, false, b.created_at, asOf);
    }
    if (b.reporter === userId) {
      const due = taskDue.get(b.task_id);
      if (due) hit(out.early_blocker_rate, b.created_at < due, b.created_at, asOf);
    }
    if (b.resolver === userId && resolved) {
      const h = hoursBetween(b.created_at, resolved);
      out.resolution_latency_hours.values.push(h);
      out.resolution_latency_hours.points.push({ value: h, ageDays: ageDays(resolved, asOf) });
    }
  }

  // --- feedback_response -------------------------------------------------------
  for (const e of evs) {
    if (e.action_family !== "REVIEW" || e.subject_id !== userId) continue;
    if (ageDays(e.occurred_at, asOf) < 14) continue; // window still open
    const revised = evs.some(
      (r) =>
        r.action_family === "REVISE" &&
        r.actor_id === userId &&
        r.object_id === e.object_id &&
        r.occurred_at > e.occurred_at &&
        ageDays(e.occurred_at, r.occurred_at) === 0 || (r.action_family === "REVISE" && r.actor_id === userId && r.object_id === e.object_id && r.occurred_at > e.occurred_at && Date.parse(r.occurred_at) - Date.parse(e.occurred_at) <= 14 * DAY),
    );
    hit(out.feedback_response, revised, e.occurred_at, asOf);
  }

  // --- help_response -------------------------------------------------------------
  for (const e of evs) {
    if (e.action_family !== "REQUEST_HELP" || e.subject_id !== userId) continue;
    if (ageDays(e.occurred_at, asOf) < 7) continue;
    const helped = evs.some(
      (h) =>
        h.action_family === "HELP" &&
        h.actor_id === userId &&
        h.episode_id === e.episode_id &&
        h.occurred_at > e.occurred_at &&
        Date.parse(h.occurred_at) - Date.parse(e.occurred_at) <= 7 * DAY,
    );
    hit(out.help_response, helped, e.occurred_at, asOf);
  }

  // --- initiation_rate -------------------------------------------------------------
  const participated = new Set(mine.map((e) => e.episode_id));
  const initiated = new Set(
    mine.filter((e) => e.action_family === "INITIATE" && e.actor_id === userId).map((e) => e.episode_id),
  );
  for (const ep of participated) {
    const first = mine.find((e) => e.episode_id === ep)!;
    hit(out.initiation_rate, initiated.has(ep), first.occurred_at, asOf);
  }

  // --- handoff_completion ----------------------------------------------------------
  for (const e of evs) {
    if (e.action_family !== "HANDOFF" || e.actor_id !== userId || !e.event_type.endsWith(".created")) continue;
    if (ageDays(e.occurred_at, asOf) < 14) continue;
    const acc = evs.some(
      (a) => a.action_family === "HANDOFF" && a.object_id === e.object_id && a.event_type.endsWith(".accepted") && a.occurred_at > e.occurred_at,
    );
    hit(out.handoff_completion, acc, e.occurred_at, asOf);
  }

  // --- interview_reliability (from the scheduler's assignments) --------------------
  const hasInterviews = db()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='interview_assignments'")
    .get();
  if (hasInterviews) {
    // `status` is mutable, so filtering on `created_at` reads an outcome that
    // may have been recorded after `asOf`. Filter on when the status was set.
    // Rows written before `status_at` existed are skipped rather than guessed.
    const rows = db()
      .prepare(
        "SELECT panel,status,status_at FROM interview_assignments WHERE status_at IS NOT NULL AND status_at<=? AND status IN ('completed','no_show')",
      )
      .all(asOf) as { panel: string; status: string; status_at: string }[];
    for (const r of rows) {
      let panel: string[] = [];
      try {
        panel = JSON.parse(r.panel);
      } catch {}
      if (panel.includes(userId)) hit(out.interview_reliability, r.status === "completed", r.status_at, asOf);
    }
  }

  return out;
}

// ------------------------------------------------------------- composed

export type PersonSignal = {
  key: string;
  label: string;
  family: string;
  kind: "rate" | "latency";
  opportunity_adjusted: boolean;
  n: number;
  posterior: Posterior | null;
  /** median for latency signals */
  median: number | null;
  peer_z: number | null;
  momentum: number | null;
  prior_source: "peer" | "weak" | null;
  reading: string;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function reading(def: SignalDef, n: number, p: Posterior | null, med: number | null): string {
  if (def.kind === "latency")
    return med === null ? "No resolved blockers yet." : `Median ${med.toFixed(1)}h across ${n} resolved blocker${n === 1 ? "" : "s"}.`;
  if (n === 0) return "No observations yet. Nothing can be said.";
  if (n < 5)
    return `${n} observation${n === 1 ? "" : "s"}. Too few to say anything about a tendency; the interval is mostly the peer prior.`;
  if (!p) return `${n} observations.`;
  return `${(p.mean * 100).toFixed(0)}% (${(p.lo * 100).toFixed(0)}–${(p.hi * 100).toFixed(0)}%) across ${n} observations.`;
}

/** All signals for one person as of a moment, with peer-informed uncertainty. */
export function computeSignals(userId: string, asOf: string): PersonSignal[] {
  const events = loadEvents(asOf);
  const users = (db().prepare("SELECT id FROM users").all() as { id: string }[]).map((u) => u.id);
  const raws = new Map<string, Record<string, RawSignal>>();
  for (const id of users) raws.set(id, computeRaw(id, asOf, events));
  const mine = raws.get(userId) || computeRaw(userId, asOf, events);

  return SIGNALS.map((def) => {
    const r = mine[def.key];
    const peers = users.filter((id) => id !== userId).map((id) => raws.get(id)![def.key]);
    if (def.kind === "latency") {
      const med = median(r.values);
      const peerMeds = peers.map((p) => median(p.values)).filter((v): v is number => v !== null);
      return {
        key: def.key,
        label: def.label,
        family: def.family,
        kind: def.kind,
        opportunity_adjusted: def.opportunityAdjusted,
        n: r.values.length,
        posterior: null,
        median: med,
        peer_z: med === null ? null : peerZ(med, peerMeds),
        momentum: momentum(r.points),
        prior_source: null,
        reading: reading(def, r.values.length, null, med),
      };
    }
    const n = r.successes + r.failures;
    const prior = peerPrior(peers);
    const post = betaPosterior(r.successes, r.failures, prior);
    const peerRates = peers
      .filter((p) => p.successes + p.failures >= 3)
      .map((p) => p.successes / (p.successes + p.failures));
    return {
      key: def.key,
      label: def.label,
      family: def.family,
      kind: def.kind,
      opportunity_adjusted: def.opportunityAdjusted,
      n,
      posterior: post,
      median: null,
      peer_z: n >= 3 ? peerZ(post.mean, peerRates) : null,
      momentum: momentum(r.points),
      prior_source: prior.source,
      reading: reading(def, n, post, null),
    };
  });
}

// -------------------------------------------------------------- registry

let registryReady = false;
function registryInit() {
  if (registryReady) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS signal_registry_runs(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  signal TEXT NOT NULL,
  outcome TEXT NOT NULL,
  pairs INTEGER NOT NULL,
  windows INTEGER NOT NULL,
  ic REAL,
  ir REAL,
  sign_agrees INTEGER,
  verdict TEXT NOT NULL,
  policy TEXT NOT NULL,
  computed_at TEXT NOT NULL);
`);
  registryReady = true;
}

export type RegistryRow = {
  signal: string;
  label: string;
  family: string;
  outcome: string | null;
  hypothesis: string;
  opportunity_adjusted: boolean;
  pairs: number;
  windows: number;
  ic: number | null;
  ir: number | null;
  sign_agrees: boolean | null;
  verdict: string;
  computed_at: string;
};

/**
 * Walk-forward test of every signal against its declared outcome.
 * For each person-level outcome, the signal is computed as of that outcome's
 * horizon_start using only events observed by then. Windows are months of
 * horizon_start, so the information ratio measures consistency over time.
 */
export function runRegistry(u: User): RegistryRow[] {
  officer(u);
  registryInit();
  outcomesInit();
  const now = timestamp();
  const rows: RegistryRow[] = [];
  const cache = new Map<string, Record<string, RawSignal>>();

  for (const def of SIGNALS) {
    let pairs: { x: number; y: number; window: string }[] = [];
    if (def.outcome) {
      for (const o of personOutcomes(def.outcome)) {
        const ck = `${o.subject_id}|${o.horizon_start}`;
        if (!cache.has(ck)) cache.set(ck, computeRaw(o.subject_id, o.horizon_start));
        const r = cache.get(ck)![def.key];
        const n = def.kind === "latency" ? r.values.length : r.successes + r.failures;
        if (n < 1) continue; // pure prior carries no information about this person
        const x =
          def.kind === "latency"
            ? (median(r.values) as number)
            : (r.successes + 1) / (n + 2); // uniform-prior posterior mean
        pairs.push({ x, y: o.value, window: o.horizon_start.slice(0, 7) });
      }
    }
    const ic = informationCoefficient(pairs.map((p) => p.x), pairs.map((p) => p.y));
    const byWindow = new Map<string, { x: number; y: number }[]>();
    for (const p of pairs) {
      if (!byWindow.has(p.window)) byWindow.set(p.window, []);
      byWindow.get(p.window)!.push(p);
    }
    const ics = [...byWindow.values()]
      .filter((w) => w.length >= 5)
      .map((w) => informationCoefficient(w.map((p) => p.x), w.map((p) => p.y)));
    const ir = informationRatio(ics);
    const verdict = def.outcome ? signalVerdict(pairs.length, ic) : "descriptive";
    const signAgrees = ic === null ? null : Math.sign(ic) === def.expectedSign;
    db()
      .prepare(
        "INSERT INTO signal_registry_runs(signal,outcome,pairs,windows,ic,ir,sign_agrees,verdict,policy,computed_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      )
      .run(def.key, def.outcome || "", pairs.length, byWindow.size, ic, ir, signAgrees === null ? null : signAgrees ? 1 : 0, verdict, POLICY, now);
    rows.push({
      signal: def.key,
      label: def.label,
      family: def.family,
      outcome: def.outcome,
      hypothesis: def.hypothesis,
      opportunity_adjusted: def.opportunityAdjusted,
      pairs: pairs.length,
      windows: byWindow.size,
      ic,
      ir,
      sign_agrees: signAgrees,
      verdict,
      computed_at: now,
    });
  }
  audit(u, "signal.registry.run", POLICY, { signals: rows.length });
  return rows;
}

/** Latest registry run per signal, plus fact-sheet text, without recomputing. */
export function registryLatest(u: User): RegistryRow[] {
  officer(u);
  registryInit();
  return SIGNALS.map((def) => {
    const r = db()
      .prepare("SELECT * FROM signal_registry_runs WHERE signal=? ORDER BY seq DESC LIMIT 1")
      .get(def.key) as any;
    return {
      signal: def.key,
      label: def.label,
      family: def.family,
      outcome: def.outcome,
      hypothesis: def.hypothesis,
      opportunity_adjusted: def.opportunityAdjusted,
      pairs: r?.pairs ?? 0,
      windows: r?.windows ?? 0,
      ic: r?.ic ?? null,
      ir: r?.ir ?? null,
      sign_agrees: r ? (r.sign_agrees === null ? null : !!r.sign_agrees) : null,
      verdict: r?.verdict ?? "never_run",
      computed_at: r?.computed_at ?? "",
    };
  });
}

/** A member's own signals. Only their own — the mirror test. */
export function behaviorState(u: User) {
  member(u);
  const asOf = timestamp();
  return {
    policy: POLICY,
    as_of: asOf,
    signals: computeSignals(u.id, asOf),
    note: "These are your own observations with uncertainty. Nobody else sees a number beside your name; officers see only whether a signal predicts anything in aggregate.",
  };
}

export function behavior(u: User, action: string, b: any) {
  if (action === "registry/run") return { rows: runRegistry(u) };
  if (action === "registry") return { rows: registryLatest(u) };
  if (action === "self") return behaviorState(u);
  if (action === "definitions") return { signals: SIGNALS };
  fail("Unknown behavior action.", 404);
}

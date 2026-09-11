// The sponsor funnel, preserved with the context that was live at each step.
//
// WHY THE CONTEXT SNAPSHOT IS ON EVERY STAGE ROW AND NOT JUST ON THE CAMPAIGN.
//
// The usual sponsorship record is a conversion count: 40 clubs recommended, 12
// accepted, 9 events happened, 300 attendees, 41 redemptions. That table can be
// read forever and will never explain anything, because the interesting
// question is not "how many" but "under what conditions" — and the conditions
// moved between every one of those steps. The club that declined was in finals
// week. The event that got 12 instead of 40 was outdoors in freezing rain. The
// campaign that renewed ran during recruiting season against no competing
// programming.
//
// A stage row that records only its own outcome throws that away, permanently.
// You cannot reconstruct it later: the weather feed has rolled over, the
// factors have been recomputed under a new model version, and the club's roster
// has turned over twice. So every stage row carries the factor values that were
// live at that moment, stamped with the snapshot they came from. That is what
// makes this a learning dataset rather than a ledger.
//
// WHAT THIS FILE REFUSES TO DO.
//
// `incrementalLift()` will not report a causal number without an identification
// strategy. Raw conversions are not lift; a treated-group conversion rate is not
// lift; a before/after comparison is not lift. Sponsors want one number and the
// honest answer is frequently "we cannot tell you that from this design", so
// that answer is a first-class return value with a stated reason, not an
// exception and not a zero.

import { db, fail, id, officer, text, timestamp, audit, type User } from "../db";
import type { Prediction } from "../factors";
import type { StoredFactor } from "../factor-store";
import type { ActivationType, SponsorProfile } from "./inventory";

// ==================================================================== funnel

/**
 * Every step, in order. The order matters: `funnel()` reports the drop between
 * consecutive stages, and a stage recorded out of order is a data bug worth
 * seeing rather than smoothing over.
 */
export const FUNNEL_STAGES = [
  "campaign_created",
  "activation_recommended",
  "club_shown",
  "club_accepted",
  "club_declined",
  "event_planned",
  "members_invited",
  "rsvp",
  "attendance",
  "engagement",
  "product_trial",
  "redemption",
  "purchase",
  "feedback",
  "sponsor_renewal",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/**
 * The predicted quantities. SEPARATE, always.
 *
 * A single "match score" collapses six different failure modes into one number
 * and makes all of them unfixable: a candidate scoring 0.4 might be a club that
 * will never accept, or one that will accept and then cancel, or one that will
 * run a flawless event nobody attends. Those need different responses and the
 * score cannot tell them apart.
 */
export const PREDICTED_OUTCOMES = [
  "club_accepts",
  "event_occurs",
  "attendance_target",
  "member_opts_in",
  "deliverables_complete",
  "brand_renews",
] as const;
export type PredictedOutcome = (typeof PREDICTED_OUTCOMES)[number];

// =============================================================== the snapshot

/**
 * What was knowable about the club and the campus at one instant.
 *
 * Deliberately a value, not a foreign key into a mutable table. Factors are
 * recomputed under new model versions; a stage row that pointed at "the club's
 * factors" would silently change its own history.
 */
export type ContextSnapshot = {
  id: string;
  clubId: string;
  at: string;
  factors: { factor: string; value: number | null; status: string; modelVersion: string }[];
  /** factors withheld from this read, and why. Omission has to be auditable. */
  omitted: { factor: string; reason: string }[];
  note: string;
};

export function snapshot(
  clubId: string,
  at: string,
  factors: StoredFactor[],
  omitted: { factor: string; reason: string }[] = [],
  note = "",
): ContextSnapshot {
  return {
    id: id(),
    clubId,
    at,
    factors: factors.map((f) => ({
      factor: f.factor,
      value: f.value,
      status: f.status,
      modelVersion: f.modelVersion,
    })),
    omitted,
    note,
  };
}

// ==================================================================== tables

let ready = false;

export function campaignsInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS sponsors(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  geographies TEXT NOT NULL DEFAULT '[]',
  budget REAL NOT NULL DEFAULT 0,
  minimum_audience INTEGER NOT NULL DEFAULT 0,
  activation_types TEXT NOT NULL DEFAULT '[]',
  windows TEXT NOT NULL DEFAULT '[]',
  brand_safety TEXT NOT NULL DEFAULT 'unrated',
  wants_member_data INTEGER NOT NULL DEFAULT 0,
  history TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS campaigns(
  id TEXT PRIMARY KEY,
  sponsor_id TEXT NOT NULL REFERENCES sponsors(id),
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  budget REAL NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS campaign_sponsor ON campaigns(sponsor_id,created_at);

CREATE TABLE IF NOT EXISTS campaign_candidates(
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id),
  club_id TEXT NOT NULL,
  inventory_id TEXT,
  activation_type TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 0,
  score REAL,
  sponsor_value REAL, club_value REAL, member_relevance REAL,
  operational_burden REAL, sponsor_fatigue REAL, risk REAL,
  -- Never null in practice: ranking.ts refuses to emit a candidate without one.
  explanation TEXT NOT NULL DEFAULT '{}',
  eligibility TEXT NOT NULL DEFAULT '{}',
  context_snapshot_id TEXT NOT NULL DEFAULT '',
  factors TEXT NOT NULL DEFAULT '[]',
  as_of TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS campaign_candidate_campaign ON campaign_candidates(campaign_id,rank);

CREATE TABLE IF NOT EXISTS campaign_predictions(
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  candidate_id TEXT,
  club_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  -- Nullable: a refusal to predict is recorded, exactly as in factor_values.
  value REAL,
  lo REAL, hi REAL,
  interval_mass REAL NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  feature_version TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  drivers TEXT NOT NULL DEFAULT '[]',
  assumptions TEXT NOT NULL DEFAULT '[]',
  limitations TEXT NOT NULL DEFAULT '[]',
  reading TEXT NOT NULL DEFAULT '',
  as_of TEXT NOT NULL,
  computed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS campaign_prediction_lookup ON campaign_predictions(campaign_id,outcome,as_of);

CREATE TABLE IF NOT EXISTS campaign_outcomes(
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  club_id TEXT NOT NULL,
  candidate_id TEXT,
  stage TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 1,
  -- How many units this row covers: attendees, redemptions, invitees. Kept
  -- separate from value so a rate and a count are never confused.
  n INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'officer',
  evidence_level TEXT NOT NULL DEFAULT 'counterparty_confirmed',
  -- The whole point of this table. What was true when this happened.
  context_snapshot_id TEXT NOT NULL DEFAULT '',
  factors TEXT NOT NULL DEFAULT '[]',
  context TEXT NOT NULL DEFAULT '{}',
  recorded_by TEXT NOT NULL DEFAULT 'system',
  UNIQUE(campaign_id,club_id,stage,occurred_at));
CREATE INDEX IF NOT EXISTS campaign_outcome_stage ON campaign_outcomes(campaign_id,stage,occurred_at);
CREATE INDEX IF NOT EXISTS campaign_outcome_club ON campaign_outcomes(club_id,stage,occurred_at);

CREATE TABLE IF NOT EXISTS campaign_experiments(
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  name TEXT NOT NULL,
  design TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'club',
  treatment TEXT NOT NULL DEFAULT '[]',
  holdout TEXT NOT NULL DEFAULT '[]',
  -- For matched designs: which covariates the match was built on. A matched
  -- comparison that cannot name its matching variables is a convenience sample.
  matching_covariates TEXT NOT NULL DEFAULT '[]',
  -- Assignment must precede outcomes, or the "experiment" is a post-hoc split.
  assigned_at TEXT NOT NULL,
  outcome_stage TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS campaign_experiment_campaign ON campaign_experiments(campaign_id);
`);
  // Additive migration for databases created before evidence_level existed.
  const cols = db().prepare("PRAGMA table_info(campaign_outcomes)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "evidence_level"))
    db().exec(
      "ALTER TABLE campaign_outcomes ADD COLUMN evidence_level TEXT NOT NULL DEFAULT 'counterparty_confirmed'",
    );
  ready = true;
}

// =================================================================== sponsors

const parse = <T>(raw: unknown, fallback: T): T => {
  if (typeof raw !== "string") return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
};

export function registerSponsor(u: User, p: SponsorProfile): SponsorProfile {
  officer(u);
  campaignsInit();
  const now = timestamp();
  db()
    .prepare(
      `INSERT INTO sponsors(id,name,category,geographies,budget,minimum_audience,activation_types,windows,brand_safety,wants_member_data,history,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, category=excluded.category, geographies=excluded.geographies,
         budget=excluded.budget, minimum_audience=excluded.minimum_audience,
         activation_types=excluded.activation_types, windows=excluded.windows,
         brand_safety=excluded.brand_safety, wants_member_data=excluded.wants_member_data,
         history=excluded.history, updated_at=excluded.updated_at`,
    )
    .run(
      text(p.id, 64),
      text(p.name, 200),
      text(p.category, 64),
      JSON.stringify(p.geographies ?? []),
      Number(p.budget) || 0,
      Math.max(0, Math.floor(Number(p.minimumAudience) || 0)),
      JSON.stringify(p.activationTypes ?? []),
      JSON.stringify(p.windows ?? []),
      p.brandSafety,
      p.wantsMemberData ? 1 : 0,
      JSON.stringify(p.history ?? {}),
      now,
      now,
    );
  audit(u, "campaign.sponsor.register", p.id, { category: p.category });
  return p;
}

export function sponsorProfile(sponsorId: string): SponsorProfile | null {
  campaignsInit();
  const r = db().prepare("SELECT * FROM sponsors WHERE id=?").get(sponsorId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    geographies: parse<string[]>(r.geographies, []),
    budget: Number(r.budget ?? 0),
    minimumAudience: Number(r.minimum_audience ?? 0),
    activationTypes: parse<ActivationType[]>(r.activation_types, []),
    windows: parse<{ start: string; end: string }[]>(r.windows, []),
    brandSafety: String(r.brand_safety ?? "unrated") as SponsorProfile["brandSafety"],
    wantsMemberData: Number(r.wants_member_data ?? 0) === 1,
    // An empty object comes back as no history rather than as a history of
    // zeroes: "never run a campaign" and "ran campaigns, delivered none" are
    // different facts and the predictor treats them differently.
    history: (() => {
      const h = parse<Record<string, unknown>>(r.history, {});
      return Object.keys(h).length ? (h as unknown as SponsorProfile["history"]) : undefined;
    })(),
  };
}

// ================================================================== campaigns

export type Campaign = {
  id: string;
  sponsorId: string;
  name: string;
  objective: string;
  budget: number;
  startsAt: string;
  endsAt: string;
  status: string;
  createdAt: string;
};

export function createCampaign(
  u: User,
  input: {
    sponsorId: string;
    name: string;
    objective?: string;
    budget?: number;
    startsAt: string;
    endsAt: string;
  },
): Campaign {
  officer(u);
  campaignsInit();
  if (!sponsorProfile(input.sponsorId)) fail("Unknown sponsor.", 404);
  if (input.startsAt > input.endsAt) fail("A campaign cannot end before it starts.", 422);
  const c: Campaign = {
    id: id(),
    sponsorId: input.sponsorId,
    name: text(input.name, 200),
    objective: input.objective ?? "",
    budget: Number(input.budget ?? 0),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    status: "draft",
    createdAt: timestamp(),
  };
  db()
    .prepare(
      "INSERT INTO campaigns(id,sponsor_id,name,objective,budget,starts_at,ends_at,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      c.id,
      c.sponsorId,
      c.name,
      c.objective,
      c.budget,
      c.startsAt,
      c.endsAt,
      c.status,
      c.createdAt,
    );
  audit(u, "campaign.create", c.id, { sponsor: c.sponsorId });
  return c;
}

export function campaign(campaignId: string): Campaign | null {
  campaignsInit();
  const r = db().prepare("SELECT * FROM campaigns WHERE id=?").get(campaignId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    sponsorId: String(r.sponsor_id),
    name: String(r.name),
    objective: String(r.objective ?? ""),
    budget: Number(r.budget ?? 0),
    startsAt: String(r.starts_at),
    endsAt: String(r.ends_at),
    status: String(r.status),
    createdAt: String(r.created_at),
  };
}

// ================================================== candidates & predictions

export type CandidateRecord = {
  campaignId: string;
  clubId: string;
  inventoryId: string | null;
  activationType: string;
  rank: number;
  score: number | null;
  terms: {
    sponsorValue: number;
    clubValue: number;
    memberRelevance: number;
    operationalBurden: number;
    sponsorFatigue: number;
    risk: number;
  };
  explanation: Record<string, unknown>;
  eligibility: Record<string, unknown>;
  snapshot: ContextSnapshot;
  asOf: string;
};

/**
 * Persist one ranked candidate with the context it was ranked under.
 *
 * Refuses a candidate with no explanation. A ranked row nobody can account for
 * is the exact artefact this system exists to avoid producing, and letting one
 * in "temporarily" is how it becomes permanent.
 */
export function recordCandidate(c: CandidateRecord): string {
  campaignsInit();
  const hasExplanation =
    c.explanation && typeof c.explanation === "object" && Object.keys(c.explanation).length > 0;
  if (!hasExplanation)
    fail("A ranked candidate must carry an explanation. An unexplained ranking is not recorded.", 422);
  const rowId = id();
  db()
    .prepare(
      `INSERT INTO campaign_candidates(id,campaign_id,club_id,inventory_id,activation_type,rank,score,sponsor_value,club_value,member_relevance,operational_burden,sponsor_fatigue,risk,explanation,eligibility,context_snapshot_id,factors,as_of,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      rowId,
      c.campaignId,
      c.clubId,
      c.inventoryId,
      c.activationType,
      c.rank,
      c.score,
      c.terms.sponsorValue,
      c.terms.clubValue,
      c.terms.memberRelevance,
      c.terms.operationalBurden,
      c.terms.sponsorFatigue,
      c.terms.risk,
      JSON.stringify(c.explanation),
      JSON.stringify(c.eligibility),
      c.snapshot.id,
      JSON.stringify(c.snapshot.factors),
      c.asOf,
      timestamp(),
    );
  return rowId;
}

export function recordPrediction(input: {
  campaignId: string;
  candidateId?: string | null;
  clubId: string;
  outcome: PredictedOutcome;
  prediction: Prediction<number | null>;
}): string {
  campaignsInit();
  const p = input.prediction;
  const rowId = id();
  db()
    .prepare(
      `INSERT INTO campaign_predictions(id,campaign_id,candidate_id,club_id,outcome,value,lo,hi,interval_mass,sample_size,model_name,model_version,feature_version,status,drivers,assumptions,limitations,reading,as_of,computed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      rowId,
      input.campaignId,
      input.candidateId ?? null,
      input.clubId,
      input.outcome,
      p.value === null ? null : Number(p.value),
      p.interval ? p.interval[0] : null,
      p.interval ? p.interval[1] : null,
      p.intervalMass,
      p.sampleSize,
      p.model.name,
      p.model.version,
      p.model.featureVersion,
      p.status,
      JSON.stringify(p.drivers ?? []),
      JSON.stringify(p.assumptions ?? []),
      JSON.stringify(p.limitations ?? []),
      p.reading ?? "",
      p.asOf,
      timestamp(),
    );
  return rowId;
}

export function predictionsFor(campaignId: string, clubId?: string) {
  campaignsInit();
  const rows = (
    clubId
      ? db()
          .prepare(
            "SELECT * FROM campaign_predictions WHERE campaign_id=? AND club_id=? ORDER BY outcome",
          )
          .all(campaignId, clubId)
      : db()
          .prepare("SELECT * FROM campaign_predictions WHERE campaign_id=? ORDER BY club_id,outcome")
          .all(campaignId)
  ) as Record<string, unknown>[];
  return rows.map((r) => ({
    outcome: String(r.outcome) as PredictedOutcome,
    clubId: String(r.club_id),
    value: r.value === null ? null : Number(r.value),
    interval:
      r.lo === null || r.hi === null ? null : ([Number(r.lo), Number(r.hi)] as [number, number]),
    sampleSize: Number(r.sample_size ?? 0),
    status: String(r.status),
    reading: String(r.reading ?? ""),
    asOf: String(r.as_of),
  }));
}

// =============================================================== stage record

export type StageRecord = {
  campaignId: string;
  clubId: string;
  stage: FunnelStage;
  candidateId?: string | null;
  value?: number;
  n?: number;
  occurredAt: string;
  observedAt?: string;
  source?: string;
  evidenceLevel?: string;
  snapshot: ContextSnapshot;
  context?: Record<string, unknown>;
  recordedBy?: string;
};

/**
 * Record one funnel step, with the context that was live when it happened.
 *
 * The snapshot is REQUIRED. It would be easy to make it optional and let
 * callers fill it in "later"; later never comes, and a row without it is a row
 * that can never be used to learn anything. A caller with genuinely no context
 * passes an empty snapshot with a note saying so, which is an honest record of
 * ignorance rather than a hidden one.
 */
export function recordStage(s: StageRecord): string {
  campaignsInit();
  if (!FUNNEL_STAGES.includes(s.stage)) fail(`Unknown funnel stage "${s.stage}".`, 422);
  if (!s.snapshot) fail("A funnel stage must record the context that was live at the time.", 422);
  const observedAt = s.observedAt || s.occurredAt;
  if (s.occurredAt > observedAt)
    fail("A stage cannot be observed before it happened.", 422);
  const rowId = id();
  db()
    .prepare(
      `INSERT INTO campaign_outcomes(id,campaign_id,club_id,candidate_id,stage,value,n,occurred_at,observed_at,source,evidence_level,context_snapshot_id,factors,context,recorded_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(campaign_id,club_id,stage,occurred_at) DO NOTHING`,
    )
    .run(
      rowId,
      s.campaignId,
      s.clubId,
      s.candidateId ?? null,
      s.stage,
      s.value ?? 1,
      Math.max(0, Math.floor(s.n ?? 0)),
      s.occurredAt,
      observedAt,
      s.source ?? "officer",
      s.evidenceLevel ?? "counterparty_confirmed",
      s.snapshot.id,
      JSON.stringify(s.snapshot.factors),
      JSON.stringify({ ...(s.context ?? {}), snapshot_note: s.snapshot.note }),
      s.recordedBy ?? "system",
    );
  return rowId;
}

export type FunnelRow = {
  stage: FunnelStage;
  clubId: string;
  value: number;
  n: number;
  occurredAt: string;
  contextSnapshotId: string;
  factors: { factor: string; value: number | null; status: string }[];
  context: Record<string, unknown>;
};

/**
 * The whole funnel for a campaign, in stage order, with each step's context.
 *
 * Returned as rows rather than as counts. A count per stage is what a dashboard
 * wants; the rows are what a model needs, and collapsing here would throw away
 * exactly the thing this table exists to keep.
 */
export function funnel(campaignId: string, clubId?: string): FunnelRow[] {
  campaignsInit();
  const rows = (
    clubId
      ? db()
          .prepare("SELECT * FROM campaign_outcomes WHERE campaign_id=? AND club_id=?")
          .all(campaignId, clubId)
      : db().prepare("SELECT * FROM campaign_outcomes WHERE campaign_id=?").all(campaignId)
  ) as Record<string, unknown>[];
  const order = new Map(FUNNEL_STAGES.map((s, i) => [s, i]));
  return rows
    .map((r) => ({
      stage: String(r.stage) as FunnelStage,
      clubId: String(r.club_id),
      value: Number(r.value ?? 0),
      n: Number(r.n ?? 0),
      occurredAt: String(r.occurred_at),
      contextSnapshotId: String(r.context_snapshot_id ?? ""),
      factors: parse<{ factor: string; value: number | null; status: string }[]>(r.factors, []),
      context: parse<Record<string, unknown>>(r.context, {}),
    }))
    .sort(
      (a, b) =>
        (order.get(a.stage) ?? 99) - (order.get(b.stage) ?? 99) ||
        a.occurredAt.localeCompare(b.occurredAt),
    );
}

/**
 * Stage counts. Named for what it is so that nobody mistakes it for lift — see
 * `incrementalLift`, which is the function that answers the causal question and
 * frequently refuses to.
 */
export function rawConversions(campaignId: string): {
  stage: FunnelStage;
  clubs: number;
  rows: number;
  units: number;
  caveat: string;
}[] {
  const rows = funnel(campaignId);
  const byStage = new Map<FunnelStage, FunnelRow[]>();
  for (const r of rows) {
    if (!byStage.has(r.stage)) byStage.set(r.stage, []);
    byStage.get(r.stage)!.push(r);
  }
  return FUNNEL_STAGES.filter((s) => byStage.has(s)).map((s) => {
    const rs = byStage.get(s)!;
    return {
      stage: s,
      clubs: new Set(rs.map((r) => r.clubId)).size,
      rows: rs.length,
      units: rs.reduce((a, r) => a + r.n, 0),
      caveat:
        "A conversion count, not an effect. It includes everyone who would have converted anyway.",
    };
  });
}

// ================================================================ experiments

export const EXPERIMENT_DESIGNS = ["randomized_holdout", "matched_clubs", "none"] as const;
export type ExperimentDesign = (typeof EXPERIMENT_DESIGNS)[number];

export type Experiment = {
  id: string;
  campaignId: string;
  name: string;
  design: ExperimentDesign;
  unit: string;
  treatment: string[];
  holdout: string[];
  matchingCovariates: string[];
  assignedAt: string;
  outcomeStage: FunnelStage;
  notes: string;
};

export function createExperiment(
  u: User,
  input: {
    campaignId: string;
    name: string;
    design: ExperimentDesign;
    treatment: string[];
    holdout: string[];
    matchingCovariates?: string[];
    assignedAt: string;
    outcomeStage: FunnelStage;
    notes?: string;
  },
): Experiment {
  officer(u);
  campaignsInit();
  if (!EXPERIMENT_DESIGNS.includes(input.design)) fail("Unknown experiment design.", 422);
  if (!FUNNEL_STAGES.includes(input.outcomeStage)) fail("Unknown outcome stage.", 422);
  const overlap = input.treatment.filter((c) => input.holdout.includes(c));
  if (overlap.length)
    fail(
      `A club cannot be in both arms: ${overlap.join(", ")}. An overlapping assignment is not an experiment.`,
      422,
    );
  const e: Experiment = {
    id: id(),
    campaignId: input.campaignId,
    name: text(input.name, 200),
    design: input.design,
    unit: "club",
    treatment: input.treatment,
    holdout: input.holdout,
    matchingCovariates: input.matchingCovariates ?? [],
    assignedAt: input.assignedAt,
    outcomeStage: input.outcomeStage,
    notes: input.notes ?? "",
  };
  db()
    .prepare(
      `INSERT INTO campaign_experiments(id,campaign_id,name,design,unit,treatment,holdout,matching_covariates,assigned_at,outcome_stage,notes,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      e.id,
      e.campaignId,
      e.name,
      e.design,
      e.unit,
      JSON.stringify(e.treatment),
      JSON.stringify(e.holdout),
      JSON.stringify(e.matchingCovariates),
      e.assignedAt,
      e.outcomeStage,
      e.notes,
      timestamp(),
    );
  audit(u, "campaign.experiment.create", e.id, { design: e.design, campaign: e.campaignId });
  return e;
}

export function experiment(experimentId: string): Experiment | null {
  campaignsInit();
  const r = db().prepare("SELECT * FROM campaign_experiments WHERE id=?").get(experimentId) as
    | Record<string, unknown>
    | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    campaignId: String(r.campaign_id),
    name: String(r.name),
    design: String(r.design) as ExperimentDesign,
    unit: String(r.unit ?? "club"),
    treatment: parse<string[]>(r.treatment, []),
    holdout: parse<string[]>(r.holdout, []),
    matchingCovariates: parse<string[]>(r.matching_covariates, []),
    assignedAt: String(r.assigned_at),
    outcomeStage: String(r.outcome_stage) as FunnelStage,
    notes: String(r.notes ?? ""),
  };
}

/**
 * Smallest arm we will report an effect from.
 *
 * Ten clubs per arm is already generous for a difference in proportions — the
 * standard error on a 50% rate with n=10 is 16 percentage points, so the honest
 * interval is nearly the whole range. It is set here as a floor below which we
 * do not speak at all, not as a threshold at which the number becomes good.
 */
export const MIN_ARM_N = 10;

export type LiftResult = {
  experimentId: string;
  stage: FunnelStage;
  /** null whenever identification is too weak to support a causal claim */
  lift: number | null;
  interval: [number, number] | null;
  treatment: { n: number; converted: number; rate: number | null };
  holdout: { n: number; converted: number; rate: number | null };
  design: ExperimentDesign;
  refused: boolean;
  /** why we refused, or why the number should still be read carefully */
  reason: string;
  reading: string;
};

/**
 * Incremental lift, or a refusal with a reason.
 *
 * THE REFUSALS, IN ORDER, AND WHY EACH ONE IS NOT NEGOTIABLE:
 *
 *   no holdout          — without an untreated comparison there is no
 *                         counterfactual, and the treated conversion rate is
 *                         just a conversion rate. This is the single most common
 *                         way sponsorship "lift" gets reported, and it measures
 *                         selection: the clubs that accepted were the ones
 *                         already inclined to.
 *   assignment after
 *   the outcomes        — a split chosen once results are visible is a story,
 *                         not a design.
 *   arms too small      — a difference of proportions from six clubs has an
 *                         interval wider than the entire plausible range of the
 *                         effect. Reporting the point estimate anyway is how a
 *                         2-point effect gets sold as a 40-point one.
 *   matched with no
 *   stated covariates   — "comparable clubs" that cannot name what they were
 *                         matched on is a convenience sample with a better name.
 *
 * When it does answer, the interval is a normal-approximation interval on the
 * difference of two proportions. That approximation is poor at small n, which is
 * exactly why MIN_ARM_N exists, and the limitation is stated in `reading`
 * rather than hidden.
 */
export function incrementalLift(experimentId: string, stage?: FunnelStage): LiftResult {
  campaignsInit();
  const e = experiment(experimentId);
  const empty = { n: 0, converted: 0, rate: null as number | null };
  if (!e)
    return {
      experimentId,
      stage: stage ?? "attendance",
      lift: null,
      interval: null,
      treatment: empty,
      holdout: empty,
      design: "none",
      refused: true,
      reason: "No such experiment.",
      reading: "No such experiment, so there is nothing to measure.",
    };

  const target = stage ?? e.outcomeStage;
  const rows = db()
    .prepare(
      `SELECT DISTINCT club_id FROM campaign_outcomes
       WHERE campaign_id=? AND stage=? AND occurred_at>=?`,
    )
    .all(e.campaignId, target, e.assignedAt) as { club_id: string }[];
  const converted = new Set(rows.map((r) => r.club_id));

  const arm = (clubs: string[]) => {
    const c = clubs.filter((x) => converted.has(x)).length;
    return { n: clubs.length, converted: c, rate: clubs.length ? c / clubs.length : null };
  };
  const t = arm(e.treatment);
  const h = arm(e.holdout);

  const refuse = (reason: string): LiftResult => ({
    experimentId,
    stage: target,
    lift: null,
    interval: null,
    treatment: t,
    holdout: h,
    design: e.design,
    refused: true,
    reason,
    reading: `No lift reported. ${reason}`,
  });

  if (e.design === "none" || e.holdout.length === 0)
    return refuse(
      "There is no holdout. Without an untreated comparison group there is no counterfactual, " +
        `and ${t.converted} of ${t.n} treated clubs reaching "${target}" is a conversion count, not an effect. ` +
        "Assign a randomized holdout, or a matched comparison set with its matching variables recorded, and ask again.",
    );

  // A "matched" design that cannot say what it matched on has not controlled
  // for anything, and its difference is confounded by whatever drove selection.
  if (e.design === "matched_clubs" && e.matchingCovariates.length === 0)
    return refuse(
      "This is a matched design with no matching covariates recorded. A comparison set that cannot name what it was matched on is a convenience sample, and its difference measures selection.",
    );

  if (t.n < MIN_ARM_N || h.n < MIN_ARM_N)
    return refuse(
      `Arms too small: ${t.n} treated and ${h.n} held out, against a floor of ${MIN_ARM_N} each. ` +
        "A difference of proportions at this n has an interval wider than the effect anyone is arguing about, so the point estimate would be worse than no number.",
    );

  const pt = t.rate as number;
  const ph = h.rate as number;
  const lift = pt - ph;
  const se = Math.sqrt((pt * (1 - pt)) / t.n + (ph * (1 - ph)) / h.n);
  const z = 1.6448536269514722; // 90%, matching the intervalMass used elsewhere
  const interval: [number, number] = [lift - z * se, lift + z * se];
  const coversZero = interval[0] <= 0 && interval[1] >= 0;

  return {
    experimentId,
    stage: target,
    lift,
    interval,
    treatment: t,
    holdout: h,
    design: e.design,
    refused: false,
    reason: coversZero
      ? "The 90% interval covers zero: this campaign has not been shown to do anything."
      : "",
    reading:
      `${(lift * 100).toFixed(1)} percentage points (90% interval ${(interval[0] * 100).toFixed(1)} to ${(interval[1] * 100).toFixed(1)}), ` +
      `treated ${t.converted}/${t.n} against held out ${h.converted}/${h.n} at "${target}". ` +
      (coversZero
        ? "The interval covers zero, so the honest summary is that no effect has been demonstrated."
        : "Normal-approximation interval; at these sample sizes treat the width as optimistic.") +
      (e.design === "matched_clubs"
        ? ` Matched on ${e.matchingCovariates.join(", ")} — this is not randomisation and unobserved differences remain.`
        : ""),
  };
}

// Persistence for factor values and their evaluations.
//
// Two tables, both modelled deliberately on `outcomes` — the best existing
// precedent in this codebase for a subject-polymorphic, bitemporal, provenance-
// carrying numeric row. Copying it rather than inventing a shape means the
// point-in-time query looks the same everywhere, which is the property that
// makes backtests trustworthy.
//
// TWO DECISIONS WORTH ARGUING WITH:
//
// 1. A REFUSAL IS STORED AS A ROW. When the registry declines to speak —
//    insufficient data, a missing input, a factor that threw — that is written
//    with a null value and the reason. It would be easier to write nothing. But
//    "we had no number" and "we were never asked" are completely different
//    facts, and only one of them is a bug. Reproducing a historical decision
//    requires knowing which.
//
// 2. PERMITTED USE IS ENFORCED HERE, AT READ TIME. docs/11 §7 requires that
//    proxies for protected attributes are "blocked from the feature store, not
//    just from display". A filter applied in a React component is not a block.
//    So `factorsAsOf` takes the USE it is being read for and silently omits
//    anything not permitted for it — and `explainOmissions` exists so that
//    omission is auditable rather than invisible.

import { db, id, timestamp, fail, type User, officer } from "./db";
import {
  type FactorDef,
  type FactorValue,
  type FactorEvaluation,
  type EntityType,
  type Use,
  type Driver,
  mayUse,
  computeFactor,
} from "./factors";

let ready = false;

export function factorStoreInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS factor_values(
  id TEXT PRIMARY KEY,
  factor TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  -- Nullable on purpose: a refusal is a fact and gets a row.
  value REAL,
  value_type TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  -- When the state being measured held.
  occurred_at TEXT NOT NULL,
  -- When we could first have known it. These genuinely differ for ingested
  -- context, which is the whole reason the pair exists.
  observed_at TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  model_version TEXT NOT NULL,
  drivers TEXT NOT NULL DEFAULT '[]',
  basis TEXT NOT NULL DEFAULT '{}',
  reading TEXT NOT NULL DEFAULT '',
  -- Recomputing the same factor for the same moment with the same model is
  -- idempotent. A new model version writes a NEW row rather than overwriting,
  -- so a decision made under the old version stays reproducible.
  UNIQUE(factor,entity_type,entity_id,occurred_at,model_version));
CREATE INDEX IF NOT EXISTS factor_entity ON factor_values(entity_type,entity_id,observed_at);
CREATE INDEX IF NOT EXISTS factor_lookup ON factor_values(factor,observed_at);

CREATE TABLE IF NOT EXISTS factor_evaluations(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  factor TEXT NOT NULL,
  outcome TEXT NOT NULL,
  pairs INTEGER NOT NULL,
  distinct_subjects INTEGER NOT NULL DEFAULT 0,
  windows INTEGER NOT NULL,
  ic REAL,
  ir REAL,
  sign_agrees INTEGER,
  verdict TEXT NOT NULL,
  policy TEXT NOT NULL,
  computed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS factor_eval_latest ON factor_evaluations(factor,seq);
`);
  // Additive migration for databases created before distinct_subjects existed.
  const cols = db()
    .prepare("PRAGMA table_info(factor_evaluations)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "distinct_subjects"))
    db().exec(
      "ALTER TABLE factor_evaluations ADD COLUMN distinct_subjects INTEGER NOT NULL DEFAULT 0",
    );
  ready = true;
}

export const FACTOR_POLICY = "factor-registry-v1";

// ==================================================================== write

/**
 * Persist one computed factor value, refusal included.
 *
 * `occurredAt` is the moment the factor describes; `observedAt` is when we
 * could first have known it. For a factor computed from our own record these
 * coincide. For one computed from an ingested feed they do not, and passing
 * them separately is what keeps a replay honest.
 */
export function writeFactorValue(
  v: FactorValue,
  opts: { occurredAt?: string; observedAt?: string } = {},
): string {
  factorStoreInit();
  const now = timestamp();
  const occurredAt = opts.occurredAt || v.asOf;
  const observedAt = opts.observedAt || v.asOf;
  if (occurredAt > observedAt)
    fail("A factor cannot be observed before the moment it describes.", 422);
  const rowId = id();
  db()
    .prepare(
      `INSERT INTO factor_values(id,factor,entity_type,entity_id,value,value_type,n,status,occurred_at,observed_at,computed_at,model_version,drivers,basis,reading)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(factor,entity_type,entity_id,occurred_at,model_version) DO NOTHING`,
    )
    .run(
      rowId,
      v.factor,
      v.entityType,
      v.entityId,
      v.value,
      v.valueType,
      v.n,
      v.status,
      occurredAt,
      observedAt,
      now,
      v.modelVersion,
      JSON.stringify(v.drivers ?? []),
      JSON.stringify(v.basis ?? {}),
      v.reading ?? "",
    );
  return rowId;
}

/** Compute a factor and persist the result in one step, refusal included. */
export function computeAndStore<I>(
  def: FactorDef<I>,
  entityId: string,
  input: I,
  asOf: string,
  opts: { occurredAt?: string; observedAt?: string } = {},
): FactorValue {
  const value = computeFactor(def, entityId, input, asOf);
  writeFactorValue(value, opts);
  return value;
}

// ===================================================================== read

export type StoredFactor = {
  factor: string;
  entityType: EntityType;
  entityId: string;
  value: number | null;
  valueType: string;
  n: number;
  status: string;
  occurredAt: string;
  observedAt: string;
  modelVersion: string;
  drivers: Driver[];
  reading: string;
};

const hydrate = (r: any): StoredFactor => ({
  factor: r.factor,
  entityType: r.entity_type,
  entityId: r.entity_id,
  value: r.value === null ? null : Number(r.value),
  valueType: r.value_type,
  n: Number(r.n),
  status: r.status,
  occurredAt: r.occurred_at,
  observedAt: r.observed_at,
  modelVersion: r.model_version,
  drivers: JSON.parse(r.drivers || "[]"),
  reading: r.reading || "",
});

/**
 * The point-in-time read, with the use gate applied.
 *
 * Two filters, and both matter:
 *
 *   observed_at <= asOf   — the model may only see what was knowable. Drop this
 *                           and every backtest becomes fiction.
 *   mayUse(def, use)      — the factor must be permitted for the purpose being
 *                           served. This is the feature-store block docs/11 §7
 *                           demands; a component-level filter would not be one.
 *
 * The latest row per factor wins, by observed_at then computed_at, so a
 * recomputation supersedes without deleting the earlier row.
 */
export function factorsAsOf(input: {
  entityType: EntityType;
  entityId: string;
  asOf: string;
  use: Use;
  /** the registry entries in play; anything not supplied is not returned */
  registry: FactorDef<any>[];
}): { factors: StoredFactor[]; omitted: { factor: string; reason: string }[] } {
  factorStoreInit();
  const allowed = new Map<string, FactorDef<any>>();
  const omitted: { factor: string; reason: string }[] = [];
  for (const def of input.registry) {
    const gate = mayUse(def, input.use);
    if (gate.allowed) allowed.set(def.id, def);
    else omitted.push({ factor: def.id, reason: gate.reason });
  }
  if (!allowed.size) return { factors: [], omitted };

  const rows = db()
    .prepare(
      `SELECT * FROM factor_values
       WHERE entity_type=? AND entity_id=? AND observed_at<=?
       ORDER BY observed_at DESC, computed_at DESC`,
    )
    .all(input.entityType, input.entityId, input.asOf) as any[];

  const latest = new Map<string, StoredFactor>();
  for (const r of rows) {
    if (!allowed.has(r.factor)) continue; // not permitted for this use
    if (!latest.has(r.factor)) latest.set(r.factor, hydrate(r));
  }
  return { factors: [...latest.values()], omitted };
}

/**
 * Why a factor was not returned. Omission has to be auditable, or the use gate
 * becomes indistinguishable from a bug.
 */
export function explainOmissions(
  registry: FactorDef<any>[],
  use: Use,
): { factor: string; reason: string }[] {
  return registry
    .map((d) => ({ def: d, gate: mayUse(d, use) }))
    .filter((x) => !x.gate.allowed)
    .map((x) => ({ factor: x.def.id, reason: x.gate.reason }));
}

/** The full history of one factor for one entity, for replay and for charts. */
export function factorHistory(
  factor: string,
  entityType: EntityType,
  entityId: string,
  asOf?: string,
): StoredFactor[] {
  factorStoreInit();
  const rows = asOf
    ? db()
        .prepare(
          "SELECT * FROM factor_values WHERE factor=? AND entity_type=? AND entity_id=? AND observed_at<=? ORDER BY occurred_at",
        )
        .all(factor, entityType, entityId, asOf)
    : db()
        .prepare(
          "SELECT * FROM factor_values WHERE factor=? AND entity_type=? AND entity_id=? ORDER BY occurred_at",
        )
        .all(factor, entityType, entityId);
  return (rows as any[]).map(hydrate);
}

/**
 * Training rows for validating a factor against an outcome.
 *
 * The factor value must have been OBSERVABLE at the outcome's horizon start,
 * which is the walk-forward rule `runRegistry` already follows. Returning the
 * latest value regardless of time is the single easiest way to produce a
 * beautiful backtest that means nothing.
 */
export function factorAtHorizon(
  factor: string,
  entityType: EntityType,
  entityId: string,
  horizonStart: string,
): StoredFactor | null {
  factorStoreInit();
  const row = db()
    .prepare(
      `SELECT * FROM factor_values
       WHERE factor=? AND entity_type=? AND entity_id=? AND observed_at<=? AND value IS NOT NULL
       ORDER BY observed_at DESC, computed_at DESC LIMIT 1`,
    )
    .get(factor, entityType, entityId, horizonStart) as any;
  return row ? hydrate(row) : null;
}

// =============================================================== evaluation

export function writeEvaluation(e: FactorEvaluation, distinctSubjects = 0): void {
  factorStoreInit();
  db()
    .prepare(
      `INSERT INTO factor_evaluations(factor,outcome,pairs,distinct_subjects,windows,ic,ir,sign_agrees,verdict,policy,computed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      e.factor,
      e.outcome,
      e.pairs,
      distinctSubjects,
      e.windows,
      e.ic,
      e.ir,
      e.signAgrees === null ? null : e.signAgrees ? 1 : 0,
      e.verdict,
      FACTOR_POLICY,
      e.computedAt,
    );
}

export type EvaluationRow = FactorEvaluation & { distinctSubjects: number };

/** The most recent evaluation per factor. Append-only; nothing is overwritten. */
export function latestEvaluations(): EvaluationRow[] {
  factorStoreInit();
  const rows = db()
    .prepare(
      `SELECT * FROM factor_evaluations
       WHERE seq IN (SELECT MAX(seq) FROM factor_evaluations GROUP BY factor,outcome)
       ORDER BY factor`,
    )
    .all() as any[];
  return rows.map((r) => ({
    factor: r.factor,
    outcome: r.outcome,
    pairs: Number(r.pairs),
    distinctSubjects: Number(r.distinct_subjects),
    windows: Number(r.windows),
    ic: r.ic === null ? null : Number(r.ic),
    ir: r.ir === null ? null : Number(r.ir),
    signAgrees: r.sign_agrees === null ? null : !!r.sign_agrees,
    verdict: r.verdict,
    computedAt: r.computed_at,
  }));
}

// ==================================================================== HTTP

/**
 * Officer-facing read of what the factor layer currently believes.
 *
 * Officer-gated because it is a research surface over the whole club, not a
 * member's own view. A member's own factors are served through their own
 * signal view, which applies the mirror test.
 */
export function factorState(u: User) {
  officer(u);
  factorStoreInit();
  const counts = db()
    .prepare(
      "SELECT factor, status, COUNT(*) n FROM factor_values GROUP BY factor, status ORDER BY factor",
    )
    .all() as any[];
  return {
    policy: FACTOR_POLICY,
    as_of: timestamp(),
    counts,
    evaluations: latestEvaluations(),
    note: "A row with a null value is a recorded refusal, not a gap. It means the model was asked and declined to answer.",
  };
}

// The Factor Registry.
//
// One declaration site for every quantity this system computes about a person, a
// club, a campus, an event or a campaign — whether it comes from our own record
// (task completion), from the academic calendar (assessment pressure), from the
// weather, or from a public campus feed.
//
// WHY THIS EXISTS, stated plainly, because the reason is a specific defect:
//
// `SignalDef` in signals.ts carries metadata only. The computation for all 13
// signals lives in one 160-line `computeRaw()`, coupled to its definition by a
// string key. Three things follow, all of them live today:
//
//   1. Adding a signal takes two coordinated edits, and forgetting the second
//      yields a SILENTLY ZERO signal rather than an error.
//   2. `halfLifeDays` is declared on all 13 signals and never read.
//   3. Two signals (`help_response`, `handoff_completion`) compute against
//      action families that are never emitted, so they are structurally
//      unreachable and can only ever report zero observations. Nothing catches
//      this, because nothing checks that a definition can actually run.
//
// A registry whose entries are metadata is a spreadsheet. This one binds each
// factor to the function that computes it, declares what that function is
// allowed to read, and refuses to register anything it cannot run.
//
// It also consolidates three things the codebase currently does five, three and
// three different ways respectively: explaining drivers, stamping versions, and
// refusing to speak on thin data. See docs/20 §B3.
//
// PRIVACY IS ENFORCED HERE, NOT DOWNSTREAM.
//
// docs/11 §7 requires that proxies for protected attributes are "blocked from
// the feature store, not just from display". A rule enforced at the render layer
// is not enforced. So every factor declares a privacy class and a set of
// permitted uses at registration time, `defineFactor` rejects anything that
// omits them, and `mayUse()` is the gate a consumer must pass. A factor that
// cannot be explained to the person it is about cannot be registered at all.
//
// Pure module. No database, no network, no clock beyond what the caller passes.

import { informationCoefficient, informationRatio, signalVerdict } from "./behavioral";

// ================================================================= taxonomy

export const ENTITY_TYPES = ["person", "club", "campus", "event", "campaign"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * What kind of thing the number is. This drives how it may be combined, and it
 * is the reason the multiplicative/log-odds mismatch in docs/20 §B4 exists at
 * all — two layers produced numbers of different kinds and nothing said so.
 */
export const VALUE_TYPES = [
  "rate", // 0..1, a proportion
  "count", // non-negative integer
  "index", // 0..1, a composite with no frequency interpretation
  "duration_hours",
  "multiplier", // 1.0 is neutral; multiplies an expectation
  "log_odds", // additive on the logit scale
  "z_score",
] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

/**
 * Who the number may be shown to and what it may drive.
 *
 * `forbidden` exists so the do-not-compute list is a value in the type system
 * rather than a paragraph in a document. `defineFactor` throws on it.
 */
export const PRIVACY_CLASSES = [
  /** No person in it. Campus weather, the academic calendar, a public feed. */
  "public_context",
  /** About a club as an organisation. Publishable to that club's officers. */
  "club_internal",
  /** About a person. The mirror test applies: must be explainable to them. */
  "person_private",
  /** A proxy for a protected attribute. Registration is refused. */
  "forbidden",
] as const;
export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

export const USES = [
  "planning", // scheduling, capacity, staffing — internal club operations
  "club_reporting", // shown to officers about their own club
  "person_self", // shown to the person it is about
  "matching", // club/project recommendations to the member themselves
  "sponsor_ranking", // campaign eligibility and ranking
  "employer_evidence", // anything reaching an external employer or investor
  "research", // internal validation only, never surfaced
] as const;
export type Use = (typeof USES)[number];

/**
 * Uses that put a number in front of someone with power over the subject.
 *
 * docs/11 §7: "No portable reliability or leadership-potential score sold to
 * employers." docs/10 §6: "evidence, never a score." A person-scoped factor may
 * therefore never declare these; `defineFactor` enforces it. Employers see
 * episodes, artifacts and outcomes — never a factor value.
 */
const EXTERNAL_USES: Use[] = ["employer_evidence", "sponsor_ranking"];

export const FACTOR_STATUSES = [
  "experimental", // registered, never evaluated
  "insufficient_data",
  "no_signal",
  "weak",
  "useful",
  "strong",
  "retired", // kept for replay of historical decisions; not computed going forward
] as const;
export type FactorStatus = (typeof FACTOR_STATUSES)[number];

// ============================================================= the definition

/** What a factor's compute function returns. Null means "cannot say". */
export type FactorReading = {
  value: number;
  /** observations behind it. Drives the refusal rule; never omit it. */
  n: number;
  /** named contributions, the ONE driver shape (docs/20 §B3) */
  drivers?: Driver[];
  /** anything the caller should carry forward for auditing */
  basis?: Record<string, unknown>;
};

export type Driver = { label: string; contribution: number };

export type FactorDef<I = any> = {
  id: string;
  name: string;
  description: string;
  entity: EntityType;
  valueType: ValueType;

  /** What we think is true, and therefore what would falsify it. Required. */
  hypothesis: string;
  /** Which outcome ids this claims to predict. Empty = descriptive only. */
  supportedOutcomes: string[];
  /** +1, -1, or null when genuinely unknown. A backwards result gets flagged. */
  expectedSign: 1 | -1 | null;

  privacy: PrivacyClass;
  permittedUses: Use[];

  /**
   * Below this many observations the registry returns null rather than a
   * number. Enforced centrally so a new factor cannot forget to refuse.
   */
  minimumSampleSize: number;
  /** Recency half-life, or null when the factor is a point-in-time state. */
  halfLifeDays: number | null;

  /** Source ids this depends on, for provenance and for cascade invalidation. */
  sources: string[];
  /**
   * Prose statement of what was knowable at compute time. This is the
   * point-in-time contract in a form a reviewer can actually check; the code
   * cannot verify it, so it must be stated and read.
   */
  availableAt: string;

  version: string;
  status: FactorStatus;

  /** Input keys `compute` reads. Checked before it runs, so a missing input is
   *  an error rather than a silently-zero factor. */
  requires: string[];
  compute: (input: I, asOf: string) => FactorReading | null;
  /**
   * Plain language, for the person or officer the number is about.
   * REQUIRED for anything person-scoped: this is the mirror test, as code.
   */
  explain: (value: number | null, reading: FactorReading | null) => string;
};

// =============================================================== registration

const ID_RE = /^[a-z][a-z0-9_]{2,63}$/;

/**
 * Validate and freeze a factor definition.
 *
 * Throws rather than warns. A factor that reaches the registry malformed would
 * produce numbers that look exactly like good ones, and the failure would
 * surface as a quietly wrong decision months later.
 */
export function defineFactor<I>(def: FactorDef<I>): FactorDef<I> {
  const bad = (why: string): never => {
    throw new Error(`Factor "${def?.id ?? "(no id)"}" rejected: ${why}`);
  };

  if (!def || typeof def !== "object") bad("not an object");
  if (typeof def.id !== "string" || !ID_RE.test(def.id))
    bad("id must be lower_snake_case, 3-64 chars");
  if (!def.name?.trim()) bad("name is required");
  if (!def.description?.trim()) bad("description is required");
  if (!ENTITY_TYPES.includes(def.entity)) bad(`entity must be one of ${ENTITY_TYPES.join(", ")}`);
  if (!VALUE_TYPES.includes(def.valueType)) bad(`valueType must be one of ${VALUE_TYPES.join(", ")}`);

  // A factor with no hypothesis is a number in search of a meaning, which is
  // precisely how a factor zoo starts (docs/20 §C, spec §51).
  if (!def.hypothesis?.trim() || def.hypothesis.trim().length < 10)
    bad("hypothesis is required and must say something falsifiable");
  if (!def.availableAt?.trim())
    bad("availableAt is required: state what was knowable at compute time");

  if (!PRIVACY_CLASSES.includes(def.privacy)) bad("privacy class is required");
  if (def.privacy === "forbidden")
    bad(
      "privacy class is 'forbidden'. This is the do-not-compute list (docs/11 §7); " +
        "proxies for protected attributes are blocked at the feature store, not at the display layer.",
    );

  if (!Array.isArray(def.permittedUses) || def.permittedUses.length === 0)
    bad("permittedUses must name at least one use");
  for (const u of def.permittedUses) if (!USES.includes(u)) bad(`unknown use "${u}"`);

  // docs/10 §6 and docs/11 §7: evidence, never a score. A number about a person
  // may never be the thing an employer or a sponsor ranks on.
  if (def.entity === "person") {
    const external = def.permittedUses.filter((u) => EXTERNAL_USES.includes(u));
    if (external.length)
      bad(
        `person-scoped factors may not declare ${external.join(", ")}. ` +
          "Employers and sponsors receive episodes, artifacts and outcomes — never a factor value.",
      );
    // The mirror test, as an executable check rather than a policy.
    if (typeof def.explain !== "function")
      bad("person-scoped factors must supply explain(): if it cannot be shown to the person it is about, it is not computed");
    if (!def.permittedUses.includes("person_self"))
      bad("person-scoped factors must permit 'person_self': the subject sees it first, or it is not computed");
  }

  if (typeof def.compute !== "function")
    bad("compute is required — a registry of metadata without computation is the defect this replaces");
  if (typeof def.explain !== "function") bad("explain is required");
  if (!Array.isArray(def.requires)) bad("requires must be an array, even if empty");
  if (!Array.isArray(def.sources)) bad("sources must be an array, even if empty");

  if (!Number.isFinite(def.minimumSampleSize) || def.minimumSampleSize < 0)
    bad("minimumSampleSize must be a non-negative number");
  if (def.halfLifeDays !== null && !(Number.isFinite(def.halfLifeDays) && def.halfLifeDays > 0))
    bad("halfLifeDays must be a positive number or explicitly null");
  if (!def.version?.trim()) bad("version is required");
  if (!FACTOR_STATUSES.includes(def.status)) bad("status is required");
  if (def.expectedSign !== null && def.expectedSign !== 1 && def.expectedSign !== -1)
    bad("expectedSign must be 1, -1, or explicitly null");

  return Object.freeze({ ...def, permittedUses: Object.freeze([...def.permittedUses]) as Use[] });
}

export class FactorRegistry {
  private readonly byId = new Map<string, FactorDef<any>>();

  register<I>(def: FactorDef<I>): FactorDef<I> {
    const validated = defineFactor(def);
    if (this.byId.has(validated.id))
      throw new Error(`Factor "${validated.id}" is already registered.`);
    this.byId.set(validated.id, validated);
    return validated;
  }

  get(id: string): FactorDef<any> | null {
    return this.byId.get(id) ?? null;
  }

  /** Active factors only. A retired factor is kept for replay, never recomputed. */
  all(): FactorDef<any>[] {
    return [...this.byId.values()].filter((f) => f.status !== "retired");
  }

  /** Everything, retired included, for reproducing a historical decision. */
  including_retired(): FactorDef<any>[] {
    return [...this.byId.values()];
  }

  byEntity(entity: EntityType): FactorDef<any>[] {
    return this.all().filter((f) => f.entity === entity);
  }

  byOutcome(outcome: string): FactorDef<any>[] {
    return this.all().filter((f) => f.supportedOutcomes.includes(outcome));
  }

  bySource(sourceId: string): FactorDef<any>[] {
    return this.including_retired().filter((f) => f.sources.includes(sourceId));
  }

  size(): number {
    return this.byId.size;
  }
}

/** May this factor be used for this purpose? The gate, not a suggestion. */
export function mayUse(def: FactorDef<any>, use: Use): { allowed: boolean; reason: string } {
  if (def.status === "retired")
    return { allowed: false, reason: `${def.id} is retired and is kept only to replay past decisions.` };
  if (!def.permittedUses.includes(use))
    return {
      allowed: false,
      reason: `${def.id} does not permit "${use}". Permitted: ${def.permittedUses.join(", ")}.`,
    };
  return { allowed: true, reason: "" };
}

// ================================================================= computing

export type FactorValue = {
  factor: string;
  entityType: EntityType;
  entityId: string;
  /** null when the registry refused to speak; `status` says why */
  value: number | null;
  valueType: ValueType;
  n: number;
  asOf: string;
  status: "ok" | "insufficient_data" | "missing_input" | "not_computable" | "retired";
  drivers: Driver[];
  basis: Record<string, unknown>;
  modelVersion: string;
  reading: string;
};

/**
 * Run one factor, with the refusal rule and the input check applied centrally.
 *
 * Three refusals, in order, each returning a null value rather than a number:
 *
 *   missing_input    — the definition declared an input the caller did not pass.
 *                      An error, not a zero. This is the specific failure that
 *                      makes `help_response` silently report nothing today.
 *   not_computable   — compute() itself said it cannot say.
 *   insufficient_data — fewer observations than the factor declared it needs.
 *
 * Centralising this is the point. Every module currently implements its own
 * refusal (`clubHealth` at MIN_PEERS, `peerPrior` at 3, `climatology` at 15) and
 * a new factor can simply forget. Here it cannot.
 */
export function computeFactor<I>(
  def: FactorDef<I>,
  entityId: string,
  input: I,
  asOf: string,
): FactorValue {
  const base = {
    factor: def.id,
    entityType: def.entity,
    entityId,
    valueType: def.valueType,
    asOf,
    modelVersion: def.version,
    drivers: [] as Driver[],
    basis: {} as Record<string, unknown>,
  };

  if (def.status === "retired")
    return { ...base, value: null, n: 0, status: "retired", reading: `${def.name} is retired.` };

  const bag = (input ?? {}) as Record<string, unknown>;
  const missing = def.requires.filter((k) => bag[k] === undefined);
  if (missing.length)
    return {
      ...base,
      value: null,
      n: 0,
      status: "missing_input",
      basis: { missing },
      reading: `${def.name} needs ${missing.join(", ")}, which was not supplied.`,
    };

  let reading: FactorReading | null;
  try {
    reading = def.compute(input, asOf);
  } catch (e) {
    return {
      ...base,
      value: null,
      n: 0,
      status: "not_computable",
      basis: { error: e instanceof Error ? e.message : String(e) },
      reading: `${def.name} could not be computed.`,
    };
  }

  if (!reading || !Number.isFinite(reading.value))
    return {
      ...base,
      value: null,
      n: reading?.n ?? 0,
      status: "not_computable",
      reading: def.explain(null, reading ?? null),
    };

  const n = Number.isFinite(reading.n) ? reading.n : 0;
  if (n < def.minimumSampleSize)
    return {
      ...base,
      value: null,
      n,
      status: "insufficient_data",
      drivers: reading.drivers ?? [],
      basis: reading.basis ?? {},
      reading: `${def.name}: ${n} observation${n === 1 ? "" : "s"}, and at least ${def.minimumSampleSize} are needed before this means anything.`,
    };

  return {
    ...base,
    value: reading.value,
    n,
    status: "ok",
    drivers: reading.drivers ?? [],
    basis: reading.basis ?? {},
    reading: def.explain(reading.value, reading),
  };
}

// ======================================================== the output standard

/**
 * The model-output standard, ported from the only complete one in the repo:
 * `MODEL` + the `forecast()` return in services/quant/club_quant/quant.py.
 *
 * Everything that predicts anything should return this shape, so that two
 * predictions are comparable, auditable, and reproducible. `forecast.ts`'s
 * `Forecast` carries uncertainty and drivers but no version, no as-of and no
 * assumptions, so two predictor outputs are indistinguishable downstream. This
 * is the fix.
 */
export type Prediction<T = number> = {
  value: T;
  /** Equal-tailed interval. Null only when the model genuinely cannot say. */
  interval: [number, number] | null;
  intervalMass: number; // e.g. 0.9
  asOf: string;
  model: { name: string; version: string; featureVersion: string };
  /** Named contributions, the same Driver shape as a factor. */
  drivers: Driver[];
  /** Every factor that fed this, with its own provenance. */
  factors: FactorValue[];
  sampleSize: number;
  /** What the model assumes, stated so it can be checked. */
  assumptions: string[];
  limitations: string[];
  /** Maturity, borrowed from quant.py's `status`. */
  status: "prior_only" | "baseline_unvalidated" | "validated";
  reading: string;
};

/** Refuse to predict, in the standard shape, rather than returning a number. */
export function cannotPredict(
  model: Prediction["model"],
  asOf: string,
  why: string,
  factors: FactorValue[] = [],
): Prediction<null> {
  return {
    value: null,
    interval: null,
    intervalMass: 0,
    asOf,
    model,
    drivers: [],
    factors,
    sampleSize: 0,
    assumptions: [],
    limitations: [why],
    status: "prior_only",
    reading: why,
  };
}

// ================================================================ evaluation

export type FactorEvaluation = {
  factor: string;
  outcome: string;
  pairs: number;
  windows: number;
  ic: number | null;
  ir: number | null;
  signAgrees: boolean | null;
  verdict: FactorStatus;
  computedAt: string;
};

/**
 * Walk-forward validation of one factor against one outcome.
 *
 * Deliberately the same statistics as `runRegistry` in signals.ts — Spearman IC
 * per window, IR across windows, `signalVerdict` thresholds — so that behavioural
 * signals and context factors are held to ONE standard and their results are
 * directly comparable. This generalises that function rather than paralleling
 * it; `signal_registry_runs` and factor evaluations should end up in one table.
 *
 * `pairs` counts observations, which over-counts when one person contributes
 * many months. `distinctSubjects` is carried separately and is what the verdict
 * uses, because a sample of 200 person-months from 6 people is a sample of 6.
 */
export function evaluateFactor(input: {
  factorId: string;
  outcome: string;
  /** one row per (subject, horizon): the factor value and the realised outcome */
  observations: { subjectId: string; window: string; x: number; y: number }[];
  expectedSign: 1 | -1 | null;
  computedAt: string;
  minWindowSize?: number;
}): FactorEvaluation {
  const minWindow = input.minWindowSize ?? 5;
  const usable = input.observations.filter(
    (o) => Number.isFinite(o.x) && Number.isFinite(o.y),
  );
  const xs = usable.map((o) => o.x);
  const ys = usable.map((o) => o.y);
  const ic = informationCoefficient(xs, ys);

  const byWindow = new Map<string, { x: number; y: number }[]>();
  for (const o of usable) {
    if (!byWindow.has(o.window)) byWindow.set(o.window, []);
    byWindow.get(o.window)!.push(o);
  }
  const windowIcs: (number | null)[] = [];
  for (const rows of byWindow.values())
    if (rows.length >= minWindow)
      windowIcs.push(informationCoefficient(rows.map((r) => r.x), rows.map((r) => r.y)));
  const ir = informationRatio(windowIcs);

  // A sample of 200 person-months drawn from 6 people is a sample of 6.
  const distinctSubjects = new Set(usable.map((o) => o.subjectId)).size;
  const verdict = signalVerdict(distinctSubjects, ic) as FactorStatus;

  return {
    factor: input.factorId,
    outcome: input.outcome,
    pairs: usable.length,
    windows: windowIcs.length,
    ic,
    ir,
    signAgrees:
      ic === null || input.expectedSign === null ? null : Math.sign(ic) === input.expectedSign,
    verdict,
    computedAt: input.computedAt,
  };
}

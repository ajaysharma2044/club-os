// Capacity(i, t) — expected available hours for one person over a horizon.
//
// ==========================================================================
// WHAT THIS IS NOT, and it is the most important paragraph in the file.
//
// This does not measure whether someone is lazy, flaky, committed or busy.
// None of those are properties of a person; they are readings taken from a
// week. What this computes is narrower and checkable: given the commitments
// Club OS can actually see, the courses the registrar publishes, and the
// assessment calendar, HOW MANY DISCRETIONARY HOURS DOES THIS WEEK PLAUSIBLY
// LEAVE? It is a statement about a calendar, not about a character.
//
// Three consequences follow, and all three are enforced below rather than
// written down and forgotten:
//
//   1. The answer is an interval, never a point. A number like "4.2 hours"
//      read off a dashboard becomes a fact about a person within a week. An
//      interval of "somewhere between 1 and 7 hours, and here is what we are
//      not counting" cannot be misread the same way.
//   2. Unknown commitments are refused, not zeroed. Assuming an untracked
//      person has no commitments reports them as the most available member of
//      the club, which is exactly backwards — the people who track least in
//      Club OS are frequently the people carrying the most outside it.
//   3. The reading names the limits out loud. Club OS sees Club OS. It does
//      not see a job, a thesis advisor, a sick parent or a second club.
//
// Pure module. No database, no network, no clock beyond what the caller
// passes. See factors.ts for the Prediction output standard this returns.
// ==========================================================================

import {
  cannotPredict,
  computeFactor,
  defineFactor,
  type Driver,
  type FactorValue,
  type Prediction,
} from "../factors";
import type { Load } from "../academic";

// ------------------------------------------------------------------- inputs

export const COMMITMENT_KINDS = [
  "task", // a Club OS task assigned to this person
  "event_responsibility", // a named role at an upcoming event
  "project", // a longer-running piece of work they own
  "blocker", // something of theirs that is stuck on someone else
] as const;
export type CommitmentKind = (typeof COMMITMENT_KINDS)[number];

export type OpenCommitment = {
  id: string;
  kind: CommitmentKind;
  label: string;
  /**
   * Hours somebody actually estimated. Null means nobody did — which is the
   * common case and must stay distinguishable from "estimated at zero".
   */
  estimatedHours: number | null;
  /** ISO. Null when undated, which widens the interval rather than dropping it. */
  dueAt: string | null;
  /** Currently blocked on someone or something else. */
  blocked?: boolean;
};

export type PersonalPressure = {
  pressure: number;
  relativeToCampus: number;
  reading: string;
};

export type CapacityInput = {
  personId: string;
  /** The moment the question is asked. */
  at: string;
  /** How far ahead to look. A week is the unit officers actually plan in. */
  horizonDays?: number;
  /**
   * Open commitments, or NULL when they are not known.
   *
   * An empty array is a claim: "this person has nothing open in Club OS".
   * Null is the absence of a claim. The two must never collapse into each
   * other, and the whole refusal rule below hangs on the difference.
   */
  commitments: OpenCommitment[] | null;
  /** `academicLoad()` from academic.ts. Null when the roster is unknown. */
  load?: Load | null;
  /** `personalPressure()` from academic.ts. Null when the calendar is thin. */
  personalPressure?: PersonalPressure | null;
  /**
   * Hours per week this person has said they want to give the club. Their own
   * statement outranks any default we could invent, and it narrows the
   * interval because it replaces a guess with an answer.
   */
  statedWeeklyHours?: number | null;
  /** Override the default discretionary budget, e.g. for a campus study. */
  discretionaryWeeklyHours?: number;
};

// ---------------------------------------------------------------- constants

/**
 * The default weekly budget for club work, in hours, absent a statement from
 * the person themselves.
 *
 * STATED PRIOR, NOT AN ESTIMATE — the same discipline as REGIME_TURNOUT in
 * context.ts. It is deliberately modest. An inflated budget makes everyone
 * look available and turns every missed task into a personal failing, which is
 * the precise attribution error this whole layer exists to avoid.
 */
export const DEFAULT_DISCRETIONARY_WEEKLY_HOURS = 8;

/** Imputed hours for a commitment nobody estimated, by kind. */
export const IMPUTED_HOURS: Record<CommitmentKind, number> = {
  task: 2,
  event_responsibility: 4,
  project: 6,
  // A blocked item is not free. Chasing it, re-reading it and re-planning
  // around it costs real time even while no progress is made.
  blocker: 1,
};

/** Proportional discretionary time lost per unit of load above a standard one. */
export const ACADEMIC_SENSITIVITY = 0.6;
/** Proportional discretionary time lost per unit of campus assessment pressure. */
export const PRESSURE_SENSITIVITY = 0.5;

/** Coefficient of variation on an hours figure somebody actually estimated. */
const CV_ESTIMATED = 0.35;
/** …and on one we imputed from the kind alone. Much wider, deliberately. */
const CV_IMPUTED = 0.8;
/** Extra CV when the item has no due date: we do not know if it lands here. */
const CV_NO_DUE_DATE = 0.25;
/** Extra CV when the item is blocked: restart cost is genuinely unknown. */
const CV_BLOCKED = 0.4;

/** Relative uncertainty on the budget itself. */
const CV_BUDGET_STATED = 0.25;
const CV_BUDGET_DEFAULT = 0.45;
/** Relative uncertainty added when an input is missing entirely. */
const CV_MISSING_INPUT = 0.2;
/** …and the smaller residual when it is present. */
const CV_PRESENT_INPUT = 0.1;

/** z for a 90% equal-tailed normal interval. */
const Z90 = 1.6449;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r1 = (v: number) => Number(v.toFixed(1));

// ------------------------------------------------------------------ factors
//
// Registered through defineFactor so the privacy class, the permitted uses and
// the refusal rule are enforced centrally rather than re-implemented here. All
// three are person-scoped and therefore carry `person_self`: the subject sees
// any of these before an officer does, or it is not computed at all.

type CommitmentBag = { commitments: OpenCommitment[]; horizonDays: number; at: string };

export const OPEN_COMMITMENT_HOURS = defineFactor<CommitmentBag>({
  id: "open_commitment_hours",
  name: "Open commitment hours",
  description:
    "Hours of open Club OS work owed by one person that fall inside a planning horizon.",
  entity: "person",
  valueType: "duration_hours",
  hypothesis:
    "Hours already owed inside a horizon reduce the hours available for anything new in that horizon, roughly one for one.",
  supportedOutcomes: [],
  expectedSign: null,
  privacy: "person_private",
  permittedUses: ["planning", "person_self", "club_reporting"],
  minimumSampleSize: 0, // zero open commitments is a real reading, not a refusal
  halfLifeDays: null, // point-in-time state, not an accumulating history
  sources: ["clubos.tasks", "clubos.events", "clubos.projects"],
  availableAt:
    "Computed only from commitments already open at `at`. Nothing created after that moment is visible to it.",
  version: "1.0.0",
  status: "experimental",
  requires: ["commitments", "horizonDays", "at"],
  compute: (input) => {
    const drivers: Driver[] = [];
    let hours = 0;
    for (const c of input.commitments) {
      const h = hoursFor(c) * horizonShare(c, input.at, input.horizonDays);
      hours += h;
      if (h > 0.01) drivers.push({ label: c.label, contribution: r1(h) });
    }
    drivers.sort((a, b) => b.contribution - a.contribution);
    return {
      value: r1(hours),
      n: input.commitments.length,
      drivers: drivers.slice(0, 6),
      basis: { horizonDays: input.horizonDays },
    };
  },
  explain: (value, reading) =>
    value === null
      ? "We do not know what this person currently has open."
      : `About ${value} hours of already-open club work fall inside this horizon, across ${reading?.n ?? 0} item${reading?.n === 1 ? "" : "s"}. This counts only what is tracked in Club OS.`,
});

export const ACADEMIC_WEEKLY_HOURS = defineFactor<{ load: Load }>({
  id: "academic_weekly_hours",
  name: "Academic weekly hours",
  description:
    "Estimated hours per week of coursework: scheduled contact hours plus modelled independent study.",
  entity: "person",
  valueType: "duration_hours",
  hypothesis:
    "A heavier credit-weighted course load leaves fewer discretionary hours in the same week.",
  supportedOutcomes: [],
  expectedSign: null,
  privacy: "person_private",
  permittedUses: ["planning", "person_self"],
  minimumSampleSize: 0, // an enrolment of zero courses is a fact, not thin data
  halfLifeDays: null,
  sources: ["registrar.roster"],
  availableAt:
    "Read from the published roster for the term containing `at`. Mid-term drops are not visible until the roster is re-ingested.",
  version: "1.0.0",
  status: "experimental",
  requires: ["load"],
  compute: (input) => ({
    value: input.load.weeklyHours,
    n: input.load.courses,
    drivers: [
      { label: "scheduled contact hours", contribution: input.load.contactHours },
      {
        label: "modelled independent study",
        contribution: r1(input.load.weeklyHours - input.load.contactHours),
      },
    ],
    basis: { loadRatio: input.load.loadRatio, verdict: input.load.verdict },
  }),
  explain: (value, reading) =>
    value === null
      ? "No course enrolment on record, so coursework hours cannot be estimated."
      : `About ${value} hours a week across ${reading?.n ?? 0} courses. Contact hours are read off the timetable; independent hours are modelled, not measured.`,
});

export const CAMPUS_ASSESSMENT_PRESSURE = defineFactor<{ campusPressure: number }>({
  id: "campus_assessment_pressure",
  name: "Campus assessment pressure",
  description:
    "How much assessment is bearing down on the campus at this moment, 0 to 1, before any personal load scaling.",
  entity: "campus",
  valueType: "index",
  hypothesis:
    "Discretionary time contracts as assessment pressure rises, independently of how many credits a person carries.",
  supportedOutcomes: [],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "person_self"],
  minimumSampleSize: 1,
  halfLifeDays: null,
  sources: ["campus.academic_calendar"],
  availableAt:
    "Derived from dated prelim and finals windows published before `at`. No student data of any kind enters it.",
  version: "1.0.0",
  status: "experimental",
  requires: ["campusPressure"],
  compute: (input) => ({ value: Number(input.campusPressure.toFixed(3)), n: 1 }),
  explain: (value) =>
    value === null
      ? "The academic calendar does not carry enough dated assessment windows to say."
      : `Campus-wide assessment pressure is ${Math.round((value ?? 0) * 100)} out of 100 right now.`,
});

export const OPEN_BLOCKER_COUNT = defineFactor<CommitmentBag>({
  id: "open_blocker_count",
  name: "Open blockers",
  description:
    "How many of this person's open items are stuck waiting on someone or something else.",
  entity: "person",
  valueType: "count",
  hypothesis:
    "Blocked work consumes attention and re-planning time without consuming progress, so it widens the uncertainty on available capacity rather than simply reducing it.",
  supportedOutcomes: [],
  expectedSign: null,
  privacy: "person_private",
  permittedUses: ["planning", "person_self", "club_reporting"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["clubos.tasks"],
  availableAt: "Blocker state as recorded at `at`.",
  version: "1.0.0",
  status: "experimental",
  requires: ["commitments", "horizonDays", "at"],
  compute: (input) => {
    const blocked = input.commitments.filter((c) => c.blocked || c.kind === "blocker");
    return {
      value: blocked.length,
      n: input.commitments.length,
      drivers: blocked.slice(0, 5).map((c) => ({ label: c.label, contribution: 1 })),
    };
  },
  explain: (value) =>
    value === null
      ? "Blocker state is not known."
      : value === 0
        ? "Nothing of theirs is currently stuck on anyone else."
        : `${value} open item${value === 1 ? " is" : "s are"} stuck on someone else. Blocked work still costs attention, so it widens the range rather than freeing the time.`,
});

// ------------------------------------------------------------------- output

export type CapacityBasis = {
  horizonDays: number;
  /** Discretionary hours before any commitment is subtracted. Null on refusal. */
  discretionaryHours: number | null;
  /** Hours of open work landing inside the horizon. Null on refusal. */
  committedHours: number | null;
  /** Multipliers applied to the raw budget, named, so the subtraction is legible. */
  multipliers: { label: string; multiplier: number }[];
  commitmentsCounted: number;
  /** How many of those nobody had estimated. Drives most of the width. */
  unestimated: number;
  blockers: number;
  /** True when the point estimate is negative: they are already over-committed. */
  overCommitted: boolean;
};

/**
 * Expected available capacity, in hours, over the stated horizon.
 *
 * `value` is NEGATIVE when the person is over-committed, and that is
 * deliberate: flooring it at zero would hide the single most useful thing this
 * function can tell an officer, which is that the work already assigned does
 * not fit in the week.
 */
export type ExpectedAvailableCapacity = Prediction<number | null> & {
  personId: string;
  basis: CapacityBasis;
};

const MODEL = {
  name: "cec.planning.capacity",
  version: "1.0.0",
  featureVersion: "open_commitment_hours@1.0.0+academic_weekly_hours@1.0.0",
};

// ------------------------------------------------------------------- helpers

function hoursFor(c: OpenCommitment): number {
  const e = c.estimatedHours;
  if (typeof e === "number" && Number.isFinite(e) && e >= 0) return e;
  return IMPUTED_HOURS[c.kind] ?? IMPUTED_HOURS.task;
}

/**
 * What share of a commitment's hours lands inside the horizon.
 *
 * Overdue and imminent work is owed in full now. Work due well beyond the
 * horizon is prorated, because people do spread a three-week project across
 * three weeks. Undated work gets half, and pays for that guess with a wider
 * interval rather than with a confident number.
 */
function horizonShare(c: OpenCommitment, at: string, horizonDays: number): number {
  if (!c.dueAt) return 0.5;
  const due = Date.parse(c.dueAt);
  const now = Date.parse(at);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return 0.5;
  const days = (due - now) / 86400e3;
  if (days <= horizonDays) return 1; // overdue or due inside the window
  return clamp(horizonDays / days, 0, 1);
}

function cvFor(c: OpenCommitment): number {
  let cv = c.estimatedHours === null ? CV_IMPUTED : CV_ESTIMATED;
  if (!c.dueAt) cv += CV_NO_DUE_DATE;
  if (c.blocked || c.kind === "blocker") cv += CV_BLOCKED;
  return cv;
}

/**
 * Recover CAMPUS pressure from a personal reading.
 *
 * This exists to stop a double-count that is easy to miss. `personalPressure()`
 * in academic.ts is already `campusPressure * sqrt(loadRatio)` — the course
 * load is inside it. If we then multiplied by a separate load term below, the
 * same credit hours would be charged twice: once as hours consumed and once as
 * pressure felt. Since `relativeToCampus` IS that sqrt(loadRatio), dividing it
 * back out recovers the campus term exactly, and the two multipliers then
 * measure genuinely different things — hours spent, and assessment timing.
 */
function campusPressureFrom(p: PersonalPressure | null | undefined): number | null {
  if (!p || !Number.isFinite(p.pressure)) return null;
  const rel = Number.isFinite(p.relativeToCampus) && p.relativeToCampus > 0 ? p.relativeToCampus : 1;
  return clamp(p.pressure / rel, 0, 1);
}

// -------------------------------------------------------------------- model

/**
 * Expected available capacity for one person over a horizon.
 *
 * The arithmetic is a subtraction and is meant to stay legible:
 *
 *   budget    = stated weekly hours (or a stated default), scaled to horizon
 *   available = budget x academicMultiplier x pressureMultiplier
 *   capacity  = available - committed hours landing inside the horizon
 *
 * Uncertainty is propagated rather than asserted. Each commitment carries a
 * coefficient of variation set by how it was measured — an estimate is tighter
 * than an imputation, an undated item is looser than a dated one, a blocked
 * item looser still — and the variances add. The result is that a person with
 * six carefully estimated tasks gets a narrow range and a person with six
 * unestimated ones gets a wide one, which is the correct asymmetry: we know
 * less about the second person, and the output should say so.
 */
export function expectedAvailableCapacity(input: CapacityInput): ExpectedAvailableCapacity {
  const horizonDays = clamp(input.horizonDays ?? 7, 1, 90);
  const emptyBasis: CapacityBasis = {
    horizonDays,
    discretionaryHours: null,
    committedHours: null,
    multipliers: [],
    commitmentsCounted: 0,
    unestimated: 0,
    blockers: 0,
    overCommitted: false,
  };

  if (!Number.isFinite(Date.parse(input.at)))
    return {
      ...cannotPredict(MODEL, input.at, `"${input.at}" is not a time we can read.`),
      personId: input.personId,
      basis: emptyBasis,
    };

  // THE REFUSAL. Unknown commitments are not zero commitments. Treating them
  // as zero would report the least-tracked member of a club as its most
  // available one, and officers would then hand them the work.
  if (input.commitments === null || input.commitments === undefined)
    return {
      ...cannotPredict(
        MODEL,
        input.at,
        "We do not know what this person currently has open, so we will not estimate their capacity. " +
          "Treating unknown commitments as no commitments would report them as the most available person in the club, which is exactly backwards: " +
          "the people who track least in Club OS are often carrying the most outside it. Ask them, or record their open work, and this becomes answerable.",
      ),
      personId: input.personId,
      basis: emptyBasis,
    };

  const commitments = input.commitments.filter((c) => c && typeof c === "object");
  const campusPressure = campusPressureFrom(input.personalPressure);

  // --- factors, computed through the registry so the gates are enforced ---
  const bag: CommitmentBag = { commitments, horizonDays, at: input.at };
  const factors: FactorValue[] = [
    computeFactor(OPEN_COMMITMENT_HOURS, input.personId, bag, input.at),
    computeFactor(OPEN_BLOCKER_COUNT, input.personId, bag, input.at),
  ];
  if (input.load)
    factors.push(computeFactor(ACADEMIC_WEEKLY_HOURS, input.personId, { load: input.load }, input.at));
  if (campusPressure !== null)
    factors.push(
      computeFactor(CAMPUS_ASSESSMENT_PRESSURE, "campus", { campusPressure }, input.at),
    );

  // --- the budget --------------------------------------------------------
  const stated =
    typeof input.statedWeeklyHours === "number" && Number.isFinite(input.statedWeeklyHours)
      ? Math.max(0, input.statedWeeklyHours)
      : null;
  const weekly = stated ?? input.discretionaryWeeklyHours ?? DEFAULT_DISCRETIONARY_WEEKLY_HOURS;
  const budget = (weekly * horizonDays) / 7;

  const multipliers: { label: string; multiplier: number }[] = [];

  // Coursework hours above (or below) a standard load move the discretionary
  // budget. Bounded on both sides so one odd roster cannot zero somebody out.
  const loadRatio = input.load ? input.load.loadRatio : null;
  const academicMultiplier =
    loadRatio === null ? 1 : clamp(1 - ACADEMIC_SENSITIVITY * (loadRatio - 1), 0.25, 1.25);
  if (academicMultiplier !== 1)
    multipliers.push({
      label:
        loadRatio !== null && loadRatio > 1
          ? `${input.load?.verdict.replace("_", " ")} course load`
          : "lighter than standard course load",
      multiplier: Number(academicMultiplier.toFixed(3)),
    });

  // Assessment timing, with the load component already divided out above.
  const pressureMultiplier =
    campusPressure === null ? 1 : clamp(1 - PRESSURE_SENSITIVITY * campusPressure, 0.3, 1);
  if (pressureMultiplier !== 1)
    multipliers.push({
      label: "assessment pressure on campus",
      multiplier: Number(pressureMultiplier.toFixed(3)),
    });

  const available = budget * academicMultiplier * pressureMultiplier;

  // --- the subtraction ---------------------------------------------------
  let committed = 0;
  let varCommitted = 0;
  let unestimated = 0;
  let blockers = 0;
  const commitmentDrivers: Driver[] = [];
  for (const c of commitments) {
    const share = horizonShare(c, input.at, horizonDays);
    const h = hoursFor(c) * share;
    committed += h;
    const sd = h * cvFor(c);
    varCommitted += sd * sd;
    if (c.estimatedHours === null) unestimated++;
    if (c.blocked || c.kind === "blocker") blockers++;
    if (h > 0.01) commitmentDrivers.push({ label: c.label, contribution: -r1(h) });
  }

  const value = available - committed;

  // --- uncertainty -------------------------------------------------------
  // Relative variance on the budget: how it was set, plus a penalty for each
  // input we had to do without. Missing inputs must WIDEN the answer, never
  // quietly shift it.
  const cvBudgetBase = stated === null ? CV_BUDGET_DEFAULT : CV_BUDGET_STATED;
  const cvLoad = input.load ? CV_PRESENT_INPUT : CV_MISSING_INPUT;
  const cvPressure = campusPressure === null ? CV_MISSING_INPUT : CV_PRESENT_INPUT;
  const relVar = cvBudgetBase ** 2 + cvLoad ** 2 + cvPressure ** 2;
  const sdAvailable = available * Math.sqrt(relVar);
  const sd = Math.sqrt(sdAvailable ** 2 + varCommitted);

  const lo = r1(value - Z90 * sd);
  const hi = r1(value + Z90 * sd);

  const drivers: Driver[] = [
    { label: `discretionary budget over ${horizonDays} days`, contribution: r1(budget) },
    ...multipliers.map((m) => ({
      label: m.label,
      contribution: r1(budget * (m.multiplier - 1)),
    })),
    ...commitmentDrivers.sort((a, b) => a.contribution - b.contribution).slice(0, 6),
  ];

  const assumptions = [
    stated === null
      ? `No stated weekly commitment from this person, so a default budget of ${weekly} hours a week is assumed. Their own statement would replace it and narrow this range.`
      : `They said they have about ${stated} hours a week for the club, and that is what this is measured against.`,
    "Commitments due beyond the horizon are prorated across the time remaining; undated commitments are counted at half and widen the range.",
    "Blocked work is counted as costing attention, not as freeing time.",
  ];

  const limitations = [
    "Club OS sees Club OS. A job, a thesis, a second club, a family situation and a bad week are all invisible here and none of them are small.",
    "This estimates demand on time. It does not measure effort, willingness or reliability, and it must not be read as any of those.",
  ];
  if (!input.load)
    limitations.push("No course enrolment was supplied, so coursework hours are not subtracted at all and this is likely an over-estimate.");
  if (campusPressure === null)
    limitations.push("No assessment-pressure reading was supplied, so exam weeks look like ordinary weeks here.");
  if (unestimated)
    limitations.push(
      `${unestimated} of ${commitments.length} open item${commitments.length === 1 ? "" : "s"} had no estimate, so their hours are imputed from the kind of work alone. That is most of the width of this range.`,
    );

  const overCommitted = value < 0;
  const hoursWord = (v: number) => `${Math.abs(r1(v))} hour${Math.abs(r1(v)) === 1 ? "" : "s"}`;
  const reading = overCommitted
    ? `Over-committed by about ${hoursWord(value)} over the next ${horizonDays} days (range ${lo} to ${hi}). ` +
      `The work already on them does not fit in the time the week plausibly leaves. This is a statement about their calendar, not about them.`
    : `Roughly ${hoursWord(value)} of club time plausibly free over the next ${horizonDays} days, and the honest range is ${lo} to ${hi}. ` +
      `Read the range, not the number${unestimated ? `; ${unestimated} open item${unestimated === 1 ? " has no estimate behind it" : "s have no estimate behind them"}` : ""}.`;

  return {
    value: r1(value),
    interval: [lo, hi],
    intervalMass: 0.9,
    asOf: input.at,
    model: MODEL,
    drivers,
    factors,
    sampleSize: commitments.length,
    assumptions,
    limitations,
    // Never "validated": nothing here has been checked against realised hours.
    status: commitments.length === 0 && !input.load ? "prior_only" : "baseline_unvalidated",
    reading,
    personId: input.personId,
    basis: {
      horizonDays,
      discretionaryHours: r1(available),
      committedHours: r1(committed),
      multipliers,
      commitmentsCounted: commitments.length,
      unestimated,
      blockers,
      overCommitted,
    },
  };
}

/** Did the model actually produce a number? Narrows the union for callers. */
export function hasCapacity(
  c: ExpectedAvailableCapacity | null | undefined,
): c is ExpectedAvailableCapacity & { value: number; interval: [number, number] } {
  return !!c && typeof c.value === "number" && Array.isArray(c.interval);
}

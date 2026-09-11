// AssignmentFit(i, p, t) — who should do this piece of work, and why.
//
// ==========================================================================
// THE BEST EXECUTOR IS NOT ALWAYS THE BEST ASSIGNMENT.
//
// A system that only ranks by expected execution quality has one behaviour,
// and it is corrosive: it hands every real piece of work to the two people who
// have already done it. Those two burn out, nobody else accumulates evidence,
// and when they graduate the club discovers it has a bus factor of one. That
// failure is already named in clubhealth.ts as `successionRisk`; this module
// is the other half of the same problem, priced at the moment of assignment
// rather than diagnosed a year later.
//
// So this returns TWO recommendations, always:
//
//   safest      — highest expected execution fit. What you pick when the stakes
//                 are high, the deadline is close, or failure is not
//                 recoverable.
//   development — the best assignment for the club over a longer horizon,
//                 among people who already hold enough prerequisite evidence
//                 that this is a stretch and not a gamble.
//
// `LearningValue` is a first-class scored term, not a tiebreak. It is highest
// where someone has the prerequisites but not the mastery, has shown interest,
// and will have somebody alongside them. It is ZERO where they have already
// done the thing to mastery — there is nothing left to learn — and zero where
// the prerequisite evidence is absent, because handing an unprepared person a
// high-stakes task is not development, it is a setup.
//
// AND: a ranking is never the primary output. Every candidate carries an
// explanation naming the drivers that moved them, and every fit score carries
// an interval that widens with thin evidence, so that "Maya 0.81, Priya 0.78"
// can be read for what it usually is — a tie.
//
// Pure module. No database, no network. See factors.ts for the Prediction
// output standard and capacity.ts for the availability input.
// ==========================================================================

import { cannotPredict, type Driver, type Prediction } from "../factors";
import {
  hasCapacity,
  type ExpectedAvailableCapacity,
} from "./capacity";

// ------------------------------------------------------------------- inputs

/**
 * A 0..1 term with the number of observations behind it.
 *
 * `n` is not decoration. A skill scored 0.9 from one observation and a skill
 * scored 0.9 from twelve are different claims, and the interval on the fit is
 * the only place that difference can honestly show up. `n = 0` means no
 * evidence — which is NOT the same as evidence of absence, and is handled as
 * such below.
 */
export type EvidenceTerm = {
  value: number;
  n: number;
  /** One phrase naming what the evidence actually is. Used in explanations. */
  note?: string;
};

export type CandidateProfile = {
  personId: string;
  /** Display name, for the explanation. Falls back to the id. */
  name?: string;
  /** EvidenceBackedSkills — demonstrated, not self-reported. */
  skills: EvidenceTerm;
  /** RelevantExperience — has done adjacent work of this shape before. */
  experience: EvidenceTerm;
  /** Interest — stated preference, and revealed preference where we have it. */
  interest: EvidenceTerm;
  /** HistoricalExecution — finished what they took on, on the time they said. */
  execution: EvidenceTerm;
  /** TeamRelationships — works well with the people already on this. */
  relationships: EvidenceTerm;
  /** From capacity.ts. Null when it refused, which is a real and common case. */
  capacity?: ExpectedAvailableCapacity | null;
  /** Open assignments they already hold. Drives the CurrentLoad penalty. */
  currentAssignments?: number;
  /** Will somebody experienced be alongside them? Changes what a stretch costs. */
  mentorAvailable?: boolean;
  /**
   * They have already done this to mastery. LearningValue goes to zero: there
   * is nothing here for them, and the development slot should go to someone
   * for whom there is.
   */
  alreadyMastered?: boolean;
};

export type TaskSpec = {
  id: string;
  label: string;
  /** Hours over the planning horizon. Null when nobody estimated it. */
  estimatedHours: number | null;
  /**
   * How bad a failure is. This is the input that decides how much prerequisite
   * evidence a development pick must hold, and it must come from a human — the
   * system cannot know whether a slipped deadline is an inconvenience or the
   * sponsor walking.
   */
  stakes: "low" | "medium" | "high";
  requiredSkills?: string[];
  dueAt?: string | null;
};

export type StaffingInput = {
  task: TaskSpec;
  candidates: CandidateProfile[];
  asOf: string;
  /** Horizon the capacity figures were computed over. Default 7 days. */
  horizonDays?: number;
};

// ---------------------------------------------------------------- constants

/**
 * Execution weights. STATED PRIORS, not fitted — there is nowhere near enough
 * assignment history on one campus to estimate six coefficients, and pretending
 * otherwise is the overfitting this codebase keeps refusing elsewhere.
 * Demonstrated skill leads; relationships matter but are the smallest term
 * because they are the easiest to over-read.
 */
export const FIT_WEIGHTS = {
  skills: 0.3,
  experience: 0.2,
  availability: 0.2,
  interest: 0.1,
  execution: 0.15,
  relationships: 0.05,
} as const;

/**
 * Development weights. Learning value carries the most weight, availability is
 * unchanged (a stretch assignment still has to fit in the week), and historical
 * execution is deliberately de-emphasised — requiring a track record before
 * giving someone the work that creates one is the circularity this exists to
 * break.
 */
export const DEVELOPMENT_WEIGHTS = {
  learning: 0.35,
  skills: 0.15,
  experience: 0.1,
  availability: 0.2,
  interest: 0.1,
  execution: 0.05,
  relationships: 0.05,
} as const;

/** Penalties, subtracted from both scores. */
export const PENALTY_WEIGHTS = { currentLoad: 0.2, capacityRisk: 0.15 } as const;

/** Open assignments at which CurrentLoad saturates. */
export const LOAD_SATURATION = 4;

/**
 * Prerequisite evidence a development pick must hold, by stakes.
 *
 * This is the line between a stretch and a setup, and it moves with
 * consequence. At low stakes almost anyone with a trace of relevant evidence
 * should get a turn. At high stakes the bar is genuinely high, and the honest
 * answer is frequently "nobody here yet — pair them instead".
 */
export const PREREQUISITE_FLOOR: Record<TaskSpec["stakes"], number> = {
  low: 0.2,
  medium: 0.35,
  high: 0.55,
};

/**
 * Margin above the floor at which readiness saturates.
 *
 * Readiness deliberately reaches 1 well short of mastery, because readiness and
 * stretch pull against each other: normalising readiness across the whole range
 * up to 1.0 would mean nobody could ever be both ready and still have something
 * to learn, and LearningValue would be crushed toward zero for everyone. A
 * quarter of a point of margin over the bar is enough to say "they can do this".
 */
export const READINESS_RAMP = 0.25;

/** LearningValue above which a stretch is worth calling an opportunity. */
export const MEANINGFUL_LEARNING = 0.2;

/**
 * How far behind the safest candidate a development pick may fall before the
 * trade stops being worth making. Beyond this the task itself is at risk, and
 * a failed stretch assignment teaches the wrong lesson to everyone.
 */
export const MAX_FIT_SACRIFICE = 0.2;

/** Fit interval mass. */
const INTERVAL_MASS = 0.9;
const Z90 = 1.6449;

/** With no capacity reading, availability is neutral — and says it is a guess. */
const NEUTRAL_AVAILABILITY = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Number(v.toFixed(2));
const r3 = (v: number) => Number(v.toFixed(3));

// ------------------------------------------------------ small normal helpers
//
// Local rather than shared: clubhealth.ts keeps its own private copy of the
// same approximation. Both should move to one place when a third caller
// appears; duplicating twice is cheaper than a premature abstraction.

/** Abramowitz & Stegun 7.1.26, good to ~7e-8. */
function normalCdf(z: number): number {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}

// ------------------------------------------------------------------- output

export type AssignmentFit = {
  personId: string;
  name: string;
  /** Execution-weighted fit, with an interval that widens on thin evidence. */
  fit: Prediction<number | null>;
  /** Development-weighted fit. Same terms, LearningValue added and reweighted. */
  developmentFit: Prediction<number | null>;
  /** LearningValue, scored 0..1. First-class, not a tiebreak. */
  learningValue: number;
  /** Prerequisite readiness against this task's stakes, 0..1. */
  prerequisiteReadiness: number;
  /** The raw prerequisite evidence behind that readiness, 0..1. */
  prerequisiteEvidence: number;
  /** P(their capacity falls short of what this task needs). */
  capacityRisk: number | null;
  /** Named contributions, positive. */
  drivers: Driver[];
  /** Named contributions, negative — load, capacity risk, missing evidence. */
  penalties: Driver[];
  eligible: boolean;
  /** Why they were not ranked, when they were not. */
  exclusion: string | null;
  /** Never empty, and always names at least one driver. */
  explanation: string;
};

export type StaffingRecommendation = {
  taskId: string;
  asOf: string;
  /** Ordered by execution fit. A ranking, never the headline. */
  ranked: AssignmentFit[];
  safest: AssignmentFit | null;
  development: AssignmentFit | null;
  /** True when the same person is both. Said out loud rather than hidden. */
  sameCandidate: boolean;
  /** Execution fit given up by choosing the development pick. */
  fitSacrifice: number | null;
  /**
   * False when the top two fit intervals overlap enough that the order is
   * inside the noise. An officer is entitled to know the ranking is a tie.
   */
  decisive: boolean;
  explanation: string;
  limitations: string[];
};

const MODEL = {
  name: "cec.planning.staffing",
  version: "1.0.0",
  featureVersion: "fit_weights@1.0.0+development_weights@1.0.0",
};

// ------------------------------------------------------------------ scoring

const term = (t: EvidenceTerm | undefined): EvidenceTerm =>
  t && Number.isFinite(t.value) && Number.isFinite(t.n)
    ? { value: clamp(t.value, 0, 1), n: Math.max(0, Math.round(t.n)), note: t.note }
    : { value: 0, n: 0 };

/**
 * Standard deviation of a 0..1 term given n observations.
 *
 * Beta-flavoured: sd = sqrt(v(1-v)/(n+2)). At n = 0 this is about 0.35 at the
 * midpoint, which is very nearly "we have no idea" — exactly right for a term
 * with no evidence behind it, and the reason a confident-looking 0.9 from one
 * observation does not get to win a ranking on its own.
 */
function termSd(t: EvidenceTerm): number {
  const v = clamp(t.value, 1e-6, 1 - 1e-6);
  return Math.sqrt((v * (1 - v)) / (t.n + 2));
}

/**
 * LearningValue — what the club gains from this person doing this, beyond the
 * work itself.
 *
 * Four multiplicative gates, each of which can legitimately zero it out:
 *
 *   readiness — do they hold the prerequisites for this stakes level? A stretch
 *               without prerequisites is a setup, and scores zero.
 *   stretch   — is there anything here they have not already evidenced? Someone
 *               who has done this ten times learns nothing, and scores zero.
 *   support   — is somebody experienced alongside them? Unsupported stretches
 *               are discounted, not forbidden.
 *   interest  — half weight on interest, because a development opportunity
 *               nobody wants is a chore with a nicer name.
 */
function learningValueFor(
  c: CandidateProfile,
  stakes: TaskSpec["stakes"],
): { value: number; readiness: number; prerequisite: number; note: string } {
  const skills = term(c.skills);
  const experience = term(c.experience);
  const interest = term(c.interest);

  const floor = PREREQUISITE_FLOOR[stakes];
  const prereq = r3(Math.min(skills.value, experience.value));
  const readiness = clamp((prereq - floor) / READINESS_RAMP, 0, 1);

  if (skills.n === 0 && experience.n === 0)
    return {
      value: 0,
      readiness: 0,
      prerequisite: prereq,
      note: "no prerequisite evidence at all, so this would be a gamble rather than a development opportunity",
    };
  if (c.alreadyMastered)
    return {
      value: 0,
      readiness,
      prerequisite: prereq,
      note: "has already done this to mastery, so there is nothing here for them to learn",
    };
  if (readiness <= 0)
    return {
      value: 0,
      readiness: 0,
      prerequisite: prereq,
      note: `holds prerequisite evidence of ${prereq} against the ${floor} a ${stakes}-stakes task needs — pair them on one of these before handing them one`,
    };

  const stretch = clamp(1 - skills.value, 0, 1);
  const support = c.mentorAvailable ? 1 : 0.7;
  const interestLift = 0.5 + 0.5 * interest.value;
  const value = clamp(readiness * stretch * support * interestLift, 0, 1);

  return {
    value: r3(value),
    readiness: r3(readiness),
    prerequisite: prereq,
    note:
      value >= MEANINGFUL_LEARNING
        ? `holds prerequisite evidence of ${prereq} against a ${stakes}-stakes bar of ${floor}, with real room to grow into this${c.mentorAvailable ? " and someone alongside them" : ", though nobody experienced is alongside them"}`
        : "some room to grow into this, but not much",
  };
}

/**
 * Availability, and the risk that it is not there.
 *
 * Both come from the capacity interval rather than from its point estimate,
 * which is the whole reason capacity.ts refuses to return a bare number.
 * `capacityRisk` is P(available hours < hours the task needs), read off the
 * normal implied by the interval — so a person with 6 expected hours and a
 * range of 2 to 10 is correctly treated as a riskier bet for a 5-hour task
 * than a person with 6 expected hours and a range of 5 to 7.
 */
function availabilityFor(
  c: CandidateProfile,
  task: TaskSpec,
): { term: EvidenceTerm; risk: number | null; note: string } {
  const cap = c.capacity;
  const need = typeof task.estimatedHours === "number" && task.estimatedHours > 0 ? task.estimatedHours : null;

  if (!hasCapacity(cap))
    return {
      term: { value: NEUTRAL_AVAILABILITY, n: 0 },
      risk: null,
      note: cap?.reading
        ? "their capacity could not be estimated, so availability is a placeholder here"
        : "no capacity reading was supplied, so availability is a placeholder here",
    };

  const [lo, hi] = cap.interval;
  // Recover the sd the interval was built from, then read the shortfall
  // probability off it. Equal-tailed and normal by construction in capacity.ts.
  const sd = Math.max(1e-6, (hi - lo) / (2 * Z90));

  if (need === null)
    return {
      // With no estimate of the work we can still say whether they have ANY
      // slack, which is a weaker claim and is scored as one.
      term: { value: clamp(cap.value / 8, 0, 1), n: cap.sampleSize },
      risk: null,
      note: "nobody estimated the hours this task needs, so availability is scored against slack in general rather than against the job",
    };

  const risk = clamp(normalCdf((need - cap.value) / sd), 0, 1);
  return {
    term: { value: clamp(cap.value / need, 0, 1), n: cap.sampleSize },
    risk: r3(risk),
    note:
      risk > 0.5
        ? `more likely than not to be short of the ${need} hours this needs`
        : `about ${Math.round(risk * 100)}% likely to fall short of the ${need} hours this needs`,
  };
}

function predictionFor(
  value: number,
  sd: number,
  asOf: string,
  sampleSize: number,
  drivers: Driver[],
  assumptions: string[],
  limitations: string[],
  reading: string,
): Prediction<number | null> {
  const lo = clamp(value - Z90 * sd, 0, 1);
  const hi = clamp(value + Z90 * sd, 0, 1);
  return {
    value: r3(value),
    // Round outward so the interval always contains the point estimate.
    interval: [Number(Math.max(0, lo).toFixed(3)), Number(Math.min(1, hi).toFixed(3))],
    intervalMass: INTERVAL_MASS,
    asOf,
    model: MODEL,
    drivers,
    factors: [],
    sampleSize,
    assumptions,
    limitations,
    status: "baseline_unvalidated",
    reading,
  };
}

// ----------------------------------------------------------------- the model

export function assignmentFit(
  candidate: CandidateProfile,
  task: TaskSpec,
  asOf: string,
): AssignmentFit {
  const name = candidate.name || candidate.personId;
  const skills = term(candidate.skills);
  const experience = term(candidate.experience);
  const interest = term(candidate.interest);
  const execution = term(candidate.execution);
  const relationships = term(candidate.relationships);
  const avail = availabilityFor(candidate, task);
  const availability = term(avail.term);

  const learning = learningValueFor(candidate, task.stakes);

  const currentLoad = clamp((candidate.currentAssignments ?? 0) / LOAD_SATURATION, 0, 1);
  const capacityRisk = avail.risk;

  const evidenceTotal = skills.n + experience.n + execution.n + relationships.n + interest.n;

  // THE REFUSAL. With no evidence of any kind, a fit score would be six
  // defaults dressed up as a judgement about a person. Say so instead.
  if (evidenceTotal === 0) {
    const why = `There is no recorded evidence of any kind for ${name} — no demonstrated skills, no adjacent experience, no completed work, no stated interest. A fit score here would be six default values wearing a person's name. Offer them something small and this becomes answerable.`;
    return {
      personId: candidate.personId,
      name,
      fit: cannotPredict(MODEL, asOf, why),
      developmentFit: cannotPredict(MODEL, asOf, why),
      learningValue: 0,
      prerequisiteReadiness: 0,
      prerequisiteEvidence: 0,
      capacityRisk,
      drivers: [],
      penalties: [],
      eligible: false,
      exclusion: why,
      explanation: why,
    };
  }

  const positive: { key: string; label: string; t: EvidenceTerm; w: number; wDev: number }[] = [
    { key: "skills", label: "evidence-backed skills", t: skills, w: FIT_WEIGHTS.skills, wDev: DEVELOPMENT_WEIGHTS.skills },
    { key: "experience", label: "relevant experience", t: experience, w: FIT_WEIGHTS.experience, wDev: DEVELOPMENT_WEIGHTS.experience },
    { key: "availability", label: "availability", t: availability, w: FIT_WEIGHTS.availability, wDev: DEVELOPMENT_WEIGHTS.availability },
    { key: "interest", label: "stated interest", t: interest, w: FIT_WEIGHTS.interest, wDev: DEVELOPMENT_WEIGHTS.interest },
    { key: "execution", label: "historical execution", t: execution, w: FIT_WEIGHTS.execution, wDev: DEVELOPMENT_WEIGHTS.execution },
    { key: "relationships", label: "team relationships", t: relationships, w: FIT_WEIGHTS.relationships, wDev: DEVELOPMENT_WEIGHTS.relationships },
  ];

  let gross = 0;
  let grossDev = 0;
  let varFit = 0;
  let varDev = 0;
  const drivers: Driver[] = [];
  for (const p of positive) {
    gross += p.w * p.t.value;
    grossDev += p.wDev * p.t.value;
    const sd = termSd(p.t);
    varFit += (p.w * sd) ** 2;
    varDev += (p.wDev * sd) ** 2;
    if (p.w * p.t.value > 0.01)
      drivers.push({ label: p.label, contribution: r3(p.w * p.t.value) });
  }

  // LearningValue enters the development score as a weighted term of its own,
  // with the same uncertainty treatment: it inherits the skill term's evidence,
  // because that is what it is computed from.
  grossDev += DEVELOPMENT_WEIGHTS.learning * learning.value;
  varDev += (DEVELOPMENT_WEIGHTS.learning * termSd({ value: learning.value, n: skills.n })) ** 2;

  const penalties: Driver[] = [];
  let penalty = 0;
  if (currentLoad > 0) {
    const p = PENALTY_WEIGHTS.currentLoad * currentLoad;
    penalty += p;
    penalties.push({
      label: `current load (${candidate.currentAssignments} open assignment${candidate.currentAssignments === 1 ? "" : "s"})`,
      contribution: -r3(p),
    });
  }
  if (capacityRisk !== null && capacityRisk > 0) {
    const p = PENALTY_WEIGHTS.capacityRisk * capacityRisk;
    penalty += p;
    penalties.push({
      label: `capacity risk (${Math.round(capacityRisk * 100)}% chance of falling short)`,
      contribution: -r3(p),
    });
  }
  if (availability.n === 0)
    penalties.push({ label: "availability unknown", contribution: 0 });

  const fitValue = clamp(gross - penalty, 0, 1);
  const devValue = clamp(grossDev - penalty, 0, 1);
  const sampleSize = Math.min(skills.n, experience.n, execution.n);

  drivers.sort((a, b) => b.contribution - a.contribution);
  penalties.sort((a, b) => a.contribution - b.contribution);

  const devDrivers: Driver[] = [
    { label: "learning value", contribution: r3(DEVELOPMENT_WEIGHTS.learning * learning.value) },
    ...drivers,
  ].sort((a, b) => b.contribution - a.contribution);

  const top = drivers.slice(0, 2);
  const worst = penalties.filter((p) => p.contribution < 0).slice(0, 1);
  const evidenceNote =
    sampleSize === 0
      ? " Thin evidence: at least one of skills, experience or completed work has nothing behind it, which is why the range is this wide."
      : ` Narrowest evidence behind this is ${sampleSize} observation${sampleSize === 1 ? "" : "s"}.`;

  const explanation =
    `${name}: ` +
    (top.length
      ? `driven by ${top.map((d) => `${d.label} (${d.contribution})`).join(" and ")}`
      : "no term contributes materially") +
    (worst.length ? `; held back by ${worst[0].label}` : "") +
    `. Learning value ${learning.value} — ${learning.note}.` +
    evidenceNote;

  const fitReading =
    `Execution fit ${r3(fitValue)} for "${task.label}", mostly ${top[0]?.label ?? "nothing in particular"}.` +
    evidenceNote;
  const devReading = `Development fit ${r3(devValue)} for "${task.label}": ${learning.note}.`;

  const assumptions = [
    `Execution weights are stated priors, not fitted: skills ${FIT_WEIGHTS.skills}, experience ${FIT_WEIGHTS.experience}, availability ${FIT_WEIGHTS.availability}, execution ${FIT_WEIGHTS.execution}, interest ${FIT_WEIGHTS.interest}, relationships ${FIT_WEIGHTS.relationships}.`,
    `A ${task.stakes}-stakes task requires prerequisite evidence of at least ${PREREQUISITE_FLOOR[task.stakes]} before a development assignment is considered.`,
  ];
  const limitations = [
    "Fit is scored from what has been recorded. Somebody whose good work happens outside Club OS scores low here for a reason that has nothing to do with them.",
    "These weights have never been checked against realised assignment outcomes, so treat the interval as the answer and the ordering as a suggestion.",
  ];
  // Only a caveat when availability had to be guessed. A real shortfall
  // probability is information, and it already shows up as a named penalty.
  if (availability.n === 0 || task.estimatedHours === null)
    limitations.push(`Availability: ${avail.note}.`);

  return {
    personId: candidate.personId,
    name,
    fit: predictionFor(
      fitValue,
      Math.sqrt(varFit),
      asOf,
      sampleSize,
      drivers.concat(penalties),
      assumptions,
      limitations,
      fitReading,
    ),
    developmentFit: predictionFor(
      devValue,
      Math.sqrt(varDev),
      asOf,
      sampleSize,
      devDrivers.concat(penalties),
      assumptions,
      limitations,
      devReading,
    ),
    learningValue: learning.value,
    prerequisiteReadiness: learning.readiness,
    prerequisiteEvidence: learning.prerequisite,
    capacityRisk,
    drivers,
    penalties,
    eligible: true,
    exclusion: null,
    explanation,
  };
}

/**
 * Rank candidates for one task and return BOTH recommendations.
 *
 * The development pick is chosen from a pool, not from the whole list: it must
 * clear the prerequisite floor for this task's stakes, must have something left
 * to learn, and must not be so far behind the safest candidate that the task
 * itself is likely to fail. A failed stretch assignment is worse than no
 * stretch assignment — it costs the club the work and costs the person their
 * confidence — so the sacrifice is bounded and the size of it is reported.
 */
export function recommendAssignment(input: StaffingInput): StaffingRecommendation {
  const asOf = input.asOf;
  const scored = (input.candidates || []).map((c) => assignmentFit(c, input.task, asOf));
  const eligible = scored.filter((s) => s.eligible && typeof s.fit.value === "number");

  const byFit = [...eligible].sort(
    (a, b) => (b.fit.value as number) - (a.fit.value as number),
  );

  const limitations = [
    "Ranking people is the part of this system most likely to be misused. The scores exist to make a conversation better, not to replace it.",
    "Nobody outside this club should ever see these numbers: they are working estimates about members, not a portable assessment of anyone.",
  ];
  if (scored.length !== eligible.length)
    limitations.push(
      `${scored.length - eligible.length} candidate${scored.length - eligible.length === 1 ? " was" : "s were"} not ranked because there is no recorded evidence for them. That is a gap in our records, not a judgement about them.`,
    );

  if (!byFit.length)
    return {
      taskId: input.task.id,
      asOf,
      ranked: scored,
      safest: null,
      development: null,
      sameCandidate: false,
      fitSacrifice: null,
      decisive: false,
      explanation:
        scored.length === 0
          ? "No candidates were supplied, so there is nothing to recommend."
          : "None of the candidates has any recorded evidence, so no recommendation can be made. Give someone something small and the next one of these is answerable.",
      limitations,
    };

  const safest = byFit[0];
  const safestFit = safest.fit.value as number;

  // The development pool: prerequisites held, something left to learn, and not
  // so far behind that the work is at risk.
  const pool = byFit.filter(
    (s) => s.learningValue > 0 && (s.fit.value as number) >= safestFit - MAX_FIT_SACRIFICE,
  );
  const development =
    [...pool].sort(
      (a, b) => (b.developmentFit.value as number) - (a.developmentFit.value as number),
    )[0] ?? null;

  const sameCandidate = !!development && development.personId === safest.personId;
  const fitSacrifice = development ? r3(safestFit - (development.fit.value as number)) : null;

  // Decisiveness on the fit intervals, not the point estimates. Two scores
  // half a point apart with overlapping 90% intervals are a tie, and saying so
  // is the difference between a tool and an oracle.
  const runnerUp = byFit[1] ?? null;
  const decisive =
    !!runnerUp &&
    Array.isArray(safest.fit.interval) &&
    (runnerUp.fit.value as number) < safest.fit.interval[0];

  const names = (s: AssignmentFit) => s.name;
  const topDrivers = (s: AssignmentFit, k = 2) =>
    s.drivers.slice(0, k).map((d) => d.label).join(" and ") || "nothing in particular";

  let explanation =
    `${names(safest)} has the strongest evidence and is the safest assignment for "${input.task.label}" — ${topDrivers(safest)}. `;
  if (development && !sameCandidate) {
    explanation +=
      `${names(development)} has enough prerequisite evidence (${development.prerequisiteEvidence} against the ${input.task.stakes}-stakes bar of ${PREREQUISITE_FLOOR[input.task.stakes]}) and ` +
      (development.learningValue >= MEANINGFUL_LEARNING
        ? `this would be a valuable development opportunity — learning value ${development.learningValue}. `
        : `this would be a modest stretch for them — learning value ${development.learningValue}, so the gain is real but small. `) +
      `Choosing them costs about ${fitSacrifice} of execution fit${decisive ? "" : ", and the two are close enough that the ranking is not decisive anyway"}. `;
  } else if (development && sameCandidate) {
    explanation +=
      `They are also the best development pick here, which is usually a sign the bench is thin: nobody else clears the ${input.task.stakes}-stakes prerequisite bar of ${PREREQUISITE_FLOOR[input.task.stakes]} with room left to grow. Consider pairing someone with them on this one. `;
  } else {
    explanation +=
      `There is no development pick for this one: nobody clears the ${input.task.stakes}-stakes prerequisite bar of ${PREREQUISITE_FLOOR[input.task.stakes]} with something left to learn and a fit within ${MAX_FIT_SACRIFICE} of the safest. Pair someone alongside instead of assigning them outright. `;
  }
  explanation += decisive
    ? "The gap at the top is larger than the uncertainty, so the ordering means something."
    : "The scores at the top sit inside each other's intervals, so treat the ordering as a starting point for a conversation, not as an answer.";

  return {
    taskId: input.task.id,
    asOf,
    ranked: byFit.concat(scored.filter((s) => !s.eligible)),
    safest,
    development,
    sameCandidate,
    fitSacrifice,
    decisive,
    explanation,
    limitations,
  };
}

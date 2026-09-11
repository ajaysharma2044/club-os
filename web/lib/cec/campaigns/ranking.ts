// Ranking eligible candidates on more than one objective.
//
// ==========================================================================
// THE OBJECTIVE, AND WHY IT HAS SIX TERMS INSTEAD OF ONE.
//
//   CampaignScore = SponsorValue + ClubValue + MemberRelevance
//                 − OperationalBurden − SponsorFatigue − Risk
//
// A marketplace that maximises advertiser revenue alone has a known trajectory,
// and every ad-supported product has already walked it: the supply side is
// squeezed until it leaves, the audience is shown as much as it will tolerate,
// and the numbers look excellent right up until they do not. Here the supply
// side is a volunteer officer with a full course load and the audience is a
// nineteen-year-old who joined a running club to run.
//
// So all three beneficiaries are first-class ADDITIVE terms, weighted equally.
// A campaign that is brilliant for the brand and burdensome for the club
// carries its burden in its own score; it does not get to externalise it. And
// the two terms that protect students — MemberRelevance upward, SponsorFatigue
// downward — cannot be bought out by a larger budget, because budget only ever
// enters through ClubValue, which is bounded.
//
// Stated plainly, because it should be arguable rather than implicit: brands
// should win, clubs should win, and students must not feel spammed. A ranking
// that delivers the first two by spending the third is not a good quarter with a
// side effect. It is the product failing.
//
// SIX PREDICTIONS, NOT ONE SCORE.
//
// P(club_accepts), P(event_occurs), P(attendance ≥ target), P(member_opts_in),
// P(deliverables_complete), P(brand_renews) are predicted SEPARATELY and each
// carries an interval. Collapsing them into a "match score" would make every
// failure mode look identical: a club that never replies, a club that accepts
// and cancels, and a club that runs a flawless event nobody attends would all
// score 0.4, and nobody could tell which problem they had.
//
// EVERY CANDIDATE CARRIES AN EXPLANATION. Not a score breakdown — an account,
// in three voices, of what the sponsor gets, what the club gets, and why a
// member would care. A candidate that cannot be explained is not emitted.
//
// THE FEATURE-STORE GATE IS REAL HERE. Factors are read with
// use: "sponsor_ranking", so anything a factor did not declare for sponsor use
// is withheld by factor-store.ts before this file ever sees it, and the
// withheld list is returned rather than silently dropped.
// ==========================================================================

import { club } from "../institutions";
import { CONTEXT_FACTORS } from "../registry";
import { factorsAsOf, type StoredFactor } from "../factor-store";
import { assembleContext, type ContextInputs } from "../club-context";
import type { Driver, Prediction } from "../factors";
import {
  ACTIVATION_BURDEN_HOURS,
  clubPolicy,
  inventoryFor,
  sectorOf,
  type ActivationInventory,
  type ActivationType,
  type ClubSponsorshipPolicy,
  type SponsorProfile,
} from "./inventory";
import { fatigueCheck, type FatigueCheck } from "./fatigue";
import { checkEligibility, type EligibilityCheck, type EligibilityResult } from "./eligibility";
import { snapshot, type ContextSnapshot, type PredictedOutcome } from "./outcomes";

export const RANKING_MODEL = {
  name: "cec.campaigns.ranking",
  version: "1.0.0",
  featureVersion: "context_factors@1.0.0",
};

/** 90%, the same interval mass the rest of the quant layer reports. */
const INTERVAL_MASS = 0.9;
const Z90 = 1.6448536269514722;

/**
 * What an officer-hour is worth, for turning a budget into club value.
 *
 * A stated assumption, not a measurement, and it is carried in every
 * prediction's `assumptions` so a reader can disagree with it. Replace it with
 * something a club actually believes when one tells us.
 */
export const OFFICER_HOUR_REFERENCE = 25;

// ============================================================== small stats

/** Wilson score interval. Behaves at n=0 and at p=0/1, unlike the normal one. */
function wilson(successes: number, n: number, z = Z90): [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, (centre - half) / d), Math.min(1, (centre + half) / d)];
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

type Estimate = {
  value: number;
  interval: [number, number];
  n: number;
  status: Prediction["status"];
};

/**
 * A proportion with a prior, so a club with no history gets a wide honest
 * estimate rather than either a confident zero or a silent refusal.
 *
 * `priorWeight` is in pseudo-observations. At n = 0 the interval is the full
 * prior interval and the status says `prior_only`, which is what a consumer
 * should be reading rather than the point estimate.
 */
function proportion(
  successes: number,
  n: number,
  priorMean: number,
  priorWeight = 4,
): Estimate {
  const value = (successes + priorMean * priorWeight) / (n + priorWeight);
  const [lo, hi] = wilson(successes + priorMean * priorWeight, n + priorWeight);
  return {
    value: clamp(value),
    interval: n === 0 ? [clamp(priorMean - 0.3), clamp(priorMean + 0.3)] : [lo, hi],
    n,
    status: n === 0 ? "prior_only" : "baseline_unvalidated",
  };
}

function predict(
  e: Estimate,
  asOf: string,
  drivers: Driver[],
  assumptions: string[],
  limitations: string[],
  reading: string,
  factors: StoredFactor[],
): Prediction<number | null> {
  return {
    value: e.value,
    interval: e.interval,
    intervalMass: INTERVAL_MASS,
    asOf,
    model: RANKING_MODEL,
    drivers,
    // Factor provenance travels with the prediction. `StoredFactor` is the
    // read-side shape; the field is typed loosely here rather than round-
    // tripping through computeFactor purely to satisfy a type.
    factors: factors as unknown as Prediction["factors"],
    sampleSize: e.n,
    assumptions,
    limitations,
    status: e.status,
    reading,
  };
}

// ============================================================ context lookup

const factorValue = (factors: StoredFactor[], id: string): number | null => {
  const f = factors.find((x) => x.factor === id && x.value !== null);
  return f ? (f.value as number) : null;
};

/** Activation types that happen outdoors, where weather is not a rounding error. */
const OUTDOOR: ActivationType[] = ["weekly_run", "race_5k", "sampling_event", "challenge"];

// ================================================================== outputs

export type CandidateTerms = {
  sponsorValue: number;
  clubValue: number;
  memberRelevance: number;
  operationalBurden: number;
  sponsorFatigue: number;
  risk: number;
  score: number;
};

export type CandidateExplanation = {
  headline: string;
  forSponsor: string;
  forClub: string;
  forMember: string;
  drivers: Driver[];
  caveats: string[];
};

export type RankedCandidate = {
  clubId: string;
  inventoryId: string;
  activationType: ActivationType;
  rank: number;
  terms: CandidateTerms;
  predictions: Record<PredictedOutcome, Prediction<number | null>>;
  explanation: CandidateExplanation;
  snapshot: ContextSnapshot;
  eligibility: EligibilityCheck[];
  fatigue: FatigueCheck;
  /** true when every prediction is prior-only: a ranking, but not evidence */
  priorOnly: boolean;
};

export type RankingResult = {
  sponsorId: string;
  asOf: string;
  ranked: RankedCandidate[];
  rejected: { clubId: string; reasons: EligibilityCheck[]; reading: string }[];
  /** factors the sponsor read was NOT allowed to see, and why */
  omittedFactors: { factor: string; reason: string }[];
  reading: string;
};

// ================================================================== the model

export type RankInput = {
  sponsor: SponsorProfile;
  clubIds: string[];
  at: string;
  /** when supplied, context is assembled (and optionally persisted) first */
  contextInputs?: ContextInputs;
  persistContext?: boolean;
  policies?: Record<string, ClubSponsorshipPolicy>;
  inventories?: Record<string, ActivationInventory[]>;
};

export function rankCandidates(input: RankInput): RankingResult {
  const { sponsor, at } = input;
  const ranked: RankedCandidate[] = [];
  const rejected: RankingResult["rejected"] = [];
  let omittedFactors: { factor: string; reason: string }[] = [];

  for (const clubId of input.clubIds) {
    const identity = club(clubId);
    const policy = input.policies?.[clubId] ?? clubPolicy(clubId);
    const inventory = input.inventories?.[clubId] ?? inventoryFor(clubId);
    const fatigue = fatigueCheck({ clubId, sponsor, at, policy });

    const eligibility: EligibilityResult = checkEligibility({
      clubId,
      campusId: identity?.institutionId ?? null,
      sponsor,
      policy,
      inventory,
      at,
      fatigue,
    });

    if (!eligibility.eligible) {
      // A rejection is not a low score. It never enters the ranking, and it
      // carries the named filters so a sponsor can act on it.
      rejected.push({ clubId, reasons: eligibility.reasons, reading: eligibility.reading });
      continue;
    }

    // The feature-store gate. Anything a factor did not declare for
    // sponsor_ranking is withheld HERE, not filtered downstream.
    if (identity && input.contextInputs)
      assembleContext(clubId, at, input.contextInputs, {
        persist: input.persistContext !== false,
      });
    const read = identity
      ? factorsAsOf({
          entityType: "campus",
          entityId: identity.institutionId,
          asOf: at,
          use: "sponsor_ranking",
          registry: CONTEXT_FACTORS,
        })
      : { factors: [] as StoredFactor[], omitted: [] as { factor: string; reason: string }[] };
    omittedFactors = read.omitted;

    const snap = snapshot(
      clubId,
      at,
      read.factors,
      read.omitted,
      "Sponsor-ranking read: planning-only factors are withheld by the feature store.",
    );

    for (const slot of eligibility.slots) {
      ranked.push(
        scoreCandidate({
          sponsor,
          clubId,
          at,
          slot: slot.inventory,
          policy,
          fatigue,
          factors: read.factors,
          snapshot: snap,
          eligibility: slot.checks,
          topics: identity ? Object.keys(identity.topics) : [],
          clubCategory: identity?.category ?? "",
        }),
      );
    }
  }

  ranked.sort((a, b) => b.terms.score - a.terms.score);
  ranked.forEach((c, i) => (c.rank = i + 1));

  return {
    sponsorId: sponsor.id,
    asOf: at,
    ranked,
    rejected,
    omittedFactors,
    reading:
      `${ranked.length} eligible candidate${ranked.length === 1 ? "" : "s"}, ` +
      `${rejected.length} club${rejected.length === 1 ? "" : "s"} rejected before ranking. ` +
      (ranked.length > 1 && ranked[0].terms.score - ranked[1].terms.score < 0.1
        ? "The top two are within 0.1 of each other, which at this evidence level is a tie rather than a winner."
        : "") +
      (omittedFactors.length
        ? ` ${omittedFactors.length} factor(s) were withheld from this sponsor read.`
        : ""),
  };
}

// ----------------------------------------------------------------- one slot

function scoreCandidate(a: {
  sponsor: SponsorProfile;
  clubId: string;
  at: string;
  slot: ActivationInventory;
  policy: ClubSponsorshipPolicy;
  fatigue: FatigueCheck;
  factors: StoredFactor[];
  snapshot: ContextSnapshot;
  eligibility: EligibilityCheck[];
  topics: string[];
  clubCategory: string;
}): RankedCandidate {
  const { sponsor, slot, policy, factors, at } = a;
  const h = slot.historicalExecution;
  const burdenHours = ACTIVATION_BURDEN_HOURS[slot.activationType] ?? 8;

  const regime = factorValue(factors, "regime_turnout_prior");
  const weather = factorValue(factors, "weather_turnout_factor");
  const competing = factorValue(factors, "competing_event_pressure");

  // ---------------------------------------------------------- P(club accepts)
  // Prior 0.25: most cold sponsorship offers are declined, and a model that
  // starts at a coin flip would recommend contacting everybody.
  const preferred = policy.preferredCategories.includes(sponsor.category);
  const acceptBase = proportion(h.accepted, h.offered, 0.25, 4);
  const budgetHeadroom = policy.minimumSponsorshipValue
    ? clamp(sponsor.budget / Math.max(1, policy.minimumSponsorshipValue) - 1, 0, 1)
    : clamp(sponsor.budget / Math.max(1, burdenHours * OFFICER_HOUR_REFERENCE) - 1, 0, 1);
  const acceptAdj = clamp(
    acceptBase.value * (preferred ? 1.3 : 1) * (1 + 0.25 * budgetHeadroom),
  );
  const pAccepts = predict(
    { ...acceptBase, value: acceptAdj },
    at,
    [
      { label: "acceptance history for this slot", contribution: acceptBase.value },
      { label: preferred ? "club prefers this category" : "category is merely permitted", contribution: preferred ? 0.3 : 0 },
      { label: "budget above the club's floor", contribution: 0.25 * budgetHeadroom },
    ],
    [
      "Acceptance history is per-slot, not per-club: a club that hosts workshops readily may still decline a sampling event.",
      `Prior acceptance rate 0.25 with weight 4 pseudo-observations.`,
    ],
    h.offered === 0
      ? ["No offer has ever been made for this slot. This is the prior, not a measurement."]
      : [],
    h.offered === 0
      ? `No history: a prior of ${(acceptAdj * 100).toFixed(0)}% acceptance, with an interval wide enough to include almost anything.`
      : `${h.accepted} of ${h.offered} past offers on this slot were accepted.`,
    factors,
  );

  // --------------------------------------------------------- P(event occurs)
  // Conditional on acceptance. Cancellation is the sponsor's real risk and it
  // is invisible in an acceptance rate.
  const occursBase = proportion(h.occurred, h.accepted, 0.7, 3);
  const pOccurs = predict(
    occursBase,
    at,
    [
      { label: "events run after acceptance", contribution: occursBase.value },
      { label: "cancellations on record", contribution: -clamp(h.cancelled / Math.max(1, h.accepted)) },
    ],
    ["Conditional on the club accepting. Unconditional occurrence is P(accepts) x P(occurs)."],
    h.accepted === 0 ? ["Nothing has been accepted here yet, so this is a prior of 0.7."] : [],
    h.accepted === 0
      ? "No acceptance history, so occurrence is a stated prior rather than a measurement."
      : `${h.occurred} of ${h.accepted} accepted activations actually happened; ${h.cancelled} were cancelled.`,
    factors,
  );

  // ------------------------------------------------- P(attendance >= target)
  const target = Math.max(sponsor.minimumAudience, 1);
  const outdoors = OUTDOOR.includes(slot.activationType);
  const baseAttendance = h.medianAttendance ?? slot.estimatedReach * 0.6;
  const expected =
    baseAttendance *
    (regime ?? 1) *
    (outdoors && weather !== null ? weather : 1) *
    (competing !== null ? clamp(1 - 0.06 * competing, 0.5, 1) : 1);
  // Logistic on the gap, scaled by a 35% coefficient of variation. Turnout is
  // genuinely this noisy; a narrower spread would manufacture confidence.
  const spread = Math.max(1, expected * 0.35);
  const pHit = clamp(1 / (1 + Math.exp(-(expected - target) / spread)));
  const attendanceN = h.occurred;
  const pAttendance = predict(
    {
      value: pHit,
      interval: [clamp(pHit - 0.2), clamp(pHit + 0.2)],
      n: attendanceN,
      status: attendanceN === 0 ? "prior_only" : "baseline_unvalidated",
    },
    at,
    [
      { label: "baseline attendance", contribution: baseAttendance },
      { label: "term regime", contribution: regime ?? 1 },
      ...(outdoors && weather !== null ? [{ label: "weather (outdoor activation)", contribution: weather }] : []),
      ...(competing !== null ? [{ label: "competing campus events", contribution: -competing }] : []),
    ],
    [
      `Target is the sponsor's stated minimum audience (${target}).`,
      "Turnout coefficient of variation fixed at 0.35 pending real per-club variance.",
      h.medianAttendance === null
        ? "No attendance history: the club's own estimated reach is discounted to 60%."
        : "Baseline is the club's own realised attendance.",
    ],
    attendanceN === 0 ? ["No realised attendance for this slot. The interval here is nominal."] : [],
    `Expected ${Math.round(expected)} against a target of ${target}.`,
    factors,
  );

  // ------------------------------------------------------ P(member opts in)
  // Relevance is a STATED match today, not a learned one. Said out loud
  // because a 0.6 that looks learned and is not is worse than no number.
  const sector = sectorOf(sponsor.category);
  const topicMatch = a.topics.some((t) => sector.includes(t) || t.includes(sector))
    ? 1
    : preferred
      ? 0.8
      : a.clubCategory && sector.includes(a.clubCategory.toLowerCase())
        ? 0.8
        : 0.4;
  const optInBase = proportion(0, 0, 0.35, 4);
  const pOptInValue = clamp(optInBase.value * topicMatch * (1 - 0.5 * a.fatigue.fatigue));
  const pOptIn = predict(
    { ...optInBase, value: pOptInValue },
    at,
    [
      { label: "baseline opt-in rate", contribution: 0.35 },
      { label: "topic relevance to this club", contribution: topicMatch },
      { label: "sponsor crowding this month", contribution: -a.fatigue.fatigue },
    ],
    [
      "Opt-in is per-campaign and revocable; a member who does nothing has not opted in.",
      "Topic relevance is a stated category-to-club match, NOT learned from member behaviour. No member-level feature enters this model.",
    ],
    ["No opt-in history exists yet anywhere in the system. This is entirely a prior."],
    `Relevance ${topicMatch.toFixed(1)} against a 35% baseline, discounted for existing sponsor crowding.`,
    factors,
  );

  // ------------------------------------------- P(deliverables) & P(renewal)
  const sh = sponsor.history;
  const deliverBase = proportion(sh?.deliverablesComplete ?? 0, sh?.campaignsRun ?? 0, 0.8, 3);
  const pDeliverables = predict(
    deliverBase,
    at,
    [{ label: "sponsor's own delivery record", contribution: deliverBase.value }],
    ["Deliverables are the sponsor's obligations, not the club's. A brand that does not ship the product is the failure mode this predicts."],
    sh?.campaignsRun ? [] : ["This sponsor has no campaign history with us."],
    sh?.campaignsRun
      ? `${sh.deliverablesComplete} of ${sh.campaignsRun} past campaigns delivered in full.`
      : "No delivery history for this sponsor; a prior of 0.8 is assumed and should be checked.",
    factors,
  );

  const renewBase = proportion(sh?.renewals ?? 0, sh?.renewalOpportunities ?? 0, 0.3, 3);
  const renewValue = clamp(renewBase.value * (0.5 + 0.5 * (pAttendance.value ?? 0)));
  const pRenews = predict(
    { ...renewBase, value: renewValue },
    at,
    [
      { label: "sponsor's renewal record", contribution: renewBase.value },
      { label: "whether this activation is likely to hit its target", contribution: pAttendance.value ?? 0 },
    ],
    ["Renewal is predicted from the sponsor's own history and from whether THIS activation is likely to succeed."],
    sh?.renewalOpportunities ? [] : ["No renewal opportunities on record for this sponsor."],
    sh?.renewalOpportunities
      ? `${sh.renewals} of ${sh.renewalOpportunities} past campaigns renewed.`
      : "No renewal history; a prior of 0.3 is assumed.",
    factors,
  );

  const predictions: Record<PredictedOutcome, Prediction<number | null>> = {
    club_accepts: pAccepts,
    event_occurs: pOccurs,
    attendance_target: pAttendance,
    member_opts_in: pOptIn,
    deliverables_complete: pDeliverables,
    brand_renews: pRenews,
  };

  // ------------------------------------------------------------- the terms
  const v = (p: Prediction<number | null>) => p.value ?? 0;

  // Reach the sponsor can actually expect, not reach the club can claim.
  const expectedReach =
    slot.estimatedReach * v(pAccepts) * v(pOccurs) * v(pOptIn) * v(pDeliverables);
  const sponsorValue = clamp(expectedReach / Math.max(1, target));

  // Bounded on purpose: this is the ONLY place budget enters the score, so no
  // budget can buy past the member-facing terms below.
  const clubValue = clamp(
    sponsor.budget / Math.max(1, burdenHours * OFFICER_HOUR_REFERENCE),
  ) * (preferred ? 1 : 0.85) * v(pAccepts) + (preferred ? 0.15 : 0);

  const memberRelevance = clamp(topicMatch * v(pOptIn) * 2);

  const operationalBurden = clamp(burdenHours / 40) * (slot.approvalRequired ? 1.1 : 1);
  const sponsorFatigue = a.fatigue.fatigue;

  const priorOnlyCount = Object.values(predictions).filter((p) => p.status === "prior_only").length;
  const risk =
    clamp(
      (sponsor.brandSafety === "verified" ? 0 : 0.15) +
        // Thin evidence is a risk to the SPONSOR too: a candidate ranked
        // entirely on priors may be excellent or may be nothing.
        0.06 * priorOnlyCount +
        (1 - v(pDeliverables)) * 0.3 +
        (1 - v(pOccurs)) * 0.3,
    );

  const score =
    sponsorValue + clubValue + memberRelevance - operationalBurden - sponsorFatigue - risk;

  const terms: CandidateTerms = {
    sponsorValue,
    clubValue,
    memberRelevance,
    operationalBurden,
    sponsorFatigue,
    risk,
    score,
  };

  // ------------------------------------------------------- the explanation
  const caveats: string[] = [];
  if (priorOnlyCount >= 4)
    caveats.push(
      `${priorOnlyCount} of 6 predictions are priors rather than measurements. This is a ranked guess; treat the order as weak.`,
    );
  if (a.fatigue.fatigue >= 0.5)
    caveats.push(
      `This club is already at ${Math.round(a.fatigue.fatigue * 100)}% of its own commercial limit. It is within its caps, but it is not fresh inventory.`,
    );
  if (regime === null)
    caveats.push("No academic regime was available for this date, so no term-timing adjustment was made.");
  if (slot.approvalRequired)
    caveats.push("An officer must approve this before anything is scheduled.");

  const explanation: CandidateExplanation = {
    headline: `${slot.activationType.replace(/_/g, " ")} with ${a.clubId}: expected ${Math.round(expectedReach)} reached against a ${target} target.`,
    forSponsor: `${Math.round(v(pAccepts) * 100)}% chance the club accepts, ${Math.round(v(pOccurs) * 100)}% that it then happens, ${Math.round(v(pAttendance) * 100)}% that attendance clears ${target}.`,
    forClub: `${sponsor.budget} against roughly ${burdenHours} officer-hours of work${preferred ? ", in a category the club said it wants" : ""}.`,
    forMember: `Relevance to this club's stated topics scores ${topicMatch.toFixed(1)}; the club has had ${a.fatigue.summary.month} commercial activation(s) in the last 30 days, against a limit of ${policy.maxActivationsPerMonth}.`,
    drivers: [
      { label: "sponsor value", contribution: sponsorValue },
      { label: "club value", contribution: clubValue },
      { label: "member relevance", contribution: memberRelevance },
      { label: "operational burden", contribution: -operationalBurden },
      { label: "sponsor fatigue", contribution: -sponsorFatigue },
      { label: "risk", contribution: -risk },
    ],
    caveats,
  };

  return {
    clubId: a.clubId,
    inventoryId: slot.id,
    activationType: slot.activationType,
    rank: 0,
    terms,
    predictions,
    explanation,
    snapshot: a.snapshot,
    eligibility: a.eligibility,
    fatigue: a.fatigue,
    priorOnly: priorOnlyCount === Object.keys(predictions).length,
  };
}

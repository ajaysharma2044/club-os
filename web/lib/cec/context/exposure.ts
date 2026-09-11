// The person-specific exposure model: who a context shock actually lands on.
//
// A regime is a property of the world. Exposure is the intersection of that
// world with one person, and the two are constantly confused. "Recruiting
// season" is not a fact about a club's attendance — it is a fact about the
// subset of that club's members who are in a recruiting calendar, eligible for
// it, have said they want it, and are at the point in their degree where it
// bites. The other members are having an ordinary February.
//
//   Exposure(i, r, t) = RegimeIntensity(r, t)
//                     × Eligibility(i, r)
//                     × ExplicitInterest(i, r, t)
//                     × LifecycleRelevance(i, r, t)
//
// Multiplicative because these are gates, not contributions. A person who is
// not eligible is not 30% exposed; they are not exposed. Any term at zero should
// take the product to zero, and a sum would let three high terms launder a
// fourth that says "this does not apply to them at all".
//
// ---------------------------------------------------------------------------
// THE PRIVACY RULE, AND WHY IT IS IN THE TYPE SYSTEM
//
// docs/11 §7 is a standing engineering rule, not a preference: no inferred
// religion, orientation, immigration status, disability or political
// affiliation, and proxies are "blocked from the feature store, not just from
// display". The mirror test that generates it: if a signal cannot be shown to
// the student it is about, in plain language, it does not get computed.
//
// Career interest is squarely inside that rule. Inferring that someone wants
// investment banking because they attended two finance-adjacent events, or
// because people who look like them in the co-attendance graph did, is exactly
// the move the rule forbids — and it is the move that is most tempting, because
// it would work well enough to look clever. It is also the move that produces
// the Mount St. Mary's failure mode in docs/11 §7: a person finds out what the
// model thinks they are from somebody else's behaviour toward them.
//
// So interest comes from EXPLICIT signals only: they said so, they applied,
// they saved it, they joined it. This is enforced structurally rather than by
// discipline. `ExplicitInterest.source` is a closed union of four affirmative
// acts; `PersonContext` has no field for a modelled, inferred, peer-derived or
// behavioural interest, and there is nowhere to put one without editing this
// file and this comment. An unstated interest yields ExplicitInterest = 0, the
// product goes to zero, and the reading says we were not told rather than
// offering a guess. tests/regimes.mjs holds that behaviour in place.
//
// Pure module. No database, no network, no clock beyond what the caller passes.

import type { EntityType } from "../factors";
import { defineFactor } from "../factors";
import type { CareerPath, CareerRegimeType, ClassYear } from "./regimes";
import { CLASS_YEARS, classYear, isCareerPath } from "./regimes";

export const EXPOSURE_MODEL_VERSION = "exposure/1.0.0-first-order";

const DAY = 86400e3;

// ======================================================== explicit interest

/**
 * The ONLY four ways a career interest may enter this system, plus the one way
 * it may be withdrawn. Every one of them is an affirmative act by the person.
 *
 * There is deliberately no "inferred", "predicted", "peer", "similar_members"
 * or "engagement" source. If a future requirement seems to need one, the
 * requirement is wrong: see the block comment at the top of this file.
 */
export const EXPLICIT_INTEREST_SOURCES = [
  "stated_preference", // they typed it into a profile or an onboarding question
  "application", // they applied to something on this path, and we saw the application
  "saved_opportunity", // they saved or bookmarked a posting on this path
  "joined_program", // they joined a club, track or cohort that is explicitly about it
  "declined", // they said explicitly that this is not for them
] as const;
export type ExplicitInterestSource = (typeof EXPLICIT_INTEREST_SOURCES)[number];

export type ExplicitInterest = {
  career_path: CareerPath;
  source: ExplicitInterestSource;
  /** When the person did the thing. */
  stated_at: string;
  /** If they later took it back. A withdrawn signal stops counting immediately. */
  withdrawn_at?: string | null;
};

/**
 * How much each affirmative act is worth as evidence of present interest, and
 * how fast it stales.
 *
 * An application is the strongest because it cost them something and it is
 * unambiguous. A saved posting is the weakest because saving is cheap and often
 * exploratory. `halfLifeDays` differs by source for the same reason: a
 * preference typed in freshman year is a weaker claim about senior year than an
 * application filed two years ago, because the application was an act and the
 * preference was an intention.
 *
 * Stated priors. Nothing here is fitted, and the floor exists so that a real
 * past act never decays to nothing while the person is still enrolled.
 */
const INTEREST_WEIGHTS: Record<
  Exclude<ExplicitInterestSource, "declined">,
  { weight: number; halfLifeDays: number; floor: number; confidence: number }
> = {
  application: { weight: 1.0, halfLifeDays: 730, floor: 0.4, confidence: 0.9 },
  joined_program: { weight: 0.85, halfLifeDays: 540, floor: 0.35, confidence: 0.8 },
  stated_preference: { weight: 0.7, halfLifeDays: 365, floor: 0.25, confidence: 0.65 },
  saved_opportunity: { weight: 0.55, halfLifeDays: 180, floor: 0.15, confidence: 0.5 },
};

export type InterestStatus = "stated" | "unstated" | "declined";

export type InterestReading = {
  status: InterestStatus;
  /** 0..1. Zero whenever status is not "stated". */
  value: number;
  /** 0..1 belief in the interest itself, which is not the same as its strength. */
  confidence: number;
  signals: number;
  reason: string;
};

/**
 * Read explicit interest in one career path, at a moment.
 *
 * Returns `unstated` — not a small positive number — when nothing was said.
 * There is no prior over what a person probably wants, on purpose. A prior here
 * is an inference about a person's life from population statistics, which is
 * precisely what the rule at the top of this file forbids.
 */
export function explicitInterest(
  interests: ExplicitInterest[],
  path: CareerPath,
  at: string,
): InterestReading {
  const t = Date.parse(at);
  if (!Number.isFinite(t))
    return { status: "unstated", value: 0, confidence: 0, signals: 0, reason: "Unreadable time." };

  const live = (interests ?? []).filter((s) => {
    if (s.career_path !== path) return false;
    const stated = Date.parse(s.stated_at);
    // Point-in-time: a signal given after `at` was not knowable at `at`.
    if (!Number.isFinite(stated) || stated > t) return false;
    if (s.withdrawn_at) {
      const w = Date.parse(s.withdrawn_at);
      if (Number.isFinite(w) && w <= t) return false;
    }
    return true;
  });

  if (live.some((s) => s.source === "declined"))
    return {
      status: "declined",
      value: 0,
      confidence: 0.9,
      signals: live.length,
      reason: "They said explicitly that this path is not for them, so nothing here applies to them.",
    };

  const positive = live.filter(
    (s): s is ExplicitInterest & { source: Exclude<ExplicitInterestSource, "declined"> } =>
      s.source !== "declined",
  );
  if (!positive.length)
    return {
      status: "unstated",
      value: 0,
      confidence: 0,
      signals: 0,
      reason:
        "They have never told us they are interested in this path, and we do not infer a career interest from anything else they do.",
    };

  let combined = 0;
  let confidence = 0;
  for (const s of positive) {
    const w = INTEREST_WEIGHTS[s.source];
    const ageDays = Math.max(0, (t - Date.parse(s.stated_at)) / DAY);
    const decay = Math.max(w.floor, Math.exp((-Math.LN2 * ageDays) / w.halfLifeDays));
    const v = w.weight * decay;
    // Same saturating combination as the pressure kernels elsewhere: two signals
    // are more than one, and ten are not ten times one.
    combined = combined + v - combined * v;
    confidence = Math.max(confidence, w.confidence);
  }

  const strongest = positive
    .map((s) => s.source)
    .sort((a, b) => INTEREST_WEIGHTS[b].weight - INTEREST_WEIGHTS[a].weight)[0];

  return {
    status: "stated",
    value: Number(Math.min(1, combined).toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    signals: positive.length,
    reason: `They told us: ${positive.length} explicit signal${positive.length === 1 ? "" : "s"}, strongest a ${strongest.replace(/_/g, " ")}.`,
  };
}

// =============================================================== the person

/**
 * Everything the exposure model is allowed to know about a person.
 *
 * Read the field list, and read what is not in it. There is no attendance
 * history, no engagement score, no peer group, no co-attendance neighbourhood,
 * no inferred major. Not because those are unavailable — several exist
 * elsewhere in this codebase — but because none of them may touch a career or
 * life interest. Keeping them out of the TYPE is what makes the rule
 * unenforceable to break: a caller who wants to infer interest from behaviour
 * has nowhere to put the behaviour.
 */
export type PersonContext = {
  person_id: string;
  /** Graduation year. Null when unknown; we do not infer it from anything. */
  graduation_cohort: number | null;
  /** Null when unknown. Unknown is not a synonym for false. */
  enrolled: boolean | null;
  /** Explicit signals only. See EXPLICIT_INTEREST_SOURCES. */
  interests: ExplicitInterest[];
  /** Overrides the four-year assumption for transfers and five-year programmes. */
  class_year?: ClassYear | null;
  institution?: string | null;
};

// =============================================================== the regime

export const EXPOSURE_SCOPES = ["universal", "career"] as const;
export type ExposureScope = (typeof EXPOSURE_SCOPES)[number];

/**
 * A regime as the exposure model sees it.
 *
 * `scope` is required and is the gate on the privacy rule. A `universal` regime
 * is one nobody opts into — finals, a campus closure, a term ending — and
 * explicit interest does not apply to it, because there is nothing to consent
 * to and nothing being inferred. A `career` regime is one a person may
 * plausibly not be in, and it requires a stated interest. Making the scope an
 * explicit, required field stops "universal" from being used as a way around
 * the interest gate by accident: a career regime with `scope: "universal"` is
 * rejected on construction rather than quietly applying to everyone.
 */
export type ExposureRegime = {
  regime_id: string;
  label: string;
  scope: ExposureScope;
  /** Required for scope "career", forbidden for "universal". */
  career_path: CareerPath | null;
  /**
   * 0..1 campus-wide intensity at the moment in question, or null when it could
   * not be established. Null propagates: `computeExposure` returns null too.
   */
  intensity: number | null;
  /** 0..1 belief in the intensity itself. Defaults to a stated-prior 0.4. */
  intensity_confidence?: number;
  /** Class years the regime is aimed at. Empty or absent means "all of them". */
  target_class_years?: ClassYear[];
  /** Graduation cohorts the regime can possibly apply to. Absent means all. */
  eligible_cohorts?: number[] | null;
  regime_type?: CareerRegimeType | "academic";
};

function assertWellFormed(r: ExposureRegime): void {
  // Throwing rather than returning a bad reading, for the same reason
  // `defineFactor` throws: a malformed regime produces numbers that look exactly
  // like good ones, and the damage surfaces months later as a wrong decision.
  if (r.scope === "career" && !isCareerPath(r.career_path ?? ""))
    throw new Error(
      `Regime "${r.regime_id}" has scope "career" but no valid career_path. A career regime must name its path, or the explicit-interest gate has nothing to check against.`,
    );
  if (r.scope === "universal" && r.career_path)
    throw new Error(
      `Regime "${r.regime_id}" has scope "universal" and a career_path. A regime tied to a career path is not universal, and marking it so would route it around the explicit-interest rule.`,
    );
}

// ============================================================= the exposure

export type ExposureComponent = {
  name: "regime_intensity" | "eligibility" | "explicit_interest" | "lifecycle_relevance";
  /** Null means we could not establish this term. Null takes the product to zero. */
  value: number | null;
  basis: string;
};

export type ExposureReading = {
  person_id: string;
  regime_id: string;
  at: string;
  /** 0..1. Zero when any gate is shut OR when we were not told. */
  exposure: number;
  /**
   * False when a term was unknown rather than zero. An exposure of 0 with
   * `known: false` means "we will not guess", and must never be rendered as
   * "this person is unaffected".
   */
  known: boolean;
  interest_status: InterestStatus;
  components: ExposureComponent[];
  /** 0..1, bounded by the least-known term. */
  confidence: number;
  reason: string;
  model_version: string;
};

/**
 * How far one class year is from another, in years. `alum` is off the scale in
 * one direction and gets no numeric distance.
 */
function yearDistance(a: ClassYear, b: ClassYear): number | null {
  if (a === "alum" || b === "alum") return a === b ? 0 : null;
  const order: ClassYear[] = ["freshman", "sophomore", "junior", "senior"];
  return Math.abs(order.indexOf(a) - order.indexOf(b));
}

/**
 * Graded relevance by distance from the class years a regime targets. Stated
 * prior, and a steep one: a sophomore is genuinely in the junior-fall consulting
 * regime to some degree (they are watching it happen and starting to prepare),
 * a freshman essentially is not.
 *
 * Deliberately SYMMETRIC in distance. A year early and a year late get the same
 * number, and there is a real argument that they should not — being past an
 * accelerated window is a different situation from being before it. We have no
 * data on which is worse, an asymmetry invented here would be indistinguishable
 * from a measured one downstream, and it would show up as a confident
 * difference between two people it was never entitled to distinguish.
 */
const LIFECYCLE_DECAY = [1, 0.35, 0.1, 0.03];

/**
 * Exposure of one person to one regime at one moment.
 *
 * Returns null only when the regime itself could not be established — an
 * unknown intensity means the honest answer is "we cannot say", and a zero
 * would be a claim. Everything else returns a reading, and the reading carries
 * `known: false` when a term was missing rather than shut.
 */
export function computeExposure(
  person: PersonContext,
  regime: ExposureRegime,
  at: string,
): ExposureReading | null {
  assertWellFormed(regime);
  if (regime.intensity === null || !Number.isFinite(regime.intensity)) return null;
  if (!Number.isFinite(Date.parse(at))) return null;

  const intensity = Math.max(0, Math.min(1, regime.intensity));
  const components: ExposureComponent[] = [
    {
      name: "regime_intensity",
      value: intensity,
      basis: `${regime.label} is at ${intensity.toFixed(2)} campus-wide at this date.`,
    },
  ];

  // --- eligibility: a hard, structural gate, 0 or 1 or unknown ---------------
  // Distinct from lifecycle relevance on purpose. Eligibility answers "could
  // this possibly apply to them at all", and the answer is yes or no. Lifecycle
  // answers "how much does it bear on them", and that is a matter of degree.
  // Folding them together would let a soft 0.35 quietly override a hard no.
  let eligibility: number | null = 1;
  let eligibilityBasis = "Enrolled and in a cohort the regime can apply to.";
  const cohorts = regime.eligible_cohorts;
  if (person.enrolled === false) {
    eligibility = 0;
    eligibilityBasis = "Not currently enrolled.";
  } else if (person.enrolled === null) {
    eligibility = null;
    eligibilityBasis = "We do not know whether they are enrolled, and will not assume it.";
  } else if (cohorts && cohorts.length) {
    if (person.graduation_cohort === null) {
      eligibility = null;
      eligibilityBasis =
        "The regime applies to named cohorts and we do not hold this person's graduation year.";
    } else if (!cohorts.includes(person.graduation_cohort)) {
      eligibility = 0;
      eligibilityBasis = `Graduating ${person.graduation_cohort}; this regime applies to ${cohorts.join(", ")}.`;
    }
  }
  components.push({ name: "eligibility", value: eligibility, basis: eligibilityBasis });

  // --- explicit interest: the privacy gate ----------------------------------
  let interest: InterestReading;
  if (regime.scope === "universal") {
    // Nobody opts into finals. There is no interest to state and nothing being
    // inferred about them, so the gate is open by construction — and it is open
    // ONLY because `scope` was declared universal and validated above.
    interest = {
      status: "stated",
      value: 1,
      confidence: 1,
      signals: 0,
      reason: `${regime.label} applies to everyone enrolled; nobody chooses into it.`,
    };
  } else {
    interest = explicitInterest(person.interests ?? [], regime.career_path as CareerPath, at);
  }
  components.push({
    name: "explicit_interest",
    value: interest.value,
    basis: interest.reason,
  });

  // --- lifecycle relevance --------------------------------------------------
  const cy =
    person.class_year ?? classYear(person.graduation_cohort ?? undefined, at) ?? null;
  const targets = (regime.target_class_years ?? []).filter((y) => CLASS_YEARS.includes(y));
  let lifecycle: number | null = 1;
  let lifecycleBasis = "The regime is not tied to a point in a degree.";
  if (targets.length) {
    if (!cy) {
      lifecycle = null;
      lifecycleBasis =
        "The regime targets particular years and we do not know what year they are in.";
    } else if (cy === "alum") {
      lifecycle = 0;
      lifecycleBasis = "They have graduated; an undergraduate recruiting window does not reach them.";
    } else {
      const d = targets
        .map((y) => yearDistance(cy, y))
        .filter((v): v is number => v !== null)
        .reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
      lifecycle = Number.isFinite(d) ? (LIFECYCLE_DECAY[Math.min(d, 3)] ?? 0.03) : 0;
      lifecycleBasis =
        d === 0
          ? `They are a ${cy}, which is exactly who this window is for.`
          : `They are a ${cy} and this window is for ${targets.join("/")}s — ${d} year${d === 1 ? "" : "s"} off.`;
    }
  }
  components.push({ name: "lifecycle_relevance", value: lifecycle, basis: lifecycleBasis });

  const known = components.every((c) => c.value !== null);
  const exposure = known
    ? Number(
        Math.max(
          0,
          Math.min(1, components.reduce((a, c) => a * (c.value as number), 1)),
        ).toFixed(3),
      )
    : 0;

  // Confidence in a product is bounded by its least-known term. Taking the
  // minimum says so plainly instead of letting three confident terms launder
  // one guess into a number that looks solid.
  const termConfidence = [
    regime.intensity_confidence ?? 0.4, // a stated prior until an empirical timeline exists
    eligibility === null ? 0 : 1, // read off the record, or not held at all
    interest.confidence,
    lifecycle === null ? 0 : targets.length ? 0.6 : 1, // the decay curve is itself a prior
  ];
  const confidence = Number(Math.min(...termConfidence).toFixed(3));

  const reason = !known
    ? `Cannot say. ${components.find((c) => c.value === null)?.basis ?? ""} Reported as zero exposure with known=false, which means "not established", not "unaffected".`
    : interest.status === "unstated"
      ? `No exposure recorded: ${interest.reason} We do not guess at a career interest from anything else, so this is zero rather than an estimate.`
      : interest.status === "declined"
        ? `No exposure: ${interest.reason}`
        : exposure >= 0.5
          ? `Strongly exposed to ${regime.label}: ${components
              .filter((c) => (c.value ?? 0) < 1)
              .map((c) => c.basis)
              .join(" ")}`.trim()
          : exposure > 0.05
            ? `Partly exposed to ${regime.label}. ${components
                .filter((c) => (c.value ?? 1) < 0.9)
                .map((c) => c.basis)
                .join(" ")}`.trim()
            : `Effectively unexposed to ${regime.label}. ${
                components.find((c) => (c.value ?? 1) < 0.1)?.basis ?? ""
              }`.trim();

  return {
    person_id: person.person_id,
    regime_id: regime.regime_id,
    at,
    exposure,
    known,
    interest_status: interest.status,
    components,
    confidence,
    reason,
    model_version: EXPOSURE_MODEL_VERSION,
  };
}

// ============================================================ context shocks

export const SHOCK_KINDS = [
  "academic", // finals move, a term extends, a strike
  "career", // a recruiting cycle opens or is pushed back
  "campus", // closure, weather event, a building shuts
  "institutional", // a policy change, a funding change
] as const;
export type ShockKind = (typeof SHOCK_KINDS)[number];

/**
 * A dated change in the environment, with an explicit scope.
 *
 * Bitemporal — `occurred_at` and `observed_at` are genuinely different here and
 * are kept apart for the reason docs/20 §B5 gives: a bank announcing in March
 * that the cycle moved is a shock that OCCURRED in March and is OBSERVED then,
 * but it changes a window in the following January, and replaying a decision
 * made in December must not see it.
 */
export type ContextShock = {
  shock_id: string;
  kind: ShockKind;
  label: string;
  occurred_at: string;
  observed_at: string;
  /** 0..1 magnitude in the world, before anybody's exposure to it. */
  magnitude: number;
  scope: ExposureScope;
  career_path?: CareerPath | null;
  target_class_years?: ClassYear[];
  eligible_cohorts?: number[] | null;
  /** Where we learned of it. A stated prior must say so. */
  source: string;
  /** 0..1 belief in the magnitude. */
  confidence?: number;
};

/** One row per (shock, entity). The shape the spec asks for, for storage. */
export type EntityExposure = {
  shock_id: string;
  entity_type: EntityType;
  entity_id: string;
  /** 0..1. */
  exposure: number;
  reason: string;
  computed_at: string;
  model_version: string;
};

/** A club, as far as a first-order shock is concerned. */
export type ClubContext = {
  club_id: string;
  /**
   * Career paths the club's OFFICERS have declared it is about. Declared, not
   * inferred from what its members do — the same rule as a person's interest,
   * for the same reason, one level up.
   */
  declared_career_focus: CareerPath[];
};

export type ExposureSubject =
  | { entity_type: "person"; entity_id: string; person: PersonContext }
  | { entity_type: "club"; entity_id: string; club: ClubContext };

export type Propagation = {
  shock_id: string;
  /** Literally one. See `not_estimated`. */
  order: 1;
  exposures: EntityExposure[];
  /**
   * The effects this function did NOT estimate, named individually so that a
   * reader cannot mistake the output for a complete accounting.
   */
  not_estimated: string[];
  reading: string;
  computed_at: string;
  model_version: string;
};

function shockToRegime(shock: ContextShock): ExposureRegime {
  return {
    regime_id: shock.shock_id,
    label: shock.label,
    scope: shock.scope,
    career_path: shock.scope === "career" ? (shock.career_path ?? null) : null,
    intensity: Math.max(0, Math.min(1, shock.magnitude)),
    intensity_confidence: shock.confidence ?? 0.4,
    target_class_years: shock.target_class_years,
    eligible_cohorts: shock.eligible_cohorts,
    regime_type: shock.kind === "academic" ? "academic" : undefined,
  };
}

/**
 * FIRST-ORDER EXPOSURE ONLY. This is a statement about what the function does,
 * not a disclaimer attached to it.
 *
 * What is computed: the direct intersection of a shock with entities that have
 * a declared, structural relationship to it — a person in the affected cohort
 * with a stated interest, a club whose officers have declared that focus.
 *
 * What is NOT computed, and is not approximated, guessed or defaulted:
 *
 *   Second order  — a club's attendance falling because its members are exposed.
 *                   That is a real and probably large effect. Estimating it
 *                   needs a membership edge, an attendance model conditioned on
 *                   exposure, and a way to separate it from the four other
 *                   things happening in the same week. None of those exist yet.
 *   Third order   — the club that shares officers with the affected club, the
 *                   downstream event that loses its speaker, the successor who
 *                   never gets trained.
 *   Substitution  — people exposed to one shock reallocating time TOWARD
 *                   something else, which can raise another club's attendance.
 *
 * And in no case is any of this causal identification. These are structural
 * exposures under a stated model: who a shock could mechanically reach. A
 * correlation between exposure and an outcome is not evidence that the shock
 * caused the outcome — the same people who state an interest in banking differ
 * from those who do not in a dozen ways nobody has measured. docs/11 §8 puts
 * the first genuinely causal result at v2, behind randomised encouragement.
 *
 * The structure is here so that second-order effects can be STUDIED later
 * against a first-order baseline that was recorded honestly at the time. It is
 * not here so they can be asserted now.
 */
export function propagate(
  shock: ContextShock,
  entities: ExposureSubject[],
  at?: string,
): Propagation {
  const computedAt = at ?? shock.occurred_at;
  const regime = shockToRegime(shock);
  assertWellFormed(regime);

  const exposures: EntityExposure[] = [];
  for (const e of entities) {
    if (e.entity_type === "person") {
      const r = computeExposure(e.person, regime, computedAt);
      exposures.push({
        shock_id: shock.shock_id,
        entity_type: "person",
        entity_id: e.entity_id,
        exposure: r ? r.exposure : 0,
        reason: r
          ? r.reason
          : "The shock's magnitude could not be established, so no exposure was computed. This is a gap, not a zero.",
        computed_at: computedAt,
        model_version: EXPOSURE_MODEL_VERSION,
      });
      continue;
    }

    // A club is exposed first-order only through what its officers DECLARED it
    // is about. Its membership is the second-order channel and is not walked
    // here; see the comment above.
    const focus = e.club.declared_career_focus ?? [];
    const direct =
      regime.scope === "universal" ||
      (!!regime.career_path && focus.includes(regime.career_path));
    exposures.push({
      shock_id: shock.shock_id,
      entity_type: "club",
      entity_id: e.entity_id,
      exposure: direct ? Number((regime.intensity ?? 0).toFixed(3)) : 0,
      reason: direct
        ? regime.scope === "universal"
          ? `${shock.label} reaches every club on campus.`
          : `This club's officers declared a ${regime.career_path?.replace(/_/g, " ")} focus, so the shock reaches it directly.`
        : `No declared focus matching this shock. The members-are-exposed channel is second order and is not estimated here.`,
      computed_at: computedAt,
      model_version: EXPOSURE_MODEL_VERSION,
    });
  }

  const touched = exposures.filter((x) => x.exposure > 0.05).length;
  return {
    shock_id: shock.shock_id,
    order: 1,
    exposures,
    not_estimated: [
      "Second order: clubs losing attendance because their members are exposed. Not estimated — no membership-conditioned attendance model exists yet.",
      "Third order: shared officers, cancelled downstream events, succession gaps. Not estimated.",
      "Substitution: time reallocated toward other commitments, which can raise attendance elsewhere. Not estimated.",
      "Causal identification: none. These are structural exposures under a stated model, not causal effects.",
    ],
    reading: `${touched} of ${exposures.length} entities are first-order exposed to ${shock.label}. First-order only: second- and third-order effects are not estimated, and nothing here is a causal claim.`,
    computed_at: computedAt,
    model_version: EXPOSURE_MODEL_VERSION,
  };
}

// ==================================================================== factor

export type RecruitingExposureInput = {
  person: PersonContext;
  regime: ExposureRegime;
};

/**
 * Person-scoped, and therefore `person_private` with `person_self` permitted and
 * no external use whatsoever. `defineFactor` refuses `employer_evidence` and
 * `sponsor_ranking` on a person-scoped factor, which is the correct behaviour
 * and exactly what docs/10 §6 and docs/11 §7 require: an employer receives
 * episodes, artifacts and outcomes, never a number about a person's career
 * pressure.
 *
 * The minimum sample size is doing real work here. `n` counts the explicit
 * signals the reading rests on, so a person who has never stated an interest has
 * n = 0 and the registry refuses centrally — the privacy rule enforced by the
 * same mechanism that refuses a thin average, rather than by a local check that
 * a future edit could forget.
 */
export const recruitingExposureFactor = defineFactor<RecruitingExposureInput>({
  id: "recruiting_exposure",
  name: "Recruiting exposure",
  description:
    "How much a specific recruiting or academic regime bears on one person at one moment, 0..1, given what they have explicitly told us.",
  entity: "person",
  valueType: "index",
  hypothesis:
    "A member's exposure to an open recruiting window predicts their short-term drop in optional club participation better than the campus-wide academic regime alone.",
  supportedOutcomes: ["member_active_next_term"],
  expectedSign: -1,
  privacy: "person_private",
  // Never employer_evidence, never sponsor_ranking. defineFactor would throw,
  // and it should: this number exists to explain a person's month to them and
  // to stop a club blaming them for February.
  permittedUses: ["person_self", "planning", "matching", "research"],
  // One explicit signal is the floor. Zero signals is the unstated case, and the
  // registry refuses it rather than reporting a confident zero.
  minimumSampleSize: 1,
  halfLifeDays: null,
  sources: ["career_regime_priors", "explicit_interest_signals"],
  availableAt:
    "Interest signals are filtered to stated_at <= asOf inside explicitInterest, and withdrawals apply from their own date. The regime intensity comes from dated definition rows. Nothing is read from behaviour.",
  version: "1.0.0",
  status: "experimental",
  requires: ["person", "regime"],
  compute: (input, asOf) => {
    const r = computeExposure(input.person, input.regime, asOf);
    if (!r) return null;
    // Universal regimes rest on one fact — enrolment — rather than on stated
    // signals, so they count as one observation. Career regimes count only what
    // the person actually told us.
    const n =
      input.regime.scope === "universal"
        ? input.person.enrolled === true
          ? 1
          : 0
        : explicitInterest(input.person.interests ?? [], input.regime.career_path as CareerPath, asOf)
            .signals;
    return {
      value: r.exposure,
      n,
      drivers: r.components.map((c) => ({
        label: c.name.replace(/_/g, " "),
        contribution: c.value ?? 0,
      })),
      basis: {
        known: r.known,
        interest_status: r.interest_status,
        confidence: r.confidence,
        reason: r.reason,
      },
    };
  },
  explain: (value, reading) => {
    if (value === null)
      return "We have not been told you are interested in this, so we are not estimating how much it affects you. If you want this taken into account, say so — we will not work it out from what you attend.";
    const why = typeof reading?.basis?.reason === "string" ? reading.basis.reason : "";
    if (value < 0.05)
      return `This window does not look like it applies to you. ${why}`.trim();
    return `${value >= 0.5 ? "This is one of the weeks where the calendar you told us about is likely to take most of your time." : "This is pressing on you somewhat."} ${why}`.trim();
  },
});

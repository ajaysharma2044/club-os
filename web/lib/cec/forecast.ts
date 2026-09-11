// Pure attendance forecasting and food ordering. No database, no I/O — plain
// data in, plain data out, so the math can be tested directly and replayed
// against the event log.
//
// See docs/14-quant-per-feature.md §2 and §3. Two ideas carry the whole file:
//
//  1. Attendance is a count bounded by RSVPs, so we model the CONVERSION rate,
//     never the raw number. The conversion posterior is a Beta with an
//     empirical-Bayes prior pooled from comparable past events, which is the
//     hierarchical step: an event type with no history inherits the pool's
//     average conversion, shrunk by exactly how little we know.
//
//  2. The food order is a newsvendor decision on that posterior predictive, and
//     the critical fractile Cu/(Cu+Co) IS the decision. Officers must state the
//     ratio. The system must not infer it — it cannot know whether a shortage
//     at a recruitment event is an annoyance or a reputational disaster.
//
// The feature effects are declared constants, not a fitted regression. One
// campus and a few dozen events cannot support fitting nine coefficients, and
// pretending otherwise produces confident nonsense. Every magnitude below is an
// assumption with a stated size, tunable in one place, and each one is reported
// back so a user can see exactly what moved the number and by how much.
//
// Tested in tests/forecast.mjs.

import {
  betaPosterior,
  betaQuantile,
  lgamma,
  peerPrior,
  type Posterior,
} from "./behavioral";

// --------------------------------------------------------------- features

export type ForecastFeatures = {
  /** Days until the first final. Negative or zero means finals have started. */
  daysToFinals: number;
  /** Weeks elapsed since the term began. */
  weeksIntoTerm: number;
  /** Competing campus events inside a two-hour window. */
  competingEvents: number;
  foodProvided: boolean;
  /** Whether the food was *advertised*, which the field evidence separates. */
  foodAdvertised: boolean;
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  /** 0–23, local time of the event start. */
  hour: number;
  /** Forecast probability of precipitation at event time, 0–1. */
  precipitationProbability: number;
  /** Days between the announcement and the event. */
  leadTimeDays: number;
  locationChangedAfterAnnouncement: boolean;
};

/**
 * Every feature effect in the model, in LOG-ODDS, in one object so they can be
 * argued about and tuned in a single place.
 *
 * These are priors, not estimates. Each is sized from the field evidence in
 * docs/13 and docs/14 and deliberately kept modest: a wrong sign on a small
 * coefficient costs a few people, a wrong sign on a large one destroys trust in
 * the forecast. For orientation, at a 70% base conversion: +0.35 log-odds is
 * about +6 points of conversion, and −0.90 is about −18.
 */
export const ATTENDANCE_ADJUSTMENTS = {
  /**
   * Finals pressure, the single largest effect anyone at CEC describes. Ramps
   * linearly in log-odds from no effect 21 days out to the full penalty on the
   * day of the first final. −0.90 ≈ 70% conversion falling to 52%.
   */
  finals: { fullPenalty: -0.9, rampDays: 21 },
  /**
   * Slow decay of novelty across a term, held small on purpose because it
   * overlaps with the finals ramp above and must not double-count it.
   * −0.02/week, floored at −0.24 (twelve weeks).
   */
  weeksIntoTerm: { perWeek: -0.02, floor: -0.24 },
  /**
   * Each competing campus event in a two-hour window. −0.18 each, floored at
   * −0.72, because the fifth competing event does not halve turnout again.
   */
  competingEvents: { perEvent: -0.18, floor: -0.72 },
  /**
   * Food provided: +0.35. Food *advertised* as well: a further +0.20, since an
   * unadvertised pizza cannot pull anyone who was not already coming.
   */
  food: { provided: 0.35, alsoAdvertised: 0.2 },
  /**
   * Day of week, indexed 0 = Sunday. Midweek is the peak; Friday and Saturday
   * lose to everything else on a campus; Sunday is mildly bad.
   */
  dayOfWeek: [-0.15, 0.05, 0.1, 0.1, 0.05, -0.3, -0.35],
  /**
   * Start hour. Before noon collides with classes and sleep; late evening loses
   * anyone who has to be up. The 17:00–21:00 block is the peak.
   */
  hour: { beforeNoon: -0.3, afternoon: -0.05, evening: 0.1, lateNight: -0.25 },
  /** Rain, scaled by probability: −0.60 at a certain soaking, −0.06 at 10%. */
  precipitation: { perUnitProbability: -0.6 },
  /**
   * Lead time. Under two days nobody has rearranged their week; over three
   * weeks the announcement has been forgotten by the people it reached.
   */
  leadTime: { under2Days: -0.4, under5Days: -0.15, over21Days: -0.1 },
  /**
   * A location change after announcement. Large, because it is the one thing on
   * this list that strands people who genuinely intended to come.
   */
  locationChanged: -0.45,
};

const HOUR_BOUNDS = { noon: 12, afternoonEnd: 17, eveningEnd: 22 };

export type FeatureAdjustment = {
  feature: string;
  /** Log-odds actually applied, i.e. after contrast against the peer pool. */
  delta: number;
  /** Raw log-odds for this event before the pool contrast. */
  raw: number;
  /** Mean raw log-odds across comparables that recorded this feature. */
  poolBaseline: number;
  note: string;
};

type Term = { feature: string; value: number; note: string };

/** Raw log-odds terms for one event. Only features actually supplied appear. */
function featureTerms(f: Partial<ForecastFeatures> | undefined): Term[] {
  const out: Term[] = [];
  if (!f) return out;
  const A = ATTENDANCE_ADJUSTMENTS;

  if (typeof f.daysToFinals === "number") {
    const d = Math.max(0, f.daysToFinals);
    const ramp = Math.max(0, (A.finals.rampDays - d) / A.finals.rampDays);
    out.push({
      feature: "days_to_finals",
      value: A.finals.fullPenalty * ramp,
      note:
        ramp <= 0
          ? `${f.daysToFinals} days to the first final — far enough out to not matter`
          : `${f.daysToFinals} days to the first final`,
    });
  }

  if (typeof f.weeksIntoTerm === "number") {
    const w = Math.max(0, f.weeksIntoTerm);
    out.push({
      feature: "weeks_into_term",
      value: Math.max(A.weeksIntoTerm.floor, A.weeksIntoTerm.perWeek * w),
      note: `week ${f.weeksIntoTerm} of the term`,
    });
  }

  if (typeof f.competingEvents === "number") {
    const c = Math.max(0, f.competingEvents);
    out.push({
      feature: "competing_events",
      value: Math.max(A.competingEvents.floor, A.competingEvents.perEvent * c),
      note: `${c} competing campus event${c === 1 ? "" : "s"} in the same window`,
    });
  }

  if (typeof f.foodProvided === "boolean") {
    const advertised = f.foodProvided && f.foodAdvertised === true;
    out.push({
      feature: "food_provided",
      value: f.foodProvided
        ? A.food.provided + (advertised ? A.food.alsoAdvertised : 0)
        : 0,
      note: !f.foodProvided
        ? "no food"
        : advertised
          ? "food provided and advertised"
          : "food provided but not advertised",
    });
  }

  if (typeof f.dayOfWeek === "number") {
    const d = ((Math.round(f.dayOfWeek) % 7) + 7) % 7;
    out.push({
      feature: "day_of_week",
      value: A.dayOfWeek[d],
      note: `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]}`,
    });
  }

  if (typeof f.hour === "number") {
    const h = f.hour;
    const value =
      h < HOUR_BOUNDS.noon
        ? A.hour.beforeNoon
        : h < HOUR_BOUNDS.afternoonEnd
          ? A.hour.afternoon
          : h < HOUR_BOUNDS.eveningEnd
            ? A.hour.evening
            : A.hour.lateNight;
    out.push({ feature: "hour", value, note: `starts at ${h}:00` });
  }

  if (typeof f.precipitationProbability === "number") {
    const p = Math.min(1, Math.max(0, f.precipitationProbability));
    out.push({
      feature: "precipitation_probability",
      value: A.precipitation.perUnitProbability * p,
      note: `${Math.round(p * 100)}% chance of rain at event time`,
    });
  }

  if (typeof f.leadTimeDays === "number") {
    const l = Math.max(0, f.leadTimeDays);
    const value =
      l < 2
        ? A.leadTime.under2Days
        : l < 5
          ? A.leadTime.under5Days
          : l > 21
            ? A.leadTime.over21Days
            : 0;
    out.push({
      feature: "lead_time_days",
      value,
      note: `announced ${l} day${l === 1 ? "" : "s"} ahead`,
    });
  }

  if (typeof f.locationChangedAfterAnnouncement === "boolean") {
    out.push({
      feature: "location_changed_after_announcement",
      value: f.locationChangedAfterAnnouncement ? A.locationChanged : 0,
      note: f.locationChangedAfterAnnouncement
        ? "location changed after the announcement"
        : "location unchanged since the announcement",
    });
  }

  return out;
}

// ------------------------------------------------------- beta-binomial tail

/**
 * Posterior predictive for the attendance COUNT: k successes in n RSVPs with an
 * uncertain rate. This is the Beta-Binomial, not a Binomial at the posterior
 * mean — using the mean would throw away exactly the uncertainty the food order
 * is supposed to be paid for.
 */
export function betaBinomialPmf(
  k: number,
  n: number,
  a: number,
  b: number,
): number {
  if (k < 0 || k > n || n < 0) return 0;
  return Math.exp(
    lgamma(n + 1) -
      lgamma(k + 1) -
      lgamma(n - k + 1) +
      lgamma(k + a) +
      lgamma(n - k + b) -
      lgamma(n + a + b) +
      lgamma(a + b) -
      lgamma(a) -
      lgamma(b),
  );
}

/** P(D <= k). */
export function betaBinomialCdf(
  k: number,
  n: number,
  a: number,
  b: number,
): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  let s = 0;
  for (let i = 0; i <= k; i++) s += betaBinomialPmf(i, n, a, b);
  return Math.min(1, s);
}

/** Smallest q with P(D <= q) >= p. The newsvendor order quantity. */
export function betaBinomialQuantile(
  p: number,
  n: number,
  a: number,
  b: number,
): number {
  if (p <= 0) return 0;
  if (p >= 1) return n;
  let s = 0;
  for (let k = 0; k <= n; k++) {
    s += betaBinomialPmf(k, n, a, b);
    // Tolerance so an exact-boundary fractile (Cu = Co on a symmetric
    // distribution) is not pushed one unit high by float drift.
    if (s >= p - 1e-12) return k;
  }
  return n;
}

// ------------------------------------------------------------- forecasting

export type ComparableEvent = {
  rsvps: number;
  attended: number;
  features?: Partial<ForecastFeatures>;
};

export type ForecastInput = {
  rsvps: number;
  features?: Partial<ForecastFeatures>;
  /** Past events judged comparable — same club, similar type. */
  comparables: ComparableEvent[];
  /**
   * Fallback prior when the pool is too thin for empirical Bayes. Defaults to
   * Beta(1,1) — deliberately uninformative, so a forecast with no history is
   * visibly useless rather than quietly wrong. Supply a campus-wide conversion
   * here if one is actually known.
   */
  prior?: { alpha: number; beta: number };
};

export type PredictiveDistribution = { n: number; alpha: number; beta: number };

export type ForecastBasis = {
  /** How many comparable events informed this. The honest headline. */
  comparables: number;
  pooledRsvps: number;
  pooledAttended: number;
  /**
   * Pooled RSVPs after the between-event discount. A single event with 400
   * RSVPs is not 400 independent facts about the next event's conversion.
   */
  effectiveTrials: number;
  priorSource: "peer" | "weak";
  priorMean: number;
  /** Pooled conversion before feature adjustments. */
  baseConversion: number;
  thin: boolean;
};

export type Forecast = {
  /** Point estimate of attendance, in people. Never above rsvps, never below 0. */
  expected: number;
  /** 95% predictive interval on the COUNT. */
  lo: number;
  hi: number;
  /** Conversion rate posterior, after feature adjustments. */
  conversionPosterior: Posterior;
  basis: ForecastBasis;
  adjustments: FeatureAdjustment[];
  /** Plain English, present only when the basis is too thin to trust. */
  caveat: string | null;
  /** Hand this to recommendFoodOrder. */
  predictive: PredictiveDistribution;
};

const THIN_BASIS = 5;

const logit = (p: number) => {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  return Math.log(q / (1 - q));
};
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/** A Beta with the same concentration but a new mean, keeping honest bounds. */
function withMean(base: Posterior, mean: number): Posterior {
  const conc = base.alpha + base.beta;
  const alpha = Math.max(1e-9, mean * conc);
  const beta = Math.max(1e-9, (1 - mean) * conc);
  const lo = betaQuantile(0.025, alpha, beta);
  const hi = betaQuantile(0.975, alpha, beta);
  return {
    alpha,
    beta,
    n: base.n,
    mean: alpha / (alpha + beta),
    lo,
    hi,
    width: hi - lo,
    shrinkage: base.shrinkage,
  };
}

/**
 * Predict attendance for one event.
 *
 * The conversion rate gets a Beta posterior whose prior is pooled from the
 * comparable events by empirical Bayes (peerPrior), and whose data is those
 * same events' check-ins, discounted for between-event heterogeneity. Feature
 * effects are then applied as additive log-odds, each one contrasted against
 * the comparable pool so that an effect already baked into the history — every
 * past event had food too — is not counted twice.
 */
export function forecastAttendance(input: ForecastInput): Forecast {
  const rsvps = Math.max(0, Math.round(input.rsvps || 0));

  const usable = (input.comparables || [])
    .filter((c) => Number.isFinite(c.rsvps) && c.rsvps > 0)
    .map((c) => ({
      rsvps: Math.round(c.rsvps),
      attended: Math.min(Math.round(c.rsvps), Math.max(0, Math.round(c.attended || 0))),
      features: c.features,
    }));

  // Empirical-Bayes prior across comparable events: the pool's mean conversion,
  // concentrated by how little the events actually differ from one another.
  const fallback = input.prior ?? { alpha: 1, beta: 1 };
  const eb = peerPrior(
    usable.map((c) => ({
      successes: c.attended,
      failures: c.rsvps - c.attended,
    })),
  );
  const prior =
    eb.source === "peer"
      ? eb
      : { alpha: fallback.alpha, beta: fallback.beta, source: "weak" as const };
  const k = prior.alpha + prior.beta;

  // Between-event discount. Under the Beta-Binomial hierarchy the variance of
  // one event's observed rate is p(1-p)[1/n + 1/(k+1)], so that event is worth
  // n(k+1)/(n + k + 1) independent trials about the NEXT event's conversion —
  // rising with n but capped at k+1. Consequence, and it is the correct one:
  // more EVENTS sharpen the forecast, more RSVPs at one event barely do.
  let successes = 0,
    failures = 0,
    pooledRsvps = 0,
    pooledAttended = 0,
    effectiveTrials = 0;
  for (const c of usable) {
    const nEff = (c.rsvps * (k + 1)) / (c.rsvps + k + 1);
    const rate = c.attended / c.rsvps;
    successes += nEff * rate;
    failures += nEff * (1 - rate);
    effectiveTrials += nEff;
    pooledRsvps += c.rsvps;
    pooledAttended += c.attended;
  }

  const base = betaPosterior(successes, failures, prior);

  // Feature adjustments, contrasted against the pool. If no comparable recorded
  // a feature the baseline is zero and the raw effect applies, which is the
  // best available answer and is flagged as such in the note.
  const poolTerms = usable.map((c) => {
    const m = new Map<string, number>();
    for (const t of featureTerms(c.features)) m.set(t.feature, t.value);
    return m;
  });
  const adjustments: FeatureAdjustment[] = featureTerms(input.features).map(
    (t) => {
      const seen = poolTerms
        .filter((m) => m.has(t.feature))
        .map((m) => m.get(t.feature)!);
      const poolBaseline = seen.length
        ? seen.reduce((a, b) => a + b, 0) / seen.length
        : 0;
      return {
        feature: t.feature,
        delta: t.value - poolBaseline,
        raw: t.value,
        poolBaseline,
        note: seen.length
          ? t.note
          : `${t.note} (no comparable event recorded this, so the full effect is applied)`,
      };
    },
  );
  adjustments.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const totalDelta = adjustments.reduce((a, x) => a + x.delta, 0);
  const adjusted = withMean(base, logistic(logit(base.mean) + totalDelta));

  const expected = Math.min(
    rsvps,
    Math.max(0, Math.round(rsvps * adjusted.mean)),
  );
  const lo = betaBinomialQuantile(0.025, rsvps, adjusted.alpha, adjusted.beta);
  const hi = betaBinomialQuantile(0.975, rsvps, adjusted.alpha, adjusted.beta);

  const thin = usable.length < THIN_BASIS;
  const caveat =
    usable.length === 0
      ? "No comparable past events, so this is the prior and nothing else — a placeholder, not a forecast. Check people in at your next event and this number starts to mean something."
      : thin
        ? `Only ${usable.length} comparable event${usable.length === 1 ? "" : "s"} informs this, so the estimate is mostly prior rather than your own history. Treat the range, not the number, as the answer.`
        : null;

  return {
    expected,
    lo,
    hi,
    conversionPosterior: adjusted,
    basis: {
      comparables: usable.length,
      pooledRsvps,
      pooledAttended,
      effectiveTrials,
      priorSource: prior.source,
      priorMean: prior.alpha / (prior.alpha + prior.beta),
      baseConversion: base.mean,
      thin,
    },
    adjustments,
    caveat,
    predictive: { n: rsvps, alpha: adjusted.alpha, beta: adjusted.beta },
  };
}

// -------------------------------------------------------------- newsvendor

export type CostRatio = {
  /** Cu — the cost of running short by one person. */
  shortage: number;
  /** Co — the cost of one surplus serving. */
  surplus: number;
};

export type FoodOrderInput = {
  /** Posterior predictive over attendance, i.e. forecastAttendance().predictive. */
  demand: PredictiveDistribution;
  /**
   * Stated by the officers. NEVER inferred: the system cannot know whether a
   * shortage is a minor annoyance or a reputational disaster during the one
   * week that decides the incoming class. Omitted means omitted, and the
   * result says so out loud.
   */
  costRatio?: CostRatio | null;
  /** What the officer sees as "predicted attendance". Defaults to the mean. */
  expected?: number;
};

export type FoodOrder = {
  quantity: number;
  /** Cu / (Cu + Co). The whole decision lives here. */
  fractile: number;
  /** P(demand > quantity) at the recommended order. */
  expectedShortfallProbability: number;
  /** P(demand > expected) — what ordering "for about the average" costs you. */
  shortfallProbabilityAtExpected: number;
  costRatio: CostRatio & { supplied: boolean };
  expected: number;
  /** The sentence an officer reads. The output is a sentence, not a dashboard. */
  explanation: string;
};

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

const times = (r: number) =>
  Number.isInteger(r) && r <= 12 ? WORDS[r] : r.toFixed(1).replace(/\.0$/, "");

function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
}

/** "about one time in three" — the phrasing the doc's worked example uses. */
function oddsPhrase(p: number): string {
  if (!(p > 0)) return "essentially never";
  if (p >= 0.95) return "almost certainly";
  if (p > 0.6) return `about ${Math.round(p * 100)}% of the time`;
  const n = Math.round(1 / p);
  if (n <= 1) return "almost every time";
  if (n === 2) return "about half the time";
  if (n <= 12) return `about one time in ${WORDS[n]}`;
  return `about one time in ${n}`;
}

/**
 * The newsvendor decision: order the smallest q with P(D <= q) >= Cu/(Cu+Co).
 *
 * Ordering at the mean — which is what "I'll order for about 50" does — is
 * correct only when shortage and surplus cost exactly the same, which they
 * never do. So the ratio is the input that matters, and it must come from a
 * human. With no ratio supplied this returns a clearly-marked 1:1 default and
 * says, in the explanation, that somebody has to set it.
 */
export function recommendFoodOrder(input: FoodOrderInput): FoodOrder {
  const { n, alpha, beta } = input.demand;

  const stated = input.costRatio;
  const supplied =
    !!stated &&
    Number.isFinite(stated.shortage) &&
    Number.isFinite(stated.surplus) &&
    stated.shortage > 0 &&
    stated.surplus > 0;
  const shortage = supplied ? stated!.shortage : 1;
  const surplus = supplied ? stated!.surplus : 1;

  const fractile = shortage / (shortage + surplus);
  const quantity = betaBinomialQuantile(fractile, n, alpha, beta);

  const expected =
    typeof input.expected === "number"
      ? Math.round(input.expected)
      : Math.round((n * alpha) / (alpha + beta));

  const expectedShortfallProbability =
    1 - betaBinomialCdf(quantity, n, alpha, beta);
  const shortfallProbabilityAtExpected =
    1 - betaBinomialCdf(expected, n, alpha, beta);

  const pct = Math.round(fractile * 100);
  const ratio = shortage / surplus;
  const shortAt = `At ${expected} you would run short ${oddsPhrase(shortfallProbabilityAtExpected)}.`;

  let explanation: string;
  if (!supplied) {
    explanation =
      `Order for ${quantity}. Predicted attendance is ${expected}. ` +
      `Nobody has told us how much worse running out is than having food left over, so this is a placeholder 1:1 trade-off and orders at the median. ` +
      `Set that ratio for this event type — it is the whole decision, and the system will not guess it for you. ` +
      shortAt;
  } else if (ratio === 1) {
    explanation =
      `Order for ${quantity}. Predicted attendance is ${expected}, and you told us running out and waste cost the same, so this is the median. ` +
      shortAt;
  } else {
    const clause =
      ratio > 1
        ? `you told us running out is ${times(ratio)} times worse than waste`
        : `you told us waste is ${times(1 / ratio)} times worse than running out`;
    explanation =
      `Order for ${quantity}. Predicted attendance is ${expected}, but ${clause}, so this is the ${ordinal(pct)} percentile. ` +
      shortAt;
  }

  return {
    quantity,
    fractile,
    expectedShortfallProbability,
    shortfallProbabilityAtExpected,
    costRatio: { shortage, surplus, supplied },
    expected,
    explanation,
  };
}

// Verifies the attendance-forecast and food-order math against hand-computed
// values. Pure functions, no database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/forecast.mjs
import assert from "node:assert/strict";
import {
  forecastAttendance,
  recommendFoodOrder,
  betaBinomialPmf,
  betaBinomialCdf,
  betaBinomialQuantile,
  ATTENDANCE_ADJUSTMENTS,
} from "../lib/cec/forecast.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const near = (a, b, tol, m) => ok(Math.abs(a - b) < tol, `${m}: ${a} vs ${b}`);

/** n identical comparable events. */
const rep = (n, c) => Array.from({ length: n }, () => ({ ...c }));
/** Concentrated Beta ⇒ the Beta-Binomial collapses to a plain Binomial(n, p). */
const binomial = (n, p) => ({ n, alpha: p * 1e6, beta: (1 - p) * 1e6 });

// --- 1. The predictive distribution itself ---------------------------------
// Beta-Binomial(n, 1, 1) is uniform on {0..n}: every count equally likely.
for (let k = 0; k <= 4; k++)
  near(betaBinomialPmf(k, 4, 1, 1), 0.2, 1e-12, `BB(4,1,1) pmf at ${k}`);
near(betaBinomialCdf(2, 4, 1, 1), 0.6, 1e-12, "BB(4,1,1) cdf(2)");

// It is a probability distribution: the mass sums to one and the mean is
// n*a/(a+b), both checked at an asymmetric, non-trivial parameterization.
let mass = 0,
  mean = 0;
for (let k = 0; k <= 30; k++) {
  const p = betaBinomialPmf(k, 30, 6, 2);
  mass += p;
  mean += k * p;
}
near(mass, 1, 1e-12, "pmf sums to 1");
near(mean, (30 * 6) / 8, 1e-9, "mean = n·a/(a+b)");
ok(betaBinomialPmf(-1, 10, 2, 2) === 0, "no mass below zero");
ok(betaBinomialPmf(11, 10, 2, 2) === 0, "no mass above n");

// Against the exact Binomial(10, 0.5): C(10,k)/1024 cumulated is
// 1,11,56,176,386,638,848,968,1013,1023,1024.
near(betaBinomialCdf(5, 10, 5e5, 5e5), 638 / 1024, 1e-4, "Binomial(10,.5) cdf(5)");
near(betaBinomialCdf(6, 10, 5e5, 5e5), 848 / 1024, 1e-4, "Binomial(10,.5) cdf(6)");

// --- 2. Newsvendor: Cu = Co orders at the median ----------------------------
// Uniform demand on {0,1,2,3,4}. P(D<=q) = (q+1)/5. Smallest q with cdf >= 0.5
// is q = 2 (cdf 0.6); cdf(1) = 0.4 is short. Ordering at the mean (2) is only
// right BECAUSE the costs are equal here — which is the point of the section.
const uniform = { n: 4, alpha: 1, beta: 1 };
const even = recommendFoodOrder({
  demand: uniform,
  costRatio: { shortage: 1, surplus: 1 },
});
near(even.fractile, 0.5, 1e-12, "Cu = Co ⇒ fractile 0.5");
ok(even.quantity === 2, `equal costs order at the median: got ${even.quantity}`);

// Cu = 3·Co ⇒ fractile 0.75. cdf(2) = 0.6 < 0.75, cdf(3) = 0.8 ⇒ q = 3.
const threeToOne = recommendFoodOrder({
  demand: uniform,
  costRatio: { shortage: 3, surplus: 1 },
});
near(threeToOne.fractile, 0.75, 1e-12, "Cu = 3·Co ⇒ fractile 0.75");
ok(
  threeToOne.quantity === 3,
  `3:1 orders at the 75th percentile: got ${threeToOne.quantity}`,
);

// Same two facts on Binomial(10, 0.5), where the percentiles are not the mean:
// cdf(4)=0.377, cdf(5)=0.623, cdf(6)=0.828. Median ⇒ 5; 75th ⇒ 6, one ABOVE
// the mean of 5. A bug that ordered at the mean would pass the uniform case
// above and fail here.
const coin = binomial(10, 0.5);
ok(
  recommendFoodOrder({ demand: coin, costRatio: { shortage: 1, surplus: 1 } })
    .quantity === 5,
  "Binomial(10,.5) median is 5",
);
ok(
  recommendFoodOrder({ demand: coin, costRatio: { shortage: 3, surplus: 1 } })
    .quantity === 6,
  "Binomial(10,.5) 75th percentile is 6, strictly above the mean",
);
// And the other direction: waste three times worse than shortage ⇒ 25th ⇒ 4.
ok(
  recommendFoodOrder({ demand: coin, costRatio: { shortage: 1, surplus: 3 } })
    .quantity === 4,
  "waste 3x worse ⇒ order below the median",
);

// --- 3. Monotonicity in the shortage cost -----------------------------------
const forecast = forecastAttendance({
  rsvps: 90,
  comparables: rep(6, { rsvps: 80, attended: 60 }),
});
const q = (r) =>
  recommendFoodOrder({
    demand: forecast.predictive,
    costRatio: { shortage: r, surplus: 1 },
  }).quantity;

// Coarse sweep: each step must move the order STRICTLY up.
const coarse = [0.25, 0.5, 1, 2, 4, 8, 20].map(q);
for (let i = 1; i < coarse.length; i++)
  ok(
    coarse[i] > coarse[i - 1],
    `raising shortage cost strictly raises the order: ${coarse}`,
  );
// Fine sweep: never goes down, anywhere.
let prev = -1,
  dips = [];
for (let r = 0.1; r <= 30; r += 0.1) {
  const v = q(r);
  if (v < prev) dips.push(r.toFixed(1));
  prev = v;
}
ok(dips.length === 0, `order quantity never dips as shortage cost rises: ${dips}`);
// The quantity is bounded by the RSVP count: you cannot feed more people than
// could possibly show up.
ok(q(1000) <= 90, "order never exceeds the RSVP count");
// And the recommended order really does meet the stated service level.
for (const r of [1, 2, 3, 5, 10]) {
  const o = recommendFoodOrder({
    demand: forecast.predictive,
    costRatio: { shortage: r, surplus: 1 },
  });
  ok(
    o.expectedShortfallProbability <= 1 - o.fractile + 1e-9,
    `shortfall risk at q meets the fractile for ${r}:1`,
  );
  ok(
    betaBinomialCdf(o.quantity - 1, 90, forecast.predictive.alpha, forecast.predictive.beta) <
      o.fractile,
    `q is the SMALLEST quantity meeting the fractile for ${r}:1`,
  );
}

// --- 4. No stated ratio ⇒ a marked 1:1 default that asks for one ------------
const unset = recommendFoodOrder({ demand: forecast.predictive });
ok(unset.costRatio.supplied === false, "an unsupplied ratio is marked unsupplied");
near(unset.fractile, 0.5, 1e-12, "default is an even 1:1, i.e. the median");
ok(
  unset.quantity ===
    recommendFoodOrder({
      demand: forecast.predictive,
      costRatio: { shortage: 1, surplus: 1 },
    }).quantity,
  "the default behaves exactly like a stated 1:1",
);
ok(
  /set that ratio/i.test(unset.explanation),
  `the explanation tells them to set the ratio: ${unset.explanation}`,
);
// Nonsense ratios are refused rather than quietly used.
ok(
  recommendFoodOrder({
    demand: forecast.predictive,
    costRatio: { shortage: 0, surplus: 1 },
  }).costRatio.supplied === false,
  "a zero cost is not a stated ratio",
);
ok(
  recommendFoodOrder({
    demand: forecast.predictive,
    costRatio: { shortage: -3, surplus: 1 },
  }).costRatio.supplied === false,
  "a negative cost is not a stated ratio",
);
// The explanation is the product surface: it must carry the real numbers.
const said = recommendFoodOrder({
  demand: forecast.predictive,
  costRatio: { shortage: 3, surplus: 1 },
});
ok(
  said.explanation.startsWith(`Order for ${said.quantity}.`),
  `explanation leads with the order: ${said.explanation}`,
);
ok(
  said.explanation.includes(`${said.expected}`) &&
    /three times worse/.test(said.explanation) &&
    /percentile/.test(said.explanation),
  `explanation states attendance, ratio and percentile: ${said.explanation}`,
);

// --- 5. More comparable history narrows the interval ------------------------
// Identical conversion (60 of 80 every time); only the event count differs.
const few = forecastAttendance({
  rsvps: 90,
  comparables: rep(3, { rsvps: 80, attended: 60 }),
});
const many = forecastAttendance({
  rsvps: 90,
  comparables: rep(12, { rsvps: 80, attended: 60 }),
});
near(few.expected, many.expected, 1.5, "same rate ⇒ same point estimate");
ok(
  many.hi - many.lo < few.hi - few.lo,
  `more events ⇒ tighter band: ${many.hi - many.lo} vs ${few.hi - few.lo}`,
);
ok(
  many.conversionPosterior.width < few.conversionPosterior.width,
  "more events ⇒ tighter conversion posterior",
);
ok(
  many.basis.effectiveTrials > few.basis.effectiveTrials,
  "more events ⇒ more effective evidence",
);
// More RSVPs at ONE event must not buy the same confidence as more events:
// between-event variation is the binding uncertainty, not sampling noise.
const oneHuge = forecastAttendance({
  rsvps: 90,
  comparables: rep(3, { rsvps: 800, attended: 600 }),
});
ok(
  oneHuge.hi - oneHuge.lo > many.hi - many.lo,
  `3 huge events stay wider than 12 normal ones: ${oneHuge.hi - oneHuge.lo} vs ${many.hi - many.lo}`,
);
// Parameter uncertainty is actually propagated: the predictive is wider than a
// Binomial pinned at the posterior mean would be.
const pinned = binomial(90, few.conversionPosterior.mean);
ok(
  few.hi - few.lo >
    betaBinomialQuantile(0.975, 90, pinned.alpha, pinned.beta) -
      betaBinomialQuantile(0.025, 90, pinned.alpha, pinned.beta),
  "the predictive is wider than a binomial at the point estimate",
);

// --- 6. No history ⇒ the prior, and it says so ------------------------------
const cold = forecastAttendance({ rsvps: 50, comparables: [] });
ok(cold.basis.comparables === 0, "no comparables counted");
ok(cold.basis.priorSource === "weak", "falls back to the weak prior");
near(cold.conversionPosterior.mean, 0.5, 1e-9, "uniform prior ⇒ 50% conversion");
near(cold.conversionPosterior.shrinkage, 0, 1e-12, "no data ⇒ no weight on data");
ok(cold.caveat !== null && /prior/i.test(cold.caveat), `caveat names the prior: ${cold.caveat}`);
ok(cold.hi - cold.lo > 40, `no history ⇒ a uselessly wide band, honestly: ${cold.lo}-${cold.hi}`);
// A supplied campus-wide prior is used instead of 50/50 when one exists.
const seeded = forecastAttendance({
  rsvps: 50,
  comparables: [],
  prior: { alpha: 7, beta: 3 },
});
near(seeded.conversionPosterior.mean, 0.7, 1e-9, "a stated prior is honoured");
ok(seeded.caveat !== null, "a stated prior is still no substitute for history");

// Thin-but-nonzero history also caveats; five events or more does not.
ok(
  forecastAttendance({ rsvps: 90, comparables: rep(4, { rsvps: 80, attended: 60 }) })
    .caveat !== null,
  "4 comparable events is thin",
);
ok(
  forecastAttendance({ rsvps: 90, comparables: rep(5, { rsvps: 80, attended: 60 }) })
    .caveat === null,
  "5 comparable events clears the thin threshold",
);
ok(few.basis.thin === true && many.basis.thin === false, "thin flag tracks the basis");

// --- 7. Feature adjustments move the number the right way -------------------
const pool = rep(8, { rsvps: 80, attended: 60 });
const fc = (features) => forecastAttendance({ rsvps: 90, comparables: pool, features });
const plain = fc(undefined);

ok(fc({ daysToFinals: 2 }).expected < plain.expected, "finals week lowers attendance");
ok(
  fc({ daysToFinals: 2 }).expected < fc({ daysToFinals: 14 }).expected,
  "closer to finals is worse than further out",
);
near(
  fc({ daysToFinals: 60 }).expected,
  plain.expected,
  0.5,
  "finals far away changes nothing",
);
ok(fc({ foodProvided: true }).expected > plain.expected, "food provided raises attendance");
ok(
  fc({ foodProvided: true, foodAdvertised: true }).expected >
    fc({ foodProvided: true, foodAdvertised: false }).expected,
  "advertised food beats unadvertised food",
);
ok(fc({ foodProvided: false }).expected === plain.expected, "no food is the baseline");
ok(fc({ competingEvents: 3 }).expected < plain.expected, "competing events lower it");
ok(
  fc({ competingEvents: 1 }).expected > fc({ competingEvents: 3 }).expected,
  "more competing events is worse",
);
ok(fc({ precipitationProbability: 0.9 }).expected < plain.expected, "rain lowers it");
ok(
  fc({ locationChangedAfterAnnouncement: true }).expected <
    fc({ locationChangedAfterAnnouncement: false }).expected,
  "a location change after announcement lowers it",
);
ok(fc({ hour: 8 }).expected < fc({ hour: 19 }).expected, "8am loses to 7pm");
ok(fc({ dayOfWeek: 6 }).expected < fc({ dayOfWeek: 3 }).expected, "Saturday loses to Wednesday");
ok(fc({ leadTimeDays: 1 }).expected < fc({ leadTimeDays: 10 }).expected, "no notice lowers it");

// Every applied adjustment is reported with its magnitude, so the "why" panel
// cannot drift from the math.
const wet = fc({ daysToFinals: 3, foodProvided: true, precipitationProbability: 1 });
ok(wet.adjustments.length === 3, "one entry per supplied feature");
ok(
  wet.adjustments.find((a) => a.feature === "days_to_finals").delta < 0 &&
    wet.adjustments.find((a) => a.feature === "food_provided").delta > 0 &&
    wet.adjustments.find((a) => a.feature === "precipitation_probability").delta < 0,
  "reported deltas carry the right signs",
);
near(
  wet.adjustments.find((a) => a.feature === "precipitation_probability").delta,
  ATTENDANCE_ADJUSTMENTS.precipitation.perUnitProbability,
  1e-12,
  "certain rain applies exactly the stated magnitude",
);
ok(
  Math.abs(wet.adjustments[0].delta) >= Math.abs(wet.adjustments[1].delta),
  "adjustments are ordered by how much they moved the number",
);

// A feature already baked into the history is NOT counted twice: if every
// comparable event had food, adding food to this one changes nothing.
const foodPool = rep(8, { rsvps: 80, attended: 60, features: { foodProvided: true } });
const alsoFood = forecastAttendance({
  rsvps: 90,
  comparables: foodPool,
  features: { foodProvided: true },
});
near(
  alsoFood.adjustments[0].delta,
  0,
  1e-9,
  "food everywhere in the pool ⇒ no extra credit for food",
);
const noFoodNow = forecastAttendance({
  rsvps: 90,
  comparables: foodPool,
  features: { foodProvided: false },
});
ok(
  noFoodNow.expected < alsoFood.expected,
  "dropping food from a pool that always had it lowers the estimate",
);
near(
  noFoodNow.adjustments[0].delta,
  -ATTENDANCE_ADJUSTMENTS.food.provided,
  1e-9,
  "the contrast is exactly the stated food magnitude",
);

// The constants are one tunable object, and their signs are the claim.
ok(ATTENDANCE_ADJUSTMENTS.finals.fullPenalty < 0, "finals penalty is a penalty");
ok(ATTENDANCE_ADJUSTMENTS.food.provided > 0, "food is a bonus");
ok(ATTENDANCE_ADJUSTMENTS.locationChanged < 0, "a location change is a penalty");

// --- 8. The hard bounds ----------------------------------------------------
const cases = [
  plain,
  cold,
  few,
  many,
  fc({ foodProvided: true, foodAdvertised: true, dayOfWeek: 3, hour: 19, daysToFinals: 90, leadTimeDays: 10, competingEvents: 0, precipitationProbability: 0 }),
  fc({ foodProvided: false, dayOfWeek: 6, hour: 8, daysToFinals: 0, leadTimeDays: 0, competingEvents: 9, precipitationProbability: 1, locationChangedAfterAnnouncement: true }),
  forecastAttendance({ rsvps: 3, comparables: rep(6, { rsvps: 2, attended: 2 }) }),
];
for (const c of cases) {
  const n = c.predictive.n;
  ok(c.expected >= 0, "expected attendance is never negative");
  ok(c.expected <= n, `expected attendance never exceeds RSVPs (${c.expected} vs ${n})`);
  ok(c.lo >= 0 && c.hi <= n, `the interval stays inside [0, rsvps]: ${c.lo}-${c.hi}`);
  ok(c.lo <= c.expected && c.expected <= c.hi, "the point estimate sits inside its interval");
}
// Everyone came to every comparable event; still cannot exceed the RSVPs.
const perfect = forecastAttendance({ rsvps: 40, comparables: rep(10, { rsvps: 50, attended: 50 }) });
ok(perfect.expected <= 40, `perfect history is still capped by RSVPs: ${perfect.expected}`);
// Nobody RSVP'd.
const empty = forecastAttendance({ rsvps: 0, comparables: rep(6, { rsvps: 80, attended: 60 }) });
ok(empty.expected === 0 && empty.lo === 0 && empty.hi === 0, "zero RSVPs ⇒ zero attendance");
ok(
  recommendFoodOrder({ demand: empty.predictive, costRatio: { shortage: 9, surplus: 1 } })
    .quantity === 0,
  "no RSVPs ⇒ order nothing, whatever the ratio",
);
// Garbage in the log (attendance above RSVPs) is clamped, not propagated.
const dirty = forecastAttendance({ rsvps: 90, comparables: rep(6, { rsvps: 80, attended: 500 }) });
ok(dirty.expected <= 90, "impossible history cannot produce impossible forecasts");
ok(dirty.basis.pooledAttended === 480, "attendance is clamped to the RSVP count");

// --- 9. The worked case from the doc ---------------------------------------
// Six comparable events, roughly 80 RSVPs with 60 attending (75% conversion),
// forecasting an event with 90 RSVPs ⇒ about 67 people.
const worked = forecastAttendance({
  rsvps: 90,
  comparables: [
    { rsvps: 80, attended: 60 },
    { rsvps: 78, attended: 58 },
    { rsvps: 84, attended: 62 },
    { rsvps: 81, attended: 59 },
    { rsvps: 79, attended: 61 },
    { rsvps: 80, attended: 57 },
  ],
});
ok(
  Math.abs(worked.expected - 67) <= 1,
  `80-RSVP history at 75% ⇒ about 67 of 90: got ${worked.expected}`,
);
near(worked.basis.priorMean, 0.745, 0.02, "the pooled prior is the 74-75% conversion");
ok(worked.basis.comparables === 6, "basis reports six comparable events");
ok(worked.caveat === null, "six events is enough not to caveat");
ok(worked.lo < worked.expected && worked.expected < worked.hi, "a real interval, not a point");

// …and the food order on top of it. At 3:1 the order sits above the forecast.
const order = recommendFoodOrder({
  demand: worked.predictive,
  costRatio: { shortage: 3, surplus: 1 },
  expected: worked.expected,
});
near(order.fractile, 0.75, 1e-12, "3:1 ⇒ the 75th percentile");
ok(
  order.quantity > worked.expected,
  `3:1 orders above the forecast: ${order.quantity} vs ${worked.expected}`,
);
ok(
  order.quantity <= worked.hi,
  `…but not past the top of the predictive interval: ${order.quantity} vs ${worked.hi}`,
);
ok(
  order.shortfallProbabilityAtExpected > order.expectedShortfallProbability,
  "ordering for the forecast alone runs short more often than the recommendation does",
);

console.log(`${checks} forecast assertions passed.`);

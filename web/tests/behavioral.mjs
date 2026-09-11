// Verifies the behavioral-quant math against known values.
// Run: npm run test:behavioral
import assert from "node:assert/strict";
import {
  lgamma,
  betaCdf,
  betaQuantile,
  betaPosterior,
  peerPrior,
  peerZ,
  recencyWeight,
  ewma,
  momentum,
  informationCoefficient,
  informationRatio,
  signalVerdict,
} from "../lib/cec/behavioral.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const near = (a, b, tol, m) => ok(Math.abs(a - b) < tol, `${m}: ${a} vs ${b}`);

// --- gamma ------------------------------------------------------------------
near(Math.exp(lgamma(5)), 24, 1e-9, "Γ(5)=4!");
near(Math.exp(lgamma(0.5)), Math.sqrt(Math.PI), 1e-9, "Γ(1/2)=√π");
near(Math.exp(lgamma(10)), 362880, 1e-4, "Γ(10)=9!");

// --- beta CDF against closed forms ------------------------------------------
// Beta(1,1) is uniform: CDF(x)=x
near(betaCdf(0.3, 1, 1), 0.3, 1e-12, "uniform cdf");
// Beta(2,1): CDF(x)=x^2
near(betaCdf(0.5, 2, 1), 0.25, 1e-12, "Beta(2,1) cdf");
// Beta(1,2): CDF(x)=1-(1-x)^2
near(betaCdf(0.5, 1, 2), 0.75, 1e-12, "Beta(1,2) cdf");
// Symmetry: I_x(a,b) = 1 - I_{1-x}(b,a)
near(betaCdf(0.3, 4, 7), 1 - betaCdf(0.7, 7, 4), 1e-12, "symmetry");
// Known value: Beta(2,3) median ≈ 0.3857
near(betaQuantile(0.5, 2, 3), 0.38573, 1e-4, "Beta(2,3) median");
// Quantile inverts CDF
near(betaCdf(betaQuantile(0.8, 5, 9), 5, 9), 0.8, 1e-9, "quantile inverts cdf");

// --- posterior: the 9/10 vs 90/100 distinction ------------------------------
const small = betaPosterior(9, 1);
const large = betaPosterior(90, 10);
near(small.mean, 10 / 12, 1e-12, "9/10 with uniform prior -> 10/12");
near(large.mean, 91 / 102, 1e-12, "90/100 with uniform prior -> 91/102");
ok(
  small.width > 2.5 * large.width,
  `same rate, far wider interval with less data: ${small.width.toFixed(3)} vs ${large.width.toFixed(3)}`,
);
ok(small.shrinkage < large.shrinkage, "more data -> more weight on data");
near(betaPosterior(0, 0).mean, 0.5, 1e-12, "no data -> prior mean");
near(betaPosterior(0, 0).shrinkage, 0, 1e-12, "no data -> zero shrinkage weight");
ok(betaPosterior(0, 0).width > 0.9, "no data -> nearly the whole interval");

// --- empirical Bayes peer prior -----------------------------------------------
// A homogeneous, well-observed group yields a concentrated prior.
const tight = peerPrior([
  { successes: 80, failures: 20 },
  { successes: 78, failures: 22 },
  { successes: 82, failures: 18 },
  { successes: 79, failures: 21 },
  { successes: 81, failures: 19 },
]);
ok(tight.source === "peer", "enough people -> peer prior");
near(tight.alpha / (tight.alpha + tight.beta), 0.8, 0.02, "peer prior mean ~0.8");
ok(tight.alpha + tight.beta > 5, "homogeneous group -> concentrated prior");

// Too few people -> weak prior, honestly.
ok(peerPrior([{ successes: 5, failures: 5 }]).source === "weak", "1 person -> weak");

// Shrinkage pulls a thin record toward the peer mean, and a fat one barely moves.
const freshman = betaPosterior(1, 2, tight); // 33% on 3 observations
const veteran = betaPosterior(30, 60, tight); // 33% on 90 observations
ok(freshman.mean > 0.5, `freshman shrinks hard toward 0.8 peer: ${freshman.mean.toFixed(3)}`);
ok(
  Math.abs(veteran.mean - 1 / 3) < 0.1,
  `veteran barely moves from 0.33: ${veteran.mean.toFixed(3)}`,
);
ok(freshman.width > veteran.width, "freshman interval is wider");

// --- peer z ----------------------------------------------------------------
near(peerZ(10, [8, 9, 10, 11, 12]), 0, 1e-12, "at the mean -> z=0");
ok(peerZ(14, [8, 9, 10, 11, 12]) > 2, "well above -> large positive z");
ok(peerZ(10, [1, 2]) === null, "thin peer group -> null, not a fake number");
ok(peerZ(5, [5, 5, 5, 5]) === 0, "zero variance -> 0 rather than NaN");

// --- recency ---------------------------------------------------------------
near(recencyWeight(0, 60), 1, 1e-12, "today weighs 1");
near(recencyWeight(60, 60), 0.5, 1e-12, "one half-life weighs 0.5");
near(recencyWeight(120, 60), 0.25, 1e-12, "two half-lives weigh 0.25");
ok(ewma([], 30) === null, "empty series -> null");
near(ewma([{ value: 1, ageDays: 0 }, { value: 0, ageDays: 1e9 }], 30), 1, 1e-6, "ancient point vanishes");

// Momentum: recent uptick reads positive; recent drop reads negative.
const rising = [
  ...Array.from({ length: 10 }, (_, i) => ({ value: 0.2, ageDays: 200 - i })),
  ...Array.from({ length: 5 }, (_, i) => ({ value: 0.9, ageDays: 10 - i })),
];
ok(momentum(rising) > 0, "recent uptick -> positive momentum");
const falling = rising.map((p) => ({ ...p, value: 1 - p.value }));
ok(momentum(falling) < 0, "recent drop -> negative momentum");

// --- information coefficient ------------------------------------------------
near(informationCoefficient([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]), 1, 1e-12, "perfect monotone -> IC 1");
near(informationCoefficient([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1, 1e-12, "perfect inverse -> IC -1");
// Rank-based: a monotone but non-linear relationship still scores 1.
near(informationCoefficient([1, 2, 3, 4, 5], [1, 8, 27, 64, 125]), 1, 1e-12, "cubic still IC 1 (rank)");
// One outlier cannot dominate.
const icOut = informationCoefficient([1, 2, 3, 4, 100], [1, 2, 3, 4, 5]);
near(icOut, 1, 1e-12, "outlier in x does not break rank correlation");
ok(informationCoefficient([1, 2], [1, 2]) === null, "n<3 -> null");
// Noise -> near zero on a decent sample (deterministic pseudo-noise).
const xs = Array.from({ length: 200 }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 1);
const ys = Array.from({ length: 200 }, (_, i) => Math.sin(i * 78.233) * 12345.678 % 1);
ok(Math.abs(informationCoefficient(xs, ys)) < 0.15, `noise -> small IC: ${informationCoefficient(xs, ys).toFixed(3)}`);
// Ties handled with average ranks.
near(informationCoefficient([1, 1, 2, 2], [1, 1, 2, 2]), 1, 1e-12, "ties -> still 1");

// --- information ratio ------------------------------------------------------
ok(informationRatio([0.1, 0.1, 0.1, 0.1]) === null, "zero dispersion -> null, not Infinity");
ok(informationRatio([0.1, 0.12, 0.09, 0.11]) > 5, "consistent small IC -> high IR");
ok(informationRatio([0.3, -0.2, 0.25, -0.15]) < 1, "inconsistent IC -> low IR");
ok(informationRatio([0.2]) === null, "one window -> null");

// --- verdict: refuses to speak on thin data ---------------------------------
ok(signalVerdict(5, 0.9) === "insufficient_data", "n=5 -> insufficient even if IC looks huge");
ok(signalVerdict(100, null) === "insufficient_data", "null IC -> insufficient");
ok(signalVerdict(100, 0.02) === "no_signal", "tiny IC -> no signal");
ok(signalVerdict(100, 0.15) === "useful", "0.15 -> useful");
ok(signalVerdict(100, -0.25) === "strong", "sign does not matter for strength");

console.log(`${checks} behavioral-math assertions passed.`);

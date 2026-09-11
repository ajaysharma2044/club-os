// Pure behavioral-quant math. No database, no I/O.
//
// Everything a signal needs to be honest about itself lives here: a Beta
// posterior so 9/10 and 90/100 are never displayed the same; empirical-Bayes
// shrinkage so a freshman with three events borrows strength from peers; peer
// z-scores so a 90% rate is read against its context; and Spearman information
// coefficients so a signal has to prove it predicts an outcome before it ships.
//
// See docs/15-behavioral-quant-layer.md. Tested in tests/behavioral.mjs.

// ---------------------------------------------------------------- gamma/beta

// Lanczos approximation, good to ~1e-15 for x > 0.
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Continued fraction for the incomplete beta function (Lentz's method).
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 300,
    EPS = 3e-14,
    FPMIN = 1e-300;
  const qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let c = 1,
    d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) = P(Beta(a,b) <= x). */
export function betaCdf(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Inverse CDF by bisection; monotone, so this is exact to tolerance. */
export function betaQuantile(p: number, a: number, b: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------- rate signals

export type Posterior = {
  alpha: number;
  beta: number;
  n: number;
  mean: number;
  /** 95% credible interval */
  lo: number;
  hi: number;
  /** interval width; the honest measure of how little we know */
  width: number;
  /** share of the estimate coming from the data rather than the prior */
  shrinkage: number;
};

/**
 * Beta posterior for a success rate. Nine of ten and ninety of a hundred have
 * the same mean and wildly different intervals; the product must never show
 * them identically, and this is the object that carries the difference.
 */
export function betaPosterior(
  successes: number,
  failures: number,
  prior: { alpha: number; beta: number } = { alpha: 1, beta: 1 },
): Posterior {
  const alpha = prior.alpha + Math.max(0, successes);
  const beta = prior.beta + Math.max(0, failures);
  const n = Math.max(0, successes) + Math.max(0, failures);
  const lo = betaQuantile(0.025, alpha, beta);
  const hi = betaQuantile(0.975, alpha, beta);
  return {
    alpha,
    beta,
    n,
    mean: alpha / (alpha + beta),
    lo,
    hi,
    width: hi - lo,
    shrinkage: n / (n + prior.alpha + prior.beta),
  };
}

/**
 * Empirical-Bayes prior from a peer group, by method of moments with the
 * binomial sampling variance removed. This is the hierarchical step: a person
 * with few observations is pulled toward the peer mean by exactly as much as
 * the data justify, and the pull falls out of the variance ratio rather than
 * being a tuning knob.
 *
 * Returns a weak uniform-ish prior when the group is too small or too
 * homogeneous to say anything, which is the honest answer in year one.
 */
export function peerPrior(
  group: { successes: number; failures: number }[],
  minPeople = 3,
  // Ceiling on prior strength in pseudo-observations. When a group is so
  // homogeneous that between-person variance is indistinguishable from zero,
  // method-of-moments wants an absurdly concentrated prior that would override
  // a rich personal record. The prior's job is cold start, so it must never
  // outweigh a modest record: at 20, a person with 20 observations is weighted
  // 50/50 with peers and one with 90 is ~80% their own data.
  maxConcentration = 20,
): { alpha: number; beta: number; source: "peer" | "weak" } {
  const usable = group.filter((g) => g.successes + g.failures > 0);
  if (usable.length < minPeople) return { alpha: 1, beta: 1, source: "weak" };

  const rates = usable.map((g) => g.successes / (g.successes + g.failures));
  const ns = usable.map((g) => g.successes + g.failures);
  const m = rates.reduce((a, b) => a + b, 0) / rates.length;
  const obsVar =
    rates.reduce((a, r) => a + (r - m) ** 2, 0) / Math.max(1, rates.length - 1);
  // Expected within-person sampling variance at the pooled mean.
  const sampVar =
    ns.reduce((a, n) => a + (m * (1 - m)) / n, 0) / ns.length;
  const betweenVar = Math.max(obsVar - sampVar, 1e-6);
  const maxVar = m * (1 - m);
  if (betweenVar >= maxVar || m <= 0 || m >= 1)
    return { alpha: 1, beta: 1, source: "weak" };
  const k = (m * (1 - m)) / betweenVar - 1; // concentration alpha+beta
  const conc = Math.min(Math.max(k, 0.5), maxConcentration);
  return { alpha: m * conc, beta: (1 - m) * conc, source: "peer" };
}

// ------------------------------------------------------------ normalization

/** z-score against a peer distribution; null when the peer group is too thin. */
export function peerZ(
  value: number,
  peers: number[],
  minPeers = 4,
): number | null {
  const xs = peers.filter((v) => Number.isFinite(v));
  if (xs.length < minPeers) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(
    xs.reduce((a, v) => a + (v - m) ** 2, 0) / Math.max(1, xs.length - 1),
  );
  if (sd < 1e-9) return 0;
  return (value - m) / sd;
}

// ------------------------------------------------------------------- time

/** Exponential recency weight with a stated half-life. */
export function recencyWeight(deltaDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return 1;
  return Math.exp((-Math.LN2 * Math.max(0, deltaDays)) / halfLifeDays);
}

/** Exponentially weighted mean of a series of (value, age-in-days). */
export function ewma(
  points: { value: number; ageDays: number }[],
  halfLifeDays: number,
): number | null {
  let num = 0,
    den = 0;
  for (const p of points) {
    const w = recencyWeight(p.ageDays, halfLifeDays);
    num += w * p.value;
    den += w;
  }
  return den > 0 ? num / den : null;
}

/**
 * Behavioral momentum, borrowed from finance: short-window average minus
 * long-window average. Positive means recently doing more of this than usual.
 * The same construction the Club Health Index already uses for "form".
 */
export function momentum(
  points: { value: number; ageDays: number }[],
  shortHalfLife = 30,
  longHalfLife = 180,
): number | null {
  const s = ewma(points, shortHalfLife);
  const l = ewma(points, longHalfLife);
  return s === null || l === null ? null : s - l;
}

// --------------------------------------------------------- signal validity

function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1; // average rank for ties, 1-based
    for (let k = i; k <= j; k++) out[idx[k][1]] = r;
    i = j + 1;
  }
  return out;
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0,
    syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Information coefficient: Spearman rank correlation between a signal measured
 * at time t and an outcome observed later. Rank-based so a monotone but
 * non-linear relationship still registers, and outliers cannot dominate.
 */
export function informationCoefficient(
  signal: number[],
  outcome: number[],
): number | null {
  if (signal.length !== outcome.length || signal.length < 3) return null;
  return pearson(ranks(signal), ranks(outcome));
}

/**
 * Information ratio across evaluation windows: mean IC over its dispersion.
 * A signal that is right on average but wildly inconsistent has a low IR and
 * should not be trusted, no matter how good its best window looked.
 */
export function informationRatio(ics: (number | null)[]): number | null {
  const xs = ics.filter((v): v is number => v !== null && Number.isFinite(v));
  if (xs.length < 2) return null;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(
    xs.reduce((a, v) => a + (v - m) ** 2, 0) / (xs.length - 1),
  );
  return sd < 1e-9 ? null : m / sd;
}

/**
 * The verdict a signal fact sheet shows. Deliberately conservative: below the
 * minimum sample it says so rather than reporting a number that means nothing.
 */
export function signalVerdict(
  n: number,
  ic: number | null,
  minN = 20,
): "insufficient_data" | "no_signal" | "weak" | "useful" | "strong" {
  if (n < minN || ic === null) return "insufficient_data";
  const a = Math.abs(ic);
  if (a < 0.05) return "no_signal";
  if (a < 0.1) return "weak";
  if (a < 0.2) return "useful";
  return "strong";
}

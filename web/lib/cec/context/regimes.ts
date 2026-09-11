// Career and academic REGIMES for a cohort, and the timelines that define them.
//
// `context.ts` already answers "what is this campus doing this week" — move-in,
// prelims, finals, break. That regime is a property of a PLACE, and it is the
// same for everybody standing in it. This module answers a different question:
// what is THIS PERSON'S COHORT doing this week.
//
// A sophomore who has said they want investment banking is inside a recruiting
// regime in February that a sophomore pre-med on the same campus, in the same
// week, is simply not in. Collapsing the two into one campus regime is the
// omitted-variable bias docs/18 exists to fix, one level down: the model would
// charge the pre-med for a drop in attendance that belonged to somebody else's
// recruiting calendar.
//
// EXTENDS, DOES NOT DUPLICATE. Academic regimes stay in `context.ts` and are
// imported here. Nothing in this file re-detects finals.
//
// ---------------------------------------------------------------------------
// WHAT THIS MODULE REFUSES TO DO
//
// It does not hard-code one recruiting calendar as truth.
//
// There is a real temptation to write `if (month === 2 && year === sophomore)
// return "IB recruiting"` and be done. That would be wrong on the facts and
// wrong in structure. On the facts: the US investment-banking summer-analyst
// timeline moved twice in three years — accelerated into sophomore spring, then
// publicly pushed back by several large banks, then partially back again. Any
// single date written into code is already stale, and it would be stale
// silently. On structure: a timeline baked into a conditional cannot carry a
// source, cannot carry a confidence, cannot be overridden per institution, and
// cannot be replaced by something learned.
//
// So timelines are DATA. Every window is a `CareerRegimeDefinition` row with a
// `source` string and a `confidence`, and the default set below is explicitly a
// BOOTSTRAP PRIOR — stated, attributable, and meant to be replaced. The
// replacement is an empirical timeline estimated from observed application,
// interview and offer timestamps once enough cohorts exist to estimate one.
// Until then these are priors, they say so in every row, and nothing downstream
// is allowed to present them as measurement.
//
// Pure module. No database, no network, no clock beyond what the caller passes.

import type { Driver } from "../factors";
import { defineFactor } from "../factors";
import type { Regime } from "../context";
import { REGIMES } from "../context";

// ============================================================= career paths

/**
 * The career paths this engine will model at all.
 *
 * A closed list on purpose. An open string field would let a caller invent a
 * path, get a confident-looking zero, and never find out the engine had never
 * heard of it. `careerRegimeIntensity` returns null for anything not in here.
 */
export const CAREER_PATHS = [
  "investment_banking",
  "consulting",
  "software_engineering",
  "quant_trading",
  "product_management",
  "venture_capital",
  "private_equity",
  "medicine",
  "law",
  "phd",
  "government",
  "entrepreneurship",
] as const;
export type CareerPath = (typeof CAREER_PATHS)[number];

export function isCareerPath(v: unknown): v is CareerPath {
  return typeof v === "string" && (CAREER_PATHS as readonly string[]).includes(v);
}

/**
 * What KIND of pressure a window carries. The kind matters separately from the
 * intensity: "interviews" and "internship" can both sit at 0.9 and mean
 * completely different things for whether a person can run a club meeting.
 */
export const CAREER_REGIME_TYPES = [
  "networking", // coffee chats, info sessions, insight programmes — before anything opens
  "applications_open",
  "interviews",
  "offers", // decisions land; the waiting is the load
  "internship", // they are doing the job, usually off-campus
  "full_time_recruiting",
  "exam", // MCAT, LSAT, quals — a career regime that happens to look academic
  "quiet",
] as const;
export type CareerRegimeType = (typeof CAREER_REGIME_TYPES)[number];

// ================================================================ class years

export const CLASS_YEARS = ["freshman", "sophomore", "junior", "senior", "alum"] as const;
export type ClassYear = (typeof CLASS_YEARS)[number];

const DAY = 86400e3;

/**
 * Month (1-12) the US academic year turns over. August, because a cohort that
 * arrives in late August is already the next class year when it does.
 */
const ACADEMIC_YEAR_START_MONTH = 8;

/**
 * The graduation year of the cohort currently in its final year — i.e. the
 * calendar year in which the academic year containing `at` ends.
 */
export function academicYearEnding(at: string | Date): number | null {
  const d = at instanceof Date ? at : new Date(at);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const y = d.getUTCFullYear();
  return d.getUTCMonth() + 1 >= ACADEMIC_YEAR_START_MONTH ? y + 1 : y;
}

/**
 * Normalise whatever we were handed about graduation into a cohort key.
 *
 * A cohort is the graduation year, and it gets its own name because the two are
 * not guaranteed to stay the same thing: a five-year MEng or a co-op programme
 * graduates in year six and recruits on the four-year calendar, and when that
 * distinction starts mattering it belongs here rather than scattered across
 * every call site.
 *
 * Returns null on anything it cannot read. It does not guess a year from a
 * partial string.
 */
export function graduationYearToCohort(gradYear: unknown): number | null {
  if (typeof gradYear === "number")
    return Number.isInteger(gradYear) && gradYear >= 1900 && gradYear <= 2200 ? gradYear : null;
  if (typeof gradYear !== "string") return null;
  const m = gradYear.match(/\b(19|20|21)\d{2}\b/);
  if (!m) return null;
  const y = Number(m[0]);
  return y >= 1900 && y <= 2200 ? y : null;
}

/**
 * Where a person is in a four-year degree at a moment.
 *
 * Returns null — not "freshman" — when the date is more than four academic
 * years before graduation. A person five years out is on a five-year programme,
 * in a gap year, or not yet enrolled, and this function has no way to tell
 * which. Guessing "freshman" there would put a high-school student inside a
 * recruiting regime.
 */
export function classYear(gradYear: unknown, at: string | Date): ClassYear | null {
  const cohort = graduationYearToCohort(gradYear);
  const ending = academicYearEnding(at);
  if (cohort === null || ending === null) return null;
  const out = cohort - ending;
  if (out < 0) return "alum";
  if (out === 0) return "senior";
  if (out === 1) return "junior";
  if (out === 2) return "sophomore";
  if (out === 3) return "freshman";
  return null;
}

/** The academic year in which a given class year of a cohort STARTS (August). */
function academicStartYear(cohort: number, cy: ClassYear): number {
  const back: Record<ClassYear, number> = {
    senior: 1,
    junior: 2,
    sophomore: 3,
    freshman: 4,
    alum: 0,
  };
  return cohort - back[cy];
}

/**
 * Absolute ISO date for a (class year, month, day) inside a cohort's calendar.
 *
 * `yearShift` exists because the recruiting calendar does not respect the
 * academic one, and that is the substantive point rather than a formatting
 * inconvenience. Two windows in the default table cross the August boundary: a
 * junior-summer internship runs into the August AFTER junior year (+1), and the
 * quant junior cycle opens in the July BEFORE it (-1). Without an explicit
 * shift, the default Aug-Dec/Jan-Jul mapping would place each of them a year
 * out and the window would end before it began.
 */
function dateIn(
  cohort: number,
  cy: ClassYear,
  month: number,
  day: number,
  yearShift = 0,
): string {
  const startYear = academicStartYear(cohort, cy);
  // Aug-Dec sit in the first calendar year of the academic year; Jan-Jul in the second.
  const year = (month >= ACADEMIC_YEAR_START_MONTH ? startYear : startYear + 1) + yearShift;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ======================================================== regime definitions

/**
 * One dated window in which one career path makes one kind of demand on one
 * graduating cohort.
 *
 * Field names are snake_case because these rows are destined for a table in the
 * `factor_values` idiom of docs/20 §D, and a shape that changes case on its way
 * to storage is a shape that gets mismapped.
 *
 * `source` and `confidence` are not decoration. They are the difference between
 * "the calendar says" and "somebody told us once", and every consumer is
 * expected to carry them through.
 */
export type CareerRegimeDefinition = {
  career_path: CareerPath;
  /** Null means the window is not school-specific. A named school overrides. */
  institution?: string | null;
  /** Graduation year this window applies to. */
  graduation_cohort: number;
  effective_start: string;
  effective_end: string;
  regime_type: CareerRegimeType;
  /** 0..1 — how hard this window presses while it is open. */
  intensity: number;
  /** 0..1 — how much we believe the DATES, which is not how hard it presses. */
  confidence: number;
  /** Where this came from. A stated prior must say so, in these words. */
  source: string;
  /** When we learned it. Bitemporal, like everything else in this repo. */
  observed_at: string;
};

/**
 * A window expressed relative to a cohort rather than in absolute dates, so one
 * statement covers every class.
 */
export type CareerRegimePrior = {
  career_path: CareerPath;
  regime_type: CareerRegimeType;
  class_year: Exclude<ClassYear, "alum">;
  /** [month, day] and an optional calendar-year shift; see `dateIn`. */
  start: [month: number, day: number, yearShift?: number];
  end: [month: number, day: number, yearShift?: number];
  intensity: number;
  confidence: number;
  source: string;
  /** Why this window is where it is, in one sentence, for a reviewer. */
  note: string;
};

const PRIOR_STATED = "stated prior";
const OBSERVED_AT = "2026-01-01T00:00:00Z";

/**
 * THE BOOTSTRAP PRIORS.
 *
 * Four career paths, because four are the ones whose US undergraduate calendars
 * are publicly described well enough to state a prior about. The other eight
 * values in `CAREER_PATHS` are legal inputs with no default timeline, and
 * `careerRegimeIntensity` returns null for them rather than a shrug dressed up
 * as a zero.
 *
 * Confidences are low on purpose — none exceeds 0.6. These are readings of
 * publicly reported recruiting calendars, not estimates from observed cohort
 * behaviour, and the banking dates in particular have been revised twice in
 * three years by the banks themselves. A 0.45 here means: the shape of this
 * window is probably right, its edges are probably wrong by a few weeks, and
 * nothing consequential should be decided on the edges.
 *
 * The intended lifecycle of this table is deletion. Once application, interview
 * and offer timestamps exist for several cohorts, an empirical timeline is
 * estimable per (career_path, institution, cohort) and replaces these rows,
 * carrying `source: "empirical"` and a confidence that means something.
 */
export const CAREER_REGIME_PRIORS: CareerRegimePrior[] = [
  // ------------------------------------------------------ investment banking
  {
    career_path: "investment_banking",
    regime_type: "networking",
    class_year: "sophomore",
    start: [9, 1],
    end: [12, 15],
    intensity: 0.4,
    confidence: 0.4,
    source: `${PRIOR_STATED} — publicly reported US bulge-bracket and elite-boutique summer-analyst calendars, 2023-2025 cycles. Not fitted to any observed cohort.`,
    note: "Coffee chats and networking start a full semester before anything opens, and the chats are the part that actually costs evenings.",
  },
  {
    career_path: "investment_banking",
    regime_type: "applications_open",
    class_year: "sophomore",
    start: [1, 10],
    end: [4, 30],
    intensity: 0.95,
    confidence: 0.45,
    source: `${PRIOR_STATED} — accelerated summer-analyst recruiting for the junior-summer internship, as publicly described for the 2023-2025 cycles. Banks have moved these dates twice; treat the edges as uncertain.`,
    note: "The accelerated timeline is the defining feature of this path: the internship two summers away is decided in sophomore spring, which is why an IB-bound sophomore disappears in February.",
  },
  {
    career_path: "investment_banking",
    regime_type: "interviews",
    class_year: "sophomore",
    start: [2, 1],
    end: [6, 30],
    intensity: 0.85,
    confidence: 0.4,
    source: `${PRIOR_STATED} — superday and HireVue windows overlap applications on the accelerated calendar; reported 2023-2025.`,
    note: "Interviews overlap applications rather than following them, which is why the sophomore-spring peak is so sharp.",
  },
  {
    career_path: "investment_banking",
    regime_type: "internship",
    class_year: "junior",
    start: [6, 1],
    end: [8, 15, 1], // runs into the August after junior year
    intensity: 0.6,
    confidence: 0.55,
    source: `${PRIOR_STATED} — the summer analyst programme itself; ten weeks, off-campus, near-universal across the path.`,
    note: "Off-campus and consuming, but it is summer, so it displaces club work rather than competing with it.",
  },
  {
    career_path: "investment_banking",
    regime_type: "full_time_recruiting",
    class_year: "senior",
    start: [8, 20],
    end: [10, 31],
    intensity: 0.5,
    confidence: 0.35,
    source: `${PRIOR_STATED} — full-time recruiting for the minority without a return offer; most of the cohort is already placed.`,
    note: "Deliberately mild: the modal senior on this path already has an offer and this window does not apply to them.",
  },

  // -------------------------------------------------------------- consulting
  {
    career_path: "consulting",
    regime_type: "networking",
    class_year: "sophomore",
    start: [1, 15],
    end: [4, 15],
    intensity: 0.3,
    confidence: 0.35,
    source: `${PRIOR_STATED} — sophomore insight and diversity programmes run by the MBB firms, publicly advertised.`,
    note: "Real but narrow. Most of the cohort is not in it, which is what the low intensity says.",
  },
  {
    career_path: "consulting",
    regime_type: "applications_open",
    class_year: "junior",
    start: [8, 15],
    end: [10, 15],
    intensity: 0.9,
    confidence: 0.6,
    source: `${PRIOR_STATED} — MBB and tier-two summer-associate applications, US fall cycle. The most stable of the four calendars here.`,
    note: "Consulting has stayed on the junior-fall calendar while banking accelerated, which is why this confidence is the highest in the table.",
  },
  {
    career_path: "consulting",
    regime_type: "interviews",
    class_year: "junior",
    start: [10, 1],
    end: [11, 30],
    intensity: 0.95,
    confidence: 0.55,
    source: `${PRIOR_STATED} — case-interview rounds follow applications on the US fall cycle.`,
    note: "Case prep is the heaviest part and it lands directly on top of prelim season, which the campus regime handles separately.",
  },
  {
    career_path: "consulting",
    regime_type: "full_time_recruiting",
    class_year: "senior",
    start: [8, 15],
    end: [10, 31],
    intensity: 0.8,
    confidence: 0.5,
    source: `${PRIOR_STATED} — full-time associate recruiting on the same fall cycle as the internship.`,
    note: "Heavier than the banking equivalent because consulting converts fewer interns and recruits more seniors externally.",
  },

  // --------------------------------------------------- software engineering
  {
    career_path: "software_engineering",
    regime_type: "applications_open",
    class_year: "sophomore",
    start: [8, 15],
    end: [11, 30],
    intensity: 0.5,
    confidence: 0.4,
    source: `${PRIOR_STATED} — sophomore-eligible internship and early-career programmes at large US technology employers.`,
    note: "Unlike banking, sophomore SWE recruiting is for a sophomore-summer internship, not an accelerated shot at the junior one.",
  },
  {
    career_path: "software_engineering",
    regime_type: "applications_open",
    class_year: "junior",
    start: [8, 1],
    end: [11, 30],
    intensity: 0.8,
    confidence: 0.5,
    source: `${PRIOR_STATED} — US technology internship postings open in the autumn and fill on a rolling basis.`,
    note: "Rolling rather than dated, so this is a long plateau rather than a spike. The cost is spread out, not concentrated.",
  },
  {
    career_path: "software_engineering",
    regime_type: "interviews",
    class_year: "junior",
    start: [9, 15],
    end: [12, 15],
    intensity: 0.7,
    confidence: 0.4,
    source: `${PRIOR_STATED} — technical screens and onsite loops follow applications on a rolling basis.`,
    note: "Interview load here is self-paced study more than scheduled events, which spreads it out.",
  },
  {
    career_path: "software_engineering",
    regime_type: "full_time_recruiting",
    class_year: "senior",
    start: [8, 1],
    end: [11, 15],
    intensity: 0.75,
    confidence: 0.45,
    source: `${PRIOR_STATED} — new-grad requisitions open in the autumn of senior year.`,
    note: "New-grad hiring is volatile year to year; the dates are steadier than the volume.",
  },

  // ------------------------------------------------------------ quant trading
  {
    career_path: "quant_trading",
    regime_type: "networking",
    class_year: "freshman",
    start: [1, 15],
    end: [4, 15],
    intensity: 0.4,
    confidence: 0.35,
    source: `${PRIOR_STATED} — first-year discovery and diversity programmes run by proprietary trading firms, publicly advertised.`,
    note: "Quant is the only one of the four that reaches a freshman at all, which is the whole reason it is in this table.",
  },
  {
    career_path: "quant_trading",
    regime_type: "applications_open",
    class_year: "sophomore",
    start: [8, 15],
    end: [11, 15],
    intensity: 0.7,
    confidence: 0.4,
    source: `${PRIOR_STATED} — sophomore-year trading and research internship programmes at proprietary trading firms.`,
    note: "Earlier than banking's accelerated calendar and far earlier than consulting's.",
  },
  {
    career_path: "quant_trading",
    regime_type: "applications_open",
    class_year: "junior",
    start: [7, 1, -1], // opens in the July BEFORE junior year, while they are still a sophomore on the academic clock
    end: [10, 15],
    intensity: 0.95,
    confidence: 0.45,
    source: `${PRIOR_STATED} — the main junior-summer quant internship cycle, which opens over the preceding summer and closes early.`,
    note: "Opens in July, before term starts, and is largely closed by mid-October. A club recruiting quants in November is late.",
  },
  {
    career_path: "quant_trading",
    regime_type: "interviews",
    class_year: "junior",
    start: [8, 15],
    end: [11, 15],
    intensity: 0.9,
    confidence: 0.4,
    source: `${PRIOR_STATED} — multi-round quantitative and probability interviews follow applications immediately.`,
    note: "Preparation is heavy and solitary; it shows up as absence rather than as a visible calendar conflict.",
  },
];

/**
 * Instantiate the priors as dated rows for one graduating cohort.
 *
 * Every row it produces carries the prior's own `source` and `confidence`
 * untouched. Nothing in this function upgrades a prior into a measurement.
 */
export function defaultCareerRegimes(
  cohort: number,
  opts: { institution?: string | null; careerPaths?: CareerPath[] } = {},
): CareerRegimeDefinition[] {
  if (!Number.isInteger(cohort)) return [];
  const wanted = opts.careerPaths;
  return CAREER_REGIME_PRIORS.filter((p) => !wanted || wanted.includes(p.career_path)).map((p) => ({
    career_path: p.career_path,
    institution: opts.institution ?? null,
    graduation_cohort: cohort,
    effective_start: dateIn(cohort, p.class_year, p.start[0], p.start[1], p.start[2] ?? 0),
    effective_end: dateIn(cohort, p.class_year, p.end[0], p.end[1], p.end[2] ?? 0),
    regime_type: p.regime_type,
    intensity: p.intensity,
    confidence: p.confidence,
    source: p.source,
    observed_at: OBSERVED_AT,
  }));
}

/** Career paths the default table actually has a stated timeline for. */
export const CAREER_PATHS_WITH_PRIORS: CareerPath[] = [
  ...new Set(CAREER_REGIME_PRIORS.map((p) => p.career_path)),
];

// ============================================================ the computation

/**
 * Run-up before a window opens. Recruiting pressure does not switch on the
 * morning applications open — prep, referrals and rewriting a resume happen in
 * the fortnight before, and that fortnight is when club attendance starts to
 * slip.
 */
const RUN_UP_DAYS = 14;
/**
 * Fall-off after a window closes, deliberately shorter than the run-up. Relief
 * arrives faster than dread. Same asymmetry, and the same reasoning, as the
 * assessment kernels in `academicPressure`.
 */
const FALL_OFF_DAYS = 7;

export type CareerRegimeReading = {
  career_path: CareerPath;
  graduation_cohort: number;
  at: string;
  /** 0..1, bounded by construction. */
  intensity: number;
  /** The heaviest window open at `at`, or null when nothing is open. */
  regime_type: CareerRegimeType | null;
  class_year: ClassYear | null;
  /** Named contributions, the one Driver shape (docs/20 §B3). */
  drivers: Driver[];
  /**
   * 0..1 belief in the TIMELINE, carried separately from intensity on purpose.
   * Multiplying them would make an uncertain claim look like a mild one, and a
   * mild claim look uncertain. They are different facts and they travel apart.
   */
  confidence: number;
  /** How many dated windows we hold for this cohort and path. */
  definitions: number;
  /** Whether every contributing window is a stated prior rather than an estimate. */
  prior_only: boolean;
  reading: string;
};

/** Trapezoid: linear run-up, plateau across the window, faster fall-off. */
function windowWeight(t: number, start: number, end: number): number {
  if (t >= start && t <= end) return 1;
  if (t < start) {
    const lead = (start - t) / DAY;
    return lead <= RUN_UP_DAYS ? 1 - lead / RUN_UP_DAYS : 0;
  }
  const lag = (t - end) / DAY;
  return lag <= FALL_OFF_DAYS ? 1 - lag / FALL_OFF_DAYS : 0;
}

/**
 * How hard one career calendar is pressing on one cohort at one moment.
 *
 * Returns NULL, not zero, when we hold no timeline for that career path. Zero
 * means "the calendar is quiet right now", which is a real statement; null means
 * "we have never been told what this calendar looks like", which is a different
 * one. A product that renders both as 0.0 has thrown away the distinction that
 * decides whether an officer should trust the number.
 *
 * Overlapping windows combine as 1 - Π(1 - w·i) rather than by summing, so a
 * path whose applications and interviews overlap saturates toward 1 instead of
 * running past it. Same convention as `academicPressure`, deliberately, so two
 * pressure numbers in this codebase mean the same kind of thing.
 */
export function careerRegimeIntensity(
  career: string,
  cohort: number,
  at: string,
  definitions?: CareerRegimeDefinition[],
  opts: { institution?: string | null } = {},
): CareerRegimeReading | null {
  if (!isCareerPath(career)) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const cohortKey = graduationYearToCohort(cohort);
  if (cohortKey === null) return null;

  const all = definitions ?? defaultCareerRegimes(cohortKey, { institution: opts.institution });
  // An institution-specific window applies only when the caller named that
  // institution. We do not apply one school's calendar to an unnamed school.
  const rows = all.filter((d) => {
    if (d.career_path !== career) return false;
    if (d.graduation_cohort !== cohortKey) return false;
    if (!d.institution) return true;
    return !!opts.institution && d.institution === opts.institution;
  });
  if (!rows.length) return null;

  const cy = classYear(cohortKey, at);
  const contributions: { row: CareerRegimeDefinition; value: number }[] = [];
  for (const d of rows) {
    const start = Date.parse(d.effective_start);
    const end = Date.parse(d.effective_end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const w = windowWeight(t, start, end);
    if (w <= 0) continue;
    const v = Math.max(0, Math.min(1, d.intensity)) * w;
    if (v > 0.005) contributions.push({ row: d, value: v });
  }

  const combined = contributions.reduce((acc, c) => acc + c.value - acc * c.value, 0);
  const intensity = Number(Math.max(0, Math.min(1, combined)).toFixed(3));
  contributions.sort((a, b) => b.value - a.value);
  const top = contributions[0] ?? null;

  // Confidence in the timeline: the contribution-weighted mean confidence of the
  // windows that actually fired. When nothing fired, it is the mean confidence
  // of the rows we hold — we are exactly as sure that "nothing is happening" as
  // we are of the calendar that told us so.
  const weight = contributions.reduce((a, c) => a + c.value, 0);
  const confidence = Number(
    (weight > 0
      ? contributions.reduce((a, c) => a + c.value * c.row.confidence, 0) / weight
      : rows.reduce((a, r) => a + r.confidence, 0) / rows.length
    ).toFixed(3),
  );

  const drivers: Driver[] = contributions.map((c) => ({
    label: `${c.row.regime_type.replace(/_/g, " ")} (${c.row.career_path.replace(/_/g, " ")})`,
    contribution: Number(c.value.toFixed(3)),
  }));

  const sourceRows = contributions.length ? contributions.map((c) => c.row) : rows;
  const prior_only = sourceRows.every((r) => r.source.startsWith(PRIOR_STATED));

  const path = career.replace(/_/g, " ");
  const where = cy ? `${cy}s` : "this cohort";
  const hedge = prior_only
    ? " These dates are a stated prior from published recruiting calendars, not an estimate from observed behaviour; treat the edges as uncertain by a few weeks."
    : "";
  const reading =
    intensity >= 0.7
      ? `Peak ${path} recruiting for ${where} — ${top ? top.row.regime_type.replace(/_/g, " ") : "several windows"} is open. Expect optional commitments to lose to it.${hedge}`
      : intensity >= 0.35
        ? `${path.charAt(0).toUpperCase()}${path.slice(1)} recruiting is building for ${where}${top ? ` (${top.row.regime_type.replace(/_/g, " ")})` : ""}.${hedge}`
        : intensity > 0
          ? `${path.charAt(0).toUpperCase()}${path.slice(1)} recruiting is light for ${where} right now.${hedge}`
          : `No ${path} recruiting window is open for ${where} at this date.${hedge}`;

  return {
    career_path: career,
    graduation_cohort: cohortKey,
    at,
    intensity,
    regime_type: top ? top.row.regime_type : null,
    class_year: cy,
    drivers,
    confidence,
    definitions: rows.length,
    prior_only,
    reading,
  };
}

/**
 * The single heaviest career regime across every path a person has EXPLICITLY
 * named. It takes paths as an argument rather than reading them from anywhere,
 * because the decision about where an interest may come from is made once, in
 * `exposure.ts`, and is not re-litigated here.
 */
export function dominantCareerRegime(
  careers: string[],
  cohort: number,
  at: string,
  definitions?: CareerRegimeDefinition[],
  opts: { institution?: string | null } = {},
): CareerRegimeReading | null {
  let best: CareerRegimeReading | null = null;
  for (const c of careers) {
    const r = careerRegimeIntensity(c, cohort, at, definitions, opts);
    if (r && (!best || r.intensity > best.intensity)) best = r;
  }
  return best;
}

// ============================================== academic regimes, not redone

/**
 * Academic regimes are `context.ts`'s job and stay there. This is the one thing
 * this module adds to them: how much a given academic regime bears on a CAREER
 * calendar, which is a different question from how much it bears on turnout
 * (`REGIME_TURNOUT`) or on assessment pressure (`REGIME_BASELINE_PRESSURE`).
 *
 * A stated prior, coarse on purpose. Break is high because recruiting does not
 * observe the academic calendar — winter break is when banking superdays get
 * scheduled and when nobody can find anybody.
 */
export const REGIME_CAREER_OVERLAP: Record<Regime, number> = {
  move_in: 0.3,
  recruiting: 0.9, // club recruiting and career recruiting collide here by construction
  normal_term: 0.6,
  prelims: 0.8, // case prep on top of prelims is the worst fortnight of the year
  finals: 0.5,
  break: 0.7,
  graduation: 0.4,
};

/** Guard: every academic regime must have an overlap prior, or the table lies. */
export function regimeOverlapIsComplete(): boolean {
  return REGIMES.every((r) => typeof REGIME_CAREER_OVERLAP[r] === "number");
}

// ==================================================================== factor

export type CareerRecruitingInput = {
  career_path: string;
  graduation_cohort: number;
  definitions?: CareerRegimeDefinition[];
  institution?: string | null;
};

/**
 * Campus-scoped, because a cohort's recruiting calendar is a property of the
 * world rather than of a person: it is the same February for every sophomore
 * who chose banking, and nothing about it is derived from anybody's behaviour.
 * That is why it can be `public_context` while `recruiting_exposure` — the same
 * calendar, intersected with one person — cannot.
 */
export const careerRecruitingIntensityFactor = defineFactor<CareerRecruitingInput>({
  id: "career_recruiting_intensity",
  name: "Career recruiting intensity",
  description:
    "How hard a career path's recruiting calendar is pressing on one graduating cohort at a moment, 0..1.",
  entity: "campus",
  valueType: "index",
  hypothesis:
    "Optional club commitments lose attendance and follow-through during the peak recruiting window of the career path a cohort is recruiting into, over and above what the academic regime already explains.",
  supportedOutcomes: ["event_met_forecast", "member_active_next_term"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  // One dated window is enough to say something. Zero is not, and the compute
  // returns null there rather than letting this floor turn a gap into a zero.
  minimumSampleSize: 1,
  // A point-in-time state read off a calendar, not an average over observations.
  halfLifeDays: null,
  sources: ["career_regime_priors"],
  availableAt:
    "Recruiting windows are published or reported ahead of the cycle; a definition row carries observed_at and only rows with observed_at <= asOf may be passed in. Nothing here reads a person's record.",
  version: "1.0.0",
  // Never evaluated against an outcome. The priors are stated, not fitted, and
  // calling this anything better than experimental would be a claim we cannot back.
  status: "experimental",
  requires: ["career_path", "graduation_cohort"],
  compute: (input, asOf) => {
    const r = careerRegimeIntensity(
      input.career_path,
      input.graduation_cohort,
      asOf,
      input.definitions,
      { institution: input.institution ?? null },
    );
    if (!r) return null;
    return {
      value: r.intensity,
      n: r.definitions,
      drivers: r.drivers,
      basis: {
        regime_type: r.regime_type,
        class_year: r.class_year,
        timeline_confidence: r.confidence,
        prior_only: r.prior_only,
        reading: r.reading,
      },
    };
  },
  explain: (value, reading) => {
    if (value === null)
      return "We hold no recruiting timeline for that career path and cohort, so there is nothing to say about it. That is a gap, not a quiet week.";
    const note = typeof reading?.basis?.reading === "string" ? reading.basis.reading : "";
    return note || `Recruiting intensity ${value.toFixed(2)} on a 0-1 scale.`;
  },
});

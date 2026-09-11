// recommendSlot — "when should we hold this?"
//
// This is the payoff question. Everything else in the quant stack exists so
// that an officer staring at four possible Saturdays gets a straight answer
// with the reasoning attached, rather than a number they have to take on faith.
//
// ==========================================================================
// THE COMPOSITION RULE, which is the whole difficulty of this file.
//
// Two layers of this codebase price the same world in different arithmetic:
//
//   forecast.ts    applies ADDITIVE LOG-ODDS to a CONVERSION RATE on RSVPs,
//                  each term contrasted against the comparable-event pool.
//   context.ts,    return MULTIPLIERS on EXPECTED HEADCOUNT, referenced to a
//   academic.ts,   "normal term, no clashes" world.
//   weather.ts
//
// Multiplying a forecast by those multipliers is the obvious move and it is
// wrong, because several effects are priced in BOTH layers:
//
//   finals       ATTENDANCE_ADJUSTMENTS.finals is -0.90 log-odds, and
//                REGIME_TURNOUT.finals is 0.45. Applying both charges finals
//                twice: roughly 0.45 x 0.70 = 0.31 of baseline instead of the
//                0.45 either layer intends. That error is invisible until the
//                forecast is systematically wrong in exactly one regime.
//   competition  ATTENDANCE_ADJUSTMENTS.competingEvents and the exponential
//                decay in behaviouralAlpha both price clashes.
//   rain         ATTENDANCE_ADJUSTMENTS.precipitation and weatherFactor both
//                price precipitation.
//   the morning  ATTENDANCE_ADJUSTMENTS.hour.beforeNoon is documented as
//                "collides with classes and sleep", and academicFactor's
//                classFactor prices the class collision directly.
//
// THE CHOICE MADE HERE: work entirely in MULTIPLIER SPACE on an
// expected-headcount baseline, the way behaviouralAlpha does. forecast.ts is
// still used, because its Beta-Binomial conversion posterior with an
// empirical-Bayes prior is the only honest way to get a headcount and an
// interval out of an RSVP count — but it is called with the slot-dependent
// features DELIBERATELY STRIPPED. It sees food, lead time and the location
// change; it never sees the calendar, the competition, the weather, the day or
// the hour. Those are priced once, downstream, as multipliers.
//
// Why multiplier space rather than log-odds space:
//
//   1. The question is "how many people", and multipliers on a headcount are
//      directly readable as "18% fewer". Log-odds are not, and an officer
//      cannot audit what they cannot read.
//   2. The two layers have DIFFERENT REFERENCE POINTS. Log-odds terms are
//      contrasted against the comparable pool; multipliers are referenced to a
//      normal term with no clashes. Mixing them silently mixes two baselines,
//      which is a subtler bug than double-counting and much harder to find.
//   3. Three of the four effects above only exist as multipliers
//      (REGIME_TURNOUT, academicFactor, weatherFactor). Moving them into
//      log-odds would mean re-deriving three calibrated tables; moving the two
//      log-odds terms we keep into multipliers is one exact conversion at a
//      stated reference conversion rate.
//
// Day-of-week and hour ARE kept, because nothing in the multiplier layer
// prices "Saturday on a residential campus". They are converted out of
// ATTENDANCE_ADJUSTMENTS into multipliers at the baseline conversion rate,
// contrasted against the comparable pool exactly as forecast.ts contrasts
// them, and applied once. The pre-noon penalty is HALVED when a course heatmap
// is supplied, because the heatmap prices the class half of that constant
// directly and we keep only the sleep half.
//
// Every multiplier is a RATIO against explicitly stated baseline conditions
// (`BaselineConditions`), so a caller whose comparable events all happened
// during finals can say so and have the regime term divide out instead of
// charging them twice.
//
// Pure module. No database, no network. See factors.ts for the Prediction
// output standard.
// ==========================================================================

import {
  academicFactor,
  academicPressure,
  classConflict,
  type ConflictReading,
  type Heatmap,
  type PressureReading,
} from "../academic";
import { competingEvents, type CampusEvent } from "../campus";
import {
  detectRegime,
  REGIME_TURNOUT,
  type AcademicCalendar,
  type Regime,
} from "../context";
import {
  ATTENDANCE_ADJUSTMENTS,
  forecastAttendance,
  type ComparableEvent,
  type ForecastFeatures,
} from "../forecast";
import {
  computeFactor,
  defineFactor,
  type Driver,
  type FactorValue,
  type Prediction,
} from "../factors";
import { weatherAt, weatherFactor, type HourlyWeather, type WeatherFactor } from "../weather";
import { CAMPUS_ASSESSMENT_PRESSURE } from "./capacity";

// ---------------------------------------------------------------- constants

/**
 * Forecast features that do NOT depend on which slot is chosen. Only these
 * reach forecastAttendance; everything else is priced as a multiplier below.
 */
export const SLOT_INVARIANT_FEATURES = [
  "foodProvided",
  "foodAdvertised",
  "leadTimeDays",
  "locationChangedAfterAnnouncement",
] as const;

/**
 * Features deliberately withheld from the forecast, and where each one is
 * priced instead. Returned on every recommendation so the composition choice
 * is auditable rather than buried in this comment.
 */
export const REPRICED_FEATURES: Record<string, string> = {
  daysToFinals:
    "priced once by REGIME_TURNOUT plus academicFactor's excess-over-regime pressure term; applying the log-odds finals ramp as well would charge finals twice",
  weeksIntoTerm:
    "priced by REGIME_TURNOUT, which is already a statement about where in the term we are",
  competingEvents:
    "priced by the exponential competition decay, which keeps discriminating past the four events at which the log-odds floor saturates",
  precipitationProbability: "priced by weatherFactor",
  dayOfWeek: "converted to a multiplier here, so it is applied exactly once",
  hour: "converted to a multiplier here, halved when a course heatmap prices the class collision directly",
};

/**
 * Proportional turnout lost per competing campus event, as an exponential
 * decay. Same default and same reasoning as behaviouralAlpha in context.ts:
 * calibrated so a baseline of 100 against 50 clashes expects about 47.
 */
export const PER_COMPETITOR_DECAY = 0.015;

/**
 * Share of ATTENDANCE_ADJUSTMENTS.hour.beforeNoon attributable to class
 * collision rather than to sleep. Withheld when a heatmap prices the classes
 * directly. A stated prior; the constant bundles two effects and the roster
 * can only tell us about one of them.
 */
export const HOUR_CLASS_SHARE = 0.5;

/** Reference conversion rate used to convert log-odds into multipliers. */
export const REFERENCE_CONVERSION = 0.65;

/** Relative half-width used when a caller supplies a bare baseline headcount. */
const STATED_BASELINE_HALF_WIDTH = 0.25;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));
const logit = (p: number) => {
  const q = clamp(p, 1e-9, 1 - 1e-9);
  return Math.log(q / (1 - q));
};
const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Convert an additive log-odds effect on a conversion rate into a multiplier on
 * expected headcount, at a stated base conversion.
 *
 * Exact, not an approximation: headcount = rsvps x p, so the headcount ratio IS
 * the conversion ratio. The only judgement is which p to evaluate at, and that
 * is the forecast's own posterior mean wherever one exists.
 */
export function logOddsToMultiplier(delta: number, baseConversion: number): number {
  const p0 = clamp(baseConversion, 0.02, 0.98);
  return logistic(logit(p0) + delta) / p0;
}

// ------------------------------------------------------------------- inputs

/**
 * The conditions the BASELINE headcount is assumed to represent.
 *
 * Every multiplier below is a ratio against these, which is what stops the
 * second, subtler kind of double-count: if your comparable events all happened
 * during finals then the pooled conversion is already depressed, and charging
 * REGIME_TURNOUT.finals on top of it would halve a number that has already
 * been halved. Say so here and the regime term divides out.
 */
export type BaselineConditions = {
  regime: Regime;
  /** Competing events the comparable pool typically faced. */
  competing: number;
  /** Teaching intensity the comparable pool typically faced, 0..1. */
  classIntensity: number;
};

export const DEFAULT_BASELINE_CONDITIONS: BaselineConditions = {
  regime: "normal_term",
  competing: 0,
  classIntensity: 0,
};

export type SchedulingContext = {
  asOf: string;
  calendar: AcademicCalendar;
  /** Campus feed covering the candidate window. Empty is a claim of "quiet". */
  campusEvents: CampusEvent[];
  /** Credit-weighted teaching heatmap. Null when the roster is not ingested. */
  heatmap?: Heatmap | null;
  timeZoneOffsetHours?: number;
  weather?: HourlyWeather[] | null;
  outdoors?: boolean;

  /** Expected RSVPs. Whichever slot wins, the invitation list is the same. */
  rsvps?: number;
  /** Past comparable events, for the conversion posterior. */
  comparables?: ComparableEvent[];
  /**
   * Slot-invariant features only. Anything in REPRICED_FEATURES is stripped
   * here and reported back in `basis.strippedFeatures` rather than silently
   * ignored.
   */
  features?: Partial<ForecastFeatures>;

  /** Skip the forecast entirely and state the baseline headcount directly. */
  baselineAttendance?: number | null;
  /** Interval on that stated baseline. Without one, a stated width is assumed. */
  baselineInterval?: [number, number] | null;
  /** What the baseline is referenced to. Defaults to a normal term, no clashes. */
  baselineConditions?: Partial<BaselineConditions>;

  perCompetitor?: number;
  windowHours?: number;
  durationHours?: number;
};

// ------------------------------------------------------------------ factors

const COMPETING_EVENT_DENSITY = defineFactor<{ competing: number; at: string }>({
  id: "competing_event_density",
  name: "Competing event density",
  description:
    "How many uncancelled campus events overlap a proposed slot's window, from the public calendar feed.",
  entity: "campus",
  valueType: "count",
  hypothesis:
    "Each additional overlapping campus event removes a roughly constant proportion of the audience that would otherwise attend, with diminishing absolute effect.",
  supportedOutcomes: ["event_attendance"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["campus.events_feed"],
  availableAt:
    "Read from the published campus calendar as it stood at `asOf`. Events listed after that moment are not visible to it.",
  version: "1.0.0",
  status: "experimental",
  requires: ["competing", "at"],
  compute: (input) => ({ value: input.competing, n: 1 }),
  explain: (value) =>
    value === null
      ? "The campus calendar was not available for that window."
      : value === 0
        ? "Nothing else on the public campus calendar overlaps that slot."
        : `${value} other campus event${value === 1 ? "" : "s"} overlap that slot. The feed only shows what is published, so this is a floor.`,
});

const CLASS_CONFLICT_INTENSITY = defineFactor<{ intensity: number; at: string }>({
  id: "class_conflict_intensity",
  name: "Class conflict intensity",
  description:
    "Credit-weighted teaching scheduled at a proposed hour, as a share of the busiest teaching hour of the week.",
  entity: "campus",
  valueType: "index",
  hypothesis:
    "People physically in a lecture at that hour cannot attend, so turnout falls roughly in proportion to how much teaching is scheduled against the slot.",
  supportedOutcomes: ["event_attendance"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting"],
  minimumSampleSize: 1,
  halfLifeDays: null,
  sources: ["registrar.roster"],
  availableAt: "Read from the published course roster for the term containing the slot.",
  version: "1.0.0",
  status: "experimental",
  requires: ["intensity", "at"],
  compute: (input) => ({ value: r3(input.intensity), n: 1 }),
  explain: (value) =>
    value === null
      ? "No course roster was supplied, so we cannot say what is being taught then."
      : `Teaching scheduled then is about ${Math.round((value ?? 0) * 100)}% of the busiest hour of the week. This measures scheduled teaching, not students present.`,
});

// ------------------------------------------------------------------- output

export type SlotMultiplier = {
  /** Stable key, for tests and for downstream attribution. */
  term: string;
  label: string;
  /** Ratio against the baseline conditions. 1.0 is neutral. */
  multiplier: number;
};

export type SlotDriver = Driver & {
  term: string;
  /** The absolute multiplier this driver came from. */
  multiplier: number;
  /**
   * False when the condition hits every candidate equally. Shared conditions
   * still get named — "moderate exam pressure" is worth saying even when it
   * does not help you choose — but they do not pretend to discriminate.
   */
  differentiating: boolean;
};

export type SlotScore = {
  at: string;
  /** "Saturday 9 AM", in campus-local time. */
  label: string;
  weekday: number;
  hour: number;
  /** Expected attendance, with an interval. Never a bare number. */
  attendance: Prediction<number | null>;
  /** Everything applied between the baseline and the expectation, named. */
  multipliers: SlotMultiplier[];
  /** Product of the multipliers. What actually orders the slots. */
  totalMultiplier: number;
  positives: SlotDriver[];
  negatives: SlotDriver[];
  regime: Regime;
  competing: number;
  competingSample: { title: string; startsAt: string }[];
  conflict: ConflictReading | null;
  pressure: PressureReading | null;
  weather: WeatherFactor | null;
  reading: string;
};

export type SlotRecommendation = {
  asOf: string;
  ranked: SlotScore[];
  recommended: SlotScore | null;
  runnerUp: SlotScore | null;
  /**
   * True when the top two differ by more than a stated margin in MULTIPLIER
   * terms. See the note on `DECISIVE_MARGIN`.
   */
  decisive: boolean;
  basis: {
    /** Expected headcount under the baseline conditions. */
    baseline: number;
    baselineInterval: [number, number];
    baselineConversion: number;
    baselineConditions: BaselineConditions;
    comparables: number;
    baselineSource: "forecast" | "stated";
    /** Forecast features that were allowed through. */
    forecastFeatures: string[];
    /** Features withheld, and where each is priced instead. */
    strippedFeatures: { feature: string; repricedAs: string }[];
  };
  explanation: string;
  limitations: string[];
};

const MODEL = {
  name: "cec.planning.scheduling.recommendSlot",
  version: "1.0.0",
  featureVersion:
    "regime_turnout@context.ts+academic_factor@academic.ts+weather_factor@weather.ts+dow_hour@forecast.ts",
};

/**
 * How much better the top slot must be before the ranking is called decisive.
 *
 * Judged on the MULTIPLIER RATIO, not on the attendance intervals, and that is
 * a deliberate statistical point rather than a shortcut. Every candidate slot
 * shares one baseline headcount and therefore one baseline uncertainty; that
 * uncertainty is common-mode and cancels when slots are compared with each
 * other. The intervals on two slots can overlap almost completely while the
 * choice between them is still clear, because what differs between them is the
 * multiplier product alone. Ten per cent of expected turnout is the smallest
 * difference an officer can plausibly act on.
 */
export const DECISIVE_MARGIN = 1.1;

// ------------------------------------------------------------------ helpers

function localParts(at: string, tz: number): { weekday: number; hour: number } | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const local = new Date(t + tz * 3600e3);
  return { weekday: local.getUTCDay(), hour: local.getUTCHours() };
}

function slotLabel(weekday: number, hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${DAY_NAMES[weekday]} ${h12} ${hour < 12 ? "AM" : "PM"}`;
}

/** Mean log-odds a feature carried across comparables that recorded it. */
function poolBaseline(
  comparables: ComparableEvent[],
  read: (f: Partial<ForecastFeatures>) => number | null,
): number {
  const seen: number[] = [];
  for (const c of comparables) {
    if (!c.features) continue;
    const v = read(c.features);
    if (v !== null && Number.isFinite(v)) seen.push(v);
  }
  return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 0;
}

function hourDelta(hour: number, heatmapPresent: boolean): number {
  const A = ATTENDANCE_ADJUSTMENTS.hour;
  if (hour < 12)
    // The constant bundles class collision with sleep. When a roster tells us
    // the class collision directly, keep only the half it cannot tell us about.
    return heatmapPresent ? A.beforeNoon * (1 - HOUR_CLASS_SHARE) : A.beforeNoon;
  if (hour < 17) return A.afternoon;
  if (hour < 22) return A.evening;
  return A.lateNight;
}

function hourLabel(hour: number): string {
  return hour < 12
    ? "a morning start"
    : hour < 17
      ? "an afternoon start"
      : hour < 22
        ? "an evening start"
        : "a late-night start";
}

function pressureLabel(p: number): string {
  return p > 0.7 ? "heavy exam pressure" : p > 0.35 ? "moderate exam pressure" : "low exam pressure";
}

function median(xs: number[]): number {
  if (!xs.length) return 1;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// --------------------------------------------------------------- the model

/**
 * Rank candidate datetimes for one event.
 *
 * Baseline first, once, for all candidates: the Beta-Binomial conversion on
 * RSVPs, fed only slot-invariant features. Then per candidate, a product of
 * named multipliers — day, hour, regime, competition, class conflict, excess
 * assessment pressure, weather — each priced in exactly one place. The interval
 * is the baseline's own predictive interval carried through the same product,
 * which keeps it honest about what it does and does not include.
 */
export function recommendSlot(
  candidates: string[],
  context: SchedulingContext,
): SlotRecommendation {
  const asOf = context.asOf;
  const tz = context.timeZoneOffsetHours ?? -4;
  const perCompetitor = context.perCompetitor ?? PER_COMPETITOR_DECAY;
  const baseCond: BaselineConditions = {
    ...DEFAULT_BASELINE_CONDITIONS,
    ...(context.baselineConditions ?? {}),
  };
  const comparables = context.comparables ?? [];
  const heatmapPresent = !!context.heatmap;

  // --- 1. strip the slot-dependent features -------------------------------
  const supplied = context.features ?? {};
  const forecastFeatures: Partial<ForecastFeatures> = {};
  const strippedFeatures: { feature: string; repricedAs: string }[] = [];
  for (const key of Object.keys(supplied) as (keyof ForecastFeatures)[]) {
    if ((SLOT_INVARIANT_FEATURES as readonly string[]).includes(key)) {
      (forecastFeatures as Record<string, unknown>)[key] = supplied[key];
    } else if (REPRICED_FEATURES[key]) {
      strippedFeatures.push({ feature: key, repricedAs: REPRICED_FEATURES[key] });
    }
  }

  // --- 2. one baseline headcount for every candidate ----------------------
  let baseline: number;
  let baselineLo: number;
  let baselineHi: number;
  let baselineConversion: number;
  let baselineSource: "forecast" | "stated";
  let thinCaveat: string | null = null;

  if (typeof context.baselineAttendance === "number" && context.baselineAttendance >= 0) {
    baseline = context.baselineAttendance;
    const iv = context.baselineInterval;
    baselineLo = iv ? iv[0] : baseline * (1 - STATED_BASELINE_HALF_WIDTH);
    baselineHi = iv ? iv[1] : baseline * (1 + STATED_BASELINE_HALF_WIDTH);
    baselineConversion = REFERENCE_CONVERSION;
    baselineSource = "stated";
    if (!iv)
      thinCaveat =
        `The baseline of ${baseline} was stated rather than forecast and came with no interval, so a flat ±${Math.round(STATED_BASELINE_HALF_WIDTH * 100)}% is assumed. That width is a placeholder, not a measurement.`;
  } else {
    const f = forecastAttendance({
      rsvps: context.rsvps ?? 0,
      comparables,
      features: forecastFeatures,
    });
    baseline = f.expected;
    baselineLo = f.lo;
    baselineHi = f.hi;
    baselineConversion = f.conversionPosterior.mean;
    baselineSource = "forecast";
    thinCaveat = f.caveat;
  }

  if (!candidates.length)
    return {
      asOf,
      ranked: [],
      recommended: null,
      runnerUp: null,
      decisive: false,
      basis: {
        baseline,
        baselineInterval: [baselineLo, baselineHi],
        baselineConversion: r3(baselineConversion),
        baselineConditions: baseCond,
        comparables: comparables.length,
        baselineSource,
        forecastFeatures: Object.keys(forecastFeatures),
        strippedFeatures,
      },
      explanation: "No candidate slots were supplied, so there is nothing to compare.",
      limitations: ["No candidates."],
    };

  // Pool contrasts for the two log-odds terms we keep, computed exactly the way
  // forecast.ts computes them, so an effect already baked into the history is
  // not charged again.
  const dowPool = poolBaseline(comparables, (ft) =>
    typeof ft.dayOfWeek === "number"
      ? ATTENDANCE_ADJUSTMENTS.dayOfWeek[((Math.round(ft.dayOfWeek) % 7) + 7) % 7]
      : null,
  );
  const hourPool = poolBaseline(comparables, (ft) =>
    typeof ft.hour === "number" ? hourDelta(ft.hour, heatmapPresent) : null,
  );

  // Reference academic factor: what the baseline conditions themselves imply.
  // With the defaults this is 1.0, and the ratio below is then the slot's own
  // factor — but a caller whose comparables all sat in heavy teaching hours can
  // say so and have it divide out.
  const refAcademic = academicFactor({
    regime: baseCond.regime,
    conflict: {
      intensity: baseCond.classIntensity,
      weekday: 0,
      hour: 0,
      verdict: "clear",
      reading: "baseline reference",
    },
    pressure: null,
  });
  const refRegime = REGIME_TURNOUT[baseCond.regime] ?? 1;

  // --- 3. score every candidate -------------------------------------------
  const scored: SlotScore[] = [];
  const skipped: string[] = [];

  for (const at of candidates) {
    const parts = localParts(at, tz);
    if (!parts) {
      skipped.push(at);
      continue;
    }
    const { weekday, hour } = parts;

    const regimeReading = detectRegime(at, context.calendar);
    const comp = competingEvents(context.campusEvents, at, {
      windowHours: context.windowHours,
      durationHours: context.durationHours,
    });
    const conflict = context.heatmap ? classConflict(context.heatmap, at, tz) : null;
    const hasAssessmentDates =
      !!context.calendar.finalsStart || (context.calendar.prelimPeriods || []).length > 0;
    const pressure = hasAssessmentDates ? academicPressure(at, context.calendar) : null;
    const academic = academicFactor({ regime: regimeReading.regime, conflict, pressure });
    const hourWeather = context.weather ? weatherAt(context.weather, at) : null;
    const weather = hourWeather
      ? weatherFactor(hourWeather, {
          outdoors: context.outdoors,
          snow: (hourWeather.temperatureF ?? 40) <= 32,
        })
      : null;

    // Every effect, once, as a ratio against the baseline conditions.
    const mDow = logOddsToMultiplier(
      ATTENDANCE_ADJUSTMENTS.dayOfWeek[weekday] - dowPool,
      baselineConversion,
    );
    const mHour = logOddsToMultiplier(
      hourDelta(hour, heatmapPresent) - hourPool,
      baselineConversion,
    );
    const mRegime = (REGIME_TURNOUT[regimeReading.regime] ?? 1) / refRegime;
    const mCompete = Math.exp(-perCompetitor * Math.max(0, comp.count - baseCond.competing));
    const mClass = academic.classFactor / (refAcademic.classFactor || 1);
    const mPressure = academic.pressureFactor / (refAcademic.pressureFactor || 1);
    const mWeather = weather ? weather.factor : 1;

    const multipliers: SlotMultiplier[] = [
      { term: "day_of_week", label: DAY_NAMES[weekday], multiplier: r3(mDow) },
      { term: "hour", label: hourLabel(hour), multiplier: r3(mHour) },
      {
        term: "regime",
        label: regimeReading.regime.replace(/_/g, " "),
        multiplier: r3(mRegime),
      },
      {
        term: "competing_events",
        label: `${comp.count} competing campus event${comp.count === 1 ? "" : "s"}`,
        multiplier: r3(mCompete),
      },
      {
        term: "class_conflict",
        label: conflict ? `${conflict.verdict} class conflict` : "class conflict unknown",
        multiplier: r3(mClass),
      },
      {
        term: "academic_pressure",
        label: pressure ? pressureLabel(pressure.pressure) : "assessment pressure unknown",
        multiplier: r3(mPressure),
      },
      {
        term: "weather",
        label:
          weather && weather.components.length
            ? weather.components.map((c) => c.label).join(", ")
            : "weather",
        multiplier: r3(mWeather),
      },
    ];

    const total = multipliers.reduce((a, m) => a * m.multiplier, 1);
    const value = Math.round(baseline * total);
    // Round outward so the interval always contains the point estimate, for
    // every multiplier and every rounding mode.
    const lo = Math.max(0, Math.floor(baselineLo * total));
    const hi = Math.ceil(baselineHi * total);

    const factors: FactorValue[] = [
      computeFactor(COMPETING_EVENT_DENSITY, "campus", { competing: comp.count, at }, asOf),
    ];
    if (conflict)
      factors.push(
        computeFactor(CLASS_CONFLICT_INTENSITY, "campus", { intensity: conflict.intensity, at }, asOf),
      );
    if (pressure)
      factors.push(
        computeFactor(CAMPUS_ASSESSMENT_PRESSURE, "campus", { campusPressure: pressure.pressure }, asOf),
      );

    scored.push({
      at,
      label: slotLabel(weekday, hour),
      weekday,
      hour,
      attendance: {
        value,
        interval: [lo, hi],
        intervalMass: 0.95,
        asOf,
        model: MODEL,
        drivers: multipliers.map((m) => ({
          label: m.label,
          contribution: r3(m.multiplier - 1),
        })),
        factors,
        sampleSize: comparables.length,
        assumptions: [
          `Baseline of ${baseline} people is referenced to ${baseCond.regime.replace(/_/g, " ")}, ${baseCond.competing} competing events and a class intensity of ${baseCond.classIntensity}. Every multiplier below is a ratio against that.`,
          "Calendar, competition, weather, day and hour are priced once each, in multiplier space, and are withheld from the conversion model to avoid double-counting.",
          `Day-of-week and hour effects are converted from the log-odds constants in forecast.ts at a base conversion of ${r3(baselineConversion)} and contrasted against the comparable pool.`,
        ],
        limitations: [
          "The interval carries the uncertainty in the conversion rate and the RSVP count. It does not carry uncertainty in the multipliers themselves, all of which are stated priors rather than fitted estimates — so the true range is wider than this.",
          "The campus feed shows published events only. Anything unpublished competes for the same people and is invisible here.",
        ],
        status: comparables.length === 0 && baselineSource === "forecast" ? "prior_only" : "baseline_unvalidated",
        reading: `About ${value} people, and the honest range is ${lo} to ${hi}.`,
      },
      multipliers,
      totalMultiplier: r3(total),
      positives: [],
      negatives: [],
      regime: regimeReading.regime,
      competing: comp.count,
      competingSample: comp.sample.map((e) => ({ title: e.title, startsAt: e.startsAt })),
      conflict,
      pressure,
      weather,
      reading: "",
    });
  }

  if (!scored.length)
    return {
      asOf,
      ranked: [],
      recommended: null,
      runnerUp: null,
      decisive: false,
      basis: {
        baseline,
        baselineInterval: [baselineLo, baselineHi],
        baselineConversion: r3(baselineConversion),
        baselineConditions: baseCond,
        comparables: comparables.length,
        baselineSource,
        forecastFeatures: Object.keys(forecastFeatures),
        strippedFeatures,
      },
      explanation: `None of the ${candidates.length} candidate slots could be read as a time.`,
      limitations: ["No candidate slot parsed."],
    };

  // --- 4. drivers, relative to the choice set ------------------------------
  //
  // A driver answers "why this slot rather than the others", so it is scored
  // against the MEDIAN of the candidate set, not against 1.0. Otherwise a clear
  // Saturday morning would never show a positive driver at all — classFactor
  // caps at 1.0, so a quiet hour is neutral in absolute terms and only reads as
  // an advantage next to the alternatives. Conditions that hit every candidate
  // equally are still named, marked as non-differentiating, so "moderate exam
  // pressure" gets said even though it cannot help you choose.
  const terms = scored[0].multipliers.map((m) => m.term);
  const reference = new Map<string, number>();
  for (const t of terms)
    reference.set(
      t,
      scored.length > 1
        ? median(scored.map((s) => s.multipliers.find((m) => m.term === t)!.multiplier))
        : 1,
    );

  for (const s of scored) {
    for (const m of s.multipliers) {
      const ref = reference.get(m.term) || 1;
      const relative = ref > 0 ? m.multiplier / ref - 1 : 0;
      const differentiating = Math.abs(relative) > 0.02;
      if (differentiating && relative > 0)
        s.positives.push({
          term: m.term,
          label: positiveLabel(m.term, s),
          contribution: r3(relative),
          multiplier: m.multiplier,
          differentiating: true,
        });
      else if (differentiating && relative < 0)
        s.negatives.push({
          term: m.term,
          label: negativeLabel(m.term, s),
          contribution: r3(relative),
          multiplier: m.multiplier,
          differentiating: true,
        });
      else if (m.multiplier < 0.93)
        // Shared by every candidate, and still worth saying out loud.
        s.negatives.push({
          term: m.term,
          label: negativeLabel(m.term, s),
          contribution: r3(m.multiplier - 1),
          multiplier: m.multiplier,
          differentiating: false,
        });
    }
    s.positives.sort((a, b) => b.contribution - a.contribution);
    s.negatives.sort((a, b) => a.contribution - b.contribution);

    const pos = s.positives.slice(0, 2).map((d) => d.label);
    const neg = s.negatives.slice(0, 2).map((d) => d.label);
    s.reading =
      `${s.label}: about ${s.attendance.value} people (${(s.attendance.interval as [number, number])[0]}–${(s.attendance.interval as [number, number])[1]}).` +
      (pos.length ? ` In its favour: ${pos.join(", ")}.` : "") +
      (neg.length ? ` Against it: ${neg.join(", ")}.` : "") +
      (pos.length || neg.length ? "" : " Nothing about this slot stands out either way.");
  }

  const ranked = [...scored].sort(
    (a, b) => (b.attendance.value as number) - (a.attendance.value as number) ||
      b.totalMultiplier - a.totalMultiplier,
  );
  const recommended = ranked[0];
  const runnerUp = ranked[1] ?? null;
  const decisive =
    !!runnerUp && runnerUp.totalMultiplier > 0
      ? recommended.totalMultiplier / runnerUp.totalMultiplier >= DECISIVE_MARGIN
      : true;

  const limitations = [
    "Every multiplier here is a stated prior, sized from field evidence and reasoning, not a fitted coefficient. There is nowhere near enough history on one campus to fit seven of them.",
    "The interval reflects conversion and RSVP uncertainty only. The multipliers carry their own uncertainty, which is not in these numbers, so the real range is wider.",
    "The campus feed shows published events. Unpublished programming competes for the same people and is invisible.",
  ];
  if (thinCaveat) limitations.push(thinCaveat);
  if (!context.heatmap)
    limitations.push(
      "No course heatmap was supplied, so class conflict is not priced and a slot in the middle of the teaching day will look better than it is.",
    );
  if (!context.weather)
    limitations.push("No weather forecast covered these slots, so no weather adjustment was made.");
  if (skipped.length)
    limitations.push(`${skipped.length} candidate slot(s) could not be read as a time and were dropped.`);

  const iv = recommended.attendance.interval as [number, number];
  const pos = recommended.positives.slice(0, 2).map((d) => d.label);
  const neg = recommended.negatives.slice(0, 2).map((d) => d.label);
  const explanation =
    `Recommended ${recommended.label}, expected attendance ${recommended.attendance.value}, interval ${iv[0]}–${iv[1]}. ` +
    (pos.length
      ? `Positive drivers: ${pos.join(", ")}. `
      : "Nothing about this slot is an active advantage; it is simply the least bad of the ones offered. ") +
    (neg.length ? `Negative driver${neg.length > 1 ? "s" : ""}: ${neg.join(", ")}. ` : "") +
    (runnerUp
      ? decisive
        ? `That is about ${Math.round((recommended.totalMultiplier / runnerUp.totalMultiplier - 1) * 100)}% better than ${runnerUp.label}, which is a large enough gap to act on.`
        : `${runnerUp.label} is within ${Math.round(Math.abs(recommended.totalMultiplier / runnerUp.totalMultiplier - 1) * 100)}% of it, which is inside what this model can tell apart — pick between them on other grounds.`
      : "Only one slot was offered, so there is nothing to compare it against.");

  return {
    asOf,
    ranked,
    recommended,
    runnerUp,
    decisive,
    basis: {
      baseline,
      baselineInterval: [baselineLo, baselineHi],
      baselineConversion: r3(baselineConversion),
      baselineConditions: baseCond,
      comparables: comparables.length,
      baselineSource,
      forecastFeatures: Object.keys(forecastFeatures),
      strippedFeatures,
    },
    explanation,
    limitations,
  };
}

// ------------------------------------------------------------------- labels

function positiveLabel(term: string, s: SlotScore): string {
  switch (term) {
    case "class_conflict":
      return "strong schedule availability";
    case "competing_events":
      return s.competing === 0
        ? "nothing else on the campus calendar"
        : "low competing event density";
    case "academic_pressure":
      return "an academically quieter week than the alternatives";
    case "regime":
      return `${s.regime.replace(/_/g, " ")} is a stronger week for turnout`;
    case "weather":
      return s.weather?.components.length
        ? s.weather.components.map((c) => c.label).join(", ")
        : "better weather";
    case "day_of_week":
      return `${DAY_NAMES[s.weekday]} draws better than the alternatives`;
    case "hour":
      return `${hourLabel(s.hour)} draws better than the alternatives`;
    default:
      return term.replace(/_/g, " ");
  }
}

function negativeLabel(term: string, s: SlotScore): string {
  switch (term) {
    case "class_conflict":
      return s.conflict
        ? s.conflict.verdict === "heavy"
          ? "one of the busiest teaching hours of the week"
          : `${s.conflict.verdict} class conflict`
        : "class conflict";
    case "competing_events":
      return `${s.competing} competing campus event${s.competing === 1 ? "" : "s"}`;
    case "academic_pressure":
      return s.pressure ? pressureLabel(s.pressure.pressure) : "assessment pressure";
    case "regime":
      return `${s.regime.replace(/_/g, " ")}`;
    case "weather":
      return s.weather?.components.length
        ? s.weather.components.map((c) => c.label).join(", ")
        : "weather";
    case "day_of_week":
      return `${DAY_NAMES[s.weekday]} is a weak day on this campus`;
    case "hour":
      return `${hourLabel(s.hour)}`;
    default:
      return term.replace(/_/g, " ");
  }
}

/**
 * The finals double-count, as a number a test can assert on.
 *
 * `naiveProduct` is what you get by multiplying the forecast's finals log-odds
 * ramp by REGIME_TURNOUT.finals — the bug this module exists to avoid.
 * `applied` is what this module actually charges. The gap between them is the
 * size of the error, and it is not small.
 */
export function finalsDoubleCountCheck(baseConversion = REFERENCE_CONVERSION): {
  regimeOnly: number;
  logOddsOnly: number;
  naiveProduct: number;
} {
  const regimeOnly = REGIME_TURNOUT.finals;
  const logOddsOnly = logOddsToMultiplier(
    ATTENDANCE_ADJUSTMENTS.finals.fullPenalty,
    baseConversion,
  );
  return {
    regimeOnly,
    logOddsOnly: r3(logOddsOnly),
    naiveProduct: r3(regimeOnly * logOddsOnly),
  };
}

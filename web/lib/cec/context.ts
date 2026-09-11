// The Campus Context layer. Pure functions, no database, no network.
//
// Everything else in the quant stack models the world from inside the club:
// person, team, club, outcome. But clubs respond to an environment they do not
// control, and leaving it out is textbook omitted-variable bias — the model
// attributes an environmental effect to a person's execution.
//
//   Outcome = f(Person, Team, Club, CampusContext)
//
// The payoff is attribution. An event drawing 40 against an expectation of 100
// looks like failure until you know 50 other things ran that night and the
// career fair was the same evening, at which point the context-conditional
// expectation was 47 and the officers did fine. Equally, 200 people during
// finals when comparable events draw 80 is a genuinely remarkable result that a
// context-blind model would score as merely good.
//
//   BehaviouralAlpha = Actual − Expected(given context)
//
// See docs/18. Regimes come first because they are cheap, need only the
// academic calendar, and make every other signal conditional rather than
// absolute: a 45% activity drop in finals week does not mean what the same drop
// means in September.

import type { CampusEvent } from "./campus";
import type { AcademicFactor, Heatmap } from "./academic";
import { academicPressure, classConflict, academicFactor } from "./academic";
import type { HourlyWeather, WeatherFactor } from "./weather";
import { weatherAt, weatherFactor } from "./weather";

// ------------------------------------------------------------------ regimes

export const REGIMES = [
  "move_in",
  "recruiting",
  "normal_term",
  "prelims",
  "finals",
  "break",
  "graduation",
] as const;
export type Regime = (typeof REGIMES)[number];

/** Dated boundaries for one campus term. Curated per school, once a year. */
export type AcademicCalendar = {
  termStart: string;
  termEnd: string;
  classesEnd?: string;
  finalsStart?: string;
  finalsEnd?: string;
  /** midterm/prelim blocks, each {start, end} */
  prelimPeriods?: { start: string; end: string }[];
  breaks?: { start: string; end: string; label?: string }[];
  moveInEnd?: string;
  /** how many days after term start recruiting runs; Cornell is ~2 weeks */
  recruitingDays?: number;
};

const DAY = 86400e3;
const within = (t: number, a?: string, b?: string) =>
  !!a && !!b && t >= Date.parse(a) && t <= Date.parse(b);

export type RegimeReading = {
  regime: Regime;
  /** 0-1: how far through the term, clamped */
  termProgress: number;
  daysToFinals: number | null;
  /** plain-English note an officer can read */
  note: string;
};

/**
 * Which regime a date falls in. Order matters: breaks and finals dominate,
 * then prelims, then the early-term recruiting window.
 */
export function detectRegime(at: string, cal: AcademicCalendar): RegimeReading {
  const t = Date.parse(at);
  const start = Date.parse(cal.termStart);
  const end = Date.parse(cal.termEnd);
  const span = Math.max(1, end - start);
  const termProgress = Math.min(1, Math.max(0, (t - start) / span));
  const finalsStart = cal.finalsStart ? Date.parse(cal.finalsStart) : null;
  const daysToFinals =
    finalsStart === null ? null : Math.round((finalsStart - t) / DAY);

  let regime: Regime = "normal_term";
  if (t < start || t > end) regime = "break";
  else if ((cal.breaks || []).some((b) => within(t, b.start, b.end)))
    regime = "break";
  else if (within(t, cal.finalsStart, cal.finalsEnd)) regime = "finals";
  else if (cal.termEnd && within(t, cal.finalsEnd, cal.termEnd))
    regime = "graduation";
  else if (cal.moveInEnd && t <= Date.parse(cal.moveInEnd)) regime = "move_in";
  else if ((cal.prelimPeriods || []).some((p) => within(t, p.start, p.end)))
    regime = "prelims";
  else if (t <= start + (cal.recruitingDays ?? 21) * DAY) regime = "recruiting";

  const note =
    regime === "finals"
      ? "Finals. Turnout collapses campus-wide; judge nothing against a normal week."
      : regime === "prelims"
        ? "Prelim block. Expect materially lower turnout than a normal week."
        : regime === "recruiting"
          ? "Recruiting window. The busiest and most competitive weeks of the year."
          : regime === "break"
            ? "Break. Most students are not on campus."
            : regime === "move_in"
              ? "Move-in. High attention, low structure."
              : regime === "graduation"
                ? "End of term. Officers are leaving; transfer anything that matters now."
                : "Normal term.";

  return { regime, termProgress, daysToFinals, note };
}

/** Multiplier on expected turnout for each regime, before other features. */
export const REGIME_TURNOUT: Record<Regime, number> = {
  // Deliberately coarse and stated in one place rather than fitted. There is
  // nowhere near enough data to estimate seven regime effects, and pretending
  // otherwise would be the exact overfitting docs/04 warns about. These are
  // priors to be replaced by estimates once several terms exist.
  move_in: 1.05,
  recruiting: 1.15,
  normal_term: 1.0,
  prelims: 0.75,
  finals: 0.45,
  break: 0.2,
  graduation: 0.6,
};

// ------------------------------------------------------------ state vector

export type CampusState = {
  at: string;
  regime: Regime;
  termProgress: number;
  daysToFinals: number | null;
  /** events running campus-wide in the surrounding window */
  eventDensity: number;
  /** density relative to this campus's own typical day, 1.0 = typical */
  relativeDensity: number | null;
  /**
   * Campus-wide assessment pressure, 0..1. Null when no academic calendar
   * detail was supplied — a calendar with no prelim or finals dates cannot
   * support a pressure curve, and guessing one would be worse than saying so.
   */
  academicPressure: number | null;
  /**
   * How much teaching is scheduled at that hour, 0..1 against the busiest
   * teaching hour of the week. Null when no course heatmap was supplied.
   */
  classIntensity: number | null;
  /** the combined academic multiplier, or null when there is nothing to say */
  academic: AcademicFactor | null;
  /** the weather multiplier, or null when no forecast covers that hour */
  weather: WeatherFactor | null;
  note: string;
};

/**
 * C_t — the campus state at a moment. Everything here is derivable from an
 * academic calendar, a public events feed and a published course roster, so it
 * costs nothing per club and is shared by every club on that campus.
 *
 * The academic fields are optional and report null rather than a default when
 * their inputs are missing, so a club on a campus whose roster we have not
 * ingested gets an honest gap instead of a fabricated one.
 */
export function campusState(input: {
  at: string;
  calendar: AcademicCalendar;
  events: CampusEvent[];
  /** median events per comparable window, if known, for relative density */
  typicalDensity?: number;
  windowHours?: number;
  /** credit-weighted teaching heatmap for this campus, if ingested */
  heatmap?: Heatmap | null;
  /** hours from UTC at the campus, for reading the heatmap's local grid */
  timeZoneOffsetHours?: number;
  /** hourly forecast or reconstructed history covering this moment */
  weather?: HourlyWeather[] | null;
  /** an outdoor event is genuinely weather-dependent in a way indoors is not */
  outdoors?: boolean;
}): CampusState {
  const r = detectRegime(input.at, input.calendar);
  const w = (input.windowHours ?? 3) * 3600e3;
  const t = Date.parse(input.at);
  const density = input.events.filter((e) => {
    if (e.cancelled) return false;
    const s = Date.parse(e.startsAt);
    return Number.isFinite(s) && Math.abs(s - t) <= w;
  }).length;

  // Assessment pressure needs dated prelim or finals windows. A calendar that
  // carries only term bounds cannot support the curve.
  const hasAssessmentDates =
    !!input.calendar.finalsStart || (input.calendar.prelimPeriods || []).length > 0;
  const pressure = hasAssessmentDates
    ? academicPressure(input.at, input.calendar)
    : null;
  const conflict = input.heatmap
    ? classConflict(input.heatmap, input.at, input.timeZoneOffsetHours)
    : null;
  const academic =
    pressure || conflict
      ? academicFactor({ regime: r.regime, conflict, pressure })
      : null;

  // Only when a forecast hour actually covers this moment. An event outside the
  // forecast window gets null, not a neutral factor dressed up as a reading.
  const hour = input.weather ? weatherAt(input.weather, input.at) : null;
  const weather = hour
    ? weatherFactor(hour, {
        outdoors: input.outdoors,
        // Below freezing, precipitation falls as snow, which costs more.
        snow: (hour.temperatureF ?? 40) <= 32,
      })
    : null;

  return {
    at: input.at,
    regime: r.regime,
    termProgress: r.termProgress,
    daysToFinals: r.daysToFinals,
    eventDensity: density,
    relativeDensity:
      input.typicalDensity && input.typicalDensity > 0
        ? density / input.typicalDensity
        : null,
    academicPressure: pressure ? pressure.pressure : null,
    classIntensity: conflict ? conflict.intensity : null,
    academic,
    weather,
    note: r.note,
  };
}

// -------------------------------------------------------- behavioural alpha

export type Alpha = {
  actual: number;
  /** what a comparable event would draw in a normal week */
  baseline: number;
  /** what to expect given the regime, the competition and the academic week */
  expected: number;
  /** actual minus context-conditional expectation */
  alpha: number;
  /** alpha as a share of the context expectation */
  ratio: number | null;
  /**
   * Every multiplier applied between baseline and expectation, named. An
   * officer being told their event underperformed is entitled to see exactly
   * which conditions the model charged them for.
   */
  factors: { label: string; multiplier: number }[];
  verdict: "well_above" | "above" | "as_expected" | "below" | "well_below";
  reading: string;
};

/**
 * The attribution fix, and the reason this layer exists.
 *
 * Scoring an outcome against a context-free baseline blames officers for the
 * weather. Scoring against the context-conditional expectation isolates what
 * they actually contributed — which is what a quant would call alpha and what
 * an honest performance review would call fair.
 */
export function behaviouralAlpha(input: {
  actual: number;
  /** expectation for a comparable event in a normal week with no clashes */
  baseline: number;
  state: CampusState;
  /** competing events at that hour; falls back to the state's density */
  competing?: number;
  /** proportional turnout lost per competing event */
  perCompetitor?: number;
  /** academic multiplier; falls back to the state's own, then to neutral */
  academic?: number;
  /** weather multiplier; falls back to the state's own, then to neutral */
  weather?: number;
}): Alpha {
  const regimeFactor = REGIME_TURNOUT[input.state.regime] ?? 1;
  const competing = input.competing ?? input.state.eventDensity;
  // Diminishing, never negative: the tenth clash hurts less than the first,
  // and no amount of competition drives expected turnout below zero.
  //
  // The default is calibrated to the worked case in docs/18 — a baseline of
  // 100 against 50 competing events should expect roughly 47, so the rate is
  // -ln(0.47)/50 ≈ 0.015. It is a stated prior, not a fitted parameter: there
  // is nowhere near enough history to estimate it, and an earlier guess of
  // 0.03 was aggressive enough to score a genuinely poor night as a triumph.
  const decay = Math.exp(-(input.perCompetitor ?? 0.015) * Math.max(0, competing));
  // The academic multiplier is already expressed as EXCESS over what the regime
  // prices in (see academicFactor), so multiplying it here does not double-count
  // the regime term above.
  const academic = input.academic ?? input.state.academic?.factor ?? 1;
  // Bounded hard in weatherFactor, because an indoor event on a residential
  // campus is not twice as hard a sell in the rain, and a model free to claim
  // that would explain away every badly-run event as bad weather.
  const weather = input.weather ?? input.state.weather?.factor ?? 1;
  const expected = Math.max(0, input.baseline * regimeFactor * decay * academic * weather);
  const alpha = input.actual - expected;
  const ratio = expected > 0 ? alpha / expected : null;

  const factors = [
    { label: input.state.regime.replace(/_/g, " "), multiplier: Number(regimeFactor.toFixed(3)) },
    { label: `${competing} competing events`, multiplier: Number(decay.toFixed(3)) },
  ];
  if (academic !== 1)
    factors.push({
      label: input.state.academic?.reading ? "academic week" : "academic adjustment",
      multiplier: Number(academic.toFixed(3)),
    });
  if (weather !== 1)
    factors.push({
      label: input.state.weather?.components.length
        ? input.state.weather.components.map((c) => c.label).join(", ")
        : "weather",
      multiplier: Number(weather.toFixed(3)),
    });

  const verdict: Alpha["verdict"] =
    ratio === null
      ? "as_expected"
      : ratio > 0.5
        ? "well_above"
        : ratio > 0.15
          ? "above"
          : ratio < -0.5
            ? "well_below"
            : ratio < -0.15
              ? "below"
              : "as_expected";

  const academicNote =
    academic < 0.95
      ? input.state.classIntensity !== null && input.state.classIntensity > 0.5
        ? " and a heavy teaching hour"
        : " and the academic week"
      : academic > 1.05
        ? " and an academically quiet week"
        : "";
  const weatherNote = weather < 0.97 ? " and the weather" : "";
  const ctx =
    input.state.regime === "normal_term" && competing < 5 && !academicNote && !weatherNote
      ? ""
      : ` given ${input.state.regime.replace("_", " ")}${competing ? ` and ${competing} competing events` : ""}${academicNote}${weatherNote}`;

  return {
    actual: input.actual,
    baseline: input.baseline,
    expected: Math.round(expected),
    alpha: Math.round(alpha),
    ratio,
    factors,
    verdict,
    reading:
      verdict === "well_above"
        ? `${input.actual} against an expected ${Math.round(expected)}${ctx}. A genuinely strong result, and a context-blind view would have understated it.`
        : verdict === "above"
          ? `${input.actual} against an expected ${Math.round(expected)}${ctx}. Above what the night allowed for.`
          : verdict === "as_expected"
            ? `${input.actual} against an expected ${Math.round(expected)}${ctx}. About par for the conditions.`
            : verdict === "below"
              ? `${input.actual} against an expected ${Math.round(expected)}${ctx}. Somewhat below what the night allowed for.`
              : `${input.actual} against an expected ${Math.round(expected)}${ctx}. Well below; worth asking what happened beyond the calendar.`,
  };
}

// ------------------------------------------------------------ topic signals

/**
 * Recency-weighted intensity of a topic across campus events, so a club can be
 * told that its subject is unusually active right now.
 *
 * Matching is deliberately keyword-based and reported with the matched terms
 * attached. An opaque relevance score would be impossible for an officer to
 * argue with, and the failure mode of topic models on small corpora is
 * confident nonsense.
 */
export function topicIntensity(
  events: CampusEvent[],
  topics: Record<string, string[]>,
  at: string,
  halfLifeDays = 21,
): { topic: string; intensity: number; matches: number; examples: string[] }[] {
  const now = Date.parse(at);
  return Object.entries(topics)
    .map(([topic, terms]) => {
      const lowered = terms.map((t) => t.toLowerCase());
      let intensity = 0;
      const examples: string[] = [];
      let matches = 0;
      for (const e of events) {
        if (e.cancelled) continue;
        const hay = `${e.title} ${e.tags.join(" ")}`.toLowerCase();
        if (!lowered.some((t) => hay.includes(t))) continue;
        matches++;
        const ageDays = Math.abs(Date.parse(e.startsAt) - now) / DAY;
        intensity += Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
        if (examples.length < 3) examples.push(e.title);
      }
      return { topic, intensity: Number(intensity.toFixed(3)), matches, examples };
    })
    .sort((a, b) => b.intensity - a.intensity);
}

// The assembled factor registry.
//
// One place where every factor this system knows how to compute is declared and
// bound to the function that computes it. Everything here wraps code that
// ALREADY EXISTS and, until now, nothing called: `context.ts`, `academic.ts`,
// `weather.ts` and `campus.ts` are imported only by their own tests
// (docs/20 §B1). That is roughly 3,000 lines of tested, working model with no
// production caller, while the live forecast runs a featureless beta-binomial.
//
// This file is the bridge. It does not add new mathematics; it gives the
// existing mathematics a declaration, a hypothesis, a privacy class, a
// permitted-use list and a version, so that it can be stored, validated,
// replayed and — crucially — REFUSED when a caller asks for it for a purpose it
// was never cleared for.
//
// A NOTE ON THE SCALE MISMATCH, because it is the thing most likely to be got
// wrong by whoever extends this next:
//
//   `academicFactor` and `weatherFactor` return MULTIPLIERS on expected
//   headcount. `forecast.ts` applies ADDITIVE LOG-ODDS to a conversion rate.
//   These are different spaces and must not be multiplied together casually.
//
// Every factor below declares its `valueType` — `multiplier` or `log_odds` — so
// the mismatch is visible in the data rather than discovered in a wrong number.
// Composition is the caller's job, and the planning layer documents its choice.

import { defineFactor, FactorRegistry, type FactorDef } from "./factors";
import {
  detectRegime,
  REGIME_TURNOUT,
  type AcademicCalendar,
  type Regime,
} from "./context";
import {
  academicPressure,
  classConflict,
  academicFactor,
  REGIME_BASELINE_PRESSURE,
  type Heatmap,
} from "./academic";
import { weatherAt, weatherFactor, type HourlyWeather } from "./weather";
import { competingEvents, type CampusEvent } from "./campus";

// The version every factor in this file shares until one of them changes
// independently. Bumping it writes new rows rather than overwriting old ones,
// so decisions made under the previous version stay reproducible.
export const CONTEXT_FACTOR_VERSION = "1.0.0";

// ======================================================== campus competition

export type CompetingInput = { events: CampusEvent[]; at: string; excludeId?: string };

export const competingEventPressure = defineFactor<CompetingInput>({
  id: "competing_event_pressure",
  name: "Competing campus events",
  description:
    "How many other live events overlap the proposed window. Overlap, not merely start time, because a talk running 6-9pm competes with a 7pm meeting.",
  entity: "campus",
  valueType: "count",
  hypothesis:
    "Turnout falls as more campus programming overlaps the same window, with diminishing effect per additional clash.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "sponsor_ranking", "research"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["campus_events"],
  availableAt:
    "Campus calendar rows whose observed_at is at or before the decision time. A feed row ingested after the decision must not enter.",
  version: CONTEXT_FACTOR_VERSION,
  status: "experimental",
  requires: ["events", "at"],
  compute: (i) => {
    const r = competingEvents(i.events, i.at, { excludeId: i.excludeId });
    return {
      value: r.count,
      // The sample is the feed itself: zero rows means we do not know the
      // campus is quiet, only that we have no calendar for it.
      n: i.events.length,
      drivers: r.sample.map((e) => ({ label: e.title, contribution: 1 })),
      basis: { sampled: r.sample.length },
    };
  },
  explain: (v, r) =>
    v === null
      ? "No campus calendar for that window, so competition is unknown — not zero."
      : v === 0
        ? "Nothing else on the campus calendar overlaps that window."
        : `${v} other campus event${v === 1 ? "" : "s"} overlap that window${
            r?.drivers?.length ? `, including ${r.drivers[0].label}` : ""
          }.`,
});

// ============================================================ academic load

export type ConflictInput = { heatmap: Heatmap; at: string; offsetHours?: number };

export const classConflictIntensity = defineFactor<ConflictInput>({
  id: "class_conflict_intensity",
  name: "Teaching load at that hour",
  description:
    "Share of the busiest teaching hour of the week that is scheduled at the proposed time. People in a lecture cannot attend.",
  entity: "campus",
  valueType: "index",
  hypothesis:
    "Scheduling into a heavily-taught hour lowers turnout, independently of how busy the week is academically.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["course_roster"],
  availableAt:
    "The roster in effect at the decision time, never a later one. rosterAt() enforces this; a 2019 decision must be scored against the 2019 catalogue.",
  version: CONTEXT_FACTOR_VERSION,
  status: "experimental",
  requires: ["heatmap", "at"],
  compute: (i) => {
    const c = classConflict(i.heatmap, i.at, i.offsetHours);
    return {
      value: c.intensity,
      // Course-sections behind the grid. A heatmap built from nothing has no
      // authority to call an hour quiet.
      n: i.heatmap.sections,
      basis: { weekday: c.weekday, hour: c.hour, verdict: c.verdict },
    };
  },
  explain: (v, r) =>
    v === null
      ? "No course roster ingested for this campus, so class conflict is unknown."
      : `${String(r?.basis?.verdict ?? "")}: teaching at that hour runs at ${Math.round((v ?? 0) * 100)}% of the busiest hour of the week.`,
});

export type PressureInput = { calendar: AcademicCalendar; at: string };

export const assessmentPressure = defineFactor<PressureInput>({
  id: "assessment_pressure",
  name: "Assessment pressure",
  description:
    "Campus-wide coursework pressure, built as assessment kernels that rise before a prelim block and release faster afterwards.",
  entity: "campus",
  valueType: "index",
  hypothesis:
    "Optional-event turnout falls as assessment pressure rises, over and above the coarse effect of which regime the term is in.",
  supportedOutcomes: ["event_met_forecast", "member_active_next_term"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["academic_calendar"],
  availableAt:
    "The academic calendar is published before the term, so it is knowable at any decision time within it.",
  version: CONTEXT_FACTOR_VERSION,
  status: "experimental",
  requires: ["calendar", "at"],
  compute: (i) => {
    const hasDates =
      !!i.calendar.finalsStart || (i.calendar.prelimPeriods || []).length > 0;
    // A calendar carrying only term bounds cannot support a pressure curve, and
    // a flat zero would read as "an academically quiet week" rather than "we
    // do not have the dates".
    if (!hasDates) return null;
    const p = academicPressure(i.at, i.calendar);
    return {
      value: p.pressure,
      n: (i.calendar.prelimPeriods?.length ?? 0) + (i.calendar.finalsStart ? 1 : 0),
      drivers: p.drivers.map((d) => ({ label: d.label, contribution: d.contribution })),
      basis: { onBreak: p.onBreak },
    };
  },
  explain: (v, r) =>
    v === null
      ? "No prelim or finals dates on record for this term, so assessment pressure cannot be estimated."
      : r?.drivers?.length
        ? `Assessment pressure ${(v ?? 0).toFixed(2)}, driven mostly by ${r.drivers[0].label}.`
        : `Assessment pressure ${(v ?? 0).toFixed(2)}.`,
});

export type AcademicFactorInput = {
  regime: Regime;
  calendar: AcademicCalendar;
  at: string;
  heatmap?: Heatmap | null;
  offsetHours?: number;
};

export const academicTurnoutFactor = defineFactor<AcademicFactorInput>({
  id: "academic_turnout_factor",
  name: "Academic multiplier on turnout",
  description:
    "The combined class-conflict and excess-assessment multiplier on expected headcount, with the regime's own baseline pressure already netted out.",
  entity: "campus",
  // A MULTIPLIER, not a log-odds term. Stated in the data so a caller cannot
  // silently add it to a logit.
  valueType: "multiplier",
  hypothesis:
    "Expected turnout scales with an academic multiplier that is neutral for an ordinary week in a given regime and only bites when the week is unusual for that regime.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: 1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["academic_calendar", "course_roster"],
  availableAt: "Calendar and roster both knowable at the decision time.",
  version: CONTEXT_FACTOR_VERSION,
  status: "experimental",
  requires: ["regime", "calendar", "at"],
  compute: (i) => {
    const hasDates =
      !!i.calendar.finalsStart || (i.calendar.prelimPeriods || []).length > 0;
    const pressure = hasDates ? academicPressure(i.at, i.calendar) : null;
    const conflict = i.heatmap ? classConflict(i.heatmap, i.at, i.offsetHours) : null;
    // Nothing to say is not the same as "neutral, confidently".
    if (!pressure && !conflict) return null;
    const f = academicFactor({ regime: i.regime, conflict, pressure });
    return {
      value: f.factor,
      n: (i.heatmap?.sections ?? 0) + (pressure ? 1 : 0),
      drivers: [
        { label: "classes at that hour", contribution: f.classFactor },
        { label: "assessment pressure above this regime's normal", contribution: f.pressureFactor },
      ],
      basis: { regimeBaselinePressure: f.regimeBaselinePressure, reading: f.reading },
    };
  },
  explain: (v, r) =>
    v === null
      ? "Neither a calendar nor a roster is available, so no academic adjustment is made."
      : String(r?.basis?.reading ?? `Academic multiplier ${(v ?? 1).toFixed(2)}.`),
});

// ==================================================================== weather

export type WeatherInput = {
  hours: HourlyWeather[];
  at: string;
  outdoors?: boolean;
};

export const weatherTurnoutFactor = defineFactor<WeatherInput>({
  id: "weather_turnout_factor",
  name: "Weather multiplier on turnout",
  description:
    "Bounded multiplier on expected headcount from apparent temperature and precipitation. About the walk, not the forecast.",
  entity: "campus",
  valueType: "multiplier",
  hypothesis:
    "Unpleasant walking conditions reduce turnout for optional events, by a small and bounded amount indoors and a larger one outdoors.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: 1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "sponsor_ranking", "research"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["nws_forecast"],
  availableAt:
    "The FORECAST available at the decision time, not the realised weather. Scoring a planning decision against what actually happened would credit the planner with hindsight.",
  version: CONTEXT_FACTOR_VERSION,
  status: "experimental",
  requires: ["hours", "at"],
  compute: (i) => {
    const hour = weatherAt(i.hours, i.at);
    // Outside the forecast window is unknown, not fair weather.
    if (!hour) return null;
    const f = weatherFactor(hour, {
      outdoors: i.outdoors,
      snow: (hour.temperatureF ?? 40) <= 32,
    });
    if (f.confidence === "none") return null;
    return {
      value: f.factor,
      n: i.hours.length,
      drivers: f.components.map((c) => ({ label: c.label, contribution: c.multiplier })),
      basis: { reading: f.reading },
    };
  },
  explain: (v, r) =>
    v === null
      ? "No forecast covers that hour, so no weather adjustment is made."
      : String(r?.basis?.reading ?? `Weather multiplier ${(v ?? 1).toFixed(2)}.`),
});

// ===================================================================== regime

export type RegimeInput = { calendar: AcademicCalendar; at: string };

export const regimeTurnoutPrior = defineFactor<RegimeInput>({
  id: "regime_turnout_prior",
  name: "Regime turnout prior",
  description:
    "The coarse multiplier for what time of term it is: recruiting, normal term, prelims, finals, break.",
  entity: "campus",
  valueType: "multiplier",
  hypothesis:
    "Which regime the term is in explains a large share of turnout variance before any finer feature is considered.",
  supportedOutcomes: ["event_met_forecast", "member_active_next_term"],
  expectedSign: 1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "sponsor_ranking", "research"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["academic_calendar"],
  availableAt: "The calendar is published before the term begins.",
  version: CONTEXT_FACTOR_VERSION,
  status: "experimental",
  requires: ["calendar", "at"],
  compute: (i) => {
    const r = detectRegime(i.at, i.calendar);
    return {
      value: REGIME_TURNOUT[r.regime] ?? 1,
      n: 1,
      drivers: [{ label: r.regime.replace(/_/g, " "), contribution: REGIME_TURNOUT[r.regime] ?? 1 }],
      basis: {
        regime: r.regime,
        termProgress: r.termProgress,
        daysToFinals: r.daysToFinals,
        note: r.note,
        // Carried so a consumer combining this with assessment_pressure can see
        // what has ALREADY been priced in and avoid charging finals twice.
        baselinePressure: REGIME_BASELINE_PRESSURE[r.regime] ?? 0.15,
      },
    };
  },
  explain: (v, r) => String(r?.basis?.note ?? `Regime multiplier ${(v ?? 1).toFixed(2)}.`),
});

// =================================================================== assembly

/**
 * Build the registry. A function rather than a module-level singleton so tests
 * get a clean one and so a future multi-institution build can vary which
 * factors are in play per campus.
 */
export function contextRegistry(): FactorRegistry {
  const r = new FactorRegistry();
  for (const f of CONTEXT_FACTORS) r.register(f);
  return r;
}

export const CONTEXT_FACTORS: FactorDef<any>[] = [
  competingEventPressure,
  classConflictIntensity,
  assessmentPressure,
  academicTurnoutFactor,
  weatherTurnoutFactor,
  regimeTurnoutPrior,
];

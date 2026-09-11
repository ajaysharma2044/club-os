// Assembling the whole context for one club at one moment.
//
// This is the call a planner, a UI or a backtest makes. Everything below it is
// already built and tested; what was missing was the place where a club id and
// a timestamp turn into a complete, stored, auditable picture.
//
// The shape of the problem, stated once:
//
//   club id + moment
//        ↓  institutions.ts     which campus, which calendar, which offset
//        ↓  academic.ts         what is being taught at that hour
//        ↓  campus.ts           what else is running
//        ↓  weather.ts          what the walk is like
//        ↓  registry.ts         each of those, declared and versioned
//        ↓  factor-store.ts     persisted point-in-time, refusals included
//   an explained expectation
//
// TWO THINGS THIS DELIBERATELY DOES NOT DO.
//
// It does not fetch. Every input is passed in, so the whole assembly is a pure
// function of its arguments plus the factor store, which means a backtest can
// replay a decision from 2019 by handing it 2019's roster and 2019's feed.
// The moment this file calls the network, that property is gone.
//
// It does not combine the factors into a single number. Composition is the
// planning layer's job and is documented there, because the factors are on two
// different scales — multipliers on headcount versus counts — and hiding that
// behind a convenience wrapper is how the double-count bugs get written.

import { club, institution, calendarAt, offsetHoursAt, type ClubIdentity } from "./institutions";
import { campusState, type CampusState } from "./context";
import { meetingHeatmap, rosterAt, type Course, type Heatmap } from "./academic";
import type { CampusEvent } from "./campus";
import type { HourlyWeather } from "./weather";
import { computeFactor, type FactorValue } from "./factors";
import {
  CONTEXT_FACTORS,
  competingEventPressure,
  classConflictIntensity,
  assessmentPressure,
  academicTurnoutFactor,
  weatherTurnoutFactor,
  regimeTurnoutPrior,
} from "./registry";
import { writeFactorValue } from "./factor-store";

export type ContextInputs = {
  /** Courses for the roster IN EFFECT at `at`, not today's catalogue. */
  courses?: Course[] | null;
  /** Campus calendar rows already filtered to observed_at <= at. */
  events?: CampusEvent[] | null;
  /** The forecast that was available at the decision time. */
  weather?: HourlyWeather[] | null;
  /** Exclude the club's own event from its own competition count. */
  excludeEventId?: string;
  outdoors?: boolean;
};

export type ClubContext = {
  club: ClubIdentity;
  institutionId: string;
  at: string;
  /** null when no configured term covers this moment */
  term: string | null;
  offsetHours: number;
  state: CampusState | null;
  heatmap: Heatmap | null;
  factors: FactorValue[];
  /** what could not be computed, and why — gaps are stated, never filled in */
  gaps: { factor: string; reason: string }[];
  reading: string;
};

/**
 * Compute every context factor for a club at a moment.
 *
 * `persist: false` is the backtest mode — compute without writing, so replaying
 * history does not pollute the store with rows stamped as if we had known
 * things at the time.
 */
export function assembleContext(
  clubIdOrSlug: string,
  at: string,
  inputs: ContextInputs = {},
  opts: { persist?: boolean } = {},
): ClubContext {
  const c = club(clubIdOrSlug);
  if (!c) throw new Error(`Unknown club "${clubIdOrSlug}".`);
  const inst = institution(c.institutionId);
  if (!inst) throw new Error(`Club "${c.id}" names an unconfigured institution.`);

  const persist = opts.persist !== false;
  const offsetHours = offsetHoursAt(inst, at);
  const term = calendarAt(c.institutionId, at);

  // Restrict teaching to the departments the club actually draws from. A
  // business club's members are not in organic chemistry labs, and averaging
  // over the whole catalogue washes out the signal that matters.
  const heatmap =
    inputs.courses && inputs.courses.length
      ? meetingHeatmap(inputs.courses, { subjects: c.drawsFrom })
      : null;

  const events = inputs.events ?? [];
  const factors: FactorValue[] = [];
  const gaps: { factor: string; reason: string }[] = [];

  const run = <I>(def: (typeof CONTEXT_FACTORS)[number], input: I) => {
    const v = computeFactor(def as any, c.institutionId, input, at);
    factors.push(v);
    if (v.value === null) gaps.push({ factor: v.factor, reason: v.reading });
    if (persist) writeFactorValue(v, { occurredAt: at, observedAt: at });
    return v;
  };

  // Regime first: the academic factor needs it, and it carries the baseline
  // pressure already priced in so the two cannot double-count.
  const regime = term
    ? run(regimeTurnoutPrior, { calendar: term.calendar, at })
    : null;
  if (!term)
    gaps.push({
      factor: "regime_turnout_prior",
      reason: `No configured term covers ${at} for ${inst.name}. Add one to institutions.ts rather than assuming a normal week.`,
    });

  if (term) {
    run(assessmentPressure, { calendar: term.calendar, at });
    run(academicTurnoutFactor, {
      regime: (regime?.basis?.regime as any) ?? "normal_term",
      calendar: term.calendar,
      at,
      heatmap,
      offsetHours,
    });
  }
  if (heatmap) run(classConflictIntensity, { heatmap, at, offsetHours });
  else
    gaps.push({
      factor: "class_conflict_intensity",
      reason: "No course roster supplied for this moment, so class conflict is unknown rather than clear.",
    });

  run(competingEventPressure, { events, at, excludeId: inputs.excludeEventId });
  if (inputs.weather?.length)
    run(weatherTurnoutFactor, { hours: inputs.weather, at, outdoors: inputs.outdoors });
  else
    gaps.push({
      factor: "weather_turnout_factor",
      reason: "No forecast supplied for this moment, so no weather adjustment is made.",
    });

  const state = term
    ? campusState({
        at,
        calendar: term.calendar,
        events,
        heatmap,
        timeZoneOffsetHours: offsetHours,
        weather: inputs.weather ?? null,
        outdoors: inputs.outdoors,
      })
    : null;

  const spoke = factors.filter((f) => f.value !== null).length;
  return {
    club: c,
    institutionId: c.institutionId,
    at,
    term: term?.term ?? null,
    offsetHours,
    state,
    heatmap,
    factors,
    gaps,
    reading: state
      ? `${state.note} ${spoke} of ${factors.length} context factors could be computed${
          gaps.length ? `; ${gaps.length} could not and are listed rather than assumed.` : "."
        }`
      : `No configured academic term covers ${at}, so the campus state is unknown. ${gaps.length} factors could not be computed.`,
  };
}

/**
 * The roster code to use for a moment, so a caller loading courses does not
 * silently hand a 2026 catalogue to a 2019 replay.
 */
export function rosterFor(clubIdOrSlug: string, at: string, available: string[]): string | null {
  const c = club(clubIdOrSlug);
  if (!c) return null;
  return rosterAt(at, available);
}

/**
 * Compare candidate times on context alone.
 *
 * Deliberately returns the factors per slot rather than a ranked winner. What
 * "best" means depends on the event — an outdoor run and an indoor workshop
 * weigh weather completely differently — and that judgement belongs with the
 * planner that knows the event type, not here.
 */
export function contextAcrossSlots(
  clubIdOrSlug: string,
  slots: string[],
  inputs: ContextInputs = {},
  opts: { persist?: boolean } = {},
): ClubContext[] {
  return slots.map((at) => assembleContext(clubIdOrSlug, at, inputs, opts));
}

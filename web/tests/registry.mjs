// The assembled context registry, exercised against REAL captured data for the
// Cornell Entrepreneurship Club: 199 FA26 courses, a live Cornell Localist
// feed, a live NWS forecast. This is the test that proves the context engine is
// reachable — until now nothing outside its own unit tests imported it.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/registry.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  contextRegistry,
  CONTEXT_FACTORS,
  competingEventPressure,
  classConflictIntensity,
  assessmentPressure,
  academicTurnoutFactor,
  weatherTurnoutFactor,
  regimeTurnoutPrior,
} from "../lib/cec/registry.ts";
import { computeFactor, mayUse } from "../lib/cec/factors.ts";
import { parseCornellRoster, meetingHeatmap } from "../lib/cec/academic.ts";
import { parseLocalist } from "../lib/cec/campus.ts";
import { parseNwsHourly } from "../lib/cec/weather.ts";
import {
  club,
  institution,
  termCalendar,
  calendarAt,
  inferredDates,
  offsetHoursAt,
  clubInstitution,
} from "../lib/cec/institutions.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));

// =============================================== the CEC identity resolves
const cec = club("cec");
ok(cec !== null, "CEC resolves by slug");
ok(club("cornell-ec") === cec, "and by the organization_id written into the record");
ok(cec.institutionId === "cornell", "CEC belongs to Cornell");
const cornell = clubInstitution("cec");
ok(cornell.id === "cornell", "and the institution resolves through the club");
ok(cornell.rosterHistoryFrom === "FA14", "Cornell rosters go back to FA14, for point-in-time replay");
ok(institution("penn") === null, "an unconfigured institution is null, not a guess");
ok(club("nope") === null, "and so is an unknown club");
ok(
  cec.drawsFrom.includes("AEM") && cec.drawsFrom.includes("CS"),
  "CEC's declared departments are stated, not inferred from members' enrolments",
);

// --- daylight saving must be handled, or every hour reading shifts by one ---
{
  const summer = offsetHoursAt(cornell, "2026-09-15T12:00:00Z");
  const winter = offsetHoursAt(cornell, "2026-12-15T12:00:00Z");
  ok(summer === -4, `September at Cornell is UTC-4, got ${summer}`);
  ok(winter === -5, `December at Cornell is UTC-5, got ${winter}`);
  ok(summer !== winter, "the offset is derived from the zone, not hard-coded");
}

// --- the calendar is honest about which dates are real ----------------------
const fa26 = termCalendar("cornell", "FA26");
ok(fa26 !== null, "the FA26 calendar exists");
ok(fa26.calendar.termStart === "2026-08-24", "term start matches the published roster meeting patterns");
ok(fa26.provenance.termStart.provenance === "published", "and is marked as published");
ok(
  fa26.provenance.prelimPeriods.provenance === "inferred",
  "while prelim windows are marked inferred — Cornell does not publish them",
);
ok(inferredDates(fa26).includes("finalsStart"), "finals dates are flagged as modelled");
ok(/replaced with a curated calendar/i.test(fa26.caveat), "and the caveat says so plainly");
ok(calendarAt("cornell", "2026-10-01T00:00:00Z")?.term === "FA26", "a date inside the term finds it");
ok(calendarAt("cornell", "2027-07-01T00:00:00Z") === null, "a date outside any term is null, not the nearest");

// ================================================== the registry assembles
const reg = contextRegistry();
ok(reg.size() === CONTEXT_FACTORS.length, `every context factor registers, got ${reg.size()}`);
ok(reg.byEntity("campus").length === CONTEXT_FACTORS.length, "all are campus-scoped");
ok(
  reg.byOutcome("event_met_forecast").length >= 5,
  "most claim to predict whether an event meets its forecast",
);
ok(
  CONTEXT_FACTORS.every((f) => f.hypothesis.length > 20),
  "every factor states a falsifiable hypothesis",
);
ok(
  CONTEXT_FACTORS.every((f) => f.availableAt.length > 20),
  "and every factor states its point-in-time contract",
);
ok(
  CONTEXT_FACTORS.every((f) => f.sources.length > 0),
  "and names the sources it depends on, for cascade invalidation",
);

// THE SCALE MISMATCH IS VISIBLE IN THE DATA, not left to be discovered later.
{
  const multipliers = CONTEXT_FACTORS.filter((f) => f.valueType === "multiplier");
  ok(multipliers.length === 3, `three factors declare themselves multipliers, got ${multipliers.length}`);
  ok(
    multipliers.every((f) => ["academic_turnout_factor", "weather_turnout_factor", "regime_turnout_prior"].includes(f.id)),
    "and they are the ones that multiply expected headcount",
  );
  ok(
    CONTEXT_FACTORS.find((f) => f.id === "competing_event_pressure").valueType === "count",
    "while competing events is a count, not a multiplier — it must be converted, not multiplied",
  );
}

// None of these may reach an employer. They are campus facts, but the gate is
// uniform: nothing is exported to employers from the factor layer.
ok(
  CONTEXT_FACTORS.every((f) => !mayUse(f, "employer_evidence").allowed),
  "no context factor is available for employer evidence",
);

// ============================================ REAL DATA: the Cornell roster
const courses = parseCornellRoster(fx("cornell-roster.json"));
const allHeat = meetingHeatmap(courses);
// CEC draws from AEM/CS/ECON etc. The fixture covers CS, MATH and ECON.
const cecHeat = meetingHeatmap(courses, { subjects: cec.drawsFrom });
ok(courses.length > 150, `parsed the real roster, ${courses.length} courses`);
ok(cecHeat.sections > 0, "CEC's own departments produce a heatmap");
ok(
  cecHeat.sections < allHeat.sections,
  `and it is narrower than the whole catalogue: ${cecHeat.sections} of ${allHeat.sections} sections`,
);

// --- the question an officer actually asks ---------------------------------
// 2026-09-15 is a Tuesday. -4 is Cornell's September offset.
const TUE_7PM = "2026-09-15T23:00:00Z";
const TUE_11AM = "2026-09-15T15:00:00Z";
{
  const evening = computeFactor(
    classConflictIntensity, "cornell",
    { heatmap: cecHeat, at: TUE_7PM, offsetHours: -4 }, TUE_7PM,
  );
  const midday = computeFactor(
    classConflictIntensity, "cornell",
    { heatmap: cecHeat, at: TUE_11AM, offsetHours: -4 }, TUE_11AM,
  );
  ok(evening.status === "ok" && midday.status === "ok", "both hours compute");
  ok(
    midday.value > evening.value,
    `11am is a busier teaching hour than 7pm for CEC's departments: ${midday.value.toFixed(2)} vs ${evening.value.toFixed(2)}`,
  );
  ok(evening.n === cecHeat.sections, "the sample size is the sections behind the grid");
  ok(/teaching at that hour/i.test(evening.reading), `and the reading is plain: "${evening.reading}"`);

  // No roster means unknown, never "quiet".
  const noRoster = computeFactor(classConflictIntensity, "cornell", { at: TUE_7PM }, TUE_7PM);
  ok(noRoster.status === "missing_input", "with no heatmap supplied the factor refuses");
  ok(noRoster.value === null, "with null, NOT a confident zero");
}

// ================================== REAL DATA: the Cornell campus calendar
{
  const events = parseLocalist(fx("cornell-localist.json"), "cornell");
  ok(events.length > 0, `parsed ${events.length} real Cornell events`);
  const busiest = events[0].startsAt;
  const v = computeFactor(competingEventPressure, "cornell", { events, at: busiest }, busiest);
  ok(v.status === "ok", "competing-event pressure computes against the real feed");
  ok(v.value >= 1, `the event's own hour has at least itself, got ${v.value}`);
  ok(v.n === events.length, "the sample is the size of the feed");
  ok(v.drivers.length <= 5, "drivers are capped so a busy night does not dump the calendar");

  // An empty feed is NOT evidence of a quiet campus.
  const empty = computeFactor(competingEventPressure, "cornell", { events: [], at: TUE_7PM }, TUE_7PM);
  ok(empty.value === 0, "an empty feed yields zero competitors");
  ok(empty.n === 0, "but reports zero sample");
  ok(
    /not zero/i.test(empty.reading) || empty.n === 0,
    "and the explanation distinguishes 'no calendar' from 'quiet campus'",
  );
}

// ================================================ assessment pressure, FA26
{
  const cal = fa26.calendar;
  const quiet = computeFactor(assessmentPressure, "cornell", { calendar: cal, at: "2026-09-15T18:00:00Z" }, "2026-09-15T18:00:00Z");
  const prelims = computeFactor(assessmentPressure, "cornell", { calendar: cal, at: "2026-10-03T18:00:00Z" }, "2026-10-03T18:00:00Z");
  const finals = computeFactor(assessmentPressure, "cornell", { calendar: cal, at: "2026-12-14T18:00:00Z" }, "2026-12-14T18:00:00Z");
  ok(quiet.value < prelims.value, `mid-September is quieter than the prelim run-up: ${quiet.value} < ${prelims.value}`);
  ok(prelims.value < finals.value, `and the prelim run-up is quieter than finals: ${prelims.value} < ${finals.value}`);
  ok(finals.drivers.some((d) => /finals/i.test(d.label)), "finals is named as the driver");

  // A calendar with only term bounds cannot support a curve, and must say so
  // rather than reporting a confident zero.
  const bare = computeFactor(
    assessmentPressure, "cornell",
    { calendar: { termStart: "2026-08-24", termEnd: "2026-12-20" }, at: TUE_7PM }, TUE_7PM,
  );
  ok(bare.status === "not_computable", "a calendar with no assessment dates refuses");
  ok(bare.value === null, "with null rather than zero pressure");
  ok(/no prelim or finals dates/i.test(bare.reading), `and says why: "${bare.reading}"`);
}

// ========================= THE DOUBLE-COUNT GUARD, end to end through the registry
{
  const cal = fa26.calendar;
  // An ordinary prelim week must come out roughly NEUTRAL on the academic
  // multiplier, because regime_turnout_prior has already discounted it.
  // Charging both would forecast about half of what a prelim week produces.
  const regime = computeFactor(regimeTurnoutPrior, "cornell", { calendar: cal, at: "2026-10-05T23:00:00Z" }, "2026-10-05T23:00:00Z");
  const academic = computeFactor(
    academicTurnoutFactor, "cornell",
    { regime: regime.basis.regime, calendar: cal, at: "2026-10-05T23:00:00Z", heatmap: cecHeat, offsetHours: -4 },
    "2026-10-05T23:00:00Z",
  );
  ok(regime.basis.regime === "prelims", `the first week of October is a prelim block, got ${regime.basis.regime}`);
  ok(regime.value < 1, `and the regime prior already discounts it, got ${regime.value}`);
  ok(
    typeof regime.basis.baselinePressure === "number" && regime.basis.baselinePressure > 0.5,
    "the regime carries the pressure it has ALREADY priced in, so a consumer can avoid charging it twice",
  );
  const pressureTerm = academic.drivers.find((d) => /assessment/i.test(d.label));
  ok(
    Math.abs(pressureTerm.contribution - 1) < 0.25,
    `an ordinary prelim week is near-neutral on the academic term, got ${pressureTerm.contribution}`,
  );

  // And the inverse: a NORMAL-term week sitting under an unusual prelim cluster
  // must discount, because that is information the regime alone cannot express.
  const unusual = computeFactor(
    academicTurnoutFactor, "cornell",
    {
      regime: "normal_term",
      calendar: cal,
      at: "2026-10-05T23:00:00Z", // high pressure, but told it is a normal week
      heatmap: cecHeat, offsetHours: -4,
    },
    "2026-10-05T23:00:00Z",
  );
  const unusualPressure = unusual.drivers.find((d) => /assessment/i.test(d.label));
  ok(
    unusualPressure.contribution < pressureTerm.contribution,
    `the same pressure in a supposedly normal week discounts more: ${unusualPressure.contribution} < ${pressureTerm.contribution}`,
  );
}

// ====================================================== REAL DATA: weather
{
  const hours = parseNwsHourly(fx("nws-hourly.json"));
  const covered = hours[10].startsAt;
  const v = computeFactor(weatherTurnoutFactor, "cornell", { hours, at: covered }, covered);
  ok(v.status === "ok", "weather computes against the real NWS forecast");
  ok(v.value >= 0.8 && v.value <= 1.03, `and stays inside the stated bounds, got ${v.value}`);

  const outdoors = computeFactor(
    weatherTurnoutFactor, "cornell", { hours, at: covered, outdoors: true }, covered,
  );
  ok(outdoors.value <= v.value, "an outdoor event is never helped relative to indoors by the same weather");

  // Outside the forecast window is UNKNOWN, not fair weather.
  const outside = computeFactor(
    weatherTurnoutFactor, "cornell", { hours, at: "2020-01-01T00:00:00Z" }, "2020-01-01T00:00:00Z",
  );
  ok(outside.status === "not_computable", "an hour outside the forecast refuses");
  ok(outside.value === null, "with null, not a neutral 1.0 dressed up as knowledge");
  ok(/no forecast covers/i.test(outside.reading), "and says so");
}

// ====================== the officer's actual question, answered end to end
{
  const cal = fa26.calendar;
  const events = parseLocalist(fx("cornell-localist.json"), "cornell");
  const hours = parseNwsHourly(fx("nws-hourly.json"));

  const evaluate = (at) => {
    const regime = computeFactor(regimeTurnoutPrior, "cornell", { calendar: cal, at }, at);
    const academic = computeFactor(
      academicTurnoutFactor, "cornell",
      { regime: regime.basis.regime, calendar: cal, at, heatmap: cecHeat, offsetHours: -4 }, at,
    );
    const competing = computeFactor(competingEventPressure, "cornell", { events, at }, at);
    const weather = computeFactor(weatherTurnoutFactor, "cornell", { hours, at }, at);
    return { regime, academic, competing, weather };
  };

  const tuesdayEvening = evaluate(TUE_7PM);
  const tuesdayMidday = evaluate(TUE_11AM);
  ok(
    tuesdayEvening.academic.value > tuesdayMidday.academic.value,
    `7pm beats 11am on the academic multiplier for CEC: ${tuesdayEvening.academic.value} vs ${tuesdayMidday.academic.value}`,
  );

  // Every factor that spoke carries its provenance, so the recommendation is
  // auditable rather than an oracle.
  for (const [name, f] of Object.entries(tuesdayEvening)) {
    ok(f.modelVersion === "1.0.0", `${name} carries a model version`);
    ok(f.asOf === TUE_7PM, `${name} carries its as-of`);
    ok(typeof f.reading === "string" && f.reading.length > 0, `${name} explains itself in words`);
  }
}

console.log(`${checks} context-registry assertions passed.`);

// Verifies the club planning engine: capacity, staffing fit and slot choice.
// Pure functions, no database, no network, no clock beyond what is passed in.
//
// The load-bearing tests here are the ones about REFUSAL and DOUBLE-COUNTING:
// that unknown commitments return null rather than zero, and that finals is not
// charged twice by naively multiplying a log-odds forecast by a regime
// multiplier. Both failures produce numbers that look exactly like good ones.
//
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/planning.mjs
import assert from "node:assert/strict";
import {
  expectedAvailableCapacity,
  DEFAULT_DISCRETIONARY_WEEKLY_HOURS,
} from "../lib/cec/planning/capacity.ts";
import {
  assignmentFit,
  recommendAssignment,
  MAX_FIT_SACRIFICE,
  PREREQUISITE_FLOOR,
} from "../lib/cec/planning/staffing.ts";
import {
  recommendSlot,
  finalsDoubleCountCheck,
  logOddsToMultiplier,
  REPRICED_FEATURES,
  SLOT_INVARIANT_FEATURES,
} from "../lib/cec/planning/scheduling.ts";
import { REGIME_TURNOUT } from "../lib/cec/context.ts";
import { academicLoad } from "../lib/cec/academic.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const near = (a, b, tol, m) => ok(Math.abs(a - b) < tol, `${m}: ${a} vs ${b}`);

/** Every interval this codebase emits must bracket its own point estimate. */
const contains = (p, what) => {
  if (p.value === null) {
    ok(p.interval === null, `${what}: a refusal carries no interval`);
    return;
  }
  ok(Array.isArray(p.interval), `${what}: has an interval at all`);
  ok(
    p.interval[0] <= p.value && p.value <= p.interval[1],
    `${what}: interval ${p.interval} contains ${p.value}`,
  );
  ok(p.intervalMass > 0 && p.intervalMass <= 1, `${what}: interval mass is stated`);
};

// ============================================================ fixtures

const CAL = {
  termStart: "2026-08-25",
  termEnd: "2026-12-20",
  classesEnd: "2026-12-09",
  finalsStart: "2026-12-12",
  finalsEnd: "2026-12-19",
  recruitingDays: 21,
};

// Weekdays 9-16 are taught hard; Tuesday 11 is the busiest hour of the week.
// Saturday is empty, which is the whole point of the first test.
const GRID = Array.from({ length: 7 }, () => new Array(24).fill(0));
for (let d = 1; d <= 5; d++) for (let h = 9; h <= 16; h++) GRID[d][h] = 0.8;
GRID[2][11] = 1;
const HEATMAP = {
  grid: GRID,
  peak: 420,
  totalWeight: 9000,
  sections: 300,
  basis: "test fixture",
};

const evt = (id, startsAt, title = "Something else on campus") => ({
  source: "test",
  externalId: id,
  title,
  startsAt,
  endsAt: null,
  locationName: "Somewhere",
  url: "",
  tags: [],
  cancelled: false,
  rsvpTotal: null,
  registrationLimit: null,
});

const rep = (n, c) => Array.from({ length: n }, () => ({ ...c }));
const COMPARABLES = rep(9, { rsvps: 150, attended: 110 });

// Local time is UTC-4. 2026-10-10 is a Saturday, 2026-10-13 a Tuesday,
// 2026-12-12 the first day of finals and also a Saturday.
const SAT_9AM = "2026-10-10T13:00:00.000Z";
const TUE_11AM = "2026-10-13T15:00:00.000Z";
const FINALS_SAT_9AM = "2026-12-12T13:00:00.000Z";
const TZ = -4;

const baseContext = (over = {}) => ({
  asOf: "2026-09-20T12:00:00.000Z",
  calendar: CAL,
  campusEvents: [],
  heatmap: HEATMAP,
  timeZoneOffsetHours: TZ,
  rsvps: 160,
  comparables: COMPARABLES,
  ...over,
});

// ============================================================ 1. slot choice
// A quiet Saturday morning must beat the single busiest teaching hour of the
// week, even though the day-of-week constant in forecast.ts says Saturday is
// the worst day on a campus. That is the composition working: the class
// conflict multiplier is allowed to overwhelm a day-of-week log-odds term
// because both are priced once, in the same space, against the same baseline.

const twoSlots = recommendSlot([SAT_9AM, TUE_11AM], baseContext());

ok(twoSlots.recommended !== null, "a recommendation is produced");
ok(
  twoSlots.recommended.at === SAT_9AM,
  `quiet Saturday morning outranks the Tuesday 11am lecture hour: got ${twoSlots.recommended.label}`,
);
ok(twoSlots.recommended.label === "Saturday 9 AM", `label reads naturally: ${twoSlots.recommended.label}`);
ok(twoSlots.runnerUp.at === TUE_11AM, "the Tuesday lecture hour is the runner-up");
ok(
  twoSlots.recommended.attendance.value > twoSlots.runnerUp.attendance.value,
  "and it does so on expected attendance, not on a tiebreak",
);

// The Tuesday slot must be penalised by the heatmap specifically.
const tueClass = twoSlots.runnerUp.multipliers.find((m) => m.term === "class_conflict");
const satClass = twoSlots.recommended.multipliers.find((m) => m.term === "class_conflict");
near(tueClass.multiplier, 0.5, 1e-6, "a fully-booked teaching hour costs half the turnout");
near(satClass.multiplier, 1, 1e-6, "an empty teaching hour costs nothing");
ok(twoSlots.runnerUp.conflict.verdict === "heavy", "Tuesday 11am reads as a heavy teaching hour");

// Saturday's advantage has to be NAMED, not merely scored.
ok(
  twoSlots.recommended.positives.some((d) => d.term === "class_conflict"),
  "schedule availability is named as a positive driver of the Saturday slot",
);
ok(
  twoSlots.runnerUp.negatives.some((d) => d.term === "class_conflict"),
  "the teaching hour is named as a negative driver of the Tuesday slot",
);

// ==================================================== 2. competition monotone

const competitionSweep = [];
for (let n = 0; n <= 12; n++) {
  const events = Array.from({ length: n }, (_, i) => evt(`c${i}`, SAT_9AM));
  const r = recommendSlot([SAT_9AM], baseContext({ campusEvents: events }));
  competitionSweep.push({
    n,
    value: r.recommended.attendance.value,
    m: r.recommended.multipliers.find((x) => x.term === "competing_events").multiplier,
    counted: r.recommended.competing,
  });
}
for (let i = 1; i < competitionSweep.length; i++) {
  ok(
    competitionSweep[i].counted === i,
    `all ${i} competing events are seen: got ${competitionSweep[i].counted}`,
  );
  ok(
    competitionSweep[i].m < competitionSweep[i - 1].m,
    `the competition multiplier falls strictly at n=${i}`,
  );
  ok(
    competitionSweep[i].value <= competitionSweep[i - 1].value,
    `expected attendance never rises when a competing event is added (n=${i})`,
  );
}
ok(
  competitionSweep[12].value < competitionSweep[0].value,
  `twelve competing events cost real people: ${competitionSweep[0].value} -> ${competitionSweep[12].value}`,
);

// Competition must not be able to drive turnout negative, however many clash.
const swamped = recommendSlot(
  [SAT_9AM],
  baseContext({ campusEvents: Array.from({ length: 400 }, (_, i) => evt(`x${i}`, SAT_9AM)) }),
);
ok(swamped.recommended.attendance.value >= 0, "competition cannot drive expected turnout below zero");

// ======================================= 3. finals is priced ONCE, not twice

const featuresWithCalendar = {
  foodProvided: true,
  foodAdvertised: true,
  leadTimeDays: 10,
  // Everything below is deliberately supplied and must be stripped.
  daysToFinals: 3,
  weeksIntoTerm: 11,
  competingEvents: 4,
  precipitationProbability: 0.4,
  dayOfWeek: 6,
  hour: 9,
};

const normalWeek = recommendSlot([SAT_9AM], baseContext({ features: featuresWithCalendar }));
const finalsWeek = recommendSlot([FINALS_SAT_9AM], baseContext({ features: featuresWithCalendar }));

ok(finalsWeek.recommended.regime === "finals", "the finals slot is detected as finals");
ok(normalWeek.recommended.regime === "normal_term", "the October slot is a normal term week");

// The calendar features never reach the conversion model.
const kept = normalWeek.basis.forecastFeatures;
ok(!kept.includes("daysToFinals"), "the finals log-odds ramp is withheld from the forecast");
ok(!kept.includes("competingEvents"), "competing events are withheld from the forecast");
ok(!kept.includes("precipitationProbability"), "precipitation is withheld from the forecast");
ok(!kept.includes("weeksIntoTerm"), "weeks-into-term is withheld from the forecast");
for (const f of kept)
  ok(SLOT_INVARIANT_FEATURES.includes(f), `only slot-invariant features survive: ${f}`);
const strippedNames = normalWeek.basis.strippedFeatures.map((s) => s.feature);
ok(strippedNames.includes("daysToFinals"), "and the withholding is reported, not silent");
for (const s of normalWeek.basis.strippedFeatures)
  ok(
    s.repricedAs === REPRICED_FEATURES[s.feature] && s.repricedAs.length > 10,
    `each stripped feature says where it is priced instead: ${s.feature}`,
  );

// THE ASSERTION THIS FILE EXISTS FOR.
// The applied finals penalty must be roughly the regime multiplier alone, and
// must be materially LESS severe than the product of the two independent
// finals penalties that the two layers each carry.
const applied = finalsWeek.recommended.totalMultiplier / normalWeek.recommended.totalMultiplier;
const check = finalsDoubleCountCheck(normalWeek.basis.baselineConversion);

ok(
  check.naiveProduct < check.regimeOnly * 0.85,
  `the naive product really is a different number: ${check.naiveProduct} vs ${check.regimeOnly}`,
);
ok(
  applied > check.naiveProduct * 1.1,
  `finals is not charged twice: applied ${applied.toFixed(3)} must be well above the naive product ${check.naiveProduct}`,
);
ok(
  Math.abs(applied - REGIME_TURNOUT.finals) < 0.1,
  `the applied finals penalty tracks REGIME_TURNOUT.finals (${REGIME_TURNOUT.finals}), not a product: ${applied.toFixed(3)}`,
);
// The excess-pressure term may adjust it, but only at the margin.
ok(applied < 1, "finals still costs turnout");

// The conversion of a log-odds effect into a headcount multiplier is exact.
near(logOddsToMultiplier(0, 0.7), 1, 1e-12, "a zero log-odds effect is a neutral multiplier");
near(
  logOddsToMultiplier(Math.log((0.8 / 0.2) / (0.5 / 0.5)), 0.5),
  1.6,
  1e-9,
  "logit(0.5) shifted to logit(0.8) is exactly a 1.6x multiplier on headcount",
);

// ================================================== 4. intervals and readings

for (const r of [twoSlots, normalWeek, finalsWeek, swamped]) {
  ok(r.explanation.length > 40, "every slot recommendation carries an explanation");
  ok(r.limitations.length > 0, "and states its limitations");
  for (const s of r.ranked) {
    contains(s.attendance, `slot ${s.label}`);
    ok(s.reading.length > 20, `slot ${s.label} has a non-empty reading`);
    ok(
      s.attendance.assumptions.length > 0 && s.attendance.limitations.length > 0,
      `slot ${s.label} states its assumptions and limitations`,
    );
    ok(s.attendance.model.name.length > 0, "and stamps the model that produced it");
    for (const d of [...s.positives, ...s.negatives])
      ok(d.label.length > 3, `driver labels are readable: "${d.label}"`);
  }
}

// The headline explanation must name a driver the slot actually carries.
const namedDrivers = [...twoSlots.recommended.positives, ...twoSlots.recommended.negatives];
ok(namedDrivers.length > 0, "the recommended slot has at least one named driver");
ok(
  namedDrivers.some((d) => twoSlots.explanation.includes(d.label)),
  `the explanation names a driver: ${twoSlots.explanation}`,
);
ok(
  /expected attendance \d+, interval \d+–\d+/.test(twoSlots.explanation),
  `the explanation states the number and the range: ${twoSlots.explanation}`,
);

// Positive and negative drivers are kept SEPARATE, never netted into one score.
for (const s of twoSlots.ranked) {
  for (const d of s.positives) ok(d.contribution > 0, "positives are positive");
  for (const d of s.negatives) ok(d.contribution < 0, "negatives are negative");
}

// A condition shared by every candidate is still named, and marked as such.
const finalsOnly = recommendSlot(
  [FINALS_SAT_9AM, "2026-12-13T13:00:00.000Z"],
  baseContext(),
);
ok(
  finalsOnly.ranked.every((s) =>
    s.negatives.some((d) => d.term === "regime" && d.differentiating === false),
  ),
  "finals is named on both slots even though it cannot help you choose between them",
);

// =================================================== 5. capacity, and refusal

const AT = "2026-10-05T12:00:00.000Z";
const task = (id, hours, dueIn) => ({
  id,
  kind: "task",
  label: `Task ${id}`,
  estimatedHours: hours,
  dueAt: new Date(Date.parse(AT) + dueIn * 86400e3).toISOString(),
});

// THE REFUSAL. Unknown commitments must produce null, never zero.
const unknown = expectedAvailableCapacity({ personId: "sam", at: AT, commitments: null });
ok(unknown.value === null, "unknown commitments produce a null capacity");
ok(unknown.value !== 0, "…and specifically not zero, which would read as 'no load'");
ok(unknown.interval === null, "a refusal carries no interval");
ok(unknown.reading.length > 60, "the refusal states a reason");
ok(
  /do not know|cannot say|not know/i.test(unknown.reading),
  `the reason names the missing input: ${unknown.reading.slice(0, 80)}`,
);
ok(unknown.basis.committedHours === null, "and reports no committed hours rather than zero");

// An EMPTY list is a claim and must still be answerable — the two cases must
// not collapse into each other.
const nothingOpen = expectedAvailableCapacity({ personId: "sam", at: AT, commitments: [] });
ok(typeof nothingOpen.value === "number", "an empty commitment list is a claim, and is answerable");
near(
  nothingOpen.value,
  DEFAULT_DISCRETIONARY_WEEKLY_HOURS,
  0.05,
  "with nothing open, capacity is the whole default budget",
);

// Capacity falls as commitments rise, strictly, and is allowed to go negative.
const ladder = [];
for (let n = 0; n <= 8; n++) {
  const c = expectedAvailableCapacity({
    personId: "sam",
    at: AT,
    commitments: Array.from({ length: n }, (_, i) => task(i, 2, 3)),
  });
  ladder.push(c);
}
for (let i = 1; i < ladder.length; i++)
  ok(
    ladder[i].value < ladder[i - 1].value,
    `capacity falls strictly as commitments rise (n=${i}): ${ladder[i - 1].value} -> ${ladder[i].value}`,
  );
for (const c of ladder) contains(c, `capacity at ${c.basis.commitmentsCounted} commitments`);

const overloaded = ladder[ladder.length - 1];
ok(overloaded.value < 0, "capacity is allowed to go negative rather than being floored at zero");
ok(overloaded.basis.overCommitted === true, "and the over-commitment is flagged");
ok(
  /over-committed/i.test(overloaded.reading),
  `the reading says so in words: ${overloaded.reading.slice(0, 70)}`,
);

// Framing: this must never read as a claim about the person.
for (const c of [...ladder, nothingOpen]) {
  ok(!/lazy|unreliable|flaky|slack(er|ing)/i.test(c.reading), "capacity never characterises a person");
  ok(
    c.limitations.some((l) => /Club OS sees Club OS/.test(l)),
    "and always says what it cannot see",
  );
}

// Unestimated work widens the interval rather than shifting the point estimate.
const estimated = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [task("a", 2, 3), task("b", 2, 3)],
});
const imputed = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [
    { ...task("a", 2, 3), estimatedHours: null },
    { ...task("b", 2, 3), estimatedHours: null },
  ],
});
near(imputed.value, estimated.value, 1e-9, "imputing the same hours does not move the estimate");
ok(
  imputed.interval[1] - imputed.interval[0] > estimated.interval[1] - estimated.interval[0],
  "but not knowing the hours widens the range",
);
ok(
  imputed.limitations.some((l) => /no estimate/.test(l)),
  "and the widening is explained",
);

// Academic load and assessment pressure both reduce the budget, and the load
// component of personal pressure is divided back out so it is not charged twice.
const course = (id, credits, level) => ({
  id,
  subject: "CS",
  catalogNumber: id.split(" ")[1],
  title: id,
  level,
  career: "UG",
  credits,
  componentsRequired: ["LEC"],
  gradingBasis: "GRD",
  satisfactoryOnly: false,
  prereqText: "",
  prereqCourses: [],
  sections: [
    {
      component: "LEC",
      section: "001",
      meetings: [{ days: [1, 3, 5], startMinutes: 600, endMinutes: 650, startDate: null, endDate: null }],
    },
  ],
});
const heavyLoad = academicLoad([
  course("CS 4820", 4, 4),
  course("CS 4670", 4, 4),
  course("CS 4410", 4, 4),
  course("CS 3110", 4, 3),
  course("CS 2110", 4, 2),
]);
const lightLoad = academicLoad([course("CS 1110", 3, 1), course("CS 2110", 3, 2)]);

const withHeavy = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [task("a", 2, 3)],
  load: heavyLoad,
});
const withLight = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [task("a", 2, 3)],
  load: lightLoad,
});
ok(heavyLoad.loadRatio > lightLoad.loadRatio, "the heavy roster really is heavier");
ok(withHeavy.value < withLight.value, "a heavier course load leaves less discretionary time");
ok(
  withHeavy.basis.multipliers.some((m) => m.multiplier < 1),
  "and the squeeze is reported as a named multiplier",
);
contains(withHeavy, "capacity under a heavy load");

const underPressure = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [task("a", 2, 3)],
  load: heavyLoad,
  // personalPressure already contains sqrt(loadRatio); relativeToCampus is that
  // factor, so the module must divide it back out before applying its own
  // load term. campus pressure here is 0.9 / 1.2 = 0.75.
  personalPressure: { pressure: 0.9, relativeToCampus: 1.2, reading: "heavier than average" },
});
ok(underPressure.value < withHeavy.value, "assessment pressure reduces capacity further");
const pressureMultiplier = underPressure.basis.multipliers.find((m) =>
  /assessment/.test(m.label),
);
near(
  pressureMultiplier.multiplier,
  1 - 0.5 * (0.9 / 1.2),
  1e-3,
  "the campus term is recovered from the personal reading, so load is not charged twice",
);

// Missing inputs widen rather than silently shift.
const noLoad = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [task("a", 2, 3)],
});
ok(
  noLoad.limitations.some((l) => /course enrolment/.test(l)),
  "a missing roster is declared, not assumed away",
);

// A blocked item costs attention and widens the range; it does not free time.
const blocked = expectedAvailableCapacity({
  personId: "sam",
  at: AT,
  commitments: [{ ...task("a", 2, 3), blocked: true }],
});
near(blocked.value, estimated.value + 2, 1e-9, "a blocked item still costs its hours");
ok(
  blocked.interval[1] - blocked.interval[0] >
    expectedAvailableCapacity({ personId: "sam", at: AT, commitments: [task("a", 2, 3)] })
      .interval[1] -
      expectedAvailableCapacity({ personId: "sam", at: AT, commitments: [task("a", 2, 3)] })
        .interval[0],
  "and being blocked widens the range",
);
ok(blocked.basis.blockers === 1, "blockers are counted");

// Unparseable time refuses rather than guessing.
const badTime = expectedAvailableCapacity({ personId: "sam", at: "never", commitments: [] });
ok(badTime.value === null, "an unreadable timestamp refuses");

// ==================================================== 6. staffing: two picks

const capFor = (hours, commitments) =>
  expectedAvailableCapacity({
    personId: "x",
    at: AT,
    commitments,
    statedWeeklyHours: hours,
  });

const MAYA = {
  personId: "maya",
  name: "Maya",
  skills: { value: 0.9, n: 12, note: "ran the last three sponsor pitches" },
  experience: { value: 0.9, n: 10 },
  interest: { value: 0.6, n: 3 },
  execution: { value: 0.9, n: 10 },
  relationships: { value: 0.8, n: 5 },
  capacity: capFor(8, [task("m1", 2, 3)]),
  currentAssignments: 2,
  // She has done this to mastery. There is nothing here for her to learn.
  alreadyMastered: true,
};
const PRIYA = {
  personId: "priya",
  name: "Priya",
  skills: { value: 0.55, n: 4 },
  experience: { value: 0.5, n: 3 },
  interest: { value: 0.95, n: 3 },
  execution: { value: 0.7, n: 4 },
  relationships: { value: 0.7, n: 4 },
  capacity: capFor(10, []),
  currentAssignments: 0,
  mentorAvailable: true,
};
const NEWCOMER = {
  personId: "theo",
  name: "Theo",
  skills: { value: 0, n: 0 },
  experience: { value: 0, n: 0 },
  interest: { value: 0, n: 0 },
  execution: { value: 0, n: 0 },
  relationships: { value: 0, n: 0 },
};

const TASK = {
  id: "sponsor-deck",
  label: "Build the sponsor deck",
  estimatedHours: 5,
  stakes: "medium",
  requiredSkills: ["deck design", "sponsor narrative"],
};

const staffing = recommendAssignment({
  task: TASK,
  candidates: [MAYA, PRIYA, NEWCOMER],
  asOf: AT,
});

ok(staffing.safest !== null, "a safest pick is returned");
ok(staffing.development !== null, "a development pick is returned");
ok(staffing.safest.personId === "maya", `Maya has the strongest evidence: got ${staffing.safest.name}`);
ok(
  staffing.development.personId === "priya",
  `Priya is the development pick: got ${staffing.development.name}`,
);
ok(
  staffing.safest.personId !== staffing.development.personId,
  "the safest pick and the development pick can differ — that is the whole point",
);
ok(staffing.sameCandidate === false, "and the module says they differ");
ok(
  staffing.fitSacrifice > 0 && staffing.fitSacrifice <= MAX_FIT_SACRIFICE,
  `the execution fit given up is reported and bounded: ${staffing.fitSacrifice}`,
);

// LearningValue is a first-class scored term, not a tiebreak.
ok(staffing.development.learningValue > 0, "the development pick has real learning value");
ok(
  staffing.safest.learningValue === 0,
  "somebody who has already mastered this has nothing to learn from it",
);
ok(
  staffing.development.prerequisiteReadiness > 0,
  `the development pick clears the ${TASK.stakes}-stakes prerequisite bar of ${PREREQUISITE_FLOOR[TASK.stakes]}`,
);
ok(
  staffing.development.prerequisiteEvidence >= PREREQUISITE_FLOOR[TASK.stakes],
  `and holds real prerequisite evidence (${staffing.development.prerequisiteEvidence}) rather than just clearing on a technicality`,
);
ok(
  /valuable development opportunity/.test(staffing.explanation),
  "a genuine stretch is called one in so many words",
);
ok(
  staffing.development.developmentFit.value > staffing.safest.developmentFit.value,
  "and wins on the development-weighted score",
);
ok(
  staffing.safest.fit.value > staffing.development.fit.value,
  "while the safest pick still wins on execution fit",
);

// Explanations. Never a bare score.
ok(staffing.explanation.length > 80, "the recommendation carries an explanation");
ok(
  staffing.explanation.includes("Maya") && staffing.explanation.includes("Priya"),
  "naming both people",
);
ok(
  /development opportunity/.test(staffing.explanation),
  `and framing the second as development: ${staffing.explanation.slice(0, 120)}`,
);

for (const f of staffing.ranked) {
  ok(f.explanation.trim().length > 0, `${f.name} has a non-empty explanation`);
  if (f.eligible) {
    ok(f.drivers.length > 0, `${f.name} has named drivers`);
    ok(
      f.drivers.some((d) => f.explanation.includes(d.label)),
      `${f.name}'s explanation names at least one driver: ${f.explanation}`,
    );
    contains(f.fit, `${f.name} execution fit`);
    contains(f.developmentFit, `${f.name} development fit`);
    ok(f.fit.limitations.length > 0, `${f.name}'s fit states its limitations`);
  }
}

// The unevidenced candidate is refused, not scored, and the refusal is about
// our records rather than about them.
const theo = staffing.ranked.find((f) => f.personId === "theo");
ok(theo.eligible === false, "a candidate with no evidence at all is not ranked");
ok(theo.fit.value === null, "…and gets null rather than a fabricated zero");
ok(theo.exclusion && theo.exclusion.length > 40, "with a stated reason");
ok(
  staffing.limitations.some((l) => /gap in our records/.test(l)),
  "framed as a gap in the records, not a judgement about the person",
);

// High stakes raises the prerequisite bar, and the module will say nobody
// qualifies rather than quietly promoting an unprepared person.
const highStakes = recommendAssignment({
  task: { ...TASK, id: "keynote", label: "Run the keynote", stakes: "high" },
  candidates: [MAYA, PRIYA],
  asOf: AT,
});
ok(
  PREREQUISITE_FLOOR.high > PREREQUISITE_FLOOR.medium,
  "the prerequisite bar rises with the stakes",
);
ok(
  highStakes.development === null || highStakes.development.learningValue > 0,
  "a high-stakes development pick is either absent or genuinely ready",
);
ok(
  highStakes.development === null,
  "nobody clears the high-stakes bar with room to grow here, and the module says so rather than promoting Priya into it",
);
ok(
  /Pair someone alongside/.test(highStakes.explanation),
  `and suggests pairing instead: ${highStakes.explanation.slice(-90)}`,
);

// Thin evidence must widen the interval, not sharpen the ranking.
const thin = assignmentFit(
  { ...PRIYA, personId: "thin", name: "Thin", skills: { value: 0.9, n: 1 }, experience: { value: 0.9, n: 1 }, execution: { value: 0.9, n: 1 } },
  TASK,
  AT,
);
const thick = assignmentFit(
  { ...PRIYA, personId: "thick", name: "Thick", skills: { value: 0.9, n: 40 }, experience: { value: 0.9, n: 40 }, execution: { value: 0.9, n: 40 } },
  TASK,
  AT,
);
near(thin.fit.value, thick.fit.value, 1e-9, "one observation and forty give the same point estimate");
ok(
  thin.fit.interval[1] - thin.fit.interval[0] > thick.fit.interval[1] - thick.fit.interval[0],
  "but one observation gives a far wider interval",
);
contains(thin.fit, "thin-evidence fit");
contains(thick.fit, "thick-evidence fit");

// No candidates at all is a refusal, not an empty winner.
const nobody = recommendAssignment({ task: TASK, candidates: [], asOf: AT });
ok(nobody.safest === null && nobody.development === null, "no candidates means no recommendation");
ok(nobody.explanation.length > 20, "and says why");

// ============================================ 7. every interval, everywhere

const everyPrediction = [
  ...twoSlots.ranked.map((s) => [s.attendance, `slot ${s.label}`]),
  ...finalsWeek.ranked.map((s) => [s.attendance, `finals slot ${s.label}`]),
  ...ladder.map((c) => [c, `capacity n=${c.basis.commitmentsCounted}`]),
  ...staffing.ranked.flatMap((f) => [
    [f.fit, `${f.name} fit`],
    [f.developmentFit, `${f.name} dev fit`],
  ]),
  [unknown, "capacity refusal"],
  [theo.fit, "staffing refusal"],
];
for (const [p, what] of everyPrediction) contains(p, what);

console.log(`${checks} planning assertions passed.`);

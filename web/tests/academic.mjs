// The academic layer, tested against a REAL captured Cornell roster
// (tests/fixtures/cornell-roster.json — 199 courses across CS/MATH/ECON, pulled
// live from classes.cornell.edu/api/2.0). Parsing and every model here is pure,
// so this needs no network and no database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/academic.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseClockTime,
  parsePattern,
  extractCourseCodes,
  parseCornellRoster,
  parseRosterCode,
  rosterAt,
  meetingHeatmap,
  classConflict,
  quietestHours,
  structuralDifficulty,
  difficultyPriors,
  courseDifficulty,
  academicLoad,
  academicPressure,
  personalPressure,
  academicFactor,
  academicContext,
  REGIME_BASELINE_PRESSURE,
  STANDARD_WEEKLY_HOURS,
} from "../lib/cec/academic.ts";
import { REGIME_TURNOUT, REGIMES, campusState, behaviouralAlpha } from "../lib/cec/context.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

// ========================================================= clock and pattern
ok(parseClockTime("09:05AM") === 545, `09:05AM is 545, got ${parseClockTime("09:05AM")}`);
ok(parseClockTime("12:00PM") === 720, `noon is 720, got ${parseClockTime("12:00PM")}`);
ok(parseClockTime("12:30AM") === 30, `half past midnight is 30, got ${parseClockTime("12:30AM")}`);
ok(parseClockTime("11:59PM") === 1439, "one minute to midnight");
ok(parseClockTime("") === null, "empty string is null, not zero");
ok(parseClockTime("TBA") === null, "TBA is null");
ok(parseClockTime("13:00PM") === null, "a 13 o'clock 12-hour time is rejected, not wrapped");
ok(parseClockTime(null) === null, "null in, null out");

ok(JSON.stringify(parsePattern("TR")) === "[2,4]", `TR is Tue+Thu, got ${parsePattern("TR")}`);
ok(JSON.stringify(parsePattern("MWF")) === "[1,3,5]", "MWF");
ok(JSON.stringify(parsePattern("mwf")) === "[1,3,5]", "lowercase is accepted");
ok(JSON.stringify(parsePattern("MM")) === "[1]", "a repeated day is not double-counted");
ok(JSON.stringify(parsePattern("MXQ")) === "[1]", "unknown letters are dropped, never guessed");
ok(parsePattern("").length === 0, "an empty pattern is no days");

// ========================================================== prereq extraction
{
  const codes = extractCourseCodes(
    "CS 2800 and CS 3110; or a minimum grade of A- in CS 2110 or CS 2112 and CS 2800.",
  );
  ok(codes.length === 4, `four distinct courses, got ${codes.length}: ${codes}`);
  ok(codes.includes("CS 2800"), "the repeated CS 2800 appears once");
  ok(extractCourseCodes("").length === 0, "empty prose is no courses");
  ok(extractCourseCodes(null).length === 0, "null prose is no courses");
  ok(
    extractCourseCodes("permission of instructor").length === 0,
    "prose with no course codes yields none rather than a guess",
  );
  ok(
    extractCourseCodes("MATH 1920").length === 1 &&
      extractCourseCodes("AEM 2400").length === 1 &&
      extractCourseCodes("NBAY 5000").length === 1,
    "2, 3 and 4-letter subject codes all parse",
  );
}

// ============================================================== real roster
const payload = JSON.parse(
  readFileSync(new URL("./fixtures/cornell-roster.json", import.meta.url), "utf8"),
);
const courses = parseCornellRoster(payload);
ok(courses.length > 150, `parsed the real roster, got ${courses.length} courses`);
ok(
  courses.every((c) => c.id === `${c.subject} ${c.catalogNumber}`),
  "every course has a composed id",
);
ok(
  new Set(courses.map((c) => c.subject)).size === 3,
  "the fixture covers CS, MATH and ECON",
);
const cs1110 = courses.find((c) => c.id === "CS 1110");
ok(cs1110, "CS 1110 is in the roster");
ok(cs1110.credits === 4, `CS 1110 is 4 credits, got ${cs1110.credits}`);
ok(cs1110.level === 1, `CS 1110 is 1000-level, got ${cs1110.level}`);
ok(cs1110.career === "UG", "CS 1110 is undergraduate");
const lec = cs1110.sections.find((s) => s.component === "LEC" && s.meetings.length);
ok(lec, "CS 1110 has a lecture with a meeting time");
ok(
  lec.meetings[0].startMinutes === 545 && lec.meetings[0].endMinutes === 595,
  "the lecture runs 9:05-9:55",
);
ok(
  JSON.stringify(lec.meetings[0].days) === "[2,4]",
  `CS 1110 lectures Tue/Thu, got ${lec.meetings[0].days}`,
);
ok(lec.meetings[0].startDate === "2026-08-24", "US dates are normalised to ISO");

const cs4820 = courses.find((c) => c.id === "CS 4820");
ok(cs4820 && cs4820.prereqCourses.length >= 3, "CS 4820's prereq chain is parsed");
ok(
  courses.some((c) => c.career === "GR"),
  "graduate courses are present and labelled",
);

// A section with no parseable meeting must not land at midnight.
ok(
  courses.every((c) =>
    c.sections.every((s) =>
      s.meetings.every((m) => m.days.length > 0 && m.endMinutes > m.startMinutes),
    ),
  ),
  "no meeting is empty or backwards",
);
ok(
  courses.some((c) => c.sections.some((s) => s.meetings.length === 0)),
  "async/TBA sections survive parsing with zero meetings rather than being faked",
);

// Malformed input must not throw.
ok(parseCornellRoster(null).length === 0, "null payload");
ok(parseCornellRoster({}).length === 0, "empty payload");
ok(parseCornellRoster({ data: { classes: [{}, null, 3] } }).length === 0, "junk entries skipped");
ok(
  parseCornellRoster({ data: { classes: [{ subject: "CS", catalogNbr: "1110" }] } })[0].sections
    .length === 0,
  "a course with no enrolment groups parses with no sections",
);

// ========================================================= historical rosters
ok(parseRosterCode("FA26").year === 2026, "FA26 is 2026");
ok(parseRosterCode("SP14").season === "SP", "SP14 is spring");
ok(parseRosterCode("XX26") === null, "an unknown season is null, not a guess");
ok(parseRosterCode("FA2026") === null, "a four-digit year is rejected");
ok(
  parseRosterCode("FA25").order < parseRosterCode("SP26").order,
  "fall precedes the following spring in ordering",
);
ok(
  parseRosterCode("SP26").order < parseRosterCode("SU26").order &&
    parseRosterCode("SU26").order < parseRosterCode("FA26").order,
  "seasons order within a year",
);
{
  // Cornell publishes rosters back to FA14, which is what makes point-in-time
  // reconstruction possible.
  const published = ["FA14", "SP15", "FA15", "SP19", "FA19", "SP26", "FA26"];
  ok(rosterAt("2019-10-01T00:00:00Z", published) === "FA19", "October 2019 reads the FA19 roster");
  ok(rosterAt("2019-03-01T00:00:00Z", published) === "SP19", "March 2019 reads SP19");
  // THE POINT-IN-TIME RULE: never a roster that had not started yet.
  ok(
    rosterAt("2015-03-01T00:00:00Z", published) === "SP15",
    "a 2015 backtest gets the 2015 roster, not today's catalogue",
  );
  ok(
    rosterAt("2013-01-01T00:00:00Z", published) === null,
    "before the earliest published roster is null, not the earliest available",
  );
  ok(rosterAt("not-a-date", published) === null, "an unparseable date is null");
  ok(rosterAt("2026-09-11T00:00:00Z", []) === null, "no published rosters is null");
}

// ================================================================== heatmap
const heat = meetingHeatmap(courses);
ok(heat.sections > 200, `the heatmap saw real sections, got ${heat.sections}`);
ok(heat.peak > 0, "there is a busiest hour");
ok(
  heat.grid.length === 7 && heat.grid.every((r) => r.length === 24),
  "the grid is 7 days by 24 hours",
);
ok(
  heat.grid.every((r) => r.every((v) => v >= 0 && v <= 1)),
  "every cell is a normalised share",
);
ok(
  Math.max(...heat.grid.flat()) === 1,
  "the busiest hour is exactly 1 after normalisation",
);
ok(/not.*students present/i.test(heat.basis), "the basis string refuses to imply a headcount");

// The real shape of a Cornell week, which is the honest test of the model:
// teaching peaks late morning and is effectively over by 7pm.
{
  const weekdayMorning = Math.max(...[1, 2, 3, 4, 5].map((d) => heat.grid[d][10]));
  const weekdayEvening = Math.max(...[1, 2, 3, 4, 5].map((d) => heat.grid[d][19]));
  ok(
    weekdayMorning > 0.8,
    `10am on a weekday is near the peak, got ${weekdayMorning.toFixed(2)}`,
  );
  // 7pm is NOT empty — Cornell runs evening seminars, and the real roster says
  // so at about a quarter of peak. The claim worth testing is the gap, not an
  // assumption that evenings are free.
  ok(
    weekdayEvening < 0.4 && weekdayEvening > 0,
    `7pm has some teaching but far less than the peak, got ${weekdayEvening.toFixed(2)}`,
  );
  ok(
    weekdayMorning > weekdayEvening * 2,
    `the morning peak is more than twice the 7pm load: ${weekdayMorning.toFixed(2)} vs ${weekdayEvening.toFixed(2)}`,
  );
  ok(
    heat.grid[0].every((v) => v < 0.02),
    "essentially nothing is taught on Sunday",
  );
  const night = Math.max(...heat.grid.map((r) => r[3]));
  ok(night === 0, "nothing is scheduled at 3am — async sections did not land at midnight");
}

// A subject filter must actually narrow, because a club draws from departments.
{
  const csOnly = meetingHeatmap(courses, { subjects: ["CS"] });
  ok(csOnly.sections < heat.sections, "filtering to CS sees fewer sections");
  ok(csOnly.totalWeight < heat.totalWeight, "and less total instruction");
  ok(csOnly.peak > 0, "but still finds a peak");
  ok(meetingHeatmap(courses, { subjects: ["ZZZ"] }).peak === 0, "an unknown subject is empty");
  ok(
    meetingHeatmap([]).peak === 0 && meetingHeatmap([]).grid.flat().every((v) => v === 0),
    "an empty catalogue is an empty grid, not a divide-by-zero",
  );
  const upper = meetingHeatmap(courses, { levels: [4, 5, 6, 7] });
  ok(upper.sections < heat.sections, "a level filter narrows too");
}

// ---- class conflict --------------------------------------------------------
{
  // 2026-09-15 is a Tuesday. Eastern daylight time is UTC-4.
  const tue7pm = classConflict(heat, "2026-09-15T23:00:00Z");
  const tue11am = classConflict(heat, "2026-09-15T15:00:00Z");
  ok(tue7pm.weekday === 2 && tue7pm.hour === 19, "the local weekday and hour are right");
  ok(tue7pm.verdict === "clear", `Tuesday 7pm is clear, got ${tue7pm.verdict}`);
  ok(
    tue11am.intensity > tue7pm.intensity,
    `11am is busier than 7pm: ${tue11am.intensity.toFixed(2)} vs ${tue7pm.intensity.toFixed(2)}`,
  );
  ok(
    tue11am.verdict === "moderate" || tue11am.verdict === "heavy",
    `11am Tuesday is a real conflict, got ${tue11am.verdict}`,
  );
  ok(/in class/i.test(tue11am.reading), "the reading explains it in words");
  ok(
    classConflict(heat, "not-a-date").intensity === 0,
    "an unparseable time is zero, not NaN",
  );
  // The offset must be honoured, not assumed.
  const utc = classConflict(heat, "2026-09-15T15:00:00Z", 0);
  ok(utc.hour === 15, `a zero offset reads 15:00 UTC as 3pm, got ${utc.hour}`);
}

// ---- quietest hours --------------------------------------------------------
{
  const quiet = quietestHours(heat, [1, 2, 3, 4], [17, 21], 5);
  ok(quiet.length === 5, "the requested number of slots comes back");
  ok(
    quiet.every((q, i) => i === 0 || quiet[i - 1].intensity <= q.intensity),
    "sorted ascending by teaching intensity",
  );
  ok(quiet[0].hour >= 17 && quiet[0].hour <= 21, "the hour range is respected");
  const wide = quietestHours(heat, [1, 2, 3, 4, 5], [8, 22], 3);
  ok(
    wide[0].intensity <= quiet[0].intensity + 1e-9,
    "a wider search never finds a busier best slot",
  );
}

// ===================================================== structural difficulty
{
  const easy = structuralDifficulty(courses.find((c) => c.id === "CS 1110"));
  const hard = structuralDifficulty(courses.find((c) => c.id === "CS 4820"));
  ok(hard.delta > easy.delta, `CS 4820 is harder than CS 1110: ${hard.delta} vs ${easy.delta}`);
  ok(hard.components.length >= 2, "the difficulty is broken into named components");
  ok(
    hard.components.every((x) => typeof x.label === "string" && x.label.length > 0),
    "every component is labelled so a student can argue with the right term",
  );
  ok(
    Math.abs(hard.components.reduce((a, x) => a + x.contribution, 0) - hard.delta) < 1e-9,
    "the components sum to the total — no hidden term",
  );
  ok(hard.source === "structural_prior", "it declares itself a prior, not a measurement");

  // Ordering across the whole real catalogue is the real test.
  const all = courses.map((c) => ({ c, d: structuralDifficulty(c).delta }));
  const meanAt = (lvl) => {
    const xs = all.filter((x) => x.c.level === lvl).map((x) => x.d);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  ok(meanAt(1) < meanAt(2), `1000-level < 2000-level: ${meanAt(1).toFixed(2)} < ${meanAt(2).toFixed(2)}`);
  ok(meanAt(2) < meanAt(4), `2000-level < 4000-level: ${meanAt(2).toFixed(2)} < ${meanAt(4).toFixed(2)}`);
  ok(meanAt(4) < meanAt(6), "4000-level < 6000-level");

  // The specific levers, isolated.
  const base = {
    id: "X 2000", subject: "X", catalogNumber: "2000", title: "", level: 2, career: "UG",
    credits: 3, componentsRequired: ["LEC"], gradingBasis: "GRD", satisfactoryOnly: false,
    prereqText: "", prereqCourses: [], sections: [],
  };
  ok(structuralDifficulty(base).delta === 0, "a plain 2000-level 3-credit lecture is the zero point");
  ok(
    structuralDifficulty({ ...base, satisfactoryOnly: true }).delta < 0,
    "S/U-only lowers difficulty",
  );
  ok(
    structuralDifficulty({ ...base, career: "GR" }).delta > 0,
    "graduate level raises it",
  );
  ok(
    structuralDifficulty({ ...base, componentsRequired: ["LEC", "LAB", "DIS"] }).delta > 0,
    "required lab and discussion raise it",
  );
  ok(
    structuralDifficulty({ ...base, prereqCourses: Array.from({ length: 20 }, (_, i) => `X ${1000 + i}`) })
      .delta <= structuralDifficulty({ ...base, prereqCourses: ["X 1", "X 2", "X 3", "X 4", "X 5"] }).delta,
    "prerequisite depth is capped so 'or equivalent' prose cannot inflate it",
  );
  ok(
    structuralDifficulty({ ...base, componentsRequired: ["LEC", "IND"] }).delta === 0,
    "an independent-study component is not counted as extra contact",
  );

  const priors = difficultyPriors(courses);
  ok(priors.size === new Set(courses.map((c) => c.id)).size, "priors cover every distinct course");
  ok(priors.get("CS 4820") > priors.get("CS 1110"), "the prior map preserves the ordering");
}

// ====================================================== empirical difficulty
{
  const priors = { "A 1000": 0, "B 2000": 0, "C 3000": 0 };

  // Too little data: fall back to the prior and SAY SO. This is the confound
  // the whole cross-classified structure exists to avoid — one unreliable
  // person must never be reported as a hard course.
  const thin = courseDifficulty(
    [
      { personId: "p1", courseId: "A 1000", showed: false },
      { personId: "p1", courseId: "A 1000", showed: false },
      { personId: "p1", courseId: "A 1000", showed: false },
    ],
    { "A 1000": 0.2 },
  );
  ok(thin[0].identified === false, "one person is not enough to identify a course effect");
  ok(thin[0].delta === 0.2, "an unidentified course falls back exactly to its prior");
  ok(thin[0].rawDelta === null, "and reports no raw estimate at all");
  ok(thin[0].source === "structural_prior", "it says which source it used");
  ok(/too few/i.test(thin[0].reading), `the reading explains why: "${thin[0].reading}"`);

  // Enough data, and the person/course separation actually works: three people
  // of differing reliability, each across all three courses. Course C is the
  // demanding one, and the model must find that rather than blaming the least
  // reliable person.
  const obs = [];
  const reliability = { p1: 0.9, p2: 0.6, p3: 0.3 };
  const courseDrop = { "A 1000": 0, "B 2000": 0.15, "C 3000": 0.45 };
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const p of Object.keys(reliability))
    for (const c of Object.keys(courseDrop))
      for (let i = 0; i < 40; i++)
        obs.push({ personId: p, courseId: c, showed: rand() < reliability[p] - courseDrop[c] });

  const fit = courseDifficulty(obs, priors, { priorStrength: 20 });
  const byId = Object.fromEntries(fit.map((f) => [f.courseId, f]));
  ok(fit.every((f) => f.identified), "three people across three courses identifies every course");
  ok(
    byId["C 3000"].delta > byId["B 2000"].delta,
    `C is harder than B: ${byId["C 3000"].delta} vs ${byId["B 2000"].delta}`,
  );
  ok(
    byId["B 2000"].delta > byId["A 1000"].delta,
    `B is harder than A: ${byId["B 2000"].delta} vs ${byId["A 1000"].delta}`,
  );
  ok(fit[0].courseId === "C 3000", "the hardest course sorts first");
  ok(
    byId["C 3000"].dataWeight > 0.8,
    `120 observations means the data dominates, got ${byId["C 3000"].dataWeight}`,
  );

  // Shrinkage: the SAME pattern with far fewer observations must stay closer
  // to the prior. This is the guard against a confident number from thin data.
  const few = obs.filter((_, i) => i % 10 === 0);
  const shrunk = courseDifficulty(few, priors, { priorStrength: 20 });
  const shrunkC = shrunk.find((f) => f.courseId === "C 3000");
  ok(
    shrunkC.dataWeight < byId["C 3000"].dataWeight,
    `less data carries less weight: ${shrunkC.dataWeight} vs ${byId["C 3000"].dataWeight}`,
  );
  ok(
    Math.abs(shrunkC.delta - shrunkC.prior) < Math.abs(shrunkC.rawDelta - shrunkC.prior),
    "the posterior sits between the raw estimate and the prior",
  );

  // A strong prior on a course with no observations at all still reports.
  const unseen = courseDifficulty([], { "Z 9999": 1.4 });
  ok(unseen.length === 1 && unseen[0].delta === 1.4, "a course with a prior and no data reports the prior");
  ok(unseen[0].observations === 0 && unseen[0].people === 0, "and reports honestly that it saw nothing");

  ok(courseDifficulty([]).length === 0, "no observations and no priors is empty, not a crash");
  // A Map prior works identically to an object.
  ok(
    courseDifficulty([], new Map([["Z 9999", 1.4]]))[0].delta === 1.4,
    "Map and object priors behave the same",
  );
}

// ================================================================== workload
{
  const cal = {
    termStart: "2026-08-24", termEnd: "2026-12-20",
    prelimPeriods: [{ start: "2026-10-05", end: "2026-10-16" }],
    finalsStart: "2026-12-10", finalsEnd: "2026-12-18",
    breaks: [{ start: "2026-10-17", end: "2026-10-20" }],
  };
  const priors = difficultyPriors(courses);
  const pick = (...ids) => ids.map((id) => courses.find((c) => c.id === id)).filter(Boolean);

  const empty = academicLoad([]);
  ok(empty.courses === 0 && empty.weeklyHours === 0, "no courses is zero hours");
  ok(empty.verdict === "none", "and a 'none' verdict rather than 'light'");
  ok(/No courses/i.test(empty.reading), "the reading says so");

  const full = pick("CS 1110", "MATH 1920", "ECON 1110", "CS 2110");
  const load = academicLoad(full, priors);
  ok(load.courses === full.length, "every course counted");
  ok(load.credits >= 12, `a real four-course load is at least 12 credits, got ${load.credits}`);
  ok(load.contactHours > 5, `contact hours are read off real meeting patterns, got ${load.contactHours}`);
  ok(
    load.weeklyHours > load.contactHours,
    "total hours exceed contact hours — independent work is counted",
  );
  ok(
    load.weeklyHours > 25 && load.weeklyHours < 70,
    `a four-course load lands in a believable range, got ${load.weeklyHours}`,
  );
  ok(/estimate/i.test(load.basis), "the basis admits the independent half is an estimate");

  // Load must be monotone in courses: adding a course never reduces the week.
  const smaller = academicLoad(pick("CS 1110", "MATH 1920"), priors);
  ok(smaller.weeklyHours < load.weeklyHours, "fewer courses is fewer hours");
  ok(smaller.loadRatio < load.loadRatio, "and a lower load ratio");
  ok(
    // Both are rounded for display, so compare within the rounding.
    Math.abs(load.loadRatio - load.weeklyHours / STANDARD_WEEKLY_HOURS) < 2e-3,
    "the load ratio is hours against the standard full load",
  );

  // Difficulty must move the estimate, but not without bound.
  const flat = academicLoad(full, {});
  const inflated = academicLoad(full, Object.fromEntries(full.map((c) => [c.id, 5])));
  const deflated = academicLoad(full, Object.fromEntries(full.map((c) => [c.id, -5])));
  ok(inflated.weeklyHours > flat.weeklyHours, "harder courses estimate more work");
  ok(deflated.weeklyHours < flat.weeklyHours, "lighter courses estimate less");
  ok(
    inflated.weeklyHours < flat.weeklyHours * 2,
    "the difficulty adjustment is bounded — an extreme delta cannot double the week",
  );
  ok(
    inflated.contactHours === flat.contactHours,
    "contact hours are a fact and do not move with difficulty",
  );

  // Twenty parallel discussion sections are one choice for the student.
  const many = {
    ...full[0],
    sections: Array.from({ length: 20 }, (_, i) => ({
      component: "DIS", section: String(i),
      meetings: [{ days: [1], startMinutes: 600, endMinutes: 650, startDate: null, endDate: null }],
    })),
  };
  ok(
    academicLoad([many]).contactHours < 1.5,
    `parallel sections of one component count once, got ${academicLoad([many]).contactHours}h`,
  );

  // ---- pressure ------------------------------------------------------------
  const p = (d) => academicPressure(d + "T18:00:00Z", cal).pressure;
  ok(p("2026-09-15") < 0.1, `mid-September is quiet, got ${p("2026-09-15")}`);
  ok(p("2026-10-10") > 0.5, `mid-prelims is high, got ${p("2026-10-10")}`);
  ok(p("2026-12-14") > 0.9, `mid-finals is near the ceiling, got ${p("2026-12-14")}`);
  ok(p("2026-12-14") > p("2026-10-10"), "finals outweighs a prelim block");
  ok(
    p("2026-10-02") > p("2026-09-15"),
    "pressure builds BEFORE the prelim block opens — the whole reason for a kernel",
  );
  ok(
    p("2026-10-22") < p("2026-10-02"),
    "and releases faster afterwards than it built: the kernel is asymmetric",
  );
  ok(academicPressure("2026-10-18T18:00:00Z", cal).onBreak === true, "a break is detected");
  ok(p("2026-10-18") <= 0.15, "a break caps pressure however close finals are");
  ok(
    academicPressure("2026-12-14T18:00:00Z", cal).pressure <= 1,
    "overlapping kernels saturate at 1 rather than summing past it",
  );
  ok(
    academicPressure("2026-12-14T18:00:00Z", cal).drivers.some((d) => d.label === "finals"),
    "the drivers name what is causing the pressure",
  );
  ok(academicPressure("nope", cal).pressure === 0, "an unparseable time is zero, not NaN");
  ok(
    academicPressure("2026-10-10T18:00:00Z", { termStart: "2026-08-24", termEnd: "2026-12-20" })
      .pressure === 0,
    "a calendar with no assessment dates yields no pressure rather than a guess",
  );

  // ---- personal pressure ---------------------------------------------------
  const campusP = academicPressure("2026-10-10T18:00:00Z", cal);
  const heavy = personalPressure(campusP, { ...load, courses: 5, loadRatio: 1.6 });
  const light = personalPressure(campusP, { ...load, courses: 3, loadRatio: 0.6 });
  ok(heavy.pressure > campusP.pressure, "a heavy load feels the week harder than the average");
  ok(light.pressure < campusP.pressure, "a light load feels it less");
  ok(heavy.relativeToCampus > 1 && light.relativeToCampus < 1, "relative-to-campus is reported");
  ok(heavy.pressure <= 1, "personal pressure is still bounded at 1");
  ok(
    heavy.pressure / campusP.pressure < 1.6,
    "a 1.6x load is NOT 1.6x the pressure — the square root reflects the ceiling on a week",
  );
  ok(
    personalPressure(campusP, empty).relativeToCampus === 1,
    "with no recorded courses a person gets the campus average, not a penalty",
  );
}

// ============================================ the anti-double-count, the point
{
  ok(
    REGIMES.every((k) => typeof REGIME_BASELINE_PRESSURE[k] === "number"),
    "every regime declares the pressure its turnout multiplier already prices in",
  );
  ok(
    REGIME_BASELINE_PRESSURE.finals > REGIME_BASELINE_PRESSURE.prelims &&
      REGIME_BASELINE_PRESSURE.prelims > REGIME_BASELINE_PRESSURE.normal_term,
    "baseline pressure is ordered like the regimes themselves",
  );
  // The baselines must be the INVERSE ordering of the turnout multipliers, or
  // one of the two tables is wrong.
  ok(
    REGIME_TURNOUT.finals < REGIME_TURNOUT.prelims &&
      REGIME_BASELINE_PRESSURE.finals > REGIME_BASELINE_PRESSURE.prelims,
    "higher baseline pressure corresponds to a lower turnout multiplier",
  );

  // THE CRITICAL CASE: an ordinary prelim week must come out roughly neutral,
  // because REGIME_TURNOUT.prelims already discounted it. Multiplying an
  // absolute pressure factor here would charge the same effect twice.
  const ordinaryPrelims = academicFactor({
    regime: "prelims",
    pressure: { pressure: REGIME_BASELINE_PRESSURE.prelims, drivers: [], onBreak: false, reading: "" },
  });
  ok(
    Math.abs(ordinaryPrelims.pressureFactor - 1) < 1e-9,
    `an ordinary prelim week is neutral, got ${ordinaryPrelims.pressureFactor}`,
  );
  const ordinaryFinals = academicFactor({
    regime: "finals",
    pressure: { pressure: REGIME_BASELINE_PRESSURE.finals, drivers: [], onBreak: false, reading: "" },
  });
  ok(
    Math.abs(ordinaryFinals.pressureFactor - 1) < 1e-9,
    "and so is an ordinary finals week",
  );

  // A normal-term week sitting under an unusual prelim cluster is NEW
  // information the regime alone cannot express.
  const unusual = academicFactor({
    regime: "normal_term",
    pressure: { pressure: 0.55, drivers: [], onBreak: false, reading: "" },
  });
  ok(unusual.pressureFactor < 1, `an unusually loaded normal week discounts, got ${unusual.pressureFactor}`);
  ok(/above what this normal term normally carries/i.test(unusual.reading), "and says why");

  // Relief is bounded and asymmetric: a quiet finals week must not outdraw a
  // normal Tuesday.
  const quietFinals = academicFactor({
    regime: "finals",
    pressure: { pressure: 0.3, drivers: [], onBreak: false, reading: "" },
  });
  ok(quietFinals.pressureFactor > 1, "a quieter-than-usual finals week lifts expectation");
  ok(quietFinals.pressureFactor <= 1.25, "but the lift is capped");
  ok(
    quietFinals.pressureFactor - 1 < REGIME_BASELINE_PRESSURE.finals - 0.3,
    "relief helps less than the same magnitude of pressure would hurt",
  );

  // Class conflict is orthogonal and multiplies cleanly.
  const busyHour = academicFactor({
    regime: "normal_term",
    conflict: { intensity: 1, weekday: 2, hour: 11, verdict: "heavy", reading: "" },
  });
  ok(busyHour.classFactor < 1, "a fully-booked teaching hour discounts turnout");
  ok(busyHour.classFactor >= 0.3, "but never to zero — some people are always free");
  ok(
    Math.abs(busyHour.factor - busyHour.classFactor * busyHour.pressureFactor) < 1e-4,
    "the total is the product of its parts",
  );
  ok(/lost to classes/i.test(busyHour.reading), "and the reading names the cause");

  // Nothing supplied means exactly neutral, never a silent penalty.
  const nothing = academicFactor({ regime: "normal_term" });
  ok(nothing.factor === 1, `no inputs is a neutral 1, got ${nothing.factor}`);
  ok(/unremarkable/i.test(nothing.reading), "and says there is nothing to report");
  ok(
    academicFactor({ regime: "normal_term", conflict: { intensity: 99, weekday: 0, hour: 0, verdict: "heavy", reading: "" } })
      .classFactor >= 0.3,
    "an out-of-range intensity is clamped rather than trusted",
  );
}

// ================================================ end-to-end into the forecast
{
  const cal = {
    termStart: "2026-08-24", termEnd: "2026-12-20", moveInEnd: "2026-08-26", recruitingDays: 21,
    prelimPeriods: [{ start: "2026-10-05", end: "2026-10-16" }],
    breaks: [{ start: "2026-10-17", end: "2026-10-20" }],
    finalsStart: "2026-12-10", finalsEnd: "2026-12-18",
  };

  // With no roster and a bare calendar, the academic fields must be NULL, not
  // defaults. A campus we have not ingested gets an honest gap.
  const bare = campusState({
    at: "2026-09-30T23:00:00Z",
    calendar: { termStart: "2026-08-24", termEnd: "2026-12-20" },
    events: [],
  });
  ok(bare.academicPressure === null, "no assessment dates -> null pressure, not 0");
  ok(bare.classIntensity === null, "no heatmap -> null class intensity");
  ok(bare.academic === null, "and no academic factor at all");

  const withRoster = campusState({
    at: "2026-09-30T23:00:00Z",
    calendar: cal,
    events: [],
    heatmap: heat,
  });
  ok(withRoster.academicPressure !== null, "a full calendar produces a pressure reading");
  ok(withRoster.classIntensity !== null, "a heatmap produces a class intensity");
  ok(withRoster.academic !== null, "and a combined factor");
  ok(withRoster.regime === "normal_term", "the regime still comes through");

  // The end-to-end claim: the SAME turnout, at the same hour, reads differently
  // once the academic week is known. 30 people on a Tuesday two days before a
  // prelim block is not the same result as 30 on a quiet Tuesday.
  const quiet = campusState({ at: "2026-09-22T23:00:00Z", calendar: cal, events: [], heatmap: heat });
  const loaded = campusState({ at: "2026-10-03T23:00:00Z", calendar: cal, events: [], heatmap: heat });
  ok(
    loaded.academicPressure > quiet.academicPressure,
    `the days before prelims carry more pressure: ${loaded.academicPressure} vs ${quiet.academicPressure}`,
  );
  const aQuiet = behaviouralAlpha({ actual: 30, baseline: 50, state: quiet, competing: 0 });
  const aLoaded = behaviouralAlpha({ actual: 30, baseline: 50, state: loaded, competing: 0 });
  ok(
    aLoaded.expected < aQuiet.expected,
    `the same event expects fewer people under academic load: ${aLoaded.expected} vs ${aQuiet.expected}`,
  );
  ok(
    aLoaded.alpha > aQuiet.alpha,
    "so the same 30 people counts for more — which is the attribution fix, applied to coursework",
  );

  // A 7pm meeting and an 11am meeting are not the same ask.
  const evening = campusState({ at: "2026-09-22T23:00:00Z", calendar: cal, events: [], heatmap: heat });
  const midday = campusState({ at: "2026-09-22T15:00:00Z", calendar: cal, events: [], heatmap: heat });
  ok(
    midday.classIntensity > evening.classIntensity,
    "11am is a busier teaching hour than 7pm",
  );
  ok(
    behaviouralAlpha({ actual: 30, baseline: 50, state: midday, competing: 0 }).expected <
      behaviouralAlpha({ actual: 30, baseline: 50, state: evening, competing: 0 }).expected,
    "so scheduling at 11am lowers what the model expects — and raises the credit for hitting it",
  );

  // Every multiplier applied must be named. An officer told they underperformed
  // is entitled to see exactly what they were charged for.
  const explained = behaviouralAlpha({ actual: 30, baseline: 50, state: loaded, competing: 12 });
  ok(explained.factors.length >= 3, `every factor is itemised, got ${explained.factors.length}`);
  ok(
    explained.factors.every((f) => typeof f.label === "string" && Number.isFinite(f.multiplier)),
    "each factor has a label and a number",
  );
  ok(
    Math.abs(
      50 * explained.factors.reduce((a, f) => a * f.multiplier, 1) - explained.expected,
    ) < 1,
    "the named factors multiply out to the stated expectation — nothing hidden",
  );

  // An explicit academic override wins over the state's own.
  const overridden = behaviouralAlpha({
    actual: 30, baseline: 50, state: loaded, competing: 0, academic: 1,
  });
  ok(overridden.expected > aLoaded.expected, "passing a neutral academic factor removes the discount");

  // And a state with no academic data must behave exactly as before.
  const before = behaviouralAlpha({ actual: 30, baseline: 50, state: bare, competing: 0 });
  ok(
    before.expected === Math.round(50 * REGIME_TURNOUT.normal_term),
    `a context-free state is unchanged by this layer, got ${before.expected}`,
  );

  // ---- the one-call convenience -------------------------------------------
  const ctx = academicContext({ at: "2026-10-03T23:00:00Z", calendar: cal, heatmap: heat, regime: "normal_term" });
  ok(ctx.conflict !== null && ctx.pressure !== null && ctx.factor !== null, "one call returns all three");
  ok(ctx.factor.factor < 1, "and the combined factor reflects the loaded week");
  ok(
    academicContext({ at: "2026-10-03T23:00:00Z", calendar: cal }).conflict === null,
    "without a heatmap the conflict is null rather than assumed clear",
  );
}

console.log(`${checks} academic-layer assertions passed.`);

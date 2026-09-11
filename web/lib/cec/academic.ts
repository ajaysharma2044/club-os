// The academic layer: what students are actually carrying.
//
// Everything else in the context stack models the campus as a calendar of
// events. But a student's week is mostly not events — it is lectures at fixed
// hours, problem sets due on fixed days, and prelims that arrive in blocks.
// Leaving that out means a club reads "nobody came Tuesday at 7" as a club
// problem when the real answer is that a third of the relevant majors had a
// prelim the next morning.
//
//   Outcome = f(Person, Team, Club, CampusContext, AcademicLoad)
//
// Three things are computed here, and they are deliberately different in kind:
//
//   1. WHEN people are in class          — from published meeting patterns.
//      Fact. No modelling, no inference.
//   2. HOW DEMANDING a course is         — a structural prior from the
//      catalogue (level, prereq depth, credits, components, grading basis),
//      refined by observed behaviour where there is enough of it.
//   3. HOW MUCH PRESSURE is on right now — assessment kernels over the
//      academic calendar, scaled by what an individual is carrying.
//
// (1) is free and exact. (2) starts as a stated prior and only becomes an
// estimate when enough distinct people have been seen across enough distinct
// courses. (3) is a stated model. Each function says which it is, because the
// worst failure mode here would be presenting a prior as a measurement.
//
// Cornell publishes all the inputs through its Class Roster API with no key,
// back to Fall 2014 (verified live: classes.cornell.edu/api/2.0/). The shape is
// generic enough that other schools' course APIs map onto the same types.
//
// What is NOT published anywhere: per-section enrolment. Every function that
// would want a headcount uses credits and section counts as a stated proxy and
// says so in its output, rather than implying a number of students it does not
// have.
//
// Pure functions. No database, no network, no clock.

import type { AcademicCalendar, CampusState, Regime } from "./context";

// ================================================================== parsing

export type Meeting = {
  /** weekday indices, 0=Sunday .. 6=Saturday */
  days: number[];
  startMinutes: number; // from local midnight
  endMinutes: number;
  startDate: string | null;
  endDate: string | null;
};

export type Section = {
  component: string; // LEC, DIS, LAB, SEM, PRJ...
  section: string;
  meetings: Meeting[];
};

export type Course = {
  id: string; // "CS 4820"
  subject: string;
  catalogNumber: string;
  title: string;
  /** 1000-level, 2000-level... 0 when the number is non-numeric */
  level: number;
  /** UG, GR, PROF */
  career: string;
  credits: number;
  /** components a student must enrol in, e.g. ["LEC","DIS"] */
  componentsRequired: string[];
  gradingBasis: string;
  /** true when the course can only be taken S/U */
  satisfactoryOnly: boolean;
  prereqText: string;
  /** course ids named in the prerequisite text */
  prereqCourses: string[];
  sections: Section[];
};

const DAY_CODE: Record<string, number> = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };

/** "09:05AM" -> 545 minutes. Null on anything unparseable. */
export function parseClockTime(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})\s*([AP])\.?M\.?$/i);
  if (!m) return null;
  const hh = Number(m[1]);
  if (hh < 1 || hh > 12) return null;
  let h = hh % 12;
  if (m[3].toUpperCase() === "P") h += 12;
  return h * 60 + Number(m[2]);
}

/** "TR" -> [2,4]. Unrecognised letters are dropped, never guessed. */
export function parsePattern(v: unknown): number[] {
  if (typeof v !== "string") return [];
  const out: number[] = [];
  for (const ch of v.toUpperCase())
    if (ch in DAY_CODE && !out.includes(DAY_CODE[ch])) out.push(DAY_CODE[ch]);
  return out.sort((a, b) => a - b);
}

const isoDate = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};

/**
 * Course codes named in free prose: "CS 2800 and CS 3110; or a minimum grade of
 * A- in CS 2110" -> ["CS 2800","CS 3110","CS 2110"].
 *
 * Deliberately shallow. Parsing the full boolean structure of prerequisite
 * prose is a losing game — "or equivalent", "permission of instructor" and
 * "one course in" all defeat it — and the only thing downstream needs is HOW
 * MANY courses stand behind this one, which a distinct-code count answers well.
 */
export function extractCourseCodes(text: unknown): string[] {
  if (typeof text !== "string" || !text) return [];
  const out: string[] = [];
  // Cornell subject codes are 2-7 capitals: CS, MATH, AEM, NBAY, PADM...
  for (const m of text.matchAll(/\b([A-Z]{2,7})\s?(\d{4})\b/g)) {
    const id = `${m[1]} ${m[2]}`;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Cornell Class Roster API -> courses. Tolerant of missing fields. */
export function parseCornellRoster(payload: any): Course[] {
  const classes = Array.isArray(payload?.data?.classes) ? payload.data.classes : [];
  const out: Course[] = [];
  for (const c of classes) {
    const subject = typeof c?.subject === "string" ? c.subject : "";
    const catalogNumber = typeof c?.catalogNbr === "string" ? c.catalogNbr : "";
    if (!subject || !catalogNumber) continue;
    const groups = Array.isArray(c?.enrollGroups) ? c.enrollGroups : [];
    // Several enrolment groups are still one course: take the first for credits
    // and grading, and pool every section for the schedule.
    const g0 = groups[0] || {};
    // A variable-credit course counts at its minimum. Overstating load across a
    // whole catalogue compounds badly.
    const credits = Number(g0?.unitsMinimum);
    const gradingBasis = typeof g0?.gradingBasis === "string" ? g0.gradingBasis : "";
    const prereqText =
      (typeof c?.catalogPrereq === "string" && c.catalogPrereq) ||
      (typeof c?.catalogPrereqCoreq === "string" && c.catalogPrereqCoreq) ||
      "";

    const sections: Section[] = [];
    for (const g of groups) {
      for (const s of Array.isArray(g?.classSections) ? g.classSections : []) {
        const meetings: Meeting[] = [];
        for (const m of Array.isArray(s?.meetings) ? s.meetings : []) {
          const days = parsePattern(m?.pattern);
          const startMinutes = parseClockTime(m?.timeStart);
          const endMinutes = parseClockTime(m?.timeEnd);
          // An asynchronous or TBA section has no time. It occupies no hour, so
          // it must not land in the heatmap at midnight.
          if (!days.length || startMinutes === null || endMinutes === null) continue;
          if (endMinutes <= startMinutes) continue;
          meetings.push({
            days,
            startMinutes,
            endMinutes,
            startDate: isoDate(m?.startDt),
            endDate: isoDate(m?.endDt),
          });
        }
        sections.push({
          component: typeof s?.ssrComponent === "string" ? s.ssrComponent : "",
          section: typeof s?.section === "string" ? s.section : "",
          meetings,
        });
      }
    }

    out.push({
      id: `${subject} ${catalogNumber}`,
      subject,
      catalogNumber,
      title: typeof c?.titleShort === "string" ? c.titleShort : "",
      level: Math.floor(Number(catalogNumber) / 1000) || 0,
      career: typeof c?.acadCareer === "string" ? c.acadCareer : "",
      credits: Number.isFinite(credits) ? credits : 0,
      componentsRequired: Array.isArray(g0?.componentsRequired)
        ? g0.componentsRequired.filter((x: unknown) => typeof x === "string")
        : [],
      gradingBasis,
      // SUS / SUI are the S/U-only bases; OPT / OPI are the student's choice.
      satisfactoryOnly: gradingBasis === "SUS" || gradingBasis === "SUI",
      prereqText,
      prereqCourses: extractCourseCodes(prereqText),
      sections,
    });
  }
  return out;
}

// ------------------------------------------------------- historical rosters

/**
 * Roster codes are a two-letter season and a two-digit year: FA26, SP25, SU24,
 * WI23. Cornell's roster list runs back to FA14, which is what makes
 * point-in-time reconstruction of the academic environment possible at all — a
 * backtest of a 2019 recruiting cycle can be run against the courses that
 * actually ran in 2019 rather than against today's catalogue.
 */
export type RosterCode = { season: "WI" | "SP" | "SU" | "FA"; year: number; order: number };

const SEASON_ORDER: Record<string, number> = { WI: 0, SP: 1, SU: 2, FA: 3 };

export function parseRosterCode(code: unknown): RosterCode | null {
  if (typeof code !== "string") return null;
  const m = code.trim().toUpperCase().match(/^(WI|SP|SU|FA)(\d{2})$/);
  if (!m) return null;
  const season = m[1] as RosterCode["season"];
  const year = 2000 + Number(m[2]);
  return { season, year, order: year * 4 + SEASON_ORDER[season] };
}

/**
 * The roster in effect at a moment, chosen from the ones actually published.
 *
 * This is the point-in-time discipline from docs/09 applied to the catalogue.
 * Scoring a 2019 event against the 2026 course schedule is the same class of
 * error as filtering a backtest on knowledge the model did not have at the
 * time: it looks fine, and it is fiction.
 */
export function rosterAt(at: string, available: string[]): string | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  // Cornell's terms: spring Jan-May, summer Jun-Jul, fall Aug-Dec.
  const season: RosterCode["season"] = mo <= 5 ? "SP" : mo <= 7 ? "SU" : "FA";
  const want = y * 4 + SEASON_ORDER[season];
  const parsed = available
    .map((c) => ({ code: c, p: parseRosterCode(c) }))
    .filter((x): x is { code: string; p: RosterCode } => x.p !== null)
    .sort((a, b) => a.p.order - b.p.order);
  // The latest roster that had already begun. Never a future one.
  let best: string | null = null;
  for (const x of parsed) if (x.p.order <= want) best = x.code;
  return best;
}

// ================================================================== heatmap

export type Heatmap = {
  /** [weekday][hour] -> share of the busiest teaching hour of the week, 0..1 */
  grid: number[][];
  /** the busiest cell's raw weight, kept so grids can be compared */
  peak: number;
  /** total credit-weighted instruction hours across the week */
  totalWeight: number;
  /** how many course-sections contributed */
  sections: number;
  /** what the numbers mean, carried with them so a caller cannot forget */
  basis: string;
};

const EMPTY_GRID = () => Array.from({ length: 7 }, () => new Array(24).fill(0));

/**
 * When is the campus in class?
 *
 * Each meeting adds weight to every hour it overlaps, proportional to how much
 * of that hour it occupies, times the course's credits. Credits stand in for
 * student-hours because per-section enrolment is not published — a 4-credit
 * lecture is a larger claim on student time than a 1-credit lab, and that is
 * the best available ordering without a headcount.
 *
 * The grid is normalised to its own peak, so a cell reads "share of the busiest
 * teaching hour of the week". It is NOT a share of students, and `basis` says
 * so, because a reader who forgets that will over-read it.
 *
 * Pass `subjects` to restrict to the departments a club actually draws from. A
 * business club's members are not sitting in organic chemistry labs, and
 * averaging over the whole catalogue washes out the signal that matters.
 */
export function meetingHeatmap(
  courses: Course[],
  opts: { subjects?: string[]; levels?: number[] } = {},
): Heatmap {
  const grid = EMPTY_GRID();
  const subjects = opts.subjects?.length ? new Set(opts.subjects) : null;
  const levels = opts.levels?.length ? new Set(opts.levels) : null;
  let totalWeight = 0;
  let sections = 0;

  for (const c of courses) {
    if (subjects && !subjects.has(c.subject)) continue;
    if (levels && !levels.has(c.level)) continue;
    const w = c.credits > 0 ? c.credits : 1;
    for (const s of c.sections) {
      if (!s.meetings.length) continue;
      sections++;
      for (const m of s.meetings) {
        for (const d of m.days) {
          for (let h = 0; h < 24; h++) {
            const overlap =
              Math.min(m.endMinutes, h * 60 + 60) - Math.max(m.startMinutes, h * 60);
            if (overlap <= 0) continue;
            const contribution = (overlap / 60) * w;
            grid[d][h] += contribution;
            totalWeight += contribution;
          }
        }
      }
    }
  }

  let peak = 0;
  for (const row of grid) for (const v of row) peak = Math.max(peak, v);
  if (peak > 0)
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid[d][h] /= peak;

  return {
    grid,
    peak,
    totalWeight,
    sections,
    basis:
      "Credit-weighted scheduled instruction, normalised to the busiest hour of the week. Per-section enrolment is not published, so this measures scheduled teaching, not students present.",
  };
}

export type ConflictReading = {
  /** 0..1 against the busiest teaching hour of the week */
  intensity: number;
  weekday: number;
  hour: number;
  verdict: "clear" | "light" | "moderate" | "heavy";
  reading: string;
};

/** How much teaching is scheduled against a proposed local time. */
export function classConflict(
  heat: Heatmap,
  at: string,
  timeZoneOffsetHours = -4,
): ConflictReading {
  const t = Date.parse(at);
  if (!Number.isFinite(t))
    return { intensity: 0, weekday: 0, hour: 0, verdict: "clear", reading: "Unparseable time." };
  const local = new Date(t + timeZoneOffsetHours * 3600e3);
  const weekday = local.getUTCDay();
  const hour = local.getUTCHours();
  const intensity = heat.grid[weekday]?.[hour] ?? 0;
  const verdict: ConflictReading["verdict"] =
    intensity < 0.1 ? "clear" : intensity < 0.35 ? "light" : intensity < 0.7 ? "moderate" : "heavy";
  return {
    intensity,
    weekday,
    hour,
    verdict,
    reading:
      verdict === "clear"
        ? "Almost nothing is taught then."
        : verdict === "light"
          ? "A few classes run then; most people are free."
          : verdict === "moderate"
            ? "A fair amount of teaching runs then — expect some people to be in class."
            : "One of the busiest teaching hours of the week — most people are in class. Expect poor turnout whatever you plan.",
  };
}

/** The quietest teaching hours in a range, so an officer can be told where to move. */
export function quietestHours(
  heat: Heatmap,
  weekdays: number[],
  hourRange: [number, number] = [8, 22],
  limit = 5,
): { weekday: number; hour: number; intensity: number }[] {
  const out: { weekday: number; hour: number; intensity: number }[] = [];
  for (const d of weekdays)
    for (let h = hourRange[0]; h <= hourRange[1]; h++)
      out.push({ weekday: d, hour: h, intensity: heat.grid[d]?.[h] ?? 0 });
  return out
    .sort((a, b) => a.intensity - b.intensity || a.weekday - b.weekday || a.hour - b.hour)
    .slice(0, limit);
}

// ====================================================== structural difficulty

export type Difficulty = {
  courseId: string;
  /** log-odds penalty; 0 is an average course for the people who take it */
  delta: number;
  components: { label: string; contribution: number }[];
  source: "structural_prior";
  reading: string;
};

/**
 * How demanding a course is, from the catalogue alone.
 *
 * This exists because the honest empirical estimate (below) needs many distinct
 * people across many distinct courses, and one club will not have that for
 * years. The structural prior gives a usable number on day one from facts the
 * registrar already publishes, and the empirical fit shrinks toward it as data
 * arrives — the same prior-then-posterior discipline used for club health and
 * take rates elsewhere in this codebase.
 *
 * THESE WEIGHTS ARE STATED, NOT FITTED. There is nowhere near enough data to
 * estimate six coefficients, and pretending otherwise would be exactly the
 * overfitting docs/04 warns about. They are ordered to match what anyone who
 * has taken these courses would say, and they are returned as named components
 * so a student who disagrees can see which term they disagree with rather than
 * arguing with one opaque number.
 */
export function structuralDifficulty(c: Course): Difficulty {
  const components: { label: string; contribution: number }[] = [];
  const add = (label: string, v: number) => {
    if (Math.abs(v) > 1e-9) components.push({ label, contribution: Number(v.toFixed(3)) });
  };

  // Course level is the strongest published signal. Centred on 2000-level,
  // which is the modal undergraduate course.
  if (c.level > 0) add(`${c.level}000-level`, (c.level - 2) * 0.25);

  // Prerequisite depth: how many courses stand behind this one. Capped at five,
  // because prose lists "or equivalent" alternatives that inflate the count.
  const prereqs = Math.min(c.prereqCourses.length, 5);
  if (prereqs) add(`${prereqs} prerequisite course${prereqs > 1 ? "s" : ""}`, prereqs * 0.12);

  // Credits above the 3-credit default.
  if (c.credits > 3) add(`${c.credits} credits`, (c.credits - 3) * 0.15);

  // Required components beyond the lecture are extra scheduled contact hours
  // and, usually, extra graded work.
  const extra = c.componentsRequired.filter((x) => x !== "LEC" && x !== "IND");
  if (extra.length) add(`required ${extra.join(" + ")}`, extra.length * 0.15);

  // An S/U-only course carries materially less grade pressure.
  if (c.satisfactoryOnly) add("S/U only", -0.4);

  // Graduate coursework, taken by an undergraduate, is a step up.
  if (c.career === "GR") add("graduate level", 0.4);

  const delta = components.reduce((a, x) => a + x.contribution, 0);
  return {
    courseId: c.id,
    delta: Number(delta.toFixed(3)),
    components: components.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    source: "structural_prior",
    reading:
      delta > 0.8
        ? "Structurally one of the heavier courses in the catalogue."
        : delta > 0.3
          ? "Somewhat heavier than an average course."
          : delta < -0.3
            ? "Structurally lighter than average."
            : "About average structurally.",
  };
}

/** Structural priors for a whole catalogue, keyed by course id. */
export function difficultyPriors(courses: Course[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of courses) m.set(c.id, structuralDifficulty(c).delta);
  return m;
}

// ======================================================= empirical difficulty

export type CourseObservation = {
  personId: string;
  courseId: string;
  /** did this person turn up for the club thing, while enrolled in this course */
  showed: boolean;
};

export type EmpiricalDifficulty = {
  courseId: string;
  /** posterior log-odds penalty, shrunk toward the structural prior */
  delta: number;
  /** what the data alone said, before shrinkage */
  rawDelta: number | null;
  prior: number;
  observations: number;
  people: number;
  /** how much weight the data carried, 0..1 */
  dataWeight: number;
  identified: boolean;
  source: "structural_prior" | "shrunk_estimate";
  reading: string;
};

/**
 * Course demandingness estimated from behaviour, shrunk toward the catalogue.
 *
 * The same cross-classified structure as docs/11 and docs/17 — person versus
 * situation — applied to the academic half of a student's life. A course effect
 * is identifiable ONLY because the same people take different courses and the
 * same courses contain different people. With one person per course you cannot
 * tell a hard course from an unreliable student, which is precisely the
 * confound this exists to remove, so a course below `minPeople` is reported as
 * NOT identified and falls back entirely to its structural prior.
 *
 * Fitted by alternating updates rather than a full hierarchical MCMC, which is
 * the honest choice at this data scale: a proper Bayesian treatment needs more
 * people per course than a single club can supply, and for the two-factor case
 * the alternating fit lands in the same place.
 *
 * Shrinkage is n/(n+k) with k = `priorStrength` pseudo-observations, so a
 * course seen four times barely moves off the catalogue prior and one seen two
 * hundred times is essentially the data.
 */
export function courseDifficulty(
  observations: CourseObservation[],
  priors: Map<string, number> | Record<string, number> = {},
  opts: { minPeople?: number; passes?: number; priorStrength?: number } = {},
): EmpiricalDifficulty[] {
  const minPeople = opts.minPeople ?? 3;
  const passes = opts.passes ?? 40;
  const priorStrength = opts.priorStrength ?? 20;
  const priorOf = (id: string): number => {
    const v = priors instanceof Map ? priors.get(id) : (priors as Record<string, number>)[id];
    return Number.isFinite(v as number) ? (v as number) : 0;
  };

  const byCourse = new Map<string, CourseObservation[]>();
  const byPerson = new Map<string, CourseObservation[]>();
  for (const o of observations) {
    if (!byCourse.has(o.courseId)) byCourse.set(o.courseId, []);
    byCourse.get(o.courseId)!.push(o);
    if (!byPerson.has(o.personId)) byPerson.set(o.personId, []);
    byPerson.get(o.personId)!.push(o);
  }

  const theta = new Map<string, number>(); // person effect
  const delta = new Map<string, number>(); // course effect
  for (const p of byPerson.keys()) theta.set(p, 0);
  for (const c of byCourse.keys()) delta.set(c, priorOf(c));

  const EPS = 1e-3;
  const squeeze = (p: number) => Math.min(1 - EPS, Math.max(EPS, p));
  const logit = (p: number) => Math.log(p / (1 - p));
  // Add one success and one failure so a perfect record does not become an
  // infinite effect.
  const smoothed = (hits: number, n: number) => (hits + 1) / (n + 2);

  for (let pass = 0; pass < passes; pass++) {
    for (const [person, obs] of byPerson) {
      const expected =
        obs.reduce((a, o) => a + 1 / (1 + Math.exp(delta.get(o.courseId) ?? 0)), 0) / obs.length;
      const actual = smoothed(obs.filter((o) => o.showed).length, obs.length);
      theta.set(person, logit(squeeze(actual)) - logit(squeeze(expected)));
    }
    for (const [course, obs] of byCourse) {
      const expected =
        obs.reduce((a, o) => a + 1 / (1 + Math.exp(-(theta.get(o.personId) ?? 0))), 0) / obs.length;
      const actual = smoothed(obs.filter((o) => o.showed).length, obs.length);
      delta.set(course, logit(squeeze(expected)) - logit(squeeze(actual)));
    }
  }

  const seen = new Set<string>(byCourse.keys());
  if (priors instanceof Map) for (const k of priors.keys()) seen.add(k);
  else for (const k of Object.keys(priors)) seen.add(k);

  return [...seen]
    .map((courseId): EmpiricalDifficulty => {
      const obs = byCourse.get(courseId) || [];
      const prior = priorOf(courseId);
      const people = new Set(obs.map((o) => o.personId)).size;
      const identified = people >= minPeople;
      const rawDelta = identified ? (delta.get(courseId) ?? prior) : null;
      const dataWeight = identified ? obs.length / (obs.length + priorStrength) : 0;
      const posterior = rawDelta === null ? prior : dataWeight * rawDelta + (1 - dataWeight) * prior;
      return {
        courseId,
        delta: Number(posterior.toFixed(4)),
        rawDelta: rawDelta === null ? null : Number(rawDelta.toFixed(4)),
        prior: Number(prior.toFixed(4)),
        observations: obs.length,
        people,
        identified,
        dataWeight: Number(dataWeight.toFixed(3)),
        source: identified ? "shrunk_estimate" : "structural_prior",
        reading: !identified
          ? `Seen alongside ${people} ${people === 1 ? "person" : "people"} — too few to separate a demanding course from an unreliable few weeks, so this is the catalogue prior only.`
          : `${obs.length} observations across ${people} people; the data carries ${Math.round(dataWeight * 100)}% of the weight, the catalogue the rest.`,
      };
    })
    .sort((a, b) => b.delta - a.delta);
}

// ================================================================= workload

export type Load = {
  credits: number;
  /** scheduled hours in class per week */
  contactHours: number;
  /** estimated total hours per week, contact plus independent work */
  weeklyHours: number;
  /** mean difficulty across the courses carried */
  meanDifficulty: number;
  /** weeklyHours against a standard full load */
  loadRatio: number;
  courses: number;
  verdict: "none" | "light" | "standard" | "heavy" | "very_heavy";
  reading: string;
  basis: string;
};

/** A standard full-time load: 15 credits at roughly three hours per credit. */
export const STANDARD_WEEKLY_HOURS = 45;

/**
 * What one person is carrying in a week.
 *
 * Contact hours are a FACT, read straight off the published meeting patterns.
 * Independent hours are a MODEL: the registrar's own stated expectation is
 * about two hours outside class per credit, adjusted by the course's difficulty
 * so a 4000-level project course is not costed the same as a 1000-level survey
 * with identical credits.
 *
 * The two are reported separately and the adjustment is bounded, so nobody has
 * to take the single number on faith.
 */
export function academicLoad(
  enrolled: Course[],
  difficulties: Map<string, number> | Record<string, number> = {},
): Load {
  const diffOf = (id: string): number => {
    const v =
      difficulties instanceof Map
        ? difficulties.get(id)
        : (difficulties as Record<string, number>)[id];
    return Number.isFinite(v as number) ? (v as number) : 0;
  };

  let credits = 0;
  let contactMinutes = 0;
  let independent = 0;
  let deltaSum = 0;

  for (const c of enrolled) {
    credits += c.credits;
    // One meeting pattern per component. A course listing twenty parallel
    // discussion sections is one choice for the student, not twenty classes.
    const byComponent = new Map<string, Section>();
    for (const s of c.sections)
      if (s.meetings.length && !byComponent.has(s.component)) byComponent.set(s.component, s);
    for (const s of byComponent.values())
      for (const m of s.meetings)
        contactMinutes += (m.endMinutes - m.startMinutes) * m.days.length;

    const delta = diffOf(c.id);
    deltaSum += delta;
    // Two hours out of class per credit, scaled by difficulty and bounded to
    // [0.6, 1.8] so one extreme delta cannot triple someone's estimated week.
    const scale = Math.min(1.8, Math.max(0.6, Math.exp(0.35 * delta)));
    independent += c.credits * 2 * scale;
  }

  const contactHours = contactMinutes / 60;
  const weeklyHours = contactHours + independent;
  const loadRatio = weeklyHours / STANDARD_WEEKLY_HOURS;
  const verdict: Load["verdict"] = !enrolled.length
    ? "none"
    : loadRatio < 0.75
      ? "light"
      : loadRatio < 1.15
        ? "standard"
        : loadRatio < 1.45
          ? "heavy"
          : "very_heavy";

  return {
    credits,
    contactHours: Number(contactHours.toFixed(1)),
    weeklyHours: Number(weeklyHours.toFixed(1)),
    meanDifficulty: enrolled.length ? Number((deltaSum / enrolled.length).toFixed(3)) : 0,
    loadRatio: Number(loadRatio.toFixed(3)),
    courses: enrolled.length,
    verdict,
    reading:
      verdict === "none"
        ? "No courses recorded."
        : verdict === "very_heavy"
          ? `About ${Math.round(weeklyHours)} hours a week across ${enrolled.length} courses — well above a standard load. Expect very little discretionary time.`
          : verdict === "heavy"
            ? `About ${Math.round(weeklyHours)} hours a week across ${enrolled.length} courses — heavier than standard.`
            : verdict === "light"
              ? `About ${Math.round(weeklyHours)} hours a week across ${enrolled.length} courses — lighter than a standard load.`
              : `About ${Math.round(weeklyHours)} hours a week across ${enrolled.length} courses — a standard load.`,
    basis:
      "Contact hours are read from published meeting patterns. Independent hours are estimated at two per credit, adjusted for course difficulty and bounded. This estimates demand on time; it does not measure effort.",
  };
}

// ================================================================= pressure

export type PressureReading = {
  /** 0..1 campus-wide assessment pressure */
  pressure: number;
  drivers: { label: string; contribution: number; daysAway: number }[];
  onBreak: boolean;
  reading: string;
};

const DAY_MS = 86400e3;

/**
 * How much assessment is bearing down on the campus at a moment.
 *
 * A sum of kernels rather than a step function, because pressure does not
 * switch on when a prelim period opens — it builds for a week or so beforehand
 * and releases fast afterwards. Each assessment window contributes a Gaussian
 * centred on it; finals get a wider and taller kernel than a prelim block
 * because more of the grade rides on it and people start earlier.
 *
 * The kernels are ASYMMETRIC on purpose: the run-up is longer than the
 * recovery. That is how students actually experience it, and a symmetric kernel
 * would predict a dead week after finals when in fact the campus empties
 * entirely — which the break regime handles separately.
 *
 * Kernels combine probabilistically, 1 - Π(1 - x), so overlapping windows
 * saturate toward 1 instead of summing past it.
 */
export function academicPressure(
  at: string,
  cal: AcademicCalendar,
  opts: { prelimWeight?: number; finalsWeight?: number } = {},
): PressureReading {
  const t = Date.parse(at);
  if (!Number.isFinite(t))
    return { pressure: 0, drivers: [], onBreak: false, reading: "Unparseable time." };

  const drivers: { label: string; contribution: number; daysAway: number }[] = [];
  const kernel = (centreMs: number, riseDays: number, fallDays: number, weight: number) => {
    const dDays = (t - centreMs) / DAY_MS;
    const sigma = dDays < 0 ? riseDays : fallDays;
    return { v: weight * Math.exp(-(dDays * dDays) / (2 * sigma * sigma)), daysAway: -dDays };
  };

  for (const p of cal.prelimPeriods || []) {
    const a = Date.parse(p.start);
    const b = Date.parse(p.end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const { v, daysAway } = kernel((a + b) / 2, 7, 3, opts.prelimWeight ?? 0.6);
    if (v > 0.01)
      drivers.push({
        label: "prelim block",
        contribution: Number(v.toFixed(3)),
        daysAway: Math.round(daysAway),
      });
  }

  if (cal.finalsStart) {
    const a = Date.parse(cal.finalsStart);
    const b = cal.finalsEnd ? Date.parse(cal.finalsEnd) : a + 7 * DAY_MS;
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const { v, daysAway } = kernel((a + b) / 2, 12, 3, opts.finalsWeight ?? 1);
      if (v > 0.01)
        drivers.push({
          label: "finals",
          contribution: Number(v.toFixed(3)),
          daysAway: Math.round(daysAway),
        });
    }
  }

  const onBreak = (cal.breaks || []).some(
    (b) => t >= Date.parse(b.start) && t <= Date.parse(b.end),
  );
  const combined = drivers.reduce((acc, d) => acc + d.contribution - acc * d.contribution, 0);
  // A break releases pressure whatever the calendar says is coming.
  const pressure = Number((onBreak ? Math.min(combined, 0.15) : Math.min(1, combined)).toFixed(3));
  drivers.sort((a, b) => b.contribution - a.contribution);
  const top = drivers[0];

  return {
    pressure,
    drivers,
    onBreak,
    reading: onBreak
      ? "Break — academic pressure is effectively off, but so is most of the campus."
      : pressure > 0.7
        ? `Peak academic pressure${top ? ` (${top.label})` : ""}. Turnout will be poor for anything optional.`
        : pressure > 0.35
          ? `Building academic pressure${top ? ` (${top.label} in ${Math.abs(top.daysAway)} days)` : ""}.`
          : "Low academic pressure. A good window for anything that needs attention.",
  };
}

/**
 * The same moment, felt by one person.
 *
 * Campus pressure is an average; a student carrying 22 credits of 4000-level
 * courses experiences prelim season very differently from one carrying 12 on
 * S/U. The load ratio enters under a square root because a doubled workload
 * does not double felt pressure — there is a ceiling on hours in a week, and
 * past it the response flattens rather than compounding.
 */
export function personalPressure(
  campus: PressureReading,
  load: Load,
): { pressure: number; relativeToCampus: number; reading: string } {
  const ratio = load.courses ? Math.max(0.25, Math.min(2.5, load.loadRatio || 1)) : 1;
  const pressure = Math.min(1, campus.pressure * Math.sqrt(ratio));
  const relative = campus.pressure > 0 ? pressure / campus.pressure : 1;
  return {
    pressure: Number(pressure.toFixed(3)),
    relativeToCampus: Number(relative.toFixed(3)),
    reading: !load.courses
      ? "No course load recorded, so this is the campus average."
      : relative > 1.15
        ? "Carrying more than a standard load, so this week is harder for them than for the campus average."
        : relative < 0.85
          ? "Carrying less than a standard load, so this week is easier for them than for the campus average."
          : "About the campus average.",
  };
}

// ================================================== rolling into the forecast

export type AcademicFactor = {
  /** multiplier on expected turnout; 1.0 is neutral */
  factor: number;
  classFactor: number;
  pressureFactor: number;
  /** pressure the regime multiplier already accounts for */
  regimeBaselinePressure: number;
  reading: string;
};

/**
 * Pressure the regime multiplier ALREADY prices in.
 *
 * This table is the whole reason `academicFactor` is not a naive multiply.
 * `REGIME_TURNOUT.prelims = 0.75` was set precisely because prelim weeks carry
 * high assessment pressure. Multiplying that by an absolute pressure factor
 * would charge the same effect twice and forecast roughly half of what a prelim
 * week really produces — a textbook double-count, and the kind of error that is
 * invisible until the forecast is systematically wrong in one regime.
 */
export const REGIME_BASELINE_PRESSURE: Record<Regime, number> = {
  move_in: 0,
  recruiting: 0.05,
  normal_term: 0.15,
  prelims: 0.6,
  finals: 0.9,
  break: 0.05,
  graduation: 0.3,
};

/**
 * Turn the academic layer into one multiplier the attendance model can use,
 * without double-counting what the regime already captures.
 *
 * Two independent terms:
 *
 *   classFactor    — people physically in a lecture at that hour cannot attend.
 *                    Orthogonal to everything else, so it multiplies cleanly.
 *   pressureFactor — assessment load measured as the EXCESS over what this
 *                    regime normally carries. An ordinary prelim week returns
 *                    about 1 because REGIME_TURNOUT.prelims already discounted
 *                    it; a normal-term week that happens to sit under an
 *                    unusual prelim cluster returns less than 1, which is new
 *                    information the regime alone cannot express.
 *
 * Both are stated priors with documented reasoning, not fitted coefficients,
 * and both are bounded so one bad input cannot swamp the forecast.
 */
export function academicFactor(input: {
  regime: Regime;
  conflict?: ConflictReading | null;
  pressure?: PressureReading | null;
  /** proportional turnout lost at a fully-booked teaching hour */
  classSensitivity?: number;
  /** proportional turnout lost per unit of excess assessment pressure */
  pressureSensitivity?: number;
}): AcademicFactor {
  const classSensitivity = input.classSensitivity ?? 0.5;
  const pressureSensitivity = input.pressureSensitivity ?? 0.6;

  const intensity = Math.min(1, Math.max(0, input.conflict?.intensity ?? 0));
  const classFactor = Math.max(0.3, 1 - classSensitivity * intensity);

  const baseline = REGIME_BASELINE_PRESSURE[input.regime] ?? 0.15;
  // With no pressure reading, assume the regime's own baseline — which makes
  // the term exactly neutral rather than silently penalising.
  const excess = (input.pressure?.pressure ?? baseline) - baseline;
  // Excess above baseline suppresses turnout; a quieter-than-usual week lifts
  // it, but only half as much. Relief helps less than pressure hurts, and an
  // unbounded upside would let a quiet finals week outdraw a normal Tuesday.
  const pressureFactor = Math.max(
    0.4,
    Math.min(1.25, 1 - pressureSensitivity * (excess > 0 ? excess : excess * 0.5)),
  );

  const notes: string[] = [];
  if (classFactor < 0.95)
    notes.push(`${Math.round((1 - classFactor) * 100)}% lost to classes running at that hour`);
  if (pressureFactor < 0.95)
    notes.push(
      `${Math.round((1 - pressureFactor) * 100)}% lost to assessment pressure above what this ${input.regime.replace("_", " ")} normally carries`,
    );
  if (pressureFactor > 1.05)
    notes.push(
      `${Math.round((pressureFactor - 1) * 100)}% gained — academically quieter than this ${input.regime.replace("_", " ")} usually is`,
    );

  return {
    factor: Number((classFactor * pressureFactor).toFixed(4)),
    classFactor: Number(classFactor.toFixed(4)),
    pressureFactor: Number(pressureFactor.toFixed(4)),
    regimeBaselinePressure: baseline,
    reading: notes.length
      ? notes.join("; ") + "."
      : "The academic week is unremarkable for this point in the term.",
  };
}

/** The whole academic read for a proposed time, in one call. */
export function academicContext(input: {
  at: string;
  calendar: AcademicCalendar;
  heatmap?: Heatmap | null;
  state?: Pick<CampusState, "regime"> | null;
  regime?: Regime;
  timeZoneOffsetHours?: number;
}): {
  conflict: ConflictReading | null;
  pressure: PressureReading;
  factor: AcademicFactor;
} {
  const conflict = input.heatmap
    ? classConflict(input.heatmap, input.at, input.timeZoneOffsetHours)
    : null;
  const pressure = academicPressure(input.at, input.calendar);
  const regime = input.regime ?? input.state?.regime ?? "normal_term";
  return { conflict, pressure, factor: academicFactor({ regime, conflict, pressure }) };
}

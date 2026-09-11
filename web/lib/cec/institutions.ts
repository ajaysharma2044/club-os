// Institutions, their calendars, and the club-to-campus link.
//
// This is the file that stops "Cornell" being a string literal scattered
// through the codebase. Today `evidence.ts` hard-codes `ORG = "cornell-ec"`,
// `campus.ts` and `weather.ts` each keep their own `"cornell"` key, and
// `academic.ts` parses a Cornell-shaped roster. None of them agree on what the
// identifier for the institution actually is.
//
// Adding a second campus should be a row here, plus a source row, plus a
// calendar. It should never be a code change in the quant layer.
//
// ON THE CALENDAR DATES BELOW, AND WHY EACH ONE CARRIES A PROVENANCE MARK:
//
// Term start and the last day of classes are FACTS — they come straight off the
// meeting patterns in the published Class Roster (`startDt` 08/24/2026,
// `endDt` 12/07/2026, verified live against classes.cornell.edu/api/2.0).
//
// Prelim periods are NOT published anywhere. Cornell prelims are scheduled by
// individual courses, mostly in evening blocks, and no registrar feed lists
// them. The windows below are a MODELLED CONSTRUCT — a stated prior about when
// assessment clusters, not a fact. They are marked as such, because the
// difference between "the registrar says finals start on the 10th" and "we
// think prelims cluster around week six" is exactly the difference a reader
// needs in order to know how much to trust a pressure curve built on them.
//
// Anything marked `inferred` should be replaced with a curated, human-checked
// calendar before it drives a decision anyone cares about.

import type { AcademicCalendar } from "./context";

export type DateProvenance = "published" | "inferred";

export type CalendarEntry = {
  value: string;
  provenance: DateProvenance;
  /** where it came from, so a reader can go and check */
  source: string;
};

export type Institution = {
  id: string;
  name: string;
  shortName: string;
  /** IANA zone; the offset varies with daylight saving and must not be fixed */
  timeZone: string;
  /** standard-time offset from UTC, for reading local-hour grids */
  standardOffsetHours: number;
  /** key into CAMPUS_SOURCES in campus.ts */
  campusEventSource: string | null;
  /** key into WEATHER_SOURCES in weather.ts */
  weatherSource: string | null;
  /** how to reach the course roster, when one is published */
  rosterApi: string | null;
  /** rosters available for point-in-time reconstruction, oldest first */
  rosterHistoryFrom: string | null;
  emailDomain: string;
};

export const INSTITUTIONS: Institution[] = [
  {
    id: "cornell",
    name: "Cornell University",
    shortName: "Cornell",
    timeZone: "America/New_York",
    standardOffsetHours: -5,
    campusEventSource: "cornell",
    weatherSource: "cornell",
    rosterApi: "https://classes.cornell.edu/api/2.0",
    // Verified live: the roster config lists terms back to FA14.
    rosterHistoryFrom: "FA14",
    emailDomain: "cornell.edu",
  },
];

export function institution(id: string): Institution | null {
  return INSTITUTIONS.find((i) => i.id === id) || null;
}

/**
 * Local UTC offset for an instant, accounting for daylight saving.
 *
 * `standardOffsetHours` alone is wrong for two thirds of the academic year in
 * the US, which would shift every hour-of-day reading in the class heatmap by
 * one. Derived from the IANA zone rather than a hard-coded table.
 */
export function offsetHoursAt(inst: Institution, at: string): number {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return inst.standardOffsetHours;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: inst.timeZone,
      timeZoneName: "shortOffset",
    });
    const part = fmt.formatToParts(new Date(t)).find((p) => p.type === "timeZoneName");
    const m = part?.value.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
    if (!m) return inst.standardOffsetHours;
    const hours = Number(m[1]);
    const minutes = m[2] ? Number(m[2]) / 60 : 0;
    return hours + (hours < 0 ? -minutes : minutes);
  } catch {
    return inst.standardOffsetHours;
  }
}

// ================================================================ calendars

export type TermCalendar = {
  institutionId: string;
  /** roster code, e.g. FA26 */
  term: string;
  label: string;
  calendar: AcademicCalendar;
  /** per-field provenance, so a reader knows which dates are real */
  provenance: Record<string, CalendarEntry>;
  /** an honest summary of what is modelled rather than published */
  caveat: string;
};

const PUBLISHED = (value: string, source: string): CalendarEntry => ({
  value,
  provenance: "published",
  source,
});
const INFERRED = (value: string, source: string): CalendarEntry => ({
  value,
  provenance: "inferred",
  source,
});

const ROSTER = "Cornell Class Roster API, meeting patterns for FA26";
const PATTERN =
  "Modelled from Cornell's usual term structure; NOT published by the registrar";

export const TERM_CALENDARS: TermCalendar[] = [
  {
    institutionId: "cornell",
    term: "FA26",
    label: "Fall 2026",
    calendar: {
      termStart: "2026-08-24",
      termEnd: "2026-12-20",
      classesEnd: "2026-12-07",
      finalsStart: "2026-12-10",
      finalsEnd: "2026-12-17",
      moveInEnd: "2026-08-23",
      recruitingDays: 21,
      // See the header: these are a stated prior about when assessment
      // clusters, not a registrar feed. Cornell prelims are set per course.
      prelimPeriods: [
        { start: "2026-09-28", end: "2026-10-09" },
        { start: "2026-11-02", end: "2026-11-13" },
      ],
      breaks: [
        { start: "2026-10-10", end: "2026-10-13", label: "Fall break" },
        { start: "2026-11-25", end: "2026-11-29", label: "Thanksgiving" },
      ],
    },
    provenance: {
      termStart: PUBLISHED("2026-08-24", ROSTER),
      classesEnd: PUBLISHED("2026-12-07", ROSTER),
      termEnd: INFERRED("2026-12-20", PATTERN),
      finalsStart: INFERRED("2026-12-10", PATTERN),
      finalsEnd: INFERRED("2026-12-17", PATTERN),
      moveInEnd: INFERRED("2026-08-23", PATTERN),
      prelimPeriods: INFERRED("2026-09-28..2026-10-09, 2026-11-02..2026-11-13", PATTERN),
      breaks: INFERRED("Fall break, Thanksgiving", PATTERN),
    },
    caveat:
      "Term start and the last day of classes come from published roster meeting patterns. Finals, breaks and prelim windows are modelled from Cornell's usual term structure and should be replaced with a curated calendar before they drive a decision that matters.",
  },
];

export function termCalendar(institutionId: string, term: string): TermCalendar | null {
  return (
    TERM_CALENDARS.find((c) => c.institutionId === institutionId && c.term === term) || null
  );
}

/** The term covering a moment, or null. Never the nearest guess. */
export function calendarAt(institutionId: string, at: string): TermCalendar | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  for (const c of TERM_CALENDARS) {
    if (c.institutionId !== institutionId) continue;
    const start = Date.parse(c.calendar.termStart);
    const end = Date.parse(c.calendar.termEnd);
    if (t >= start && t <= end) return c;
  }
  return null;
}

/** Which calendar dates are modelled rather than published. */
export function inferredDates(c: TermCalendar): string[] {
  return Object.entries(c.provenance)
    .filter(([, v]) => v.provenance === "inferred")
    .map(([k]) => k);
}

// ==================================================================== clubs

export type ClubIdentity = {
  /** the organization_id written into episodes and activity_events */
  id: string;
  slug: string;
  name: string;
  shortName: string;
  institutionId: string;
  category: string;
  /** topics this club's members plausibly care about, for topic intensity */
  topics: Record<string, string[]>;
  /**
   * Departments this club actually draws members from. Used to restrict the
   * class heatmap: averaging over the whole catalogue washes out the signal,
   * because a business club's members are not in organic chemistry labs.
   *
   * Stated, not inferred. It should be set by officers and corrected by them,
   * never derived from members' course enrolments — that would be exactly the
   * kind of quiet inference docs/11 rules out.
   */
  drawsFrom: string[];
};

export const CLUBS: ClubIdentity[] = [
  {
    id: "cornell-ec",
    slug: "cec",
    name: "Cornell Entrepreneurship Club",
    shortName: "CEC",
    institutionId: "cornell",
    category: "Entrepreneurship",
    topics: {
      entrepreneurship: [
        "entrepreneur", "startup", "founder", "venture", "pitch",
        "accelerator", "incubator", "eship", "blackstone launchpad",
      ],
      funding: ["grant", "funding", "seed", "investor", "vc", "angel", "demo day"],
      building: ["hackathon", "build", "product", "prototype", "maker", "demo"],
      careers: ["career fair", "info session", "recruiting", "internship", "employer"],
    },
    // CEC draws heavily from Dyson/AEM, engineering and CS, plus economics.
    drawsFrom: ["AEM", "CS", "ECON", "ENGRD", "INFO", "NBA", "ORIE"],
  },
];

export function club(idOrSlug: string): ClubIdentity | null {
  return CLUBS.find((c) => c.id === idOrSlug || c.slug === idOrSlug) || null;
}

export function clubInstitution(idOrSlug: string): Institution | null {
  const c = club(idOrSlug);
  return c ? institution(c.institutionId) : null;
}

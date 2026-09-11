// Roster persistence.
//
// `academic.ts` can parse a course roster but nothing stores one, so the class
// heatmap only exists inside tests that read a fixture off disk. A planner
// answering "when should we meet" at request time has no way to get it.
//
// This is the cache. One row per (institution, term), holding the PARSED
// courses rather than the raw payload — the raw FA26 response is 282KB of prose
// descriptions and learning outcomes the engine never reads, and keeping it
// would be storing a quarter of a megabyte to use about six fields.
//
// TWO PROPERTIES THAT MATTER:
//
// Rosters are keyed by TERM, not by "current". That is what makes point-in-time
// reconstruction possible: `rosterAt()` picks the term in effect at a moment,
// and this table can hold FA19 alongside FA26 without either pretending to be
// the other. Cornell publishes back to FA14.
//
// `fetched_at` is recorded and never overwritten by a re-fetch of the same
// term. A course schedule does change during add/drop, and a decision made in
// week two was made against the schedule as it stood in week two.

import { db, id, timestamp, fail, officer, type User } from "../db";
import { parseCornellRoster, type Course } from "../academic";
import { institution } from "../institutions";

let ready = false;

export function rosterInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS roster_snapshots(
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  term TEXT NOT NULL,
  -- Parsed and slimmed. The raw payload is mostly prose we never read.
  courses TEXT NOT NULL,
  course_count INTEGER NOT NULL DEFAULT 0,
  section_count INTEGER NOT NULL DEFAULT 0,
  subjects TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  -- A re-fetch of the same term writes a NEW row. Add/drop genuinely changes
  -- the schedule, and a decision made in week two was made against week two's.
  UNIQUE(institution_id,term,fetched_at));
CREATE INDEX IF NOT EXISTS roster_lookup ON roster_snapshots(institution_id,term,observed_at);
`);
  ready = true;
}

export const ROSTER_PARSER_VERSION = "cornell-roster-v1";

export type RosterSnapshot = {
  id: string;
  institutionId: string;
  term: string;
  courses: Course[];
  courseCount: number;
  sectionCount: number;
  subjects: string[];
  source: string;
  fetchedAt: string;
  observedAt: string;
};

/** Store a parsed roster. Returns the row id. */
export function storeRoster(input: {
  institutionId: string;
  term: string;
  courses: Course[];
  source: string;
  fetchedAt?: string;
}): string {
  rosterInit();
  if (!institution(input.institutionId))
    fail(`Unknown institution "${input.institutionId}".`, 422);
  if (!/^(WI|SP|SU|FA)\d{2}$/.test(input.term))
    fail(`"${input.term}" is not a roster code like FA26.`, 422);
  if (!input.courses.length) fail("Refusing to store an empty roster.", 422);

  const at = input.fetchedAt || timestamp();
  const rowId = id();
  const sections = input.courses.reduce((a, c) => a + c.sections.length, 0);
  const subjects = [...new Set(input.courses.map((c) => c.subject))].sort();
  db()
    .prepare(
      `INSERT INTO roster_snapshots(id,institution_id,term,courses,course_count,section_count,subjects,source,parser_version,fetched_at,observed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(institution_id,term,fetched_at) DO NOTHING`,
    )
    .run(
      rowId,
      input.institutionId,
      input.term,
      JSON.stringify(input.courses),
      input.courses.length,
      sections,
      JSON.stringify(subjects),
      input.source,
      ROSTER_PARSER_VERSION,
      at,
      at,
    );
  return rowId;
}

const hydrate = (r: any): RosterSnapshot => ({
  id: r.id,
  institutionId: r.institution_id,
  term: r.term,
  courses: JSON.parse(r.courses),
  courseCount: Number(r.course_count),
  sectionCount: Number(r.section_count),
  subjects: JSON.parse(r.subjects || "[]"),
  source: r.source,
  fetchedAt: r.fetched_at,
  observedAt: r.observed_at,
});

/**
 * The roster for a term as it was known at a moment.
 *
 * `asOf` filters on `observed_at`, so replaying a week-two decision gets the
 * week-two schedule rather than the post-add/drop one. Omitting `asOf` gets the
 * latest, which is what a live planner wants.
 */
export function rosterSnapshot(
  institutionId: string,
  term: string,
  asOf?: string,
): RosterSnapshot | null {
  rosterInit();
  const row = asOf
    ? db()
        .prepare(
          "SELECT * FROM roster_snapshots WHERE institution_id=? AND term=? AND observed_at<=? ORDER BY observed_at DESC LIMIT 1",
        )
        .get(institutionId, term, asOf)
    : db()
        .prepare(
          "SELECT * FROM roster_snapshots WHERE institution_id=? AND term=? ORDER BY observed_at DESC LIMIT 1",
        )
        .get(institutionId, term);
  return row ? hydrate(row) : null;
}

/** Which terms we actually hold, for rosterAt() to choose among. */
export function storedTerms(institutionId: string): string[] {
  rosterInit();
  const rows = db()
    .prepare(
      "SELECT DISTINCT term FROM roster_snapshots WHERE institution_id=? ORDER BY term",
    )
    .all(institutionId) as { term: string }[];
  return rows.map((r) => r.term);
}

export function rosterSummary(institutionId: string) {
  rosterInit();
  return db()
    .prepare(
      `SELECT term, MAX(observed_at) observed_at, course_count, section_count, source
       FROM roster_snapshots WHERE institution_id=? GROUP BY term ORDER BY term`,
    )
    .all(institutionId);
}

// ================================================================== ingestion

/**
 * Fetch and store a Cornell roster.
 *
 * Officer-gated and deliberately explicit about the term: there is no "just get
 * the current one" convenience, because the whole value of this table is that
 * terms are addressable. A caller that does not know which term it wants has
 * not thought about the question.
 *
 * The API is public and needs no key (verified live), but it is a university's
 * infrastructure, so the fetch is single-request, timed out, and identifies
 * itself.
 */
export async function ingestCornellRoster(
  u: User,
  term: string,
  subjects: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ term: string; courses: number; sections: number; subjects: string[] }> {
  officer(u);
  rosterInit();
  const inst = institution("cornell");
  if (!inst?.rosterApi) fail("Cornell has no configured roster API.", 500);
  if (!/^(WI|SP|SU|FA)\d{2}$/.test(term)) fail(`"${term}" is not a roster code like FA26.`, 422);
  const wanted = subjects.map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  if (!wanted.length) fail("Name at least one subject to ingest.", 422);

  const courses: Course[] = [];
  for (const subject of wanted) {
    const url = `${inst.rosterApi}/search/classes.json?roster=${encodeURIComponent(term)}&subject=${encodeURIComponent(subject)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ClubOS/1.0 (campus context for student clubs; contact via club officers)",
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
    });
    // A subject with no classes in a term is a normal answer, not an error.
    if (!res.ok) continue;
    courses.push(...parseCornellRoster(await res.json()));
  }
  if (!courses.length)
    fail(`The roster returned no classes for ${term} in ${wanted.join(", ")}.`, 502);

  storeRoster({
    institutionId: "cornell",
    term,
    courses,
    source: `${inst.rosterApi}/search/classes.json`,
  });
  return {
    term,
    courses: courses.length,
    sections: courses.reduce((a, c) => a + c.sections.length, 0),
    subjects: [...new Set(courses.map((c) => c.subject))].sort(),
  };
}

// The officer-facing planning endpoint: "when should we hold this?"
//
// This is the thin DB adapter over `recommendSlot`. The recommendation logic is
// pure and lives next door; this file's only job is to gather what the club
// actually has ingested, hand it over, and be honest about what is missing.
//
// THE DESIGN RULE HERE IS THE SAME ONE AS EVERYWHERE ELSE, and it is worth
// restating because this is the surface an officer will actually look at:
//
//   A missing input is reported as missing. It is never quietly replaced with
//   a neutral default that looks like knowledge.
//
// No roster ingested means class conflict is UNKNOWN, not "the hour is clear".
// No campus feed means competition is UNKNOWN, not "a quiet night". Both would
// produce a confident-looking recommendation built on nothing, which is worse
// than no recommendation at all — because somebody will act on it.

import { db, officer, member, text, fail, timestamp, type User } from "../db";
import { club, institution, calendarAt, offsetHoursAt } from "../institutions";
import { rosterSnapshot, storedTerms, rosterSummary } from "../context/roster";
import { checkinInit } from "../checkin";
import { rosterAt, meetingHeatmap } from "../academic";
import { campusEventsAsOf, type CanonicalEvent } from "../context/campus-events";
import type { CampusEvent } from "../campus";
import { recommendSlot, type SchedulingContext, type SlotRecommendation } from "./scheduling";

/**
 * Canonical campus events -> the shape the scheduler consumes.
 *
 * These two types are genuinely different and a cast between them compiles
 * cleanly while being completely wrong: `CanonicalEvent.start_at` is not
 * `CampusEvent.startsAt`, so `competingEvents()` would parse `undefined`, get
 * NaN, filter every row out, and report a quiet campus forever. Silent, and
 * indistinguishable from a genuinely empty calendar.
 *
 * Rows with no start time are DROPPED rather than defaulted. An event with no
 * known time cannot overlap a window, and giving it one would invent
 * competition that was never on the calendar.
 */
function toCampusEvents(rows: CanonicalEvent[]): CampusEvent[] {
  const out: CampusEvent[] = [];
  for (const r of rows) {
    if (!r.start_at || !Number.isFinite(Date.parse(r.start_at))) continue;
    out.push({
      source: r.institution_id,
      externalId: r.id,
      title: r.title,
      startsAt: new Date(r.start_at).toISOString(),
      endsAt:
        r.end_at && Number.isFinite(Date.parse(r.end_at))
          ? new Date(r.end_at).toISOString()
          : null,
      locationName: r.location || "",
      url: r.url || "",
      tags: [...(r.topics || []), ...(r.audiences || [])],
      // The canonical store does not carry a cancellation flag. Treating every
      // row as live is the conservative direction here: it can only ever
      // overstate competition, never talk an officer into a night that was
      // actually busy.
      cancelled: false,
      rsvpTotal: null,
      registrationLimit: null,
    });
  }
  return out;
}

/** How many candidate times an officer may compare at once. */
const MAX_SLOTS = 12;

export type PlanningReadiness = {
  institutionId: string;
  term: string | null;
  roster: { term: string; courses: number; sections: number } | null;
  campusEvents: number;
  /** everything the planner would use but does not have */
  missing: { input: string; consequence: string; fix: string }[];
  ready: boolean;
};

/**
 * What the planner can and cannot see right now.
 *
 * Surfaced as its own call so an officer can find out WHY a recommendation is
 * thin without having to request one and read the caveats.
 */
export function planningReadiness(u: User, at?: string): PlanningReadiness {
  member(u);
  const c = club("cec");
  if (!c) fail("Club is not configured.", 500);
  const when = at || timestamp();
  const inst = institution(c.institutionId)!;
  const term = calendarAt(c.institutionId, when);
  const missing: PlanningReadiness["missing"] = [];

  const terms = storedTerms(c.institutionId);
  const code = rosterAt(when, terms);
  const snap = code ? rosterSnapshot(c.institutionId, code, when) : null;

  if (!term)
    missing.push({
      input: "academic calendar",
      consequence:
        "Regime and assessment pressure cannot be computed, so the planner cannot tell a prelim week from a quiet one.",
      fix: `Add the term covering ${when.slice(0, 10)} to lib/cec/institutions.ts.`,
    });
  if (!snap)
    missing.push({
      input: "course roster",
      consequence:
        "Class conflict is unknown, not clear. The planner cannot tell an 11am lecture hour from an empty evening.",
      fix: `Ingest a roster: POST planning/roster with a term and subjects (${c.drawsFrom.join(", ")}).`,
    });

  let campusEvents = 0;
  try {
    campusEvents = campusEventsAsOf(c.institutionId, when).length;
  } catch {
    campusEvents = 0;
  }
  if (!campusEvents)
    missing.push({
      input: "campus calendar",
      consequence:
        "Competing events are unknown, not zero. An empty feed is not evidence of a quiet campus.",
      fix: "Crawl a permitted campus source into campus_events.",
    });

  return {
    institutionId: c.institutionId,
    term: term?.term ?? null,
    roster: snap
      ? { term: snap.term, courses: snap.courseCount, sections: snap.sectionCount }
      : null,
    campusEvents,
    missing,
    ready: missing.length === 0,
  };
}

export type SlotAdviceResult = SlotRecommendation & {
  readiness: PlanningReadiness;
};

/**
 * Rank candidate times for a proposed event.
 *
 * Officer-gated: this reads the whole club's history and the campus context,
 * and it produces a recommendation an officer will act on. A member asking
 * about their own availability is a different question with a different answer.
 */
export function slotAdvice(u: User, b: any): SlotAdviceResult {
  officer(u);
  const c = club("cec");
  if (!c) fail("Club is not configured.", 500);
  const inst = institution(c.institutionId)!;

  const candidates: string[] = Array.isArray(b?.slots)
    ? b.slots.map((s: unknown) => String(s)).slice(0, MAX_SLOTS)
    : [];
  if (candidates.length < 2)
    fail("Give at least two candidate times to compare.", 422);
  for (const s of candidates)
    if (!Number.isFinite(Date.parse(s)))
      fail(`"${s}" is not a time this system can read.`, 422);

  const asOf = b?.as_of ? String(b.as_of) : timestamp();
  const readiness = planningReadiness(u, candidates[0]);

  // Assemble whatever the club actually has. Anything absent stays absent.
  const term = calendarAt(c.institutionId, candidates[0]);
  if (!term)
    fail(
      `No academic term is configured for ${candidates[0].slice(0, 10)}. The planner will not assume a normal week.`,
      422,
    );

  const terms = storedTerms(c.institutionId);
  const code = rosterAt(candidates[0], terms);
  const snap = code ? rosterSnapshot(c.institutionId, code, asOf) : null;
  // Restrict to the departments this club draws from. Averaging over the whole
  // catalogue washes out the signal that matters.
  const heatmap = snap ? meetingHeatmap(snap.courses, { subjects: c.drawsFrom }) : null;

  let campusEvents: CampusEvent[] = [];
  try {
    campusEvents = toCampusEvents(campusEventsAsOf(c.institutionId, asOf));
  } catch {
    campusEvents = [];
  }

  // `checkins` is created lazily by checkinInit(), so a database on which
  // nobody has yet opened a sign-in window does not have it. Calling the init
  // is the codebase's idiom for this (scheduling.ts calls evidenceInit() for
  // the same reason); assuming the table exists throws on a fresh install.
  checkinInit();

  // Comparable past events, for the conversion posterior: RSVPs against the
  // attendance we actually recorded. Only closed events with both numbers.
  const comparables = db()
    .prepare(
      `SELECT i.id,
              (SELECT COUNT(*) FROM rsvps r WHERE r.event_id=i.id AND r.status='yes') rsvps,
              (SELECT COUNT(*) FROM checkins ck WHERE ck.event_id=i.id) attended
       FROM items i
       WHERE i.kind='event' AND i.created_at <= ?
       ORDER BY i.created_at DESC LIMIT 40`,
    )
    .all(asOf) as { rsvps: number; attended: number }[];
  const usable = comparables.filter((r) => r.rsvps > 0 && r.attended <= r.rsvps);

  const context: SchedulingContext = {
    asOf,
    calendar: term.calendar,
    campusEvents,
    heatmap,
    timeZoneOffsetHours: offsetHoursAt(inst, candidates[0]),
    outdoors: b?.outdoors === true,
    rsvps: Number.isFinite(Number(b?.rsvps)) ? Math.max(0, Number(b.rsvps)) : undefined,
    comparables: usable.map((r) => ({ rsvps: r.rsvps, attended: r.attended })),
    features: {
      foodProvided: b?.food === true,
      foodAdvertised: b?.food_advertised === true,
    },
  };

  const result = recommendSlot(candidates, context);

  // Surface the gaps on the recommendation itself. An officer reading a ranked
  // list should not have to make a second call to learn it was built without a
  // roster.
  const limitations = [...result.limitations];
  for (const m of readiness.missing) limitations.push(`${m.input}: ${m.consequence}`);

  return { ...result, limitations, readiness };
}

// ==================================================================== router

export async function planning(u: User, action: string, b: any): Promise<any> {
  if (action === "readiness") return planningReadiness(u, b?.at ? String(b.at) : undefined);
  if (action === "slots") return slotAdvice(u, b);
  if (action === "roster") {
    officer(u);
    const { ingestCornellRoster } = await import("../context/roster");
    const c = club("cec")!;
    const subjects: string[] = Array.isArray(b?.subjects) && b.subjects.length
      ? b.subjects.map((s: unknown) => String(s))
      : c.drawsFrom;
    return ingestCornellRoster(u, text(b?.term, 8), subjects);
  }
  if (action === "roster/summary") {
    member(u);
    const c = club("cec")!;
    return { institution: c.institutionId, terms: rosterSummary(c.institutionId) };
  }
  fail("Unknown planning action.", 404);
}

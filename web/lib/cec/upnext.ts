// "Up next" — the home screen.
//
// The screen it replaces showed four static counts: published events, open
// commitments, projects, members. That is Canvas's exact failure mode, and
// docs/22 §2 names the mechanism: STATE LIVES OUTSIDE THE INTERFACE. The old
// home told you the state of the world and nothing about what needs YOU, and
// nothing on it ever moved.
//
// This returns one time-ordered list of things a specific person has to do
// something about, over the next seven days. Four properties do the work
// (docs/22 §5.1):
//
//   1. The top row is the next thing with a time and a place.
//   2. Every row carries its action inline — no row is a link to a page where
//      the real action lives.
//   3. ROWS ARE NOT LIMITED TO OBJECTS WITH A DUE DATE. This is the specific
//      repair of Canvas's To Do list, which is populated only by objects
//      carrying a due date — so "be in Phillips 203 at 7pm" never appears in
//      it. Most club obligations have a time and a place, not a deadline.
//   4. A changed time or place is shown as a DIFF, not silently replaced.
//
// Property 4 is the highest-conviction item in the research and the direct fix
// for the most expensive failure in docs/12 §1: a room moved, the listing was
// never updated, people walked to the wrong building, and "URGENT" went out at
// 6:55pm for a 7pm start.
//
// WHAT THIS DELIBERATELY DOES NOT DO. It does not rank by predicted engagement,
// it does not surface anything the person has not been asked to act on, and it
// carries no model output — docs/06 §7: no student ever sees a model output
// they did not ask for. It is a list of obligations in time order. That is all.

import { db, member, timestamp, type User } from "./db";

const HOUR = 3600e3;
const DAY = 24 * HOUR;

/** How far ahead the list looks. A week is what a student can act on. */
export const HORIZON_DAYS = 7;
/** A change this close to the start is worth interrupting someone about. */
export const DIFF_WINDOW_HOURS = 48;
/** How long a diff keeps showing after the edit. */
export const DIFF_VISIBLE_HOURS = 24;

export type RowAction = {
  /** what the button does, resolved by the client against the existing API */
  kind: string;
  label: string;
  /** the object it acts on */
  target: string;
  /** true when this is the action we expect most people to take */
  primary?: boolean;
};

export type Change = {
  field: "location" | "starts_at";
  from: string;
  to: string;
  changedAt: string;
};

export type UpNextRow = {
  id: string;
  kind: "event" | "task" | "coffee_chat" | "interview" | "question" | "message";
  title: string;
  /** when it happens, or when it is due */
  at: string | null;
  /** null when the object genuinely has no place, not when we failed to find one */
  place: string | null;
  /** the member's own state: going, assigned, unanswered... */
  state: string;
  /** social proof, where it is a real count and not a guess */
  count: { going: number; capacity: number | null } | null;
  /** what moved, and from what. Empty when nothing did. */
  changes: Change[];
  actions: RowAction[];
  /** true when the person has not yet responded at all */
  needsAnswer: boolean;
};

export type UpNext = {
  asOf: string;
  horizonDays: number;
  rows: UpNextRow[];
  /** unanswered things beyond the horizon, as a single count — not a list */
  laterCount: number;
  /** two-tier unread: a number ONLY for things addressed to this person */
  directed: { mentions: number; messages: number };
  /** ambient activity gets a boolean, never a number (docs/22 Pattern 1) */
  ambient: boolean;
  note: string;
};

/**
 * Changes to an event's time or place, read back out of the record.
 *
 * `captureItem` stamps `previous_location` / `previous_starts_at` into the
 * event's `.updated` context whenever the value actually moved. This reads
 * those rows rather than keeping a second changelog, so the diff and the record
 * cannot disagree.
 */
function recentChanges(eventId: string, startsAt: string, now: number): Change[] {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) return [];
  const rows = db()
    .prepare(
      `SELECT occurred_at, context FROM activity_events
       WHERE object_type IN ('event','meeting') AND object_id=? AND event_type LIKE '%.updated'
       ORDER BY seq DESC LIMIT 10`,
    )
    .all(eventId) as { occurred_at: string; context: string }[];

  const out: Change[] = [];
  for (const r of rows) {
    const changedAt = Date.parse(r.occurred_at);
    // Only edits made close to the start, and only while the diff is fresh.
    // An event rescheduled a month out is not news; one moved this morning is.
    if (start - changedAt > DIFF_WINDOW_HOURS * HOUR) continue;
    if (now - changedAt > DIFF_VISIBLE_HOURS * HOUR) continue;
    let ctx: any = {};
    try {
      ctx = JSON.parse(r.context || "{}");
    } catch {
      continue;
    }
    if (ctx.previous_location !== undefined && ctx.previous_location !== null)
      out.push({
        field: "location",
        from: String(ctx.previous_location),
        to: "",
        changedAt: r.occurred_at,
      });
    if (ctx.previous_starts_at !== undefined && ctx.previous_starts_at !== null)
      out.push({
        field: "starts_at",
        from: String(ctx.previous_starts_at),
        to: "",
        changedAt: r.occurred_at,
      });
  }
  // Only the most recent change per field. Three edits in an hour is one move.
  const seen = new Set<string>();
  return out.filter((c) => (seen.has(c.field) ? false : (seen.add(c.field), true)));
}

/**
 * What needs this person, in time order, for the next seven days.
 *
 * Member-gated: this is a personal list. An officer's view of the club is a
 * different screen and should be (docs/22 §5.4).
 */
export function upNext(u: User, asOfIso?: string): UpNext {
  member(u);
  const asOf = asOfIso || timestamp();
  const now = Date.parse(asOf);
  const horizonEnd = new Date(now + HORIZON_DAYS * DAY).toISOString();
  const rows: UpNextRow[] = [];

  // ---- events -------------------------------------------------------------
  // Published events inside the horizon, whether or not the person answered.
  // An unanswered event is the single most common thing a club needs from a
  // member, and it has no due date — which is why Canvas's model cannot hold it.
  const events = db()
    .prepare(
      `SELECT id, data, updated_at FROM items WHERE kind='event' ORDER BY created_at DESC LIMIT 200`,
    )
    .all() as { id: string; data: string; updated_at: string }[];

  for (const e of events) {
    let d: any = {};
    try {
      d = JSON.parse(e.data);
    } catch {
      continue;
    }
    if (d.status !== "published") continue;
    const startsAt = d.starts_at;
    const start = Date.parse(startsAt);
    if (!Number.isFinite(start) || start < now || startsAt > horizonEnd) continue;

    const mine = db()
      .prepare("SELECT status, attendance FROM rsvps WHERE event_id=? AND user_id=?")
      .get(e.id, u.id) as { status: string; attendance: string | null } | undefined;
    const going = (
      db()
        .prepare("SELECT COUNT(*) n FROM rsvps WHERE event_id=? AND status='yes'")
        .get(e.id) as { n: number }
    ).n;

    const state = !mine ? "unanswered" : mine.status;
    const actions: RowAction[] = !mine
      ? [
          { kind: "rsvp.yes", label: "I'm going", target: e.id, primary: true },
          { kind: "rsvp.no", label: "Can't", target: e.id },
        ]
      : mine.status === "yes"
        ? [{ kind: "rsvp.no", label: "Can't make it", target: e.id }]
        : [{ kind: "rsvp.yes", label: "I'm going", target: e.id, primary: true }];

    const changes = recentChanges(e.id, startsAt, now).map((c) => ({
      ...c,
      to: c.field === "location" ? (d.location ?? "") : startsAt,
    }));

    rows.push({
      id: e.id,
      kind: "event",
      title: String(d.title || "Event"),
      at: startsAt,
      place: d.location ? String(d.location) : null,
      state,
      count: {
        going,
        capacity: Number.isFinite(Number(d.capacity)) ? Number(d.capacity) : null,
      },
      changes,
      actions,
      needsAnswer: !mine,
    });
  }

  // ---- tasks assigned to me ----------------------------------------------
  const tasks = db()
    .prepare("SELECT id, data FROM items WHERE kind='task' ORDER BY created_at DESC LIMIT 300")
    .all() as { id: string; data: string }[];
  for (const t of tasks) {
    let d: any = {};
    try {
      d = JSON.parse(t.data);
    } catch {
      continue;
    }
    if (d.assignee !== u.id) continue;
    if (["completed", "cancelled"].includes(d.status)) continue;
    const due = d.due_at;
    // A task with no due date still belongs here if it is assigned and open —
    // it simply sorts after everything that has a time.
    if (due && due > horizonEnd) continue;

    rows.push({
      id: t.id,
      kind: "task",
      title: String(d.title || "Task"),
      at: due || null,
      place: null,
      state: d.status === "accepted" && d.work_history?.at(-1)?.kind === "revision" ? "changes_requested" : d.status || "assigned",
      count: null,
      changes: [],
      actions:
        d.status === "assigned"
          ? [
              { kind: "task.accept", label: "Accept", target: t.id, primary: true },
              { kind: "task.decline", label: "Decline", target: t.id },
            ]
          : [{ kind: "task.view", label: d.status === "submitted" ? "View submitted work" : d.work_history?.at(-1)?.kind === "revision" ? "Review feedback" : "Submit work", target: t.id, primary: true }],
      needsAnswer: d.status === "assigned",
    });
  }

  // ---- coffee chats I booked ---------------------------------------------
  const chats = db()
    .prepare(
      `SELECT b.slot_id, i.data FROM bookings b JOIN items i ON i.id=b.slot_id
       WHERE b.user_id=? AND i.kind='slot'`,
    )
    .all(u.id) as { slot_id: string; data: string }[];
  for (const c of chats) {
    let d: any = {};
    try {
      d = JSON.parse(c.data);
    } catch {
      continue;
    }
    const at = d.starts_at;
    if (!at || Date.parse(at) < now || at > horizonEnd) continue;
    rows.push({
      id: c.slot_id,
      kind: "coffee_chat",
      title: String(d.title || "Coffee chat"),
      at,
      place: d.location ? String(d.location) : null,
      state: "booked",
      count: null,
      changes: [],
      actions: [{ kind: "booking.cancel", label: "Cancel", target: c.slot_id }],
      needsAnswer: false,
    });
  }

  // Time order, with undated open work after everything that has a time.
  rows.sort((a, b) => {
    if (a.at && b.at) return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
    if (a.at) return -1;
    if (b.at) return 1;
    return 0;
  });

  // Unanswered things beyond the horizon become a COUNT, never a list. A home
  // screen that grows without bound is a feed, and docs/22 §6.2 refuses that.
  const laterCount = events.filter((e) => {
    try {
      const d = JSON.parse(e.data);
      return (
        d.status === "published" &&
        d.starts_at > horizonEnd &&
        !db()
          .prepare("SELECT 1 FROM rsvps WHERE event_id=? AND user_id=?")
          .get(e.id, u.id)
      );
    } catch {
      return false;
    }
  }).length;

  return {
    asOf,
    horizonDays: HORIZON_DAYS,
    rows,
    laterCount,
    // Filled in by the caller from the messaging layer, which is walled off
    // from this module's data and must stay that way.
    directed: { mentions: 0, messages: 0 },
    ambient: false,
    note: rows.length
      ? "Your upcoming plans and open work."
      : "Nothing needs you in the next week.",
  };
}

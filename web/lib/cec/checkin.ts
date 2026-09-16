// Check-in and attendance integrity.
//
// Two hours before an event the president asked whether a sign-in system was
// ready — "can be bare bones" — and an officer shipped a QR check-in page that
// same afternoon (docs/12 §6). Separately an officer's Startup Hours proposal
// (docs/12 §15) specified the two parts a bare-bones QR page does not have:
// a sign-in window tied to food service, and escalation for take-food-and-leave
// — tolerated once, blocked at the next sign-in. docs/13 §2.2 is the spec.
//
// This module extends the existing attendance path rather than replacing it.
// Events are `items` rows with kind='event'; registrations are `rsvps` rows.
// Every check-in writes `rsvps.attendance` exactly the way service.ts's
// `attendance` action does, so every screen and query that already reads that
// column keeps working and keeps telling the truth. It also calls
// `capturePresence` from evidence.ts so a self check-in lands in the episode /
// evidence trail on the same footing as an officer-recorded one.

import {
  db,
  fail,
  id,
  text,
  date,
  item,
  timestamp,
  officer,
  member,
  audit,
  emit,
  type User,
} from "./db";
import { capturePresence } from "./evidence";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Rotating signed codes
// ---------------------------------------------------------------------------
//
// A static QR is a screenshot away from being useless: the first person through
// the door photographs it, sends it to the group chat, and four people who are
// not in the room are marked present. The fix is that the code is a function of
// time, so a screenshot is stale before it can be forwarded.
//
//   code = HMAC-SHA256(server_secret, "<event id>:<30-second bucket>")
//
// rendered as 8 characters of an unambiguous alphabet (~41 bits). Three
// properties fall out of that construction:
//
//   * It is derived, not stored — there is no table of live codes to leak, and
//     the display screen can recompute it every second with no writes.
//   * It is bound to the event id, so a code harvested at last week's Startup
//     Hours does not check anyone in here.
//   * It is bound to a time bucket, so it expires on its own in at most 30
//     seconds whether or not anyone remembers to rotate it.
//
// Verification accepts the current bucket and the immediately previous one.
// That is the clock-skew and human-latency allowance: a phone whose clock is a
// few seconds off, or a person who scans as the projector ticks over, must not
// be turned away at the door. Two buckets is the smallest window that covers
// both, and it caps a stolen code's useful life at 60 seconds.
//
// The secret lives in the `settings` table (or CEC_CHECKIN_SECRET) so codes
// survive a restart mid-event. Comparison is constant-time; the route layer
// should rate-limit failed scans on top of this.

const WINDOW_MS = 30_000;
const CODE_LENGTH = 8;
/** No I, L, O, 0 or 1 — the code gets read aloud when a camera will not focus. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SECRET_KEY = "checkin.secret";

/** Minutes after the window opens before an arrival is called late. */
const DEFAULT_GRACE_MINUTES = 15;

let cachedSecret = "";
function secret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.CEC_CHECKIN_SECRET;
  if (fromEnv && fromEnv.length >= 16) return (cachedSecret = fromEnv);
  checkinInit();
  db()
    .prepare("INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)")
    .run(SECRET_KEY, randomBytes(32).toString("hex"));
  const row = db()
    .prepare("SELECT value FROM settings WHERE key=?")
    .get(SECRET_KEY) as { value: string };
  return (cachedSecret = row.value);
}

function bucket(at: number): number {
  return Math.floor(at / WINDOW_MS);
}

function derive(eventId: string, at: number): string {
  const digest = createHmac("sha256", secret())
    .update(`${eventId}:${bucket(at)}`)
    .digest();
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++)
    out += ALPHABET[digest[i] % ALPHABET.length];
  return out;
}

/** The code to put on the projector right now. */
export function currentCode(eventId: string): string {
  return derive(text(eventId, 64), Date.now());
}

/** The code that was on screen at a given instant. Diagnostics and tests. */
export function codeAt(eventId: string, at: number): string {
  return derive(text(eventId, 64), at);
}

function normalize(code: unknown): string {
  if (typeof code !== "string") return "";
  const cleaned = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== CODE_LENGTH) return "";
  for (const c of cleaned) if (!ALPHABET.includes(c)) return "";
  return cleaned;
}

/** True for the current 30s bucket or the one immediately before it. */
export function verifyCode(eventId: string, code: unknown): boolean {
  const given = normalize(code);
  if (!given) return false;
  const now = Date.now();
  const buf = Buffer.from(given);
  let matched = false;
  // Both candidates are always compared so verification takes the same time
  // whether the first, the second, or neither matched.
  for (const at of [now, now - WINDOW_MS]) {
    const candidate = Buffer.from(derive(eventId, at));
    if (
      candidate.length === buf.length &&
      timingSafeEqual(candidate, buf)
    )
      matched = true;
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
//
// `checkin_windows` is deliberately separate from the event's starts_at /
// ends_at. The officer's proposal is precise about why: food service time is
// the control point, not the programme. Startup Hours runs 18:00–21:00 and the
// pizza lands at 18:15; sign-in opens 18:00 and closes 18:45, and an event that
// serves no food can carry a window that is not a food event at all.
//
// `integrity_events` is the append-only record of take-food-and-leave.
// `integrity_flags` is the single current state per person, reversible, with
// the officer who set it and the officer who cleared it both named.

let ready = false;
export function checkinInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS checkin_windows(
  event_id TEXT PRIMARY KEY REFERENCES records(id),
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  grace_minutes INTEGER NOT NULL DEFAULT ${DEFAULT_GRACE_MINUTES},
  food INTEGER NOT NULL DEFAULT 1,
  opened_by TEXT NOT NULL,
  opened_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS checkins(
  event_id TEXT NOT NULL REFERENCES records(id),
  user_id TEXT NOT NULL REFERENCES accounts(id),
  at TEXT NOT NULL,
  method TEXT NOT NULL,
  late INTEGER NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  walk_in INTEGER NOT NULL DEFAULT 0,
  recorded_by TEXT NOT NULL,
  PRIMARY KEY(event_id,user_id));
CREATE INDEX IF NOT EXISTS checkin_person ON checkins(user_id,at);
CREATE TABLE IF NOT EXISTS integrity_events(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES accounts(id),
  event_id TEXT NOT NULL REFERENCES records(id),
  kind TEXT NOT NULL DEFAULT 'left_early',
  at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS integrity_once
  ON integrity_events(user_id,event_id,kind);
CREATE TABLE IF NOT EXISTS integrity_flags(
  user_id TEXT PRIMARY KEY REFERENCES accounts(id),
  state TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 0,
  set_by TEXT NOT NULL DEFAULT '',
  set_at TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  cleared_by TEXT NOT NULL DEFAULT '',
  cleared_at TEXT NOT NULL DEFAULT '',
  cleared_reason TEXT NOT NULL DEFAULT '',
  counted_from TEXT NOT NULL DEFAULT '');
`);
  ready = true;
}

export type FlagState = "clear" | "noted" | "blocked";

export type Flag = {
  user_id: string;
  state: FlagState;
  occurrences: number;
  set_by: string;
  set_at: string;
  reason: string;
  cleared_by: string;
  cleared_at: string;
  cleared_reason: string;
  counted_from: string;
};

export type CheckinWindow = {
  event_id: string;
  opens_at: string;
  closes_at: string;
  grace_minutes: number;
  food: number;
  opened_by: string;
  opened_at: string;
};

export type CheckinResult = {
  event_id: string;
  user_id: string;
  status: "present";
  method: "qr" | "officer";
  at: string;
  late: boolean;
  late_minutes: number;
  walk_in: boolean;
  /** true when this call found an existing check-in and changed nothing */
  already: boolean;
  /** set when an officer overrode something the member path would refuse */
  warning?: string;
};

function windowFor(eventId: string): CheckinWindow {
  checkinInit();
  const row = db()
    .prepare("SELECT * FROM checkin_windows WHERE event_id=?")
    .get(eventId) as CheckinWindow | undefined;
  if (!row)
    fail(
      "Sign-in is not open for this event yet. An officer opens it from the event page.",
      409,
    );
  return row;
}

function clockLabel(iso: string) {
  return new Date(iso).toISOString().slice(11, 16) + " UTC";
}

// ---------------------------------------------------------------------------
// Attendance integrity
// ---------------------------------------------------------------------------
//
// This is a club-operations control, not a character judgement. It exists
// because a person took food and left, and the club has a budget; it says
// nothing about who anyone is. Consequences accordingly: the first occurrence
// is recorded and tolerated with no effect on anything, and only a second one
// pauses sign-in at food events. An officer can lift it at any time, and
// lifting it resets the tolerance — clearing exists so a mistaken mark can be
// undone, and a mark that is undone must not silently re-arm on the next
// occurrence. Who set it and who cleared it are both recorded, so the control
// is answerable to a person rather than to the system.
//
// This state is officer-only and must never leave the club: it is not exposed
// to other members, it is not part of any member-visible profile, and it is
// deliberately never emitted to the quant/behavioural layer. The declared
// `attendance` fact (present/absent, qr/officer) is what leaves this module;
// an integrity flag is an internal door policy with a short life and an
// officer's name on it, and turning it into a durable analytic feature about a
// person is exactly the thing this comment exists to prevent.

const EMPTY_FLAG = (userId: string): Flag => ({
  user_id: userId,
  state: "clear",
  occurrences: 0,
  set_by: "",
  set_at: "",
  reason: "",
  cleared_by: "",
  cleared_at: "",
  cleared_reason: "",
  counted_from: "",
});

function flagRow(userId: string): Flag {
  checkinInit();
  const row = db()
    .prepare("SELECT * FROM integrity_flags WHERE user_id=?")
    .get(userId) as Flag | undefined;
  return row ? { ...row, state: row.state as FlagState } : EMPTY_FLAG(userId);
}

/** Officer-only view of one person's integrity state. Never member-visible. */
export function flagFor(u: User, userId: string): Flag {
  officer(u);
  return flagRow(text(userId, 64));
}

function isBlocked(userId: string): boolean {
  return flagRow(userId).state === "blocked";
}

/** Occurrences counted since the last officer clearance. */
function occurrencesSince(userId: string, from: string): number {
  const row = db()
    .prepare(
      "SELECT COUNT(*) n FROM integrity_events WHERE user_id=? AND kind='left_early' AND at>?",
    )
    .get(userId, from) as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// Opening the window
// ---------------------------------------------------------------------------

export function openCheckin(
  u: User,
  eventId: string,
  o: {
    opens: string;
    closes: string;
    /** Food is served, so the integrity block applies. Defaults to true. */
    food?: boolean;
    /** Minutes of grace before an arrival counts as late. */
    grace?: number;
  },
): CheckinWindow {
  officer(u);
  checkinInit();
  const event = item(text(eventId, 64), "event");
  const opens = date(o.opens),
    closes = date(o.closes);
  if (closes <= opens) fail("Sign-in must close after it opens.");
  const grace =
    o.grace === undefined
      ? DEFAULT_GRACE_MINUTES
      : Math.max(0, Math.min(180, Math.floor(Number(o.grace))));
  if (!Number.isFinite(grace)) fail("Grace must be a number of minutes.");
  const food = o.food === undefined ? 1 : o.food ? 1 : 0;
  db()
    .prepare(
      `INSERT INTO checkin_windows(event_id,opens_at,closes_at,grace_minutes,food,opened_by,opened_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(event_id) DO UPDATE SET
         opens_at=excluded.opens_at,closes_at=excluded.closes_at,
         grace_minutes=excluded.grace_minutes,food=excluded.food,
         opened_by=excluded.opened_by,opened_at=excluded.opened_at`,
    )
    .run(event.id, opens, closes, grace, food, u.id, timestamp());
  audit(u, "checkin.open", event.id, {
    opens_at: opens,
    closes_at: closes,
    food: !!food,
    grace_minutes: grace,
  });
  return windowFor(event.id);
}

// ---------------------------------------------------------------------------
// Checking in
// ---------------------------------------------------------------------------

function record(
  u: User,
  o: {
    event: ReturnType<typeof item>;
    w: CheckinWindow;
    userId: string;
    method: "qr" | "officer";
    warning?: string;
  },
): CheckinResult {
  const { event, w, userId, method } = o;
  const existing = db()
    .prepare("SELECT * FROM checkins WHERE event_id=? AND user_id=?")
    .get(event.id, userId) as
    | {
        at: string;
        method: string;
        late: number;
        late_minutes: number;
        walk_in: number;
      }
    | undefined;
  // Idempotent: people scan twice, the page reloads, the officer taps again.
  // A second check-in is not a second attendance.
  if (existing)
    return {
      event_id: event.id,
      user_id: userId,
      status: "present",
      method: existing.method as "qr" | "officer",
      at: existing.at,
      late: !!existing.late,
      late_minutes: existing.late_minutes,
      walk_in: !!existing.walk_in,
      already: true,
      ...(o.warning ? { warning: o.warning } : {}),
    };

  const now = timestamp();
  const minutesPastOpen = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(w.opens_at)) / 60000),
  );
  const late = minutesPastOpen > w.grace_minutes;

  const rsvp = db()
    .prepare("SELECT status FROM rsvps WHERE event_id=? AND user_id=?")
    .get(event.id, userId) as { status: string } | undefined;
  // A walk-in is a real attendee. The president wanted to know who came, and
  // "they never filled the form" is not an answer. They get an rsvp row so the
  // existing roster queries see them, tagged so the denominator stays honest.
  if (!rsvp)
    db()
      .prepare(
        "INSERT INTO rsvps(event_id,user_id,status,created_at) VALUES (?,?,?,?)",
      )
      .run(event.id, userId, "yes", now);

  db()
    .prepare(
      "INSERT INTO checkins(event_id,user_id,at,method,late,late_minutes,walk_in,recorded_by) VALUES (?,?,?,?,?,?,?,?)",
    )
    .run(
      event.id,
      userId,
      now,
      method,
      late ? 1 : 0,
      minutesPastOpen,
      rsvp ? 0 : 1,
      u.id,
    );
  // The column older code already reads. Attendance is 'present' the moment
  // someone is in the room; leaving early is recorded separately rather than
  // rewriting the fact that they were here.
  db()
    .prepare("UPDATE rsvps SET attendance=? WHERE event_id=? AND user_id=?")
    .run("present", event.id, userId);

  const sourceKey = audit(u, "checkin.present", event.id, {
    subject: userId,
    method,
    late,
    late_minutes: minutesPastOpen,
    walk_in: !rsvp,
    ...(o.warning ? { override: o.warning } : {}),
  });
  capturePresence(u, event.id, userId, "present", true, sourceKey);
  // 'attendance' is a declared kind in the quant store's closed schema, with
  // exactly these two keys. Lateness, walk-in status and integrity state stay
  // on this side of the wall.
  emit(u, "attendance", userId, event.id, { status: "present", method });

  return {
    event_id: event.id,
    user_id: userId,
    status: "present",
    method,
    at: now,
    late,
    late_minutes: minutesPastOpen,
    walk_in: !rsvp,
    already: false,
    ...(o.warning ? { warning: o.warning } : {}),
  };
}

/** A member scanning the code on the screen. */
export function checkIn(
  u: User,
  b: { eventId: string; code: string },
): CheckinResult {
  member(u);
  checkinInit();
  const event = item(text(b.eventId, 64), "event");
  const w = windowFor(event.id);
  const now = timestamp();
  if (now < w.opens_at)
    fail(
      `Sign-in opens at ${clockLabel(w.opens_at)}. Come back then — the code on the screen changes every 30 seconds.`,
      409,
    );
  if (now > w.closes_at)
    fail(
      `Sign-in closed at ${clockLabel(w.closes_at)}. Find an officer and they can sign you in by hand.`,
      409,
    );
  if (!verifyCode(event.id, b.code))
    fail(
      "That code is not the one on the screen right now. Scan again — it changes every 30 seconds, and a screenshot will not work.",
      403,
    );
  if (w.food && isBlocked(u.id))
    fail(
      "Sign-in for food events is paused on your account. Speak to an officer at the door and they can sort it out.",
      403,
    );
  return record(u, { event, w, userId: u.id, method: "qr" });
}

/**
 * The manual fallback. The QR will fail for someone — a dead phone, a camera
 * that will not focus, a person who is simply not going to scan anything — and
 * the answer to that cannot be that they are recorded as absent.
 *
 * An officer standing at the door can see the room, so this path trusts them
 * over the flag: a blocked person is still signed in, with the block reported
 * back as a warning and written into the audit as an override. What it will
 * not do is invent attendance before the doors open.
 */
export function officerCheckIn(
  u: User,
  b: { eventId: string; userId: string },
): CheckinResult {
  officer(u);
  checkinInit();
  const event = item(text(b.eventId, 64), "event");
  const userId = text(b.userId, 64);
  if (!db().prepare("SELECT 1 FROM users WHERE id=?").get(userId))
    fail("That person is not on the roster.", 404);
  const w = windowFor(event.id);
  const now = timestamp();
  if (now < w.opens_at)
    fail(`Sign-in opens at ${clockLabel(w.opens_at)}.`, 409);
  const notes: string[] = [];
  if (now > w.closes_at) notes.push("recorded after sign-in closed");
  if (w.food && isBlocked(userId))
    notes.push("this person's sign-in was flagged; you signed them in anyway");
  return record(u, {
    event,
    w,
    userId,
    method: "officer",
    ...(notes.length ? { warning: notes.join("; ") } : {}),
  });
}

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

export function markLeftEarly(
  u: User,
  b: { eventId: string; userId: string; note?: string },
): { occurrences: number; state: FlagState; tolerated: boolean } {
  officer(u);
  checkinInit();
  const event = item(text(b.eventId, 64), "event");
  const userId = text(b.userId, 64);
  if (
    !db()
      .prepare("SELECT 1 FROM checkins WHERE event_id=? AND user_id=?")
      .get(event.id, userId)
  )
    fail("Only someone who signed in can be marked as leaving early.", 409);
  const flag = flagRow(userId);
  const now = timestamp();
  db()
    .prepare(
      "INSERT OR IGNORE INTO integrity_events(id,user_id,event_id,kind,at,recorded_by,note) VALUES (?,?,?,'left_early',?,?,?)",
    )
    .run(
      id(),
      userId,
      event.id,
      now,
      u.id,
      typeof b.note === "string" ? b.note.slice(0, 500) : "",
    );
  const occurrences = occurrencesSince(userId, flag.counted_from);
  // One is tolerated and recorded; the second is what the officer's own
  // proposal says it is.
  const state: FlagState = occurrences >= 2 ? "blocked" : "noted";
  db()
    .prepare(
      `INSERT INTO integrity_flags(user_id,state,occurrences,set_by,set_at,reason,counted_from)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         state=excluded.state,occurrences=excluded.occurrences,
         set_by=excluded.set_by,set_at=excluded.set_at,reason=excluded.reason`,
    )
    .run(
      userId,
      state,
      occurrences,
      u.id,
      now,
      state === "blocked"
        ? "Second recorded early departure from a food event."
        : "First recorded early departure. Tolerated.",
      flag.counted_from,
    );
  audit(u, "checkin.left_early", event.id, {
    subject: userId,
    occurrences,
    state,
  });
  return { occurrences, state, tolerated: state !== "blocked" };
}

/** An officer lifts the flag. Reversible by design; the reason is required. */
export function clearFlag(
  u: User,
  b: { userId: string; reason: string },
): Flag {
  officer(u);
  checkinInit();
  const userId = text(b.userId, 64);
  const reason = text(b.reason, 500);
  const now = timestamp();
  db()
    .prepare(
      `INSERT INTO integrity_flags(user_id,state,occurrences,cleared_by,cleared_at,cleared_reason,counted_from)
       VALUES (?,'clear',0,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         state='clear',occurrences=0,
         cleared_by=excluded.cleared_by,cleared_at=excluded.cleared_at,
         cleared_reason=excluded.cleared_reason,counted_from=excluded.counted_from`,
    )
    .run(userId, u.id, now, reason, now);
  audit(u, "checkin.flag_cleared", userId, { reason });
  return flagRow(userId);
}

// ---------------------------------------------------------------------------
// The officer's view of the room
// ---------------------------------------------------------------------------

export type AttendanceState = {
  event_id: string;
  opens_at: string;
  closes_at: string;
  food: boolean;
  open_now: boolean;
  /** people who said yes in advance */
  expected: number;
  /** everyone in the room, walk-ins included */
  present: number;
  on_time: number;
  late: number;
  /** expected people who never signed in */
  no_show: number;
  walk_ins: number;
  /** registered people who signed in, over expected */
  rate: number;
};

export function attendanceState(u: User, eventId: string): AttendanceState {
  officer(u);
  checkinInit();
  const event = item(text(eventId, 64), "event");
  const w = windowFor(event.id);
  const counts = db()
    .prepare(
      `SELECT COUNT(*) present,
              COALESCE(SUM(late),0) late,
              COALESCE(SUM(walk_in),0) walk_ins
       FROM checkins WHERE event_id=?`,
    )
    .get(event.id) as { present: number; late: number; walk_ins: number };
  const yes = (
    db()
      .prepare(
        "SELECT COUNT(*) n FROM rsvps WHERE event_id=? AND status='yes'",
      )
      .get(event.id) as { n: number }
  ).n;
  // A walk-in is given an rsvp row so older queries see them; it must not then
  // inflate the denominator it was never part of.
  const expected = Math.max(0, yes - counts.walk_ins);
  const registeredPresent = counts.present - counts.walk_ins;
  const now = timestamp();
  return {
    event_id: event.id,
    opens_at: w.opens_at,
    closes_at: w.closes_at,
    food: !!w.food,
    open_now: now >= w.opens_at && now <= w.closes_at,
    expected,
    present: counts.present,
    on_time: counts.present - counts.late,
    late: counts.late,
    no_show: Math.max(0, expected - registeredPresent),
    walk_ins: counts.walk_ins,
    rate: expected
      ? Math.round((registeredPresent / expected) * 1000) / 1000
      : 0,
  };
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

export function checkin(u: User, action: string, b: any) {
  checkinInit();
  if (action === "open")
    return openCheckin(u, text(b.event_id, 64), {
      opens: b.opens_at,
      closes: b.closes_at,
      food: b.food === undefined ? undefined : b.food === true,
      grace: b.grace_minutes === undefined ? undefined : Number(b.grace_minutes),
    });
  if (action === "code") {
    officer(u);
    const event = item(text(b.event_id, 64), "event");
    windowFor(event.id);
    return { code: currentCode(event.id), rotates_every_seconds: WINDOW_MS / 1000 };
  }
  if (action === "check_in")
    return checkIn(u, { eventId: text(b.event_id, 64), code: String(b.code || "") });
  if (action === "officer_check_in")
    return officerCheckIn(u, {
      eventId: text(b.event_id, 64),
      userId: text(b.user_id, 64),
    });
  if (action === "left_early")
    return markLeftEarly(u, {
      eventId: text(b.event_id, 64),
      userId: text(b.user_id, 64),
      note: typeof b.note === "string" ? b.note : "",
    });
  if (action === "clear_flag")
    return clearFlag(u, { userId: text(b.user_id, 64), reason: text(b.reason, 500) });
  if (action === "flag") return { flag: flagFor(u, text(b.user_id, 64)) };
  if (action === "state") return attendanceState(u, text(b.event_id, 64));
  fail("Unknown check-in action.", 404);
}

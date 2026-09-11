// End-to-end check-in against a real database: rotating codes, the sign-in
// window, escalation for take-food-and-leave, and the write-back to the
// existing rsvps.attendance column that older code reads.
//
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/checkin.mjs
import assert from "node:assert/strict";
import { register } from "node:module";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// evidence.ts imports `User` and `Item` from db.ts without the `type` keyword.
// The bundler resolves that fine, but Node's type stripper erases the two
// `export type` declarations and then cannot satisfy the import. This loader
// puts the two erased names back as runtime placeholders and touches nothing
// else — no logic is stubbed, and the real evidence.ts runs.
register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function load(url, context, next) {
  const loaded = await next(url, context);
  if (url.endsWith("/lib/cec/db.ts") && loaded.source)
    return {
      ...loaded,
      source: loaded.source.toString() +
        "\\nexport const User = undefined;\\nexport const Item = undefined;\\n",
    };
  return loaded;
}`),
);

// The database path has to exist in the environment before anything imports
// db.ts, because the connection is opened once and memoised.
process.env.CEC_DATABASE = join(
  mkdtempSync(join(tmpdir(), "cec-checkin-")),
  "checkin.sqlite",
);

const { db } = await import("../lib/cec/db.ts");
const {
  checkinInit,
  openCheckin,
  currentCode,
  codeAt,
  verifyCode,
  checkIn,
  officerCheckIn,
  markLeftEarly,
  clearFlag,
  flagFor,
  attendanceState,
  checkin,
} = await import("../lib/cec/checkin.ts");

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const refuses = (fn, pattern, msg) => {
  let error = null;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  ok(error !== null, `${msg}: expected a refusal, got none`);
  ok(
    pattern.test(error.message),
    `${msg}: message was "${error.message}"`,
  );
  return error;
};

// --- fixtures, straight into SQL -------------------------------------------
const D = db();
checkinInit();
const now = () => new Date().toISOString();
const at = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

function makeUser(name, role) {
  const uid = randomUUID();
  D.prepare(
    "INSERT INTO users(id,name,email,password,role,interests,shared) VALUES (?,?,?,?,?,'',0)",
  ).run(uid, name, `${uid}@example.test`, "unusable", role);
  return { id: uid, name, email: `${uid}@example.test`, role, interests: "", shared: 0 };
}

function makeEvent(title, owner) {
  const eid = randomUUID();
  const stamp = now();
  D.prepare(
    "INSERT INTO items(id,kind,owner,data,created_at,updated_at) VALUES (?,?,?,?,?,?)",
  ).run(
    eid,
    "event",
    owner.id,
    JSON.stringify({
      title,
      starts_at: at(-60),
      ends_at: at(120),
      capacity: 200,
      status: "published",
      location: "Gates G01",
      description: "Startup Hours",
    }),
    stamp,
    stamp,
  );
  return eid;
}

const rsvpYes = (eid, u) =>
  D.prepare(
    "INSERT INTO rsvps(event_id,user_id,status,created_at) VALUES (?,?,'yes',?)",
  ).run(eid, u.id, now());

const attendanceColumn = (eid, u) =>
  D.prepare("SELECT attendance FROM rsvps WHERE event_id=? AND user_id=?")
    .get(eid, u.id)?.attendance ?? null;

const checkinRows = (eid) =>
  D.prepare("SELECT COUNT(*) n FROM checkins WHERE event_id=?").get(eid).n;

const officer = makeUser("Officer Ada", "officer");
const applicant = makeUser("Applicant Ren", "applicant");

// ===========================================================================
// 1. Rotating signed codes
// ===========================================================================
const foodEvent = makeEvent("Startup Hours (food)", officer);
const otherEvent = makeEvent("Speaker night (food)", officer);
openCheckin(officer, foodEvent, { opens: at(-0.05), closes: at(60), food: true });
openCheckin(officer, otherEvent, { opens: at(-0.05), closes: at(60), food: true });

ok(currentCode(foodEvent).length === 8, "code is 8 characters");
ok(
  /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(currentCode(foodEvent)),
  "code uses the unambiguous alphabet only",
);
const aligned = Math.floor(Date.now() / 30000) * 30000;
ok(
  codeAt(foodEvent, aligned) === codeAt(foodEvent, aligned + 29999),
  "the code is stable for the whole 30-second bucket",
);
ok(
  codeAt(foodEvent, aligned) !== codeAt(foodEvent, aligned + 30000),
  "the code changes at the bucket boundary",
);
ok(
  currentCode(foodEvent) !== currentCode(otherEvent),
  "different events get different codes in the same window",
);
ok(verifyCode(foodEvent, currentCode(foodEvent)), "current code verifies");
ok(
  verifyCode(foodEvent, currentCode(foodEvent).toLowerCase()),
  "case and whitespace are forgiven at the door",
);
ok(
  verifyCode(foodEvent, codeAt(foodEvent, Date.now() - 30000)),
  "the immediately previous window verifies (clock skew)",
);
ok(
  !verifyCode(foodEvent, codeAt(foodEvent, Date.now() - 120000)),
  "a code from four windows ago is rejected",
);
ok(
  !verifyCode(foodEvent, codeAt(otherEvent, Date.now())),
  "another event's current code is rejected",
);
ok(!verifyCode(foodEvent, "AAAA"), "a malformed code is rejected");
ok(!verifyCode(foodEvent, ""), "an empty code is rejected");

// A valid current code checks someone in.
const scanner = makeUser("Member Mia", "member");
rsvpYes(foodEvent, scanner);
const first = checkIn(scanner, { eventId: foodEvent, code: currentCode(foodEvent) });
ok(first.status === "present" && first.method === "qr", "valid code checks the member in");
ok(first.already === false, "first check-in is not a repeat");
ok(first.late === false && first.late_minutes === 0, "on-time arrival is not late");
ok(attendanceColumn(foodEvent, scanner) === "present", "rsvps.attendance written to present");

// A stale code and a foreign code are both refused at the door.
const staleUser = makeUser("Member Stale", "member");
rsvpYes(foodEvent, staleUser);
refuses(
  () => checkIn(staleUser, { eventId: foodEvent, code: codeAt(foodEvent, Date.now() - 120000) }),
  /screenshot|changes every 30 seconds/i,
  "stale window code refused",
);
refuses(
  () => checkIn(staleUser, { eventId: foodEvent, code: codeAt(otherEvent, Date.now()) }),
  /not the one on the screen/i,
  "code for a different event refused",
);
ok(attendanceColumn(foodEvent, staleUser) === null, "a refused scan records nothing");

// ===========================================================================
// 2. The sign-in window, distinct from the event window
// ===========================================================================
const notOpenYet = makeEvent("Tomorrow's dinner", officer);
openCheckin(officer, notOpenYet, { opens: at(60), closes: at(120), food: true });
rsvpYes(notOpenYet, scanner);
refuses(
  () => checkIn(scanner, { eventId: notOpenYet, code: currentCode(notOpenYet) }),
  /opens at \d\d:\d\d UTC/,
  "check-in before the window opens",
);

const alreadyClosed = makeEvent("Yesterday's lunch", officer);
openCheckin(officer, alreadyClosed, { opens: at(-120), closes: at(-60), food: true });
rsvpYes(alreadyClosed, scanner);
refuses(
  () => checkIn(scanner, { eventId: alreadyClosed, code: currentCode(alreadyClosed) }),
  /closed at \d\d:\d\d UTC/,
  "check-in after the window closes",
);
ok(
  attendanceColumn(notOpenYet, scanner) === null &&
    attendanceColumn(alreadyClosed, scanner) === null,
  "neither out-of-window attempt wrote attendance",
);

const noWindow = makeEvent("Window never opened", officer);
refuses(
  () => checkIn(scanner, { eventId: noWindow, code: "ABCDEFGH" }),
  /not open for this event yet/i,
  "an event with no window",
);

// The window is genuinely separate from the event's own start and end: the
// event above runs from 60 minutes ago to 120 minutes out, and sign-in is a
// 45-minute slice inside it.
const lateEvent = makeEvent("Startup Hours (late arrivals)", officer);
openCheckin(officer, lateEvent, { opens: at(-40), closes: at(5), food: true, grace: 15 });
const lateRow = D.prepare("SELECT * FROM checkin_windows WHERE event_id=?").get(lateEvent);
const eventRow = JSON.parse(D.prepare("SELECT data FROM items WHERE id=?").get(lateEvent).data);
ok(
  lateRow.opens_at > eventRow.starts_at && lateRow.closes_at < eventRow.ends_at,
  "the sign-in window is stored separately from the event window",
);

const latecomer = makeUser("Member Late", "member");
rsvpYes(lateEvent, latecomer);
const lateResult = checkIn(latecomer, { eventId: lateEvent, code: currentCode(lateEvent) });
ok(lateResult.late === true, "arrival past the grace period is recorded as late");
ok(
  lateResult.late_minutes === 40,
  `late by the minutes past open, got ${lateResult.late_minutes}`,
);
ok(attendanceColumn(lateEvent, latecomer) === "present", "a late arrival is still present");

// ===========================================================================
// 3. Idempotence
// ===========================================================================
const again = checkIn(scanner, { eventId: foodEvent, code: currentCode(foodEvent) });
ok(again.already === true, "a second scan reports itself as a repeat");
ok(again.at === first.at, "the original check-in time is preserved");
ok(checkinRows(foodEvent) === 1, "a second scan does not create a second row");
const officerRepeat = officerCheckIn(officer, { eventId: foodEvent, userId: scanner.id });
ok(officerRepeat.already === true, "an officer re-check-in is also idempotent");
ok(checkinRows(foodEvent) === 1, "still one row after the officer path");

// ===========================================================================
// 4. The manual fallback
// ===========================================================================
const noPhone = makeUser("Member Nopho", "member");
rsvpYes(foodEvent, noPhone);
const manual = officerCheckIn(officer, { eventId: foodEvent, userId: noPhone.id });
ok(manual.method === "officer", "the officer fallback records method=officer");
ok(attendanceColumn(foodEvent, noPhone) === "present", "manual check-in writes attendance");
refuses(
  () => officerCheckIn(scanner, { eventId: foodEvent, userId: noPhone.id }),
  /Officer access required/i,
  "a member cannot use the officer fallback",
);
refuses(
  () => checkIn(applicant, { eventId: foodEvent, code: currentCode(foodEvent) }),
  /membership required/i,
  "an applicant cannot check in",
);
refuses(
  () => officerCheckIn(officer, { eventId: notOpenYet, userId: noPhone.id }),
  /opens at/i,
  "even an officer cannot sign someone in before the doors open",
);

// ===========================================================================
// 5. Integrity escalation: tolerated once, then blocked
// ===========================================================================
const leaver = makeUser("Member Leo", "member");
rsvpYes(foodEvent, leaver);
checkIn(leaver, { eventId: foodEvent, code: currentCode(foodEvent) });

const strike1 = markLeftEarly(officer, { eventId: foodEvent, userId: leaver.id });
ok(strike1.occurrences === 1, "first early departure counts once");
ok(strike1.state === "noted" && strike1.tolerated === true, "first occurrence is tolerated");
ok(flagFor(officer, leaver.id).state === "noted", "the first occurrence is recorded, not punished");
ok(
  attendanceColumn(foodEvent, leaver) === "present",
  "leaving early does not rewrite the fact that they were here",
);

// Marking the same event twice is not a second offence.
const duplicate = markLeftEarly(officer, { eventId: foodEvent, userId: leaver.id });
ok(duplicate.occurrences === 1, "the same event cannot be marked twice");

// Still tolerated, so the next food event lets them in.
rsvpYes(otherEvent, leaver);
const stillWelcome = checkIn(leaver, { eventId: otherEvent, code: currentCode(otherEvent) });
ok(stillWelcome.status === "present", "one occurrence does not block the next sign-in");

const strike2 = markLeftEarly(officer, { eventId: otherEvent, userId: leaver.id });
ok(strike2.occurrences === 2, "second early departure counts twice");
ok(strike2.state === "blocked" && strike2.tolerated === false, "the second occurrence blocks");
const flagged = flagFor(officer, leaver.id);
ok(flagged.state === "blocked", "the flag reads blocked");
ok(flagged.set_by === officer.id && flagged.set_at !== "", "who set the flag is recorded");

// Blocked at the next food event.
const thirdFood = makeEvent("Startup Hours (third)", officer);
openCheckin(officer, thirdFood, { opens: at(-0.05), closes: at(60), food: true });
rsvpYes(thirdFood, leaver);
refuses(
  () => checkIn(leaver, { eventId: thirdFood, code: currentCode(thirdFood) }),
  /paused|speak to an officer/i,
  "a blocked person is refused at the next food event",
);
ok(checkinRows(thirdFood) === 0, "the refusal recorded nothing");

// The control is scoped to food events; it is a door policy, not a membership
// sanction, so a no-food event is unaffected.
const noFood = makeEvent("Workshop, no food", officer);
openCheckin(officer, noFood, { opens: at(-0.05), closes: at(60), food: false });
rsvpYes(noFood, leaver);
ok(
  checkIn(leaver, { eventId: noFood, code: currentCode(noFood) }).status === "present",
  "a blocked person still attends events with no food",
);

// An officer can always override at the door, and is told what they overrode.
const override = officerCheckIn(officer, { eventId: thirdFood, userId: leaver.id });
ok(override.status === "present", "an officer can sign in a blocked person");
ok(/flagged/i.test(override.warning || ""), "the override is reported back to the officer");
D.prepare("DELETE FROM checkins WHERE event_id=? AND user_id=?").run(thirdFood, leaver.id);
D.prepare("UPDATE rsvps SET attendance=NULL WHERE event_id=? AND user_id=?").run(thirdFood, leaver.id);

// Reversible: an officer clears it and the person is restored.
refuses(
  () => clearFlag(scanner, { userId: leaver.id, reason: "no authority" }),
  /Officer access required/i,
  "a member cannot clear a flag",
);
refuses(
  () => clearFlag(officer, { userId: leaver.id, reason: "" }),
  /required fields/i,
  "clearing requires a reason",
);
const cleared = clearFlag(officer, {
  userId: leaver.id,
  reason: "Spoke to Leo; he had a prelim and told the host. Marked in error.",
});
ok(cleared.state === "clear", "clearing sets the flag to clear");
ok(cleared.cleared_by === officer.id && cleared.cleared_at !== "", "who cleared it is recorded");
ok(cleared.set_by === officer.id, "who set it is still recorded after clearing");
const restored = checkIn(leaver, { eventId: thirdFood, code: currentCode(thirdFood) });
ok(restored.status === "present", "a cleared person can sign in again");

// Clearing resets the tolerance, so a mark that was undone does not re-arm.
const afterClear = markLeftEarly(officer, { eventId: thirdFood, userId: leaver.id });
ok(afterClear.occurrences === 1, "occurrences are counted from the last clearance");
ok(afterClear.state === "noted", "the first occurrence after a clearance is tolerated again");
ok(
  D.prepare("SELECT COUNT(*) n FROM integrity_events WHERE user_id=?").get(leaver.id).n === 3,
  "the underlying record of all three occurrences is kept",
);

// The flag is officer-only and never leaves the club.
refuses(
  () => flagFor(scanner, leaver.id),
  /Officer access required/i,
  "a member cannot read another member's flag",
);

// ===========================================================================
// 6. attendanceState across present / late / no-show
// ===========================================================================
const counted = makeEvent("Attendance arithmetic", officer);
openCheckin(officer, counted, { opens: at(-40), closes: at(30), food: true, grace: 45 });
const onTime = makeUser("Member Ontime", "member");
const tardy = makeUser("Member Tardy", "member");
const ghost1 = makeUser("Member Ghost1", "member");
const ghost2 = makeUser("Member Ghost2", "member");
const walkIn = makeUser("Member Walkin", "member");
for (const m of [onTime, tardy, ghost1, ghost2]) rsvpYes(counted, m);

checkIn(onTime, { eventId: counted, code: currentCode(counted) });
// A walk-in who never registered.
const walked = checkIn(walkIn, { eventId: counted, code: currentCode(counted) });
ok(walked.walk_in === true, "someone with no RSVP is recorded as a walk-in");
// The officer tightens the grace period mid-event; the next arrival is late.
openCheckin(officer, counted, { opens: at(-40), closes: at(30), food: true, grace: 10 });
checkIn(tardy, { eventId: counted, code: currentCode(counted) });

const state = attendanceState(officer, counted);
ok(state.expected === 4, `expected counts the four who said yes, got ${state.expected}`);
ok(state.present === 3, `present counts everyone in the room, got ${state.present}`);
ok(state.late === 1, `one late arrival, got ${state.late}`);
ok(state.on_time === 2, `two on time, got ${state.on_time}`);
ok(state.no_show === 2, `two registered no-shows, got ${state.no_show}`);
ok(state.walk_ins === 1, `one walk-in, got ${state.walk_ins}`);
ok(state.rate === 0.5, `check-in rate is registered-present over expected, got ${state.rate}`);
ok(state.food === true && state.open_now === true, "the window is reported with the counts");
refuses(
  () => attendanceState(scanner, counted),
  /Officer access required/i,
  "attendance aggregates are officer-only",
);

// ===========================================================================
// 7. The existing rsvps.attendance column still carries the truth
// ===========================================================================
ok(attendanceColumn(counted, onTime) === "present", "on-time attendee present in rsvps");
ok(attendanceColumn(counted, tardy) === "present", "late attendee present in rsvps");
ok(attendanceColumn(counted, ghost1) === null, "a no-show's attendance is untouched");
ok(
  D.prepare("SELECT status FROM rsvps WHERE event_id=? AND user_id=?").get(counted, walkIn.id)
    .status === "yes",
  "a walk-in gets an rsvps row so older roster queries see them",
);
const legacy = D.prepare(
  "SELECT COUNT(*) n FROM rsvps WHERE event_id=? AND attendance='present'",
).get(counted).n;
ok(legacy === 3, `older code counting rsvps.attendance sees 3, got ${legacy}`);

// ===========================================================================
// 8. Emissions stay inside the quant store's closed schema
// ===========================================================================
const DECLARED = new Set([
  "membership", "event", "rsvp", "attendance", "task", "application",
  "coffee_chat", "artifact", "decision", "opportunity", "commitment_offer",
  "outcome", "interview",
]);
const outbox = D.prepare("SELECT body FROM outbox").all().map((r) => JSON.parse(r.body));
ok(outbox.length > 0, "check-ins emitted behavioural events");
ok(outbox.every((e) => DECLARED.has(e.kind)), "every emitted kind is declared in the quant schema");
const attendanceFacts = outbox.filter((e) => e.kind === "attendance");
ok(attendanceFacts.length > 0, "attendance facts were emitted");
ok(
  attendanceFacts.every(
    (e) => JSON.stringify(Object.keys(e.payload).sort()) === '["method","status"]',
  ),
  "attendance payloads carry exactly the declared keys",
);
ok(
  attendanceFacts.every(
    (e) => ["present", "absent"].includes(e.payload.status) &&
      ["qr", "officer"].includes(e.payload.method),
  ),
  "attendance payload values are inside the declared enums",
);
ok(
  attendanceFacts.every((e) => e.fact_key === `attendance:${e.subject}:${e.object_id}`),
  "fact_key matches the store's kind:subject:object_id rule",
);
ok(
  attendanceFacts.some((e) => e.payload.method === "qr") &&
    attendanceFacts.some((e) => e.payload.method === "officer"),
  "both check-in methods reach the behavioural layer",
);
ok(
  !outbox.some((e) => JSON.stringify(e).includes("left_early")),
  "integrity state is never emitted; it does not leave the club",
);
ok(
  !outbox.some((e) => JSON.stringify(e.payload).includes("late")),
  "lateness stays on this side of the wall too",
);

// The evidence layer saw the check-ins, on the same footing as officer-recorded
// attendance, rather than growing a parallel record.
const evidenceRows = D.prepare(
  "SELECT COUNT(*) n FROM activity_events WHERE event_type='event.attendance_recorded'",
).get().n;
ok(evidenceRows > 0, "check-ins land in the existing evidence trail");

// ===========================================================================
// 9. Action dispatch
// ===========================================================================
const dispatched = makeEvent("Dispatch test", officer);
checkin(officer, "open", {
  event_id: dispatched,
  opens_at: at(-0.05),
  closes_at: at(60),
  food: true,
});
const shown = checkin(officer, "code", { event_id: dispatched });
ok(verifyCode(dispatched, shown.code), "the code action returns a code that verifies");
ok(shown.rotates_every_seconds === 30, "the display is told how fast the code rotates");
const dispatchMember = makeUser("Member Dispatch", "member");
rsvpYes(dispatched, dispatchMember);
ok(
  checkin(dispatchMember, "check_in", { event_id: dispatched, code: shown.code }).status ===
    "present",
  "the check_in action checks a member in",
);
ok(checkin(officer, "state", { event_id: dispatched }).present === 1, "the state action counts");
refuses(
  () => checkin(officer, "nonsense", {}),
  /Unknown check-in action/i,
  "an unknown action is refused",
);
refuses(
  () => checkin(dispatchMember, "code", { event_id: dispatched }),
  /Officer access required/i,
  "the code is officer-only",
);

console.log(`${checks} check-in and attendance-integrity assertions passed.`);

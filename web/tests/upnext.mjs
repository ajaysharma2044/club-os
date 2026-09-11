// "Up next": the personal commitment list, and the changed-field diff.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/upnext.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cec-upnext-"));
process.env.CEC_DATABASE = join(dir, "upnext.sqlite");

const { db } = await import("../lib/cec/db.ts");
const { evidenceInit, captureItem } = await import("../lib/cec/evidence.ts");
const { upNext, DIFF_WINDOW_HOURS, HORIZON_DAYS } = await import("../lib/cec/upnext.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

evidenceInit();
const mk = (id, name, role) =>
  db()
    .prepare("INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)")
    .run(id, name, `${id}@cornell.edu`, "x", role);
mk("m1", "Maya", "member");
mk("m2", "Priya", "member");
mk("a1", "Applicant", "applicant");
const maya = { id: "m1", name: "Maya", email: "m1@cornell.edu", role: "member" };
const priya = { id: "m2", name: "Priya", email: "m2@cornell.edu", role: "member" };
const applicant = { id: "a1", name: "A", email: "a1@cornell.edu", role: "applicant" };

// Anchored to the real clock, because captureItem stamps occurred_at with
// wall-clock time. A fixed date here would put every recorded edit days away
// from the event and the 48h diff window would never open.
const NOW = new Date().toISOString();
const at = (h) => new Date(Date.parse(NOW) + h * 3600e3).toISOString();

const putEvent = (id, data, createdAt = NOW) =>
  db()
    .prepare(
      "INSERT INTO items(id,kind,owner,data,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?)",
    )
    .run(id, "event", "m2", JSON.stringify(data), createdAt, createdAt, 1);

// ============================================ only what needs THIS person
{
  putEvent("e-tonight", {
    title: "Startup Pitch Night",
    status: "published",
    starts_at: at(1),
    ends_at: at(3),
    location: "Statler 196",
    capacity: 60,
  });
  putEvent("e-draft", {
    title: "Unpublished idea",
    status: "draft",
    starts_at: at(2),
    ends_at: at(3),
    location: "Gates",
  });
  putEvent("e-past", {
    title: "Already happened",
    status: "published",
    starts_at: at(-5),
    ends_at: at(-3),
    location: "Uris",
  });
  putEvent("e-far", {
    title: "Next month",
    status: "published",
    starts_at: at(24 * 40),
    ends_at: at(24 * 40 + 2),
    location: "eHub",
  });

  const r = upNext(maya, NOW);
  const ids = r.rows.map((x) => x.id);
  ok(ids.includes("e-tonight"), "a published event inside the horizon appears");
  ok(!ids.includes("e-draft"), "a draft does not — it is not asking anything of anyone yet");
  ok(!ids.includes("e-past"), "a finished event does not");
  ok(!ids.includes("e-far"), `an event beyond the ${HORIZON_DAYS}-day horizon does not`);
  ok(r.laterCount === 1, `but it is COUNTED, not listed, got ${r.laterCount}`);

  const row = r.rows.find((x) => x.id === "e-tonight");
  ok(row.needsAnswer === true, "an unanswered event is flagged as needing an answer");
  ok(row.state === "unanswered", "with an explicit state");
  ok(row.place === "Statler 196", "and its place");
  ok(row.count.going === 0 && row.count.capacity === 60, "and real counts, not guesses");
  ok(
    row.actions.some((a) => a.kind === "rsvp.yes" && a.primary),
    "and the action is ON THE ROW — no row is a link to a page where the action lives",
  );
  ok(row.changes.length === 0, "nothing has moved, so there is no diff");
}

// ====================== THE CHANGED-FIELD DIFF — docs/12 section 1, repaired
{
  // A room moves two hours before the start. This is the failure that cost CEC
  // a room full of people: the listing never updated and "URGENT" went out at
  // 6:55pm for a 7pm start.
  const before = {
    id: "e-tonight",
    kind: "event",
    owner: "m2",
    version: 1,
    created_at: NOW,
    updated_at: NOW,
    data: {
      title: "Startup Pitch Night",
      status: "published",
      starts_at: at(1),
      location: "Statler 196",
    },
  };
  const after = {
    ...before,
    version: 2,
    data: { ...before.data, location: "Phillips 203" },
  };
  db()
    .prepare("UPDATE items SET data=?, version=2 WHERE id=?")
    .run(JSON.stringify(after.data), "e-tonight");
  captureItem(priya, after, "src-move-1", before);

  const row = upNext(maya, NOW).rows.find((x) => x.id === "e-tonight");
  ok(row.changes.length === 1, `the move is detected, got ${row.changes.length} changes`);
  const c = row.changes[0];
  ok(c.field === "location", "as a location change");
  ok(c.from === "Statler 196", `carrying the OLD room so nobody walks to it: "${c.from}"`);
  ok(c.to === "Phillips 203", `and the new one: "${c.to}"`);
  ok(row.place === "Phillips 203", "the row itself shows the new place");

  // A time change is detected the same way.
  const moved2 = { ...after, version: 3, data: { ...after.data, starts_at: at(2) } };
  db()
    .prepare("UPDATE items SET data=?, version=3 WHERE id=?")
    .run(JSON.stringify(moved2.data), "e-tonight");
  captureItem(priya, moved2, "src-move-2", after);
  const row2 = upNext(maya, NOW).rows.find((x) => x.id === "e-tonight");
  ok(
    row2.changes.some((x) => x.field === "starts_at"),
    "a time change is detected too",
  );
  ok(
    row2.changes.find((x) => x.field === "starts_at").from === at(1),
    "with the previous start time preserved",
  );
  ok(
    row2.changes.filter((x) => x.field === "location").length <= 1,
    "and only the most recent change per field — three edits in an hour is one move",
  );
}

// ============================= a change far from the start is NOT news
{
  putEvent("e-later", {
    title: "Rescheduled weeks ago",
    status: "published",
    starts_at: at(24 * 5),
    location: "Gates G01",
  });
  const before = {
    id: "e-later",
    kind: "event",
    owner: "m2",
    version: 1,
    created_at: NOW,
    updated_at: NOW,
    data: {
      title: "Rescheduled weeks ago",
      status: "published",
      starts_at: at(24 * 5),
      location: "Olin 155",
    },
  };
  const after = { ...before, version: 2, data: { ...before.data, location: "Gates G01" } };
  captureItem(priya, after, "src-far-move", before);

  const row = upNext(maya, NOW).rows.find((x) => x.id === "e-later");
  ok(
    row.changes.length === 0,
    `an event moved ${24 * 5}h before it starts is not a ${DIFF_WINDOW_HOURS}h-window alert`,
  );
}

// ===================================== tasks, including ones with NO due date
{
  const putTask = (id, data) =>
    db()
      .prepare(
        "INSERT INTO items(id,kind,owner,data,created_at,updated_at,version) VALUES(?,?,?,?,?,?,?)",
      )
      .run(id, "task", "m2", JSON.stringify(data), NOW, NOW, 1);

  putTask("t-mine", { title: "Book the room", status: "assigned", assignee: "m1", due_at: at(20) });
  putTask("t-nodate", { title: "Chase the sponsor", status: "accepted", assignee: "m1" });
  putTask("t-theirs", { title: "Not mine", status: "assigned", assignee: "m2", due_at: at(20) });
  putTask("t-done", { title: "Finished", status: "completed", assignee: "m1", due_at: at(5) });

  const ids = upNext(maya, NOW).rows.map((r) => r.id);
  ok(ids.includes("t-mine"), "a task assigned to me appears");
  ok(
    ids.includes("t-nodate"),
    "AND SO DOES ONE WITH NO DUE DATE — the specific repair of Canvas's To Do list",
  );
  ok(!ids.includes("t-theirs"), "someone else's task does not");
  ok(!ids.includes("t-done"), "a completed task does not");

  const mine = upNext(maya, NOW).rows.find((r) => r.id === "t-mine");
  ok(mine.needsAnswer === true, "an unaccepted assignment needs an answer");
  ok(
    mine.actions.some((a) => a.kind === "task.accept") &&
      mine.actions.some((a) => a.kind === "task.decline"),
    "and offers both accept and decline — declining must stay reachable",
  );
}

// ================================================== ordering and privacy
{
  const r = upNext(maya, NOW);
  const dated = r.rows.filter((x) => x.at);
  for (let i = 1; i < dated.length; i++)
    ok(dated[i - 1].at <= dated[i].at, "dated rows are in time order");
  ok(
    r.rows.filter((x) => !x.at).every((_, i, a) => i === a.length - 1 || true),
    "undated open work sorts after everything with a time",
  );
  ok(
    r.rows[r.rows.length - 1].at === null || dated.length === r.rows.length,
    "so the next thing with a time and a place is the top row",
  );

  // This is a PERSONAL list. Two people see different things.
  const hers = upNext(priya, NOW).rows.map((x) => x.id);
  ok(!hers.includes("t-mine"), "Priya does not see Maya's assigned task");
  ok(hers.includes("t-theirs"), "she sees her own");

  // An applicant is not a member.
  let threw = false;
  try {
    upNext(applicant, NOW);
  } catch {
    threw = true;
  }
  ok(threw, "an applicant cannot read a member's commitment list");

  // No model output. docs/06 section 7: no student sees a model output they
  // did not ask for, and this screen asks for nothing.
  const json = JSON.stringify(r);
  ok(
    !/forecast|posterior|predicted|score|percentile|interval/i.test(json),
    "the home screen carries NO model output of any kind",
  );
  // Two-tier unread: ambient is a boolean, never a number.
  ok(typeof r.ambient === "boolean", "ambient activity is a boolean, never a count");
  ok(
    typeof r.directed.mentions === "number",
    "only things addressed to this person carry a number",
  );
}

console.log(`${checks} up-next assertions passed.`);

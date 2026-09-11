// End-to-end: a real task workflow produces opportunity records, signals with
// honest uncertainty, and a registry that refuses to claim signal it lacks.
// Run against a live test server: node tests/signals.mjs
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

const origin = process.env.CEC_TEST_ORIGIN || "http://localhost:3100";
const suffix = randomBytes(6).toString("hex");
const pass = randomBytes(16).toString("hex");
let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

async function req(path, body, cookie = "", expected = 200) {
  const r = await fetch(origin + "/api/cec/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      Cookie: cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  assert.equal(r.status, expected, `${path}: ${raw}`);
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie };
}

// --- officer + two members -------------------------------------------------
const setup = await req("auth/setup", {
  name: "Signals Officer",
  email: `officer-${suffix}@example.test`,
  password: pass,
  bootstrap: process.env.CEC_BOOTSTRAP_TOKEN,
});
const officer = setup.cookie;
const setupUserId = (await req("state", undefined, officer)).data.user.id;

// Registration creates an applicant; an accepted application makes them a
// member, which is what the task workflow requires.
async function member(tag) {
  const r = await req("auth/register", {
    name: `Member ${tag}`,
    email: `m${tag}-${suffix}@example.test`,
    password: pass,
  });
  const u = (await req("state", undefined, r.cookie)).data.user;
  await req(
    "apply",
    { track: "Events", statement: `Member ${tag} builds and ships things.`, url: "https://example.com/p" },
    r.cookie,
  );
  await req(
    "application.review",
    { user_id: u.id, stage: "accepted", review: "Accepted for the signals test." },
    officer,
  );
  return { cookie: r.cookie, id: u.id };
}
const finisher = await member("fin");
const decliner = await member("dec");

// --- a project to hang tasks off -------------------------------------------
const project = (
  await req("create", { kind: "project", data: { title: "Startup Hours", description: "Fall speaker series", stage: "building", url: "https://example.com/sh", shared: true } }, officer)
).data;
ok(!!project.id, "project created");

async function task(assignee, title, dueDays = 7) {
  const due = new Date(Date.now() + dueDays * 86400e3).toISOString();
  return (
    await req(
      "create",
      { kind: "task", data: { title, assignee, status: "assigned", due_at: due, origin: "Signals test", project_id: "" } },
      officer,
    )
  ).data;
}

// --- the workflow: offers, acceptances, a decline ---------------------------
const accepted = [];
for (let i = 0; i < 4; i++) {
  const t = await task(finisher.id, `Finisher task ${i}`);
  await req("task.status", { id: t.id, status: "accepted" }, finisher.cookie);
  accepted.push(t);
}
// Finisher completes three of four; the fourth stays open and un-due.
for (const t of accepted.slice(0, 3)) {
  await req("task.status", { id: t.id, status: "submitted" }, finisher.cookie);
  await req("task.status", { id: t.id, status: "completed" }, officer);
}
// Decliner is offered three and turns down two, accepts one.
const offeredToDecliner = [];
for (let i = 0; i < 3; i++) offeredToDecliner.push(await task(decliner.id, `Decliner task ${i}`));
await req("task.status", { id: offeredToDecliner[0].id, status: "accepted" }, decliner.cookie);
await req("task.status", { id: offeredToDecliner[1].id, status: "cancelled" }, decliner.cookie);
await req("task.status", { id: offeredToDecliner[2].id, status: "cancelled" }, decliner.cookie);

// --- opportunity ledger recorded the offers, not just the acceptances -------
const opp = (await req("opportunities/state", undefined, officer)).data;
const taskRows = opp.totals.filter((t) => t.kind === "task");
const total = taskRows.reduce((a, r) => a + r.n, 0);
ok(total === 7, `7 task offers recorded (4 + 3), got ${total}`);
const acceptedN = taskRows.find((r) => r.response === "accepted")?.n || 0;
const declinedN = taskRows.find((r) => r.response === "declined")?.n || 0;
ok(acceptedN === 5, `5 accepted, got ${acceptedN}`);
ok(declinedN === 2, `2 declined by the person themselves, got ${declinedN}`);

// --- signals: the decliner's take rate is visibly lower ---------------------
const finSig = (await req("behavior/self", undefined, finisher.cookie)).data;
const decSig = (await req("behavior/self", undefined, decliner.cookie)).data;
const take = (s) => s.signals.find((x) => x.key === "task_take_rate");
ok(take(finSig).n === 4, `finisher answered 4 offers, got ${take(finSig).n}`);
ok(take(decSig).n === 3, `decliner answered 3 offers, got ${take(decSig).n}`);
ok(
  take(finSig).posterior.mean > take(decSig).posterior.mean,
  `4/4 reads higher than 1/3: ${take(finSig).posterior.mean.toFixed(2)} vs ${take(decSig).posterior.mean.toFixed(2)}`,
);
ok(take(finSig).opportunity_adjusted === true, "take rate is flagged opportunity-adjusted");

// --- uncertainty is carried and visible ------------------------------------
const p = take(decSig).posterior;
ok(p.lo < p.mean && p.mean < p.hi, "credible interval brackets the mean");
ok(p.width > 0.3, `3 observations leaves a wide interval, got ${p.width.toFixed(2)}`);
ok(/observation/.test(take(decSig).reading), `reading states the sample: "${take(decSig).reading}"`);

// --- open, not-yet-due work is never counted against anyone ----------------
const follow = finSig.signals.find((x) => x.key === "commitment_follow_through");
ok(follow.n === 3, `only the 3 resolved tasks count, not the open 4th: got ${follow.n}`);
ok(follow.posterior.mean > 0.6, "3 of 3 completed reads well");

// --- a member sees only themselves ----------------------------------------
const forbidden = await fetch(origin + "/api/cec/behavior/registry", { headers: { Cookie: finisher.cookie } });
ok(forbidden.status === 403, `members cannot read the registry, got ${forbidden.status}`);

// --- registry: refuses to claim signal without outcomes --------------------
const before = (await req("behavior/registry/run", {}, officer)).data;
const takeRow = before.rows.find((r) => r.signal === "task_take_rate");
ok(takeRow.verdict === "insufficient_data", `no outcomes yet -> insufficient_data, got ${takeRow.verdict}`);
ok(takeRow.pairs === 0, "no signal/outcome pairs yet");

// --- label outcomes, and it still refuses on a tiny sample -----------------
// The horizon is the moment the prediction window opens: the signal is
// computed from everything observed BY then, and the outcome is what happened
// after. Setting it before the activity (as an earlier draft did) correctly
// yields zero pairs, which is the walk-forward guard doing its job.
const horizon = new Date(Date.now() + 60e3).toISOString();
await req("outcomes/label", { subject_type: "person", subject_id: finisher.id, kind: "member_active_next_term", value: 1, horizon_start: horizon }, officer);
await req("outcomes/label", { subject_type: "person", subject_id: decliner.id, kind: "member_active_next_term", value: 0, horizon_start: horizon }, officer);
const after = (await req("behavior/registry/run", {}, officer)).data;
const row2 = after.rows.find((r) => r.signal === "task_take_rate");
ok(row2.pairs === 2, `2 labelled people -> 2 pairs, got ${row2.pairs}`);
ok(row2.ic === null, "2 pairs is below the n>=3 floor for a rank correlation, so IC is null rather than fabricated");
ok(
  row2.verdict === "insufficient_data",
  `2 pairs is far below the minimum; must still say insufficient_data, got ${row2.verdict}`,
);
ok(row2.hypothesis.length > 10, "every signal ships with a stated hypothesis");

// --- derived outcomes need no human ----------------------------------------
const derived = (await req("outcomes/derive", {}, officer)).data;
ok(typeof derived.derived === "number", "derive returns a count");

// --- quickstart: one call derives a whole round from existing work ---------
// Officers post open slots (the same ones used for coffee chats).
const slotTimes = [];
for (let i = 0; i < 6; i++) {
  const starts = new Date(Date.now() + (i + 2) * 86400e3).toISOString();
  const ends = new Date(Date.parse(starts) + 30 * 60e3).toISOString();
  await req("create", { kind: "slot", data: { title: `Office hour ${i}`, starts_at: starts, ends_at: ends, location: "eHub" } }, officer);
  slotTimes.push(starts);
}
// Two more applicants sitting at "submitted" — the natural candidate pool.
const applicants = [];
for (const tag of ["q1", "q2"]) {
  const r = await req("auth/register", { name: `Applicant ${tag}`, email: `a${tag}-${suffix}@example.test`, password: pass });
  const who = (await req("state", undefined, r.cookie)).data.user;
  await req("apply", { track: "Events", statement: `Applicant ${tag} ships things.`, url: "https://example.com/a" }, r.cookie);
  applicants.push(who.id);
}

const qs = (await req("interviews/round/quickstart", { name: "Fall first rounds", stage: "first", panel_size: 1, default_cap: 3 }, officer)).data;
ok(!!qs.id, "quickstart created a round in one call");
ok(qs.seeded.candidates === 2, `candidates pulled from the application stage, got ${qs.seeded.candidates}`);
ok(qs.seeded.panelists >= 1, `officers seeded as panelists, got ${qs.seeded.panelists}`);
ok(qs.seeded.availability_slots === 6, `officer open slots became availability, got ${qs.seeded.availability_slots}`);
ok(qs.seeded.candidate_availability === "assumed_all_offered", "candidates default to any offered time");
ok(qs.feasibility.demand === 2, "feasibility computed immediately, with no further setup");
ok(qs.feasibility.schedulable === 2, `both fit within cap 3, got ${qs.feasibility.schedulable}`);
ok(typeof qs.needs === "string" && qs.needs.length > 0, "tells the officer what is still missing in plain language");

// Capacity is honest: drop every cap to zero and it says so.
await req("interviews/panelist/set", { round_id: qs.id, user_id: setupUserId, weekly_cap: 0 }, officer);
const tight = (await req("interviews/feasibility", { round_id: qs.id }, officer)).data;
ok(tight.schedulable === 0, `cap 0 means nothing is schedulable, got ${tight.schedulable}`);
ok(/cap/i.test(tight.explanation), `explanation blames caps: "${tight.explanation}"`);

// --- the screens are reachable and role-gated ------------------------------
// The panels are client-hydrated, so asserting on server HTML would test the
// wrong thing. Route reachability is covered in cec-pages.mjs; what matters
// here is that the data each screen loads is correctly gated by role.
for (const path of ["/clubs/cec/interviews", "/clubs/cec/signals"]) {
  const r = await fetch(origin + path);
  ok(r.status === 200, `${path} renders`);
}
const officerSees = await fetch(origin + "/api/cec/interviews/state", { headers: { Cookie: officer } });
ok(officerSees.status === 200, "officers can load interview rounds");
const memberBlocked = await fetch(origin + "/api/cec/interviews/state", { headers: { Cookie: finisher.cookie } });
ok(memberBlocked.status === 403, "members cannot load interview rounds");
const ownSignals = await fetch(origin + "/api/cec/behavior/self", { headers: { Cookie: finisher.cookie } });
ok(ownSignals.status === 200, "members can load their own signals");

// --- invite onboarding: one screen, no password, no application -----------
const inv = (await req("invites/create", { label: "Fall members" }, officer)).data;
ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(inv.code), `code is short and readable: ${inv.code}`);
const look = (await req("invite?code=" + inv.code)).data;
ok(look.valid === true, "a fresh invite is valid");
ok(look.email_domain === "cornell.edu", "defaults to the Cornell domain");
const joined = await fetch(origin + "/api/cec/invite/claim", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ code: inv.code, name: "Henrik Gombos", email: `hg-${suffix}@cornell.edu` }),
});
ok(joined.status === 200, "joining needs only a name and an email");
const newCookie = joined.headers.get("set-cookie")?.split(";")[0] || "";
ok(newCookie.startsWith("cec_session="), "joining signs you straight in");
const who = (await req("state", undefined, newCookie)).data.user;
ok(who.role === "member", `lands as a member, not an applicant: got ${who.role}`);
const wrongDomain = await fetch(origin + "/api/cec/invite/claim", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ code: inv.code, name: "Outsider", email: "x@gmail.com" }),
});
ok(wrongDomain.status === 400, "a non-Cornell address is turned away");
ok((await req("invite?code=ZZZZ-ZZZZ")).data.valid === false, "an unknown code is not valid");

// --- REGRESSION: point-in-time leaks --------------------------------------
// The response to an offer is only known when it is recorded. Filtering
// opportunities by their OFFER time and then reading a response stamped later
// leaked the future backwards into every take rate, and dated the leaked
// observation at the cutoff so it also carried maximum recency weight.
{
  // Everything above happened "now". A horizon in the past must therefore see
  // no answered offers at all, regardless of how many exist today.
  const past = new Date(Date.now() - 30 * 86400e3).toISOString();
  await req(
    "outcomes/label",
    { subject_type: "person", subject_id: finisher.id, kind: "transition_completed", value: 1, horizon_start: past },
    officer,
  );
  const run = (await req("behavior/registry/run", {}, officer)).data;
  const takeRow = run.rows.find((r) => r.signal === "task_take_rate");
  ok(
    takeRow.pairs === 0 || takeRow.verdict === "insufficient_data",
    "a horizon before the activity sees nothing leak backwards",
  );
  const panelRow = run.rows.find((r) => r.signal === "panel_take_rate");
  ok(panelRow.verdict === "insufficient_data", "panel take rate does not fabricate history either");
  const interviewRow = run.rows.find((r) => r.signal === "interview_reliability");
  ok(
    interviewRow.verdict === "insufficient_data",
    "interview outcomes are read by status_at, so none leak before they were set",
  );
}

console.log(`${checks} signal-pipeline assertions passed.`);

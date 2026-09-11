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

console.log(`${checks} signal-pipeline assertions passed.`);

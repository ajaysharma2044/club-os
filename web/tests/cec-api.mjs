// Run against a dedicated fresh test database, never a real club installation.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const origin = process.env.CEC_TEST_ORIGIN || "http://localhost:3100";
const suffix = randomBytes(6).toString("hex");
const pass = randomBytes(16).toString("hex");
let checks = 0;
async function request(path, body, cookie = "", expected = 200) {
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
  checks++;
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] || cookie };
}
const setup = await request("auth/setup", {
  name: "Test Officer",
  email: `officer-${suffix}@example.test`,
  password: pass,
  bootstrap: process.env.CEC_BOOTSTRAP_TOKEN,
});
const officer = setup.cookie;
const signup = await request("auth/register", {
  name: "Test Builder",
  email: `member-${suffix}@example.test`,
  password: pass,
});
const participant = signup.cookie;
const u = (await request("state", undefined, participant)).data.user;
await request("create", { kind: "project", data: {} }, participant, 403);
await request(
  "apply",
  {
    track: "Events",
    statement: "I build prototypes and organize sessions.",
    url: "https://example.com/project",
  },
  participant,
);
await request(
  "application.review",
  { user_id: u.id, stage: "accepted", review: "INTERNAL_REVIEW_SECRET" },
  officer,
);
assert.equal(
  (await request("state", undefined, participant)).data.user.role,
  "member",
);
checks++;
assert.ok(
  !JSON.stringify(
    (await request("state", undefined, participant)).data,
  ).includes("INTERNAL_REVIEW_SECRET"),
);
checks++;
const starts = new Date(Date.now() + 86400000).toISOString(),
  ends = new Date(Date.now() + 90000000).toISOString();
const event = (
  await request(
    "create",
    {
      kind: "event",
      data: {
        title: "Synthetic Startup Hours",
        description: "Integration test event",
        location: "Test room",
        starts_at: starts,
        ends_at: ends,
        capacity: 1,
        status: "published",
      },
    },
    officer,
  )
).data.id;
await request("rsvp", { event_id: event, status: "yes" }, participant);
const other = (
  await request("auth/register", {
    name: "Waitlisted Participant",
    email: `other-${suffix}@example.test`,
    password: pass,
  })
).cookie;
assert.equal(
  (await request("rsvp", { event_id: event, status: "yes" }, other)).data
    .status,
  "waitlist",
);
checks++;
await request(
  "attendance",
  { event_id: event, user_id: u.id, status: "present" },
  participant,
  403,
);
await request(
  "attendance",
  { event_id: event, user_id: u.id, status: "present" },
  officer,
  400,
);
const forecast = (await request("quant/forecast", { event_id: event }, officer))
  .data;
assert.equal(forecast.features.current_rsvps, 1);
assert.equal(forecast.status, "prior_only");
checks += 2;
const task = (
  await request(
    "create",
    {
      kind: "task",
      data: {
        title: "Prepare agenda",
        assignee: u.id,
        status: "assigned",
        due_at: starts,
        origin: "Weekly meeting",
        project_id: "",
      },
    },
    officer,
  )
).data.id;
await request(
  "task.status",
  { id: task, status: "completed" },
  participant,
  400,
);
await request("task.status", { id: task, status: "accepted" }, participant);
await request("task.status", { id: task, status: "submitted" }, participant);
await request(
  "task.status",
  { id: task, status: "completed" },
  participant,
  403,
);
await request("task.status", { id: task, status: "completed" }, officer);
const slot = (
  await request(
    "create",
    {
      kind: "slot",
      data: {
        title: "Coffee chat",
        starts_at: starts,
        ends_at: ends,
        location: "Test room",
      },
    },
    officer,
  )
).data.id;
await request("book", { slot_id: slot }, participant);
await request("book", { slot_id: slot }, other, 409);
const form = (
  await request(
    "create",
    {
      kind: "form",
      data: {
        title: "Feedback",
        fields: [{ label: "What did you build?", required: true }],
        open: true,
      },
    },
    officer,
  )
).data.id;
await request("respond", { form_id: form, answers: {} }, participant, 400);
await request(
  "respond",
  { form_id: form, answers: { q0: "A prototype" } },
  participant,
);
await request(
  "respond",
  { form_id: form, answers: { q0: "Duplicate" } },
  participant,
  400,
);
const project = (
  await request(
    "create",
    {
      kind: "project",
      data: {
        title: "Synthetic project",
        description: "A test only",
        stage: "building",
        url: "https://example.com",
        shared: true,
      },
    },
    participant,
  )
).data.id;
assert.ok(
  !(await request("directory")).data.projects.some((p) => p.id === project),
);
checks++;
await request(
  "profile",
  { name: "Test Builder", interests: "Developer tools", shared: true },
  participant,
);
assert.ok(
  (await request("directory")).data.projects.some((p) => p.id === project),
);
checks++;
await request(
  "profile",
  { name: "Test Officer", interests: "synthetic project", shared: false },
  officer,
);
const suggestions = (await request("recommendations/generate", {}, officer))
  .data;
assert.equal(suggestions.model_version, "project-token-cosine-v1");
checks++;
const rec = suggestions.recommendations.find((r) => r.project_id === project);
assert.ok(rec);
checks++;
await request(
  "recommendations/action",
  { id: rec.id, value: "saved" },
  officer,
  409,
);
await request(
  "recommendations/exposure",
  { id: rec.id, value: "visible" },
  participant,
  404,
);
await request(
  "recommendations/exposure",
  { id: rec.id, value: "visible" },
  officer,
);
await request(
  "recommendations/action",
  { id: rec.id, value: "saved" },
  officer,
);
await request(
  "recommendations/outcome",
  { id: rec.id, value: "collaborating" },
  officer,
);
await request(
  "recommendations/action",
  { id: rec.id, value: "not_interested" },
  officer,
);
assert.equal(
  (await request("recommendations/generate", {}, officer)).data.recommendations
    .length,
  0,
);
checks++;
await request(
  "profile",
  { name: "Test Builder", interests: "Developer tools", shared: false },
  participant,
);
assert.ok(
  !(await request("directory")).data.projects.some((p) => p.id === project),
);
checks++;
await request(
  "recommendations/exposure",
  { id: rec.id, value: "visible" },
  officer,
  410,
);
const f = (await request("state", undefined, officer)).data.items.find(
  (r) => r.id === form,
);
await request(
  "update",
  { id: form, version: f.version - 1, data: f.data },
  officer,
  409,
);
await request(
  "message",
  { channel: "general", body: "Test club message" },
  participant,
);
const st = (await request("state", undefined, officer)).data;
assert.ok(st.messages.length);
assert.equal(st.outbox.count, 0);
checks += 2;
const noOrigin = await fetch(origin + "/api/cec/profile", {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: participant },
  body: "{}",
});
assert.equal(noOrigin.status, 403);
checks++;
const cal = (await request("calendar")).data;
assert.ok(cal.includes("BEGIN:VCALENDAR"));
assert.ok(cal.includes("Synthetic Startup Hours"));
checks += 2;
await request("auth/logout", {}, participant);
await request("profile", { name: "Nope" }, participant, 401);
console.log(
  `${checks} API assertions passed: roles, persistence, recruitment privacy, RSVP capacity, forecast bridge, review gates, booking, forms, sharing revocation, CSRF, ICS and logout.`,
);

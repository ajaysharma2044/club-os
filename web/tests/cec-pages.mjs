import assert from "node:assert/strict";

const origin = process.env.CEC_TEST_ORIGIN || "http://localhost:3100";
let checks = 0;
async function page(path, status = 200) {
  const response = await fetch(origin + path, { redirect: "manual" });
  assert.equal(response.status, status, path);
  checks++;
  return response;
}

// These requests exercise Next's actual route rendering and redirects without
// assuming a seeded member identity or sharing the developer's local database.
for (const path of [
  "/",
  "/discover",
  "/join",
  "/join?club=cec",
  "/chat",
  "/chat?c=builders",
  "/you",
  "/you?view=intake",
  "/you?view=record",
  "/you?view=schedule",
  "/clubs/cec",
  "/clubs/cec/events",
  "/clubs/cec/workspace",
  "/clubs/cec/people",
  "/clubs/cec/money",
  "/clubs/cec/settings",
  "/clubs/cec/record",
  "/clubs/cec/intake",
  "/clubs/cec/schedule",
  "/clubs/cec/directory",
  "/clubs/cec/interviews",
  "/clubs/cec/signals",
  "/join/cec",
  "/join/cec?i=NOPE-NOPE",
])
  await page(path);

for (const [legacy, current] of Object.entries({
  "/cec": "/clubs/cec",
  "/cec/events": "/clubs/cec/events",
  "/cec/work": "/clubs/cec/workspace",
  "/cec/people": "/clubs/cec/people",
  "/cec/crm": "/clubs/cec/money",
  "/cec/account": "/clubs/cec/settings",
  "/cec/record": "/clubs/cec/record",
  "/cec/intake": "/clubs/cec/intake",
  "/cec/schedule": "/clubs/cec/schedule",
  "/cec/directory": "/clubs/cec/directory",
  "/cec/interviews": "/clubs/cec/interviews",
  "/cec/signals": "/clubs/cec/signals",
})) {
  const response = await page(legacy, 307);
  assert.equal(
    response.headers.get("location"),
    current,
    legacy + " destination",
  );
  checks++;
}

// Additional CEC views must never attach its data to a different club slug.
await page("/clubs/baja/record", 404);
await page("/clubs/cec/missing-view", 404);
const example = await (await page("/clubs/baja")).text();
assert.match(example, /Example club/);
checks++;
console.log(`CEC frontend routes: ${checks} checks passed`);

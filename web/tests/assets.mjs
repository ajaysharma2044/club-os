// The asset register and succession risk, against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/assets.mjs
//
// The case under test is the real one from docs/12 §11: cornellec.com sits on a
// graduated president's personal registrar account, an officer who needs it has
// no access, and nobody noticed until September.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-assets-"));
process.env.CEC_DATABASE = join(dir, "assets.sqlite");

const { db } = await import("../lib/cec/db.ts");
const {
  assetsInit,
  registerAsset,
  grantAccess,
  revokeAccess,
  reassign,
  busFactor,
  orphanRisk,
  accessList,
  myAccess,
  assetState,
  assets,
  setDeparture,
  departureOf,
  monthsUntil,
} = await import("../lib/cec/assets.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

assetsInit();

// --- fixtures ---------------------------------------------------------------
const user = (name, role) => {
  const id = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,interests,shared) VALUES (?,?,?,?,?,'',0)",
    )
    .run(id, name, `${id}@example.test`, "x:unusable", role);
  return { id, name, email: `${id}@example.test`, role, interests: "", shared: 0 };
};
const inMonths = (n) => new Date(Date.now() + n * 30.436875 * 86400e3).toISOString();
const reset = () => {
  db().exec("DELETE FROM asset_access; DELETE FROM assets;");
};

const president = user("Rohan (President Emeritus)", "alumni"); // graduated
const media = user("Maya, Media Chair", "officer");
const ops = user("Owen, Ops", "officer");
const junior = user("Jen, Junior", "member");
const senior = user("Sam, Senior", "member");

setDeparture(media, president.id, inMonths(-4)); // left in May
setDeparture(media, media.id, inMonths(8));
setDeparture(media, ops.id, inMonths(20));
setDeparture(media, junior.id, inMonths(32));
setDeparture(media, senior.id, inMonths(2));

ok(departureOf(president.id).startsWith("20"), "departure is stored as an ISO date");
ok(departureOf(randomUUID()) === "", "unknown person has no recorded departure");
ok(Math.abs(monthsUntil(inMonths(6)) - 6) < 0.1, "monthsUntil counts forward");
ok(monthsUntil(inMonths(-3)) < 0, "a past date reads negative");

// --- the register stores no credentials ------------------------------------
const columns = db()
  .prepare("SELECT name FROM pragma_table_info('assets')")
  .all()
  .concat(db().prepare("SELECT name FROM pragma_table_info('asset_access')").all())
  .map((c) => c.name.toLowerCase());
ok(
  !columns.some((c) => /password|secret|credential|token|^key$|api/.test(c)),
  `no credential column exists: ${columns.join(",")}`,
);
ok(columns.includes("location"), "it stores where the credential lives");
ok(columns.includes("role_key"), "assets belong to a position, not a person");

// --- 1. the only holder has graduated: bus factor 0, top of the list --------
let domain = registerAsset(media, {
  kind: "domain",
  name: "cornellec.com",
  location: "Porkbun — personal account",
  holder: president.id,
  roleKey: "president",
});
const drive = registerAsset(media, {
  kind: "drive_folder",
  name: "CEC Shared Drive",
  holder: junior.id,
  roleKey: "vp_internal",
});

ok(busFactor(domain) === 0, `graduated sole holder -> bus factor 0, got ${busFactor(domain)}`);
ok(busFactor(drive) === 1, "a current holder with owner access -> bus factor 1");
let risk = orphanRisk();
ok(risk[0].asset_id === domain, "the stranded domain sorts first in orphan risk");
ok(risk[0].gone === true, "it carries the already-left flag");
ok(risk[0].bus_factor === 0, "the row reports bus factor 0");
ok(risk[0].months < 0, `the holder's departure is in the past: ${risk[0].months}`);
ok(/has left/.test(risk[0].line), `the row reads as a sentence: ${risk[0].line}`);
ok(
  accessList(domain).every((a) => a.current === false),
  "nobody with access is still in the club",
);

// --- 2. a second admin raises the bus factor and clears the alarm -----------
ok(busFactor(drive) === 1, "before: one owner");
ok(
  assetState(media).single_point.some((r) => r.asset_id === drive),
  "bus factor 1 shows in the single-point list",
);
grantAccess(media, drive, ops.id, "admin");
ok(busFactor(drive) === 2, `a second current admin -> 2, got ${busFactor(drive)}`);
const state = assetState(media);
ok(
  !state.single_point.some((r) => r.asset_id === drive),
  "it drops out of the single-point alarm list",
);
ok(
  !state.stranded.some((r) => r.asset_id === drive),
  "and is not stranded either",
);
ok(
  state.stranded.some((r) => r.asset_id === domain),
  "the domain is still stranded",
);
// Viewers and editors are not continuity: they cannot renew anything.
grantAccess(media, drive, senior.id, "viewer");
ok(busFactor(drive) === 2, "a viewer does not raise the bus factor");
ok(accessList(drive).length === 3, "but is listed as having access");

// --- 3. reassigning moves the holder and preserves the history -------------
const before = db()
  .prepare("SELECT granted_at,level FROM asset_access WHERE asset_id=? AND user_id=?")
  .get(domain, president.id);
ok(reassign(media, domain, media.id) === true, "reassign reports the move");
ok(
  db().prepare("SELECT holder_id FROM assets WHERE id=?").get(domain).holder_id ===
    media.id,
  "the holder moved to the current officer",
);
const after = db()
  .prepare("SELECT granted_at,level FROM asset_access WHERE asset_id=? AND user_id=?")
  .get(domain, president.id);
ok(after && after.granted_at === before.granted_at, "the prior holder's access row is preserved untouched");
ok(
  db()
    .prepare("SELECT COUNT(*) n FROM audit WHERE action='asset.reassign' AND object_id=?")
    .get(domain).n === 1,
  "the reassignment is in the append-only audit log",
);
ok(busFactor(domain) === 1, "the new holder can now actually get in");
ok(reassign(media, domain, media.id) === false, "reassigning to the same person is a no-op");

// --- 4. revoking the last owner lowers the bus factor ----------------------
ok(busFactor(domain) === 1, "one current owner before the revoke");
ok(revokeAccess(media, domain, media.id) === true, "revoke reports the removal");
ok(busFactor(domain) === 0, "revoking the last owner drops the bus factor to 0");
ok(
  orphanRisk().find((r) => r.asset_id === domain).bus_factor === 0,
  "and the register says so, even though a current officer is still the holder",
);
ok(revokeAccess(media, domain, media.id) === false, "revoking twice is a no-op");
ok(revokeAccess(media, domain, ops.id) === false, "revoking someone who never had access is a no-op");
grantAccess(media, domain, media.id, "owner"); // put it back

// --- 5. orphan risk sorts by time to departure, ascending ------------------
reset();
const held = (name, holder, roleKey) =>
  registerAsset(media, { kind: "social_account", name, holder, roleKey });
held("Instagram", senior.id, "media_chair"); // 2 months
held("LinkedIn", media.id, "media_chair"); // 8 months
held("Substack", ops.id, "vp_external"); // 20 months
held("YouTube", junior.id, "media_chair"); // 32 months
const unknown = registerAsset(media, {
  kind: "subscription",
  name: "Notion",
  holder: user("Nia, No Date", "member").id,
});
const unheld = registerAsset(media, { kind: "form", name: "Coffee chat form" });
const gone = registerAsset(media, {
  kind: "email_account",
  name: "cec.recruiting@gmail.com",
  holder: president.id,
});

risk = orphanRisk();
ok(risk[0].asset_id === unheld, "an asset nobody holds sorts above everything");
ok(risk[0].rank === 0 && risk[0].gone === true, "it is flagged as having no holder");
ok(risk[1].asset_id === gone, "then the asset whose holder already left");
ok(risk[1].rank === 1, "which is a distinct rank from a holder still here");
const present = risk.filter((r) => r.rank === 2 && r.months !== null);
ok(present.length === 4, "four assets have a dated, still-present holder");
ok(
  present.every((r, i) => i === 0 || present[i - 1].months <= r.months),
  `months ascending: ${present.map((r) => r.months).join(",")}`,
);
ok(present[0].name === "Instagram", "the soonest departure is first");
ok(present[3].name === "YouTube", "the furthest is last");
ok(
  risk[risk.length - 1].asset_id === unknown,
  "an undated holder sorts last, not into the emergency slots",
);
ok(risk[risk.length - 1].months === null, "with no invented number");
ok(assetState(media).unassigned_role === 3, "assets tied to no position are counted");

// --- 6. the CEC case, end to end -------------------------------------------
reset();
domain = registerAsset(media, {
  kind: "domain",
  name: "cornellec.com",
  location: "Porkbun — Rohan's personal account",
  holder: president.id,
  roleKey: "president",
  notes: "Discussed in #fall26-internalltools; he is not in the channel.",
});
registerAsset(media, {
  kind: "drive_folder",
  name: "Recruiting 2026",
  holder: ops.id,
  roleKey: "vp_internal",
});

// Owen runs recruitment off the domain and cannot get in.
ok(
  !accessList(domain).some((a) => a.user_id === ops.id),
  "the officer who needs it has no access",
);
ok(
  !myAccess(ops).assets.some((a) => a.id === domain),
  "and his own page confirms it, instead of 'u shd have access'",
);
const cec = assetState(media);
ok(cec.orphan_risk[0].asset_id === domain, "the register flags the domain as the top risk");
ok(cec.stranded.length === 1 && cec.stranded[0].asset_id === domain, "it is the only stranded asset");
ok(cec.orphan_risk[0].role_key === "president", "and names the position that should hold it");
ok(
  /president/.test(cec.orphan_risk[0].line) && /has left/.test(cec.orphan_risk[0].line),
  `the officer-readable line: ${cec.orphan_risk[0].line}`,
);
ok(cec.counts.length === 2 && cec.total === 2, "counts by kind cover the register");

// The transition: hand it to the sitting president's seat and stop being one
// graduation from zero.
assets(media, "reassign", { asset_id: domain, to: media.id });
assets(media, "grant", { asset_id: domain, user_id: ops.id, level: "admin" });
ok(busFactor(domain) === 2, `after the handoff the bus factor is 2, got ${busFactor(domain)}`);
const fixed = assetState(media);
ok(fixed.stranded.length === 0, "nothing is stranded any more");
ok(
  !fixed.single_point.some((r) => r.asset_id === domain),
  "and the domain is no longer one person away",
);
ok(
  fixed.single_point.some((r) => r.name === "Recruiting 2026"),
  "while the folder with a single owner still shows in the alarm list",
);
ok(
  fixed.orphan_risk[0].months !== null && fixed.orphan_risk[0].months > 0,
  "the worst row is now a future date, not a past one",
);
ok(
  myAccess(ops).assets.some((a) => a.id === domain),
  "the officer who needed it can see that he has it",
);

// --- officer gate and unknown actions --------------------------------------
const applicant = user("Ana, Applicant", "applicant");
assert.throws(() => assetState(applicant), /Officer access required/);
checks++;
assert.throws(() => assets(junior, "register", { kind: "domain", name: "x" }), /Officer access required/);
checks++;
assert.throws(() => assets(media, "nonsense", {}), /Unknown asset action/);
checks++;
assert.throws(
  () => registerAsset(media, { kind: "domain", name: "cornellec.com" }),
  /already in the register/,
);
checks++;
assert.throws(() => registerAsset(media, { kind: "wallet", name: "x" }), /Unknown asset kind/);
checks++;
assert.throws(() => grantAccess(media, domain, media.id, "root"), /Unknown access level/);
checks++;
assert.throws(() => myAccess(applicant), /Club membership required/);
checks++;

// --- emissions stay inside the quant store's closed schema -----------------
const declared = {
  commitment_offer: {
    status: ["offered", "accepted", "declined", "expired", "withdrawn", "reassigned"],
    offer_kind: [
      "task",
      "ownership",
      "panel",
      "coffee_chat",
      "speaker_outreach",
      "committee",
      "handoff",
    ],
  },
};
const emitted = db()
  .prepare("SELECT body FROM outbox")
  .all()
  .map((r) => JSON.parse(r.body));
ok(emitted.length > 0, "the register emits behavioural events");
ok(
  emitted.every((e) => declared[e.kind]),
  `every emitted kind is declared in store.py SCHEMAS: ${[...new Set(emitted.map((e) => e.kind))].join(",")}`,
);
ok(
  emitted.every(
    (e) =>
      JSON.stringify(Object.keys(e.payload).sort()) ===
      JSON.stringify(Object.keys(declared[e.kind]).sort()),
  ),
  "payload keys match the declared schema exactly",
);
ok(
  emitted.every((e) =>
    Object.entries(e.payload).every(([k, v]) => declared[e.kind][k].includes(v)),
  ),
  "payload values are inside the declared enums",
);
ok(
  emitted.every((e) => e.fact_key === `${e.kind}:${e.subject}:${e.object_id}`),
  "fact_key is kind:subject:object_id, as the store requires",
);
ok(
  emitted.some((e) => e.payload.offer_kind === "handoff" && e.payload.status === "accepted"),
  "a reassignment emits the handoff the new holder accepted",
);
ok(
  emitted.some((e) => e.payload.status === "reassigned"),
  "and records that the outgoing holder lost it by someone else's decision",
);
ok(
  emitted.some((e) => e.payload.status === "withdrawn"),
  "a revoked owner emits a withdrawn commitment",
);
ok(
  !emitted.some((e) => JSON.stringify(e).toLowerCase().includes("password")),
  "nothing resembling a credential ever leaves the register",
);

console.log(`${checks} asset-register assertions passed.`);

// The skill evidence graph, against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/skills.mjs
//
// The two claims under test are the ones the whole design rests on:
//
//   1. A single experience is not a skill. One episode yields "single_instance"
//      however much activity is inside it; only repetition ACROSS episodes,
//      settings and terms moves the verdict.
//   2. Evidence, never a score (docs/10 §6, docs/11 §7). The employer and
//      investor payloads carry episodes, artifacts, outcomes and counts — and no
//      number that could be sorted on.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-skills-"));
process.env.CEC_DATABASE = join(dir, "skills.sqlite");

const { db } = await import("../lib/cec/db.ts");
const { label } = await import("../lib/cec/outcomes.ts");
const { SKILLS, SKILL_IDS, skill, isSkill, skillName } = await import(
  "../lib/cec/skills/definitions.ts"
);
const {
  skillsInit,
  linkEvidence,
  retractLink,
  recordArtifact,
  evidenceStrength,
  skillSummary,
  skillLinks,
  personSkills,
  termOf,
} = await import("../lib/cec/skills/evidence.ts");
const {
  profilesInit,
  grantProfileAccess,
  revokeProfileAccess,
  activeGrant,
  externalSafety,
  evidenceProfile,
  jobEvidenceMatch,
  vcProfile,
} = await import("../lib/cec/skills/profiles.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const throws = (f, m) => {
  assert.throws(f, m);
  checks++;
};

skillsInit();
profilesInit();

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

const at = (iso) => `${iso}T12:00:00.000Z`;

const episode = (title, owner, createdAt, status = "active", sourceType = "project") => {
  const eid = randomUUID();
  db()
    .prepare(
      "INSERT INTO episodes(id,organization_id,owner,title,goal,status,source_type,source_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(eid, "cornell-ec", owner, title, `Ship ${title}`, status, sourceType, randomUUID(), createdAt);
  return eid;
};

const event = (
  episodeId,
  actor,
  subject,
  family,
  type,
  occurredAt,
  level = "system_observed",
  context = {},
) => {
  const evid = randomUUID();
  db()
    .prepare(
      "INSERT INTO activity_events(id,source_key,organization_id,episode_id,actor_id,subject_id,action_family,event_type,object_type,object_id,occurred_at,observed_at,source,source_ref,evidence_level,visibility,policy,context) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      evid,
      randomUUID(),
      "cornell-ec",
      episodeId,
      actor,
      subject,
      family,
      type,
      "task",
      randomUUID(),
      occurredAt,
      occurredAt,
      "club_os",
      "test",
      level,
      "club_internal",
      "test-policy",
      JSON.stringify(context),
    );
  return evid;
};

const chair = user("Priya, President", "officer");
const dana = user("Dana", "member");
const sam = user("Sam", "member");
const kai = user("Kai", "member");
const rin = user("Rin", "member");
const noor = user("Noor", "member");

// asOf must sit after the grants, which are stamped with the real clock.
const NOW_ISO = new Date().toISOString();
const FULL = "2099-01-01T00:00:00.000Z";

// =========================================================== the vocabulary

ok(SKILLS.length >= 18, "the curated skill list covers the club's real work");
ok(
  SKILL_IDS.includes("backend_engineering") && SKILL_IDS.includes("sponsorship_sales"),
  "the vocabulary spans engineering and revenue work",
);
ok(
  SKILLS.every((s) => /^[a-z][a-z0-9_]*$/.test(s.id) && s.description.length > 30),
  "every skill has a stable id and a description a reviewer could argue with",
);
ok(!isSkill("growth_hacking"), "a skill nobody wrote down is not a skill");
ok(skill("design")?.canonical_name === "Design", "definitions resolve by id");
ok(skillName("not_a_skill") === "not_a_skill", "an unknown id is shown, never invented");
ok(termOf(at("2025-02-10")) === "2025-SP" && termOf(at("2025-10-05")) === "2025-FA",
  "terms come from the calendar, not from anything about the person");

// ================================================ a link needs real evidence

const b1 = episode("Member portal rebuild", dana.id, at("2025-02-10"));
const b1e = event(b1, dana.id, dana.id, "EXECUTE", "task.completed", at("2025-02-10"), "counterparty_confirmed");

throws(
  () =>
    linkEvidence(chair, {
      personId: dana.id,
      skillId: "backend_engineering",
      evidenceKind: "episode",
      evidenceId: randomUUID(),
      roleContext: "owner",
      reason: "made it up",
    }),
  /does not exist/,
);
ok(true, "a link to an episode id that does not exist is refused");

throws(
  () =>
    linkEvidence(chair, {
      personId: dana.id,
      skillId: "quantum_alchemy",
      evidenceKind: "episode",
      evidenceId: b1,
      roleContext: "owner",
      reason: "off-vocabulary",
    }),
  /curated list/,
);
ok(true, "a skill outside the curated vocabulary is refused");

throws(
  () =>
    linkEvidence(chair, {
      personId: sam.id,
      skillId: "backend_engineering",
      evidenceKind: "activity_event",
      evidenceId: b1e,
      roleContext: "implementer",
      reason: "borrowing someone else's work",
    }),
  /not about this person/,
);
ok(true, "an event about someone else cannot be attached to a third party");

throws(
  () =>
    linkEvidence(chair, {
      personId: dana.id,
      skillId: "backend_engineering",
      evidenceKind: "episode",
      evidenceId: b1,
      roleContext: "owner",
      reason: "",
    }),
  /required/i,
);
ok(true, "a link with no stated reason is refused: an unarguable claim is not evidence");

const firstLink = linkEvidence(chair, {
  personId: dana.id,
  skillId: "backend_engineering",
  evidenceKind: "episode",
  evidenceId: b1,
  roleContext: "owner",
  reason: "Owned the portal rebuild episode end to end, including the data model.",
  contextKey: "eng-team",
});
const stored = db()
  .prepare("SELECT * FROM evidence_skill_links WHERE id=?")
  .get(firstLink);
ok(stored.evidence_id === b1, "the stored link points at the real episode row");
ok(stored.reason.length > 10 && stored.model_version === "skill-evidence-v1",
  "the link carries a human-readable reason and the model version that wrote it");
ok(stored.occurred_at === at("2025-02-10"),
  "the link copies the evidence's own clock, not the clock of whoever ran the deriver");

const again = linkEvidence(chair, {
  personId: dana.id,
  skillId: "backend_engineering",
  evidenceKind: "episode",
  evidenceId: b1,
  roleContext: "owner",
  reason: "Owned the portal rebuild episode end to end, including the data model.",
  contextKey: "eng-team",
});
ok(again === firstLink, "linking the same evidence twice is idempotent");

// ===================================== one episode is not a proven skill

const a1 = episode("Attendance analysis", sam.id, at("2025-02-10"));
event(a1, sam.id, sam.id, "EXECUTE", "task.completed", at("2025-02-10"), "counterparty_confirmed");
linkEvidence(chair, {
  personId: sam.id,
  skillId: "data_analysis",
  evidenceKind: "episode",
  evidenceId: a1,
  roleContext: "owner",
  reason: "Cleaned two years of RSVP data and produced the no-show breakdown officers used.",
  contextKey: "data-team",
});
// Pile more evidence into the SAME episode. This is the case the design is
// built against: activity volume inside one experience must not read as breadth.
const a1b = event(a1, sam.id, sam.id, "REVISE", "task.updated", at("2025-02-12"));
const a1c = event(a1, sam.id, sam.id, "COMPLETE", "task.submitted", at("2025-02-14"), "self_reported");
for (const [e, why] of [
  [a1b, "Reworked the cohort join after the first numbers looked wrong."],
  [a1c, "Submitted the finished breakdown for review."],
])
  linkEvidence(chair, {
    personId: sam.id,
    skillId: "data_analysis",
    evidenceKind: "activity_event",
    evidenceId: e,
    roleContext: "implementer",
    reason: why,
    contextKey: "data-team",
  });

const one = skillSummary(sam.id, "data_analysis", FULL);
ok(one.verdict === "single_instance", "one episode yields single_instance, not proficiency");
ok(one.episodes === 1 && one.links.length === 3,
  "three records inside one episode are still one episode");
ok(one.distinctContexts === 1 && one.distinctTerms === 1, "one setting, one term");
ok(one.confidence <= 0.25,
  "confidence is capped for a single instance: what is missing is a second occasion, not better evidence");
ok(/One experience is one experience/.test(one.reading),
  "the reading refuses to claim proficiency in plain language");

// ===================================== repetition across contexts is the thing

const a2 = episode("Recruiting funnel review", sam.id, at("2025-10-05"));
event(a2, sam.id, sam.id, "EXECUTE", "task.completed", at("2025-10-05"), "counterparty_confirmed");
linkEvidence(chair, {
  personId: sam.id,
  skillId: "data_analysis",
  evidenceKind: "episode",
  evidenceId: a2,
  roleContext: "lead",
  reason: "Modelled the application funnel and found the stage where candidates dropped out.",
  contextKey: "recruiting-team",
});

const two = skillSummary(sam.id, "data_analysis", FULL);
ok(two.verdict === "repeated", "a second episode moves the verdict off single_instance");
ok(two.confidence > one.confidence, "a second, separate occasion raises confidence");

const a3 = episode("Sponsor conversion study", sam.id, at("2026-03-12"));
event(a3, sam.id, sam.id, "EXECUTE", "task.completed", at("2026-03-12"), "counterparty_confirmed");
linkEvidence(chair, {
  personId: sam.id,
  skillId: "data_analysis",
  evidenceKind: "episode",
  evidenceId: a3,
  roleContext: "owner",
  reason: "Measured which outreach sequences converted sponsors across two semesters of deals.",
  contextKey: "sponsorship-team",
});

const three = skillSummary(sam.id, "data_analysis", FULL);
ok(three.verdict === "consistent",
  "three episodes across three settings and three terms reads as consistent");
ok(three.episodes === 3 && three.distinctContexts === 3 && three.distinctTerms === 3,
  "episodes, settings and terms are counted separately, because they mean different things");
ok(three.confidence > two.confidence && two.confidence > one.confidence,
  "confidence rises monotonically with cross-context repetition");
ok(/different settings and different semesters/.test(three.reading),
  "the reading names what actually changed");

// ============================================================ point in time

const early = skillSummary(sam.id, "data_analysis", "2025-06-01T00:00:00.000Z");
ok(early.episodes === 1 && early.verdict === "single_instance",
  "as of June 2025 only the first episode had happened: later evidence is excluded");
ok(early.links.every((l) => l.occurred_at <= "2025-06-01T00:00:00.000Z"),
  "no link dated after asOf appears in an as-of read");
ok(early.confidence < three.confidence,
  "the same person reads as less established at an earlier date, which is the point");

// ================================================== retraction and disputes

const d1 = episode("Demo day emcee", sam.id, at("2025-04-01"));
const d1e = event(d1, sam.id, sam.id, "COMMUNICATE", "event.hosted", at("2025-04-01"));
const speak = linkEvidence(chair, {
  personId: sam.id,
  skillId: "public_speaking",
  evidenceKind: "activity_event",
  evidenceId: d1e,
  roleContext: "lead",
  reason: "Hosted demo day in front of roughly ninety people.",
  contextKey: "demo-day",
});
ok(skillLinks(sam.id, "public_speaking", FULL).length === 1, "the link is live");
ok(retractLink(chair, speak, "Sam says a co-host ran the evening."), "a link can be retracted");
ok(skillLinks(sam.id, "public_speaking", FULL).length === 0,
  "a retracted link stops being evidence, and is kept rather than deleted");
ok(
  db().prepare("SELECT retracted_reason FROM evidence_skill_links WHERE id=?").get(speak)
    .retracted_reason.length > 0,
  "the retraction itself is on the record, so the dispute is auditable",
);

const c1 = episode("Budget reconciliation", sam.id, at("2025-05-06"));
const c1e = event(c1, sam.id, sam.id, "EXECUTE", "task.completed", at("2025-05-06"));
linkEvidence(chair, {
  personId: sam.id,
  skillId: "budgeting",
  evidenceKind: "activity_event",
  evidenceId: c1e,
  roleContext: "implementer",
  reason: "Reconciled the spring budget against receipts.",
  contextKey: "finance-team",
});
ok(skillLinks(sam.id, "budgeting", FULL).length === 1, "the budgeting link is live");
event(c1, chair.id, sam.id, "REVISE", "evidence.correction", at("2025-05-20"), "self_reported", {
  corrects: c1e,
  statement: "The treasurer did the reconciliation; Sam collected the receipts.",
});
ok(skillLinks(sam.id, "budgeting", FULL).length === 0,
  "evidence somebody has filed a correction against stops supporting a skill claim");

// ================================================== artifacts are append-only

const s1 = episode("Fall sponsorship drive", dana.id, at("2025-10-05"), "completed");
event(s1, dana.id, dana.id, "EXECUTE", "deal.signed", at("2025-11-01"), "counterparty_confirmed");
const contract = recordArtifact(chair, {
  personId: dana.id,
  kind: "contract",
  title: "IBM sponsorship agreement, $4,000",
  episodeId: s1,
  url: "https://drive.example.test/ibm-2025",
  producedAt: at("2025-11-01"),
});
ok(contract, "an artifact is recorded");
throws(
  () => db().prepare("UPDATE skill_artifacts SET title='something else' WHERE id=?").run(contract),
  /append only/,
);
ok(true, "an artifact cannot be edited after a claim was built on it");
throws(() => db().prepare("DELETE FROM skill_artifacts WHERE id=?").run(contract), /append only/);
ok(true, "an artifact cannot be deleted");

// ======================================================== strength mechanics

const baseline = {
  evidenceKind: "episode",
  evidenceLevel: "system_observed",
  roleContext: "contributor",
  asOf: at("2026-06-01"),
};
const fresh = evidenceStrength({ ...baseline, occurredAt: at("2026-05-01") });
const stale = evidenceStrength({ ...baseline, occurredAt: at("2024-06-01") });
ok(fresh.value > stale.value, "recent evidence carries more than old evidence");
ok(stale.value > 0, "but old work is still work: recency has a floor, not an asymptote to zero");
ok(
  evidenceStrength({ ...baseline, roleContext: "owner", occurredAt: at("2026-05-01") }).value >
    evidenceStrength({ ...baseline, roleContext: "observer", occurredAt: at("2026-05-01") }).value,
  "what the person actually did in the work changes what it shows",
);
ok(
  evidenceStrength({ ...baseline, occurredAt: at("2026-05-01"), repeatCount: 4, distinctContexts: 3 })
    .value > fresh.value,
  "corroboration across settings raises the strength of each piece of evidence",
);
ok(fresh.drivers.length >= 6 && fresh.drivers.every((d) => Number.isFinite(d.contribution)),
  "strength decomposes into named drivers rather than arriving as one opaque number");

// ==================================== the same person, two very different jobs

// Backend: three episodes, two settings, three terms.
linkEvidence(chair, {
  personId: dana.id,
  skillId: "backend_engineering",
  evidenceKind: "activity_event",
  evidenceId: b1e,
  roleContext: "implementer",
  reason: "Wrote and shipped the portal's task API.",
  contextKey: "eng-team",
});
const b2 = episode("Ticketing API", dana.id, at("2025-10-05"), "completed");
const b2e = event(b2, dana.id, dana.id, "EXECUTE", "task.completed", at("2025-10-05"), "counterparty_confirmed");
linkEvidence(chair, {
  personId: dana.id,
  skillId: "backend_engineering",
  evidenceKind: "activity_event",
  evidenceId: b2e,
  roleContext: "lead",
  reason: "Built the ticketing service used at Big Red Hacks, including the queue.",
  contextKey: "hack-cornell",
});
const b3 = episode("Payments migration", dana.id, at("2026-03-12"));
const b3e = event(b3, dana.id, dana.id, "EXECUTE", "task.completed", at("2026-03-12"), "counterparty_confirmed");
linkEvidence(chair, {
  personId: dana.id,
  skillId: "backend_engineering",
  evidenceKind: "activity_event",
  evidenceId: b3e,
  roleContext: "owner",
  reason: "Migrated dues collection to the new provider with no lost payments.",
  contextKey: "eng-team",
});
recordArtifact(chair, {
  personId: dana.id,
  kind: "repository",
  title: "clubos-payments",
  episodeId: b3,
  url: "https://github.example.test/clubos-payments",
  producedAt: at("2026-03-20"),
});

// Sponsorship: a different two episodes, with a contract and a labelled outcome.
linkEvidence(chair, {
  personId: dana.id,
  skillId: "sponsorship_sales",
  evidenceKind: "episode",
  evidenceId: s1,
  roleContext: "owner",
  reason: "Ran the fall sponsorship pipeline and closed the IBM agreement.",
  contextKey: "sponsorship-team",
});
const outcomeId = label(chair, {
  subjectType: "episode",
  subjectId: s1,
  kind: "sponsor_converted",
  value: 1,
  horizonStart: at("2025-10-05"),
  occurredAt: at("2025-11-01"),
});
linkEvidence(chair, {
  personId: dana.id,
  skillId: "sponsorship_sales",
  evidenceKind: "outcome",
  evidenceId: outcomeId,
  roleContext: "owner",
  reason: "The sponsor converted: a signed agreement, not a pitch deck.",
  contextKey: "sponsorship-team",
});
const s2 = episode("Spring sponsor renewals", dana.id, at("2026-03-12"));
const s2e = event(s2, dana.id, dana.id, "EXECUTE", "deal.signed", at("2026-03-12"), "counterparty_confirmed");
linkEvidence(chair, {
  personId: dana.id,
  skillId: "sponsorship_sales",
  evidenceKind: "activity_event",
  evidenceId: s2e,
  roleContext: "owner",
  reason: "Renewed two of three sponsors for spring.",
  contextKey: "sponsorship-team",
});

throws(
  () =>
    linkEvidence(chair, {
      personId: sam.id,
      skillId: "sponsorship_sales",
      evidenceKind: "outcome",
      evidenceId: outcomeId,
      roleContext: "owner",
      reason: "not mine",
    }),
  /no record in|someone else/i,
);
ok(true, "an outcome cannot be borrowed by someone with no record in the work that produced it");

const backendJob = {
  id: "job-be-1",
  title: "Backend Engineering Intern",
  employer: "Northwind",
  skills: [
    { skill_id: "backend_engineering", necessity: "required", note: "Python or TypeScript services" },
    { skill_id: "data_analysis", necessity: "preferred" },
    { skill_id: "financial_modeling", necessity: "bonus" },
  ],
};
const salesJob = {
  id: "job-sales-1",
  title: "Partnerships Associate",
  employer: "Northwind",
  skills: [
    { skill_id: "sponsorship_sales", necessity: "required" },
    { skill_id: "partnerships", necessity: "preferred" },
  ],
};

// --- consent gate -----------------------------------------------------------
const noGrant = jobEvidenceMatch({
  personId: dana.id,
  job: backendJob,
  audience: "employer",
  asOf: FULL,
});
ok(noGrant.granted === false, "an absent grant is refused, not partially honoured");
ok(noGrant.requirements.length === 0 && noGrant.unevidenced.length === 0,
  "nothing at all is released without consent — not even the shape of what exists");
ok(evidenceProfile({ personId: dana.id, audience: "employer", asOf: FULL }).skills.length === 0,
  "the unscoped profile is equally empty without a grant");

ok(grantProfileAccess(dana, { personId: dana.id, audience: "employer", scope: "skill_evidence" }),
  "the person grants access to their own record");
throws(
  () => grantProfileAccess(chair, { personId: dana.id, audience: "employer", scope: "skill_evidence" }),
  /Only the person/,
);
ok(true, "an officer cannot consent on a member's behalf");
ok(activeGrant(dana.id, "employer", "skill_evidence", FULL) !== null, "the grant is live");
ok(activeGrant(dana.id, "investor", "skill_evidence", FULL) === null,
  "consent is per audience: an employer grant does not open the investor view");

// --- job specificity --------------------------------------------------------
const beMatch = jobEvidenceMatch({
  personId: dana.id,
  job: backendJob,
  audience: "employer",
  asOf: FULL,
});
const salesMatch = jobEvidenceMatch({
  personId: dana.id,
  job: salesJob,
  audience: "employer",
  asOf: FULL,
});
ok(beMatch.granted && salesMatch.granted, "with a grant, both matches are released");

const ids = (m) =>
  new Set(m.requirements.flatMap((r) => r.exhibits.map((e) => e.evidence_id)));
const beIds = ids(beMatch);
const salesIds = ids(salesMatch);
ok(beIds.size > 0 && salesIds.size > 0, "each role surfaces real evidence");
ok([...beIds].every((i) => !salesIds.has(i)),
  "the SAME person produces completely different evidence for a backend role and a sales role");
ok(
  beMatch.requirements.map((r) => r.skill_id).join() === "backend_engineering" &&
    salesMatch.requirements.map((r) => r.skill_id).join() === "sponsorship_sales",
  "only the skills the job named are surfaced",
);
ok(
  beMatch.unevidenced.some((r) => r.skill_id === "financial_modeling"),
  "a requirement with nothing behind it is named plainly rather than quietly dropped",
);
ok(
  beMatch.requirements[0].standing === "consistent" &&
    beMatch.requirements[0].episode_count === 3,
  "the backend section reports the verdict word and the episode count",
);
ok(
  salesMatch.requirements[0].standing === "repeated",
  "two sponsorship episodes in one setting read as repeated, not as consistent",
);
ok(
  salesMatch.requirements[0].exhibits.some((e) =>
    e.artifacts.some((a) => a.kind === "contract"),
  ),
  "the signed contract travels with the sponsorship evidence",
);
ok(
  salesMatch.requirements[0].exhibits.some((e) =>
    e.outcomes.some((o) => o.result === "met"),
  ),
  "the labelled outcome is shown as a result, never as its raw value",
);
ok(
  beMatch.requirements[0].exhibits.every((e) => e.why && e.role && e.episode),
  "every exhibit carries the reason, the role and the episode it came from",
);

const fullProfile = evidenceProfile({ personId: dana.id, audience: "employer", asOf: FULL });
ok(
  fullProfile.skills.length > beMatch.requirements.length,
  "Profile(person) is not Profile(person, job): the unscoped profile is strictly wider",
);
ok(
  fullProfile.skills.map((s) => s.skill_id).includes("sponsorship_sales") &&
    !beMatch.requirements.map((r) => r.skill_id).includes("sponsorship_sales"),
  "the backend employer never sees the sponsorship work, because they did not ask about it",
);

// ============================================ the employer payload has no score

const numbersIn = (node, path = "$", out = []) => {
  if (typeof node === "number") out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => numbersIn(v, `${path}[${i}]`, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) numbersIn(v, `${path}.${k}`, out);
  return out;
};
const keysIn = (node, out = []) => {
  if (Array.isArray(node)) node.forEach((v) => keysIn(v, out));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      keysIn(v, out);
    }
  return out;
};

const employerKeys = keysIn(beMatch);
ok(
  !employerKeys.some((k) =>
    /score|rating|rank|percentile|strength|confidence|grade|points|proficiency/i.test(k),
  ),
  "the employer payload contains no field that reads as a numeric person score",
);
ok(
  !/"(evidence_strength|confidence)"/.test(JSON.stringify(beMatch)),
  "neither evidence_strength nor confidence appears anywhere in the employer payload",
);
ok(
  numbersIn(beMatch).length > 0 &&
    numbersIn(beMatch).every(([, n]) => Number.isInteger(n) && n >= 0),
  "every number leaving the building is a plain count: no rate, no index, nothing sortable as ability",
);
ok(externalSafety(beMatch).length === 0, "the release guard passes the employer payload");
ok(
  externalSafety({ person: { reliability_score: 0.82 } }).length > 0 &&
    externalSafety({ person: { episodes: 0.82 } }).length > 0,
  "the guard catches both a score by name and a score smuggled into an innocent field",
);
ok(
  skillSummary(dana.id, "backend_engineering", FULL).confidence > 0,
  "the internal number still exists and is still useful — it simply never crosses the boundary",
);
ok(
  beMatch.notes.some((n) => /evidence, not a score/i.test(n)),
  "the payload says in words what it refuses to do",
);

// ---- revocation ------------------------------------------------------------
ok(revokeProfileAccess(dana, { personId: dana.id, audience: "employer", scope: "skill_evidence" }),
  "the person revokes the grant");
const revoked = jobEvidenceMatch({
  personId: dana.id,
  job: backendJob,
  audience: "employer",
  asOf: FULL,
});
ok(revoked.granted === false && revoked.requirements.length === 0,
  "a revoked grant returns nothing, not a stale or partial record");
ok(
  db()
    .prepare(
      "SELECT revoked_at FROM professional_profile_grants WHERE person_id=? AND audience='employer'",
    )
    .get(dana.id).revoked_at !== null,
  "the revocation is recorded rather than deleted, so 'who could see this, and when' stays answerable",
);

// ================================================================ the VC view

const hack = episode("Big Red Hacks", kai.id, at("2025-09-20"), "completed");
const priors = [
  ["Course scheduler", at("2025-01-15"), [kai, rin]],
  ["Club website", at("2025-03-04"), [rin, noor]],
  ["Mentor matching bot", at("2025-04-18"), [kai, noor]],
  ["Orientation fair booth", at("2025-05-02"), [kai, rin, noor]],
];
for (const [title, when, people] of priors) {
  const eid = episode(title, people[0].id, when, "completed");
  for (const p of people) event(eid, p.id, p.id, "EXECUTE", "task.completed", when);
}
for (const p of [kai, rin, noor]) event(hack, p.id, p.id, "EXECUTE", "task.completed", at("2025-09-20"));
event(hack, kai.id, kai.id, "OUTCOME", "episode.outcome_recorded", at("2025-09-22"), "self_reported");

// The part an investor actually wants: what happened AFTER the hackathon ended.
const after = episode("Palette (post-hackathon)", kai.id, at("2025-10-01"));
event(after, kai.id, kai.id, "INITIATE", "project.created", at("2025-10-01"));
event(after, rin.id, rin.id, "REVISE", "task.updated", at("2025-11-15"));
event(after, kai.id, kai.id, "REVIEW", "task.completed", at("2025-12-10"));
event(after, noor.id, noor.id, "REVISE", "task.updated", at("2026-01-20"));
recordArtifact(chair, {
  personId: kai.id,
  kind: "repository",
  title: "palette",
  episodeId: after,
  url: "https://github.example.test/palette",
  producedAt: at("2025-10-04"),
});
recordArtifact(chair, {
  personId: rin.id,
  kind: "usage_record",
  title: "Two other clubs are running Palette for their spring intake",
  episodeId: after,
  detail: "Confirmed with both club presidents in January.",
  producedAt: at("2026-01-18"),
});

const venture = { name: "Palette", originEpisodeId: hack };
const vcDenied = vcProfile({
  founders: [kai.id, rin.id, noor.id],
  audience: "investor",
  venture,
  asOf: FULL,
});
ok(vcDenied.granted === false, "the venture view is closed without grants");
ok(vcDenied.withheld.length === 3 && vcDenied.repeated_collaboration.pairs.length === 0,
  "no founder's collaboration history leaks before any of them consented");

for (const p of [kai, rin, noor])
  grantProfileAccess(p, { personId: p.id, audience: "investor", scope: "venture_evidence" });
throws(
  () =>
    vcProfile({ founders: [kai.id, rin.id, noor.id], audience: "employer", venture, asOf: FULL }),
  /not offered to that audience/,
);
ok(true, "venture evidence is not offered to an employer audience at all");

const vc = vcProfile({
  founders: [kai.id, rin.id, noor.id],
  audience: "investor",
  venture,
  asOf: FULL,
});
ok(vc.granted === true, "with all three grants the venture record opens");
ok(vc.team_formation.founder_count === 3, "the team is three people");
ok(vc.repeated_collaboration.prior_shared_episodes === 4,
  "four projects preceded the hackathon, counted from shared episodes rather than claimed");
ok(vc.repeated_collaboration.pairs.length === 3 &&
  vc.repeated_collaboration.pairs.every((p) => p.shared_episodes >= 4),
  "collaboration is reported pairwise, because 'the team has worked together' hides who has");
ok(vc.persistence.days_active_after_origin === 120,
  "the team kept working for 120 days after the hackathon's recorded outcome");
ok(vc.persistence.origin.basis.includes("recorded outcome"),
  "the payload says which date it measured from");
ok(vc.continuation.episodes_started_after_origin.length === 1,
  "the project that started after the hackathon is named");
ok(vc.shipping.artifacts.some((a) => a.kind === "repository"),
  "shipped artifacts are listed, with who made them");
ok(vc.external_usage.length === 1 && /other clubs/.test(vc.external_usage[0].title),
  "external usage is a recorded artifact, not an assertion");
ok(vc.iteration.revisions >= 3 && vc.iteration.working_days > 0,
  "iteration is counted from recorded revisions and the days work actually happened");
ok(/Three founders/.test(vc.reading) && /four previous projects/.test(vc.reading) &&
  /120 days/.test(vc.reading),
  "the narrative reads as facts: 'Three founders have collaborated across four previous projects and continued working for 120 days...'");
ok(externalSafety(vc).length === 0, "the release guard passes the investor payload");
ok(
  numbersIn(vc).every(([, n]) => Number.isInteger(n) && n >= 0),
  "the investor payload carries counts and whole days only",
);
ok(
  !keysIn(vc).some((k) => /score|rating|rank|percentile|strength|confidence/i.test(k)),
  "and no field that a scout could sort a cohort by",
);

const vcEarly = vcProfile({
  founders: [kai.id, rin.id, noor.id],
  audience: "investor",
  venture,
  asOf: "2025-10-15T00:00:00.000Z",
});
ok(vcEarly.persistence.days_active_after_origin < 120,
  "asked in October, the record says what was true in October");

ok(revokeProfileAccess(noor, { personId: noor.id, audience: "investor", scope: "venture_evidence" }),
  "one founder revokes");
const vcPartial = vcProfile({
  founders: [kai.id, rin.id, noor.id],
  audience: "investor",
  venture,
  asOf: FULL,
});
ok(vcPartial.granted === false && vcPartial.withheld.length === 1,
  "one revoked grant closes the whole team view: a team record missing a founder misleads");
ok(vcPartial.repeated_collaboration.prior_shared_episodes === 0,
  "and the remaining founders' history is not released as a consolation prize");

// ================================================================ the mirror

const mine = personSkills(dana.id, FULL);
ok(mine.length >= 2 && mine.every((s) => s.reading && s.links.length),
  "the person's own view carries every skill with evidence, each with a plain-language reading");

console.log(`${checks} skill-evidence assertions passed.`);

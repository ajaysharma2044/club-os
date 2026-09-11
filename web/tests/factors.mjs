// The Factor Registry: declaration, refusal, privacy enforcement, evaluation.
// Pure functions, no database, no network.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/factors.mjs
import assert from "node:assert/strict";
import {
  defineFactor,
  FactorRegistry,
  computeFactor,
  mayUse,
  evaluateFactor,
  cannotPredict,
  ENTITY_TYPES,
  VALUE_TYPES,
  PRIVACY_CLASSES,
  USES,
  FACTOR_STATUSES,
} from "../lib/cec/factors.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const throws = (fn, re, m) => {
  let got = null;
  try {
    fn();
  } catch (e) {
    got = e.message;
  }
  assert.ok(got !== null, m + " (expected a throw, got none)");
  assert.ok(re.test(got), `${m} — message was: ${got}`);
  checks++;
};

// A minimal valid definition, cloned and broken in each test below.
const base = {
  id: "competing_event_density",
  name: "Competing event density",
  description: "How many other things run against a proposed time.",
  entity: "campus",
  valueType: "count",
  hypothesis: "More competing programming at the same hour lowers turnout.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["cornell_localist"],
  availableAt: "Feed rows with observed_at <= asOf; the campus calendar is published ahead of time.",
  version: "1.0.0",
  status: "experimental",
  requires: ["events"],
  compute: (input) => ({ value: input.events.length, n: input.events.length }),
  explain: (v) => (v === null ? "Not enough to say." : `${v} competing events.`),
};

// ============================================================ happy path
{
  const def = defineFactor({ ...base });
  ok(def.id === "competing_event_density", "a complete definition is accepted");
  ok(Object.isFrozen(def), "the definition is frozen so it cannot drift after registration");
  ok(Object.isFrozen(def.permittedUses), "and so is its permitted-use list");
}

// ============================================== required metadata is required
throws(() => defineFactor({ ...base, id: "X" }), /snake_case/i, "an upper-case id is rejected");
throws(() => defineFactor({ ...base, id: "ab" }), /snake_case/i, "too short an id is rejected");
throws(() => defineFactor({ ...base, id: "has-dashes" }), /snake_case/i, "dashes are rejected");
throws(() => defineFactor({ ...base, name: "" }), /name is required/i, "a nameless factor is rejected");
throws(() => defineFactor({ ...base, description: " " }), /description/i, "a blank description is rejected");
throws(() => defineFactor({ ...base, entity: "galaxy" }), /entity/i, "an unknown entity is rejected");
throws(() => defineFactor({ ...base, valueType: "vibes" }), /valueType/i, "an unknown value type is rejected");
throws(() => defineFactor({ ...base, version: "" }), /version/i, "an unversioned factor is rejected");
throws(() => defineFactor({ ...base, status: "great" }), /status/i, "an unknown status is rejected");
throws(() => defineFactor({ ...base, expectedSign: 0 }), /expectedSign/i, "a zero sign is rejected; null means unknown");
throws(() => defineFactor({ ...base, minimumSampleSize: -1 }), /minimumSampleSize/i, "a negative sample floor is rejected");
throws(() => defineFactor({ ...base, halfLifeDays: 0 }), /halfLifeDays/i, "a zero half-life is rejected; null means not applicable");
throws(() => defineFactor({ ...base, sources: "cornell" }), /sources must be an array/i, "sources must be an array");
throws(() => defineFactor({ ...base, requires: null }), /requires must be an array/i, "requires must be an array");
ok(defineFactor({ ...base, expectedSign: null }).expectedSign === null, "an explicitly unknown sign is allowed");
ok(defineFactor({ ...base, requires: [] }).requires.length === 0, "an empty requires list is allowed");

// --- a factor with no falsifiable claim is a number in search of a meaning ---
throws(() => defineFactor({ ...base, hypothesis: "" }), /hypothesis/i, "a factor with no hypothesis is rejected");
throws(() => defineFactor({ ...base, hypothesis: "good" }), /falsifiable/i, "a one-word hypothesis is rejected");
throws(() => defineFactor({ ...base, availableAt: "" }), /availableAt/i, "a factor that does not state its point-in-time contract is rejected");

// --- THE DEFECT THIS REGISTRY EXISTS TO FIX ---------------------------------
// signals.ts couples definitions to computation by string key, so a definition
// with no computation is silently zero rather than an error.
throws(
  () => defineFactor({ ...base, compute: undefined }),
  /compute is required/i,
  "a definition with no compute function is rejected outright",
);
throws(
  () => defineFactor({ ...base, compute: "computeRaw" }),
  /compute is required/i,
  "a string key is not a computation",
);
throws(() => defineFactor({ ...base, explain: undefined }), /explain is required/i, "a factor that cannot explain itself is rejected");

// ========================================== PRIVACY — the non-negotiable part
{
  // The do-not-compute list is a value in the type system, not a policy doc.
  throws(
    () => defineFactor({ ...base, privacy: "forbidden" }),
    /do-not-compute/i,
    "a factor marked forbidden is refused at registration",
  );
  throws(
    () => defineFactor({ ...base, privacy: "forbidden" }),
    /feature store/i,
    "and the message says why: blocked at the feature store, not the display layer",
  );
  throws(() => defineFactor({ ...base, privacy: undefined }), /privacy class is required/i, "privacy must be declared");
  throws(() => defineFactor({ ...base, permittedUses: [] }), /permittedUses/i, "at least one permitted use is required");
  throws(() => defineFactor({ ...base, permittedUses: ["surveillance"] }), /unknown use/i, "an unknown use is rejected");

  // A person-scoped factor may NEVER be what an employer or sponsor ranks on.
  // docs/10 §6: evidence, never a score.
  const person = {
    ...base,
    id: "commitment_follow_through",
    entity: "person",
    privacy: "person_private",
    permittedUses: ["person_self", "planning"],
  };
  ok(defineFactor(person).entity === "person", "a well-formed person factor is accepted");
  throws(
    () => defineFactor({ ...person, permittedUses: ["person_self", "employer_evidence"] }),
    /employer_evidence/i,
    "a person-scoped factor may not be exported to employers",
  );
  throws(
    () => defineFactor({ ...person, permittedUses: ["person_self", "sponsor_ranking"] }),
    /sponsor_ranking/i,
    "nor may a sponsor rank on it",
  );
  throws(
    () => defineFactor({ ...person, permittedUses: ["person_self", "employer_evidence"] }),
    /episodes, artifacts and outcomes/i,
    "and the message says what employers do receive instead",
  );

  // The mirror test, enforced rather than documented.
  throws(
    () => defineFactor({ ...person, permittedUses: ["planning"] }),
    /person_self/i,
    "a person-scoped factor the subject cannot see is refused",
  );
  throws(
    () => defineFactor({ ...person, explain: undefined }),
    /shown to the person it is about/i,
    "a person-scoped factor with no plain-language explanation is refused",
  );

  // A club- or campus-scoped factor MAY inform sponsor ranking — that is an
  // organisation deciding about itself, not a verdict on a student.
  ok(
    defineFactor({ ...base, entity: "club", privacy: "club_internal", permittedUses: ["sponsor_ranking"] }).id ===
      base.id,
    "a club-scoped factor may inform sponsor ranking",
  );
}

// ================================================================ the registry
{
  const r = new FactorRegistry();
  r.register({ ...base });
  ok(r.size() === 1, "a factor registers");
  ok(r.get("competing_event_density") !== null, "and can be fetched by id");
  ok(r.get("nope") === null, "an unknown id is null, not a throw");
  throws(() => r.register({ ...base }), /already registered/i, "double registration is refused");

  r.register({
    ...base,
    id: "assessment_pressure",
    entity: "campus",
    sources: ["academic_calendar"],
    supportedOutcomes: ["event_met_forecast", "member_active_next_term"],
  });
  r.register({
    ...base,
    id: "officer_capacity",
    entity: "club",
    privacy: "club_internal",
    permittedUses: ["planning", "club_reporting"],
    sources: ["club_os"],
    supportedOutcomes: [],
  });
  ok(r.byEntity("campus").length === 2, `two campus factors, got ${r.byEntity("campus").length}`);
  ok(r.byEntity("club").length === 1, "one club factor");
  ok(r.byEntity("person").length === 0, "no person factors registered here");
  ok(r.byOutcome("event_met_forecast").length === 2, "outcome lookup finds both");
  ok(r.byOutcome("member_active_next_term").length === 1, "and discriminates");
  ok(r.bySource("academic_calendar").length === 1, "source lookup works, for cascade invalidation");

  // A retired factor is kept for replay but never recomputed.
  r.register({ ...base, id: "old_thing", status: "retired" });
  ok(r.all().length === 3, `retired factors are excluded from all(), got ${r.all().length}`);
  ok(r.including_retired().length === 4, "but retained for replaying historical decisions");
  ok(r.bySource("cornell_localist").some((f) => f.id === "old_thing"), "and still found by source");
}

// ================================================================== mayUse
{
  const def = defineFactor({ ...base, permittedUses: ["planning"] });
  ok(mayUse(def, "planning").allowed === true, "a permitted use is allowed");
  ok(mayUse(def, "employer_evidence").allowed === false, "an undeclared use is refused");
  ok(/does not permit/i.test(mayUse(def, "employer_evidence").reason), "and the reason says so");
  ok(
    /planning/.test(mayUse(def, "employer_evidence").reason),
    "and lists what IS permitted, so the caller can tell whether it is a bug or a boundary",
  );
  const retired = defineFactor({ ...base, status: "retired" });
  ok(mayUse(retired, "planning").allowed === false, "a retired factor is refused for live use");
  ok(/replay/i.test(mayUse(retired, "planning").reason), "and says it exists only to replay past decisions");
}

// ========================================= computing, and the refusal ladder
{
  const reg = new FactorRegistry();
  const def = reg.register({
    ...base,
    id: "attendance_rate",
    entity: "club",
    valueType: "rate",
    privacy: "club_internal",
    permittedUses: ["planning", "club_reporting"],
    minimumSampleSize: 5,
    requires: ["attended", "invited"],
    compute: (i) => ({
      value: i.invited ? i.attended / i.invited : 0,
      n: i.invited,
      drivers: [{ label: "invited", contribution: i.invited }],
      basis: { attended: i.attended },
    }),
    explain: (v) => (v === null ? "Not enough events yet." : `${Math.round(v * 100)}% of invitees came.`),
  });

  const good = computeFactor(def, "cec", { attended: 30, invited: 50 }, "2026-09-15T00:00:00Z");
  ok(good.status === "ok", "a well-fed factor computes");
  ok(good.value === 0.6, `the value is right, got ${good.value}`);
  ok(good.n === 50, "the sample size comes through");
  ok(good.modelVersion === "1.0.0", "the model version is stamped on every value");
  ok(good.asOf === "2026-09-15T00:00:00Z", "so is as-of");
  ok(good.entityType === "club" && good.entityId === "cec", "and the entity it is about");
  ok(good.drivers.length === 1, "drivers come through in the one standard shape");
  ok(good.basis.attended === 30, "and so does the basis");
  ok(/60%/.test(good.reading), `the reading is plain language: "${good.reading}"`);

  // --- REFUSAL 1: missing input. An error, never a zero. ---------------------
  // This is the exact failure mode that makes two signals in signals.ts report
  // zero forever instead of announcing that they cannot run.
  const missing = computeFactor(def, "cec", { attended: 30 }, "2026-09-15T00:00:00Z");
  ok(missing.status === "missing_input", "a missing declared input is caught");
  ok(missing.value === null, "and yields null, NOT zero — the whole point");
  ok(missing.basis.missing.includes("invited"), "and names the missing input");
  ok(/invited/.test(missing.reading), "and says so in the reading");

  // --- REFUSAL 2: below the declared sample floor ---------------------------
  const thin = computeFactor(def, "cec", { attended: 2, invited: 3 }, "2026-09-15T00:00:00Z");
  ok(thin.status === "insufficient_data", "below the floor, the registry refuses");
  ok(thin.value === null, "with a null value rather than a confident fraction");
  ok(thin.n === 3, "while still reporting how much it had");
  ok(/at least 5/.test(thin.reading), `and how much it needs: "${thin.reading}"`);

  // --- REFUSAL 3: compute itself declines, or throws ------------------------
  const declines = reg.register({
    ...base,
    id: "sometimes_null",
    compute: () => null,
    explain: () => "Cannot say.",
  });
  const nothing = computeFactor(declines, "cornell", { events: [] }, "2026-09-15T00:00:00Z");
  ok(nothing.status === "not_computable", "compute() returning null is honoured");
  ok(nothing.value === null, "as a null");

  const explodes = reg.register({
    ...base,
    id: "throws_up",
    compute: () => {
      throw new Error("upstream feed is malformed");
    },
  });
  const caught = computeFactor(explodes, "cornell", { events: [] }, "2026-09-15T00:00:00Z");
  ok(caught.status === "not_computable", "a throwing factor does not take down the caller");
  ok(/malformed/.test(String(caught.basis.error)), "and the cause is preserved for debugging");

  const nan = reg.register({ ...base, id: "returns_nan", compute: () => ({ value: NaN, n: 10 }) });
  ok(
    computeFactor(nan, "cornell", { events: [] }, "2026-09-15T00:00:00Z").status === "not_computable",
    "NaN is not a value",
  );
  const inf = reg.register({ ...base, id: "returns_inf", compute: () => ({ value: Infinity, n: 10 }) });
  ok(
    computeFactor(inf, "cornell", { events: [] }, "2026-09-15T00:00:00Z").value === null,
    "nor is Infinity",
  );

  // --- REFUSAL 4: retired ---------------------------------------------------
  const dead = defineFactor({ ...base, id: "gone", status: "retired" });
  ok(computeFactor(dead, "cornell", { events: [] }, "2026-09-15T00:00:00Z").status === "retired", "a retired factor does not compute");

  // A zero sample floor means the factor is willing to speak from nothing,
  // which must remain possible for point-in-time state like "is it raining".
  const state = reg.register({
    ...base,
    id: "is_break",
    valueType: "index",
    minimumSampleSize: 0,
    requires: [],
    compute: () => ({ value: 1, n: 0 }),
    explain: () => "It is a break.",
  });
  ok(
    computeFactor(state, "cornell", {}, "2026-09-15T00:00:00Z").status === "ok",
    "a declared-zero floor lets a state factor speak from no observations",
  );
}

// ============================================================== evaluation
{
  // A factor that genuinely predicts: x and y move together.
  // Deliberately noisy, so per-window ICs genuinely differ. Perfectly clean
  // synthetic data produces identical window ICs, which hits the limitation
  // recorded at the end of this block.
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const strong = evaluateFactor({
    factorId: "f",
    outcome: "member_active_next_term",
    observations: Array.from({ length: 60 }, (_, i) => ({
      subjectId: `p${i % 30}`,
      window: `2026-0${(i % 5) + 1}`,
      x: i / 60,
      y: i / 60 + (rand() - 0.5) * 0.4,
    })),
    expectedSign: 1,
    computedAt: "2026-09-15T00:00:00Z",
  });
  ok(strong.ic > 0.5, `a genuinely predictive factor scores high IC, got ${strong.ic}`);
  ok(strong.signAgrees === true, "and its sign agrees with the hypothesis");
  ok(strong.verdict === "strong", `verdict strong, got ${strong.verdict}`);
  ok(strong.windows === 5, `per-window ICs computed, got ${strong.windows}`);
  ok(strong.ir !== null, "and an information ratio across windows");

  // KNOWN LIMITATION, recorded rather than hidden (docs/16 m1, still open).
  // informationRatio returns null when the window ICs have zero variance, so a
  // PERFECTLY CONSISTENT factor is reported identically to one we know nothing
  // about. The true IR there is unbounded, not unknown. This asserts the
  // current behaviour so that changing it is a deliberate, visible decision.
  const perfect = evaluateFactor({
    factorId: "f",
    outcome: "o",
    observations: Array.from({ length: 40 }, (_, i) => ({
      subjectId: `p${i}`,
      window: `2026-0${(i % 4) + 1}`,
      x: i,
      y: i,
    })),
    expectedSign: 1,
    computedAt: "2026-09-15T00:00:00Z",
  });
  ok(perfect.ic === 1, "a perfectly rank-correlated factor has IC 1");
  ok(perfect.windows === 4, "across four windows");
  ok(
    perfect.ir === null,
    "KNOWN LIMITATION: identical window ICs give sd=0, so IR is null — indistinguishable from unknown (docs/16 m1)",
  );

  // A factor pointing the wrong way must be FLAGGED, not quietly accepted.
  const backwards = evaluateFactor({
    factorId: "f",
    outcome: "member_active_next_term",
    observations: Array.from({ length: 60 }, (_, i) => ({
      subjectId: `p${i % 30}`,
      window: "2026-01",
      x: i / 60,
      y: 1 - i / 60,
    })),
    expectedSign: 1,
    computedAt: "2026-09-15T00:00:00Z",
  });
  ok(backwards.ic < 0, "a backwards factor has negative IC");
  ok(backwards.signAgrees === false, "and is flagged as disagreeing with its own hypothesis");

  // THE SAMPLE-SIZE HONESTY RULE: 200 person-months from 6 people is a sample
  // of 6, and the verdict must use the people, not the rows.
  const manyRowsFewPeople = evaluateFactor({
    factorId: "f",
    outcome: "member_active_next_term",
    observations: Array.from({ length: 200 }, (_, i) => ({
      subjectId: `p${i % 6}`,
      window: `2026-0${(i % 4) + 1}`,
      x: i / 200,
      y: i / 200,
    })),
    expectedSign: 1,
    computedAt: "2026-09-15T00:00:00Z",
  });
  ok(manyRowsFewPeople.pairs === 200, "all rows are counted and reported");
  ok(
    manyRowsFewPeople.verdict === "insufficient_data",
    `but 6 distinct people is not enough to judge, got ${manyRowsFewPeople.verdict}`,
  );

  // Unknown expected sign means no agreement claim, not a false one.
  const unsigned = evaluateFactor({
    factorId: "f", outcome: "o",
    observations: Array.from({ length: 40 }, (_, i) => ({ subjectId: `p${i}`, window: "w", x: i, y: i })),
    expectedSign: null, computedAt: "2026-09-15T00:00:00Z",
  });
  ok(unsigned.signAgrees === null, "an unsigned hypothesis makes no agreement claim");

  // Degenerate inputs must not crash or invent a number.
  const empty = evaluateFactor({
    factorId: "f", outcome: "o", observations: [], expectedSign: 1, computedAt: "2026-09-15T00:00:00Z",
  });
  ok(empty.ic === null && empty.verdict === "insufficient_data", "no observations is insufficient_data, not a crash");
  const dirty = evaluateFactor({
    factorId: "f", outcome: "o",
    observations: [
      { subjectId: "a", window: "w", x: NaN, y: 1 },
      { subjectId: "b", window: "w", x: 1, y: Infinity },
      { subjectId: "c", window: "w", x: 1, y: 1 },
    ],
    expectedSign: 1, computedAt: "2026-09-15T00:00:00Z",
  });
  ok(dirty.pairs === 1, `non-finite rows are dropped before correlating, got ${dirty.pairs}`);

  // Windows below the minimum do not contribute an IC.
  const tinyWindows = evaluateFactor({
    factorId: "f", outcome: "o",
    observations: Array.from({ length: 20 }, (_, i) => ({ subjectId: `p${i}`, window: `w${i}`, x: i, y: i })),
    expectedSign: 1, computedAt: "2026-09-15T00:00:00Z",
  });
  ok(tinyWindows.windows === 0, "twenty windows of one observation yield no window ICs");
  ok(tinyWindows.ir === null, "and therefore no information ratio");
}

// ====================================================== prediction standard
{
  const model = { name: "attendance", version: "1.0.0", featureVersion: "ctx-v1" };
  const refusal = cannotPredict(model, "2026-09-15T00:00:00Z", "No comparable events yet.");
  ok(refusal.value === null, "a refusal carries a null value, not a zero");
  ok(refusal.interval === null, "and no interval");
  ok(refusal.status === "prior_only", "and declares itself prior-only");
  ok(refusal.limitations[0] === "No comparable events yet.", "and says why in limitations");
  ok(refusal.model.version === "1.0.0", "while still carrying the model version");
  ok(refusal.asOf === "2026-09-15T00:00:00Z", "and the as-of, so a refusal is auditable too");
}

// ================================================= taxonomies are non-empty
ok(ENTITY_TYPES.length === 5, "five entity types");
ok(VALUE_TYPES.includes("multiplier") && VALUE_TYPES.includes("log_odds"),
  "both composition scales are nameable — this is what makes the mismatch in docs/20 B4 visible");
ok(PRIVACY_CLASSES.includes("forbidden"), "the do-not-compute class exists");
ok(USES.includes("person_self"), "the mirror-test use exists");
ok(FACTOR_STATUSES.includes("retired") && FACTOR_STATUSES.includes("experimental"),
  "factors can be born experimental and retired");

console.log(`${checks} factor-registry assertions passed.`);

// The sponsor campaign substrate, against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/campaigns.mjs
//
// The cases under test are the ones that decide whether this marketplace is
// worth having: a club's stated refusal is honoured rather than outbid, five
// shoe brands cannot reach a run club in one week, a rejection names which
// filter rejected it, a ranked candidate carries an account of itself, a
// sponsor read cannot see a planning-only factor, and a lift number is refused
// when there is nothing to identify it from.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-campaigns-"));
process.env.CEC_DATABASE = join(dir, "campaigns.sqlite");

const { db } = await import("../lib/cec/db.ts");
const {
  inventoryInit,
  declareInventory,
  inventoryFor,
  recordExecution,
  setClubPolicy,
  clubPolicy,
  defaultPolicy,
  sectorOf,
  isCommercial,
  ACTIVATION_TYPES,
  RESTRICTED_CATEGORIES,
} = await import("../lib/cec/campaigns/inventory.ts");
const { fatigueInit, recordExposure, fatigueCheck, exposureSummary, memberExposureCount } =
  await import("../lib/cec/campaigns/fatigue.ts");
const { checkEligibility, eligibilityFor, ELIGIBILITY_FILTERS } = await import(
  "../lib/cec/campaigns/eligibility.ts"
);
const { rankCandidates } = await import("../lib/cec/campaigns/ranking.ts");
const {
  campaignsInit,
  registerSponsor,
  sponsorProfile,
  createCampaign,
  recordCandidate,
  recordPrediction,
  recordStage,
  funnel,
  rawConversions,
  createExperiment,
  incrementalLift,
  snapshot,
  FUNNEL_STAGES,
  PREDICTED_OUTCOMES,
} = await import("../lib/cec/campaigns/outcomes.ts");
const { computeAndStore, factorsAsOf } = await import("../lib/cec/factor-store.ts");
const { CONTEXT_FACTORS, assessmentPressure, regimeTurnoutPrior } = await import(
  "../lib/cec/registry.ts"
);
const { termCalendar } = await import("../lib/cec/institutions.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

inventoryInit();
fatigueInit();
campaignsInit();

// --- fixtures ---------------------------------------------------------------
const mkUser = (id, role) => {
  db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,interests,shared) VALUES (?,?,?,?,?,'',0)",
    )
    .run(id, id, `${id}@example.test`, "x:unusable", role);
  return { id, name: id, email: `${id}@example.test`, role, interests: "", shared: 0 };
};
const officerUser = mkUser("officer-1", "officer");
const memberUser = mkUser("member-1", "member");

// "cornell-ec" is the one configured club (institutions.ts). The run club is a
// second, unconfigured id on purpose: eligibility must have an answer for a
// club that is not attached to a campus, and that answer is "no".
const CEC = "cornell-ec";
const RUN = "run-club";

const AT = "2026-09-15T18:00:00.000Z"; // inside Cornell FA26, a normal term week
const WINDOW = [{ start: "2026-08-24T00:00:00.000Z", end: "2026-12-07T00:00:00.000Z" }];

const sponsor = (over = {}) => ({
  id: "adidas",
  name: "Adidas",
  category: "athletic_apparel",
  geographies: ["national"],
  budget: 4000,
  minimumAudience: 30,
  activationTypes: ["product_test", "weekly_run", "workshop"],
  windows: WINDOW,
  brandSafety: "verified",
  wantsMemberData: false,
  history: { campaignsRun: 6, deliverablesComplete: 5, renewals: 2, renewalOpportunities: 5 },
  ...over,
});

// ============================================================ 1. inventory
ok(ACTIVATION_TYPES.length === 17, "seventeen activation types are declared");
for (const t of [
  "weekly_run",
  "race_5k",
  "product_test",
  "workshop",
  "challenge",
  "conference",
  "newsletter_placement",
  "member_discount",
  "training_series",
  "travel_sponsorship",
  "competition_funding",
  "sampling_event",
  "recruiting_event",
  "scholarship",
  "ambassador_program",
  "speaker_series",
  "demo_day",
])
  ok(ACTIVATION_TYPES.includes(t), `activation type ${t} exists`);

// An unconfigured club is NOT unlimited inventory.
const fresh = defaultPolicy("nobody");
ok(fresh.maxActivationsPerMonth === 2, "an unconfigured club defaults to 2 activations a month");
ok(
  RESTRICTED_CATEGORIES.every((c) => fresh.excludedCategories.includes(c)),
  "restricted categories are excluded by default: silence is not consent",
);

const slot = declareInventory(officerUser, {
  clubId: CEC,
  activationType: "workshop",
  audience: "Undergraduates building companies",
  capacity: 120,
  estimatedReach: 60,
  availableDates: WINDOW,
  location: "Statler 185",
  minimumBudget: 1000,
  maximumFrequency: 2,
  approvalRequired: true,
});
ok(slot.estimatedReach === 60, "declared reach is stored");

// Reach is bounded by capacity: a club cannot advertise seats it does not have.
const inflated = declareInventory(officerUser, {
  clubId: CEC,
  activationType: "product_test",
  capacity: 40,
  estimatedReach: 4000,
  availableDates: WINDOW,
});
ok(inflated.estimatedReach === 40, "estimated reach cannot exceed declared capacity");

// A member cannot set the club's own terms.
assert.throws(
  () => setClubPolicy(memberUser, CEC, { maxActivationsPerMonth: 99 }),
  /Officer access required/,
  "only an officer may change a club's sponsorship policy",
);
checks++;

// ============================================================ 2. eligibility
setClubPolicy(officerUser, CEC, {
  excludedCategories: ["crypto", "gambling", "alcohol", "tobacco", "vape", "dating", "political", "pharma"],
  preferredCategories: ["software"],
  minimumSponsorshipValue: 500,
  maxActivationsPerMonth: 3,
  maxActivationsPerWeek: 2,
  maxPerSectorPerMonth: 2,
});

const eligible = eligibilityFor(CEC, sponsor(), AT);
ok(eligible.eligible, "a well-formed sponsor with matching inventory is eligible");
ok(eligible.slots.length >= 1, "at least one slot survives the filters");
ok(
  eligible.checks.every((c) => ELIGIBILITY_FILTERS.includes(c.filter)),
  "every check cites a declared filter and nothing else",
);

// --- a rejection NAMES the filter -------------------------------------------
const broke = eligibilityFor(CEC, sponsor({ id: "tiny", budget: 100 }), AT);
ok(!broke.eligible, "a sponsor below the club's floor is not eligible");
ok(
  broke.reasons.some((r) => r.filter === "minimum_value"),
  "the rejection names minimum_value",
);
ok(
  broke.reasons.every((r) => r.reason.startsWith(r.filter)),
  "every rejection reason is prefixed with the filter that produced it",
);

const wrongGeo = eligibilityFor(CEC, sponsor({ geographies: ["stanford"] }), AT);
ok(
  wrongGeo.reasons.some((r) => r.filter === "geography"),
  "an out-of-area campaign is rejected by geography, named",
);

const noCampus = eligibilityFor("club-that-does-not-exist", sponsor(), AT);
ok(
  noCampus.reasons.some((r) => r.filter === "campus_eligibility"),
  "a club with no configured campus is rejected by campus_eligibility",
);
ok(
  noCampus.reasons.some((r) => r.filter === "inventory_exists"),
  "and by inventory_exists, because every filter runs rather than short-circuiting",
);

// --- the club's excluded category is honoured, at any budget ----------------
const whale = sponsor({ id: "coinbase", category: "crypto", budget: 250000 });
const excluded = eligibilityFor(CEC, whale, AT);
ok(!excluded.eligible, "an excluded category is refused");
ok(
  excluded.reasons.some((r) => r.filter === "club_category_exclusion"),
  "the refusal names club_category_exclusion",
);
ok(
  excluded.reasons.some((r) => r.reason.includes("crypto")),
  "and says which category",
);
// The point: 250k does not buy past it. A penalty-based design would.
ok(
  eligibilityFor(CEC, sponsor({ id: "coinbase2", category: "crypto", budget: 10_000_000 }), AT)
    .eligible === false,
  "ten million dollars still does not buy past a club's stated exclusion",
);

// --- restricted categories are default-deny ---------------------------------
setClubPolicy(officerUser, CEC, { excludedCategories: [], preferredCategories: ["software"] });
const restricted = eligibilityFor(CEC, sponsor({ id: "bet", category: "gambling" }), AT);
ok(
  restricted.reasons.some((r) => r.filter === "category_accepted"),
  "a restricted category with no explicit opt-in is rejected by category_accepted",
);

// --- member privacy ---------------------------------------------------------
const nosy = eligibilityFor(CEC, sponsor({ id: "nosy", wantsMemberData: true }), AT);
ok(
  nosy.reasons.some((r) => r.filter === "member_privacy"),
  "a campaign wanting member-level data is rejected by member_privacy",
);

// --- brand safety -----------------------------------------------------------
const unrated = eligibilityFor(CEC, sponsor({ id: "unknown-brand", brandSafety: "unrated" }), AT);
ok(
  unrated.reasons.some((r) => r.filter === "brand_safety"),
  "an unrated brand is rejected: unrated is treated as unsafe, not neutral",
);

// --- an undeclared date window is not an open one ---------------------------
const outOfWindow = eligibilityFor(CEC, sponsor(), "2027-03-01T18:00:00.000Z");
ok(
  outOfWindow.reasons.some((r) => r.filter === "available_date"),
  "a date outside every declared window is rejected by available_date",
);

// Restore the working policy for the rest of the run.
setClubPolicy(officerUser, CEC, {
  excludedCategories: ["crypto", "gambling", "alcohol", "tobacco", "vape", "dating", "political", "pharma"],
  preferredCategories: ["software"],
  minimumSponsorshipValue: 500,
  maxActivationsPerMonth: 3,
  maxActivationsPerWeek: 2,
  maxPerSectorPerMonth: 2,
});

// ============================================================ 3. fatigue
// THE CASE: a run club must not receive Adidas, Garmin, Hoka, Nike and
// Gatorade in the same week.
declareInventory(officerUser, {
  clubId: RUN,
  activationType: "weekly_run",
  capacity: 80,
  estimatedReach: 50,
  availableDates: WINDOW,
});
setClubPolicy(officerUser, RUN, {
  excludedCategories: [],
  preferredCategories: ["athletic_apparel", "footwear", "wearables", "sports_nutrition"],
  minimumSponsorshipValue: 0,
  maxActivationsPerMonth: 4,
  maxActivationsPerWeek: 2,
  maxPerSectorPerMonth: 2,
});

const endurance = [
  ["adidas", "athletic_apparel"],
  ["garmin", "wearables"],
  ["hoka", "footwear"],
  ["nike", "footwear"],
  ["gatorade", "sports_nutrition"],
];
ok(
  new Set(endurance.map(([, c]) => sectorOf(c))).size === 1,
  "all five brands fall in one sector: a student hears them as one pitch",
);

const weekStart = Date.parse("2026-09-14T09:00:00.000Z");
const dayOf = (n) => new Date(weekStart + n * 86400e3).toISOString();
const AFTER_WEEK = dayOf(6.5);

let firstBlockedAt = null;
endurance.forEach(([id, category], i) => {
  const check = fatigueCheck({
    clubId: RUN,
    sponsor: { id, category },
    at: dayOf(i),
  });
  if (!check.withinCaps && firstBlockedAt === null) firstBlockedAt = i;
  // Only record the ones that were actually allowed through; a blocked
  // candidate never reaches the club and so never counts against it.
  if (check.withinCaps)
    recordExposure({
      clubId: RUN,
      sponsorId: id,
      sponsorCategory: category,
      stage: "shown",
      occurredAt: dayOf(i),
    });
});

ok(firstBlockedAt !== null, "the run of five endurance sponsors is stopped");
ok(
  firstBlockedAt === 2,
  `the cap fires on the third brand of the week, not the fifth (fired at index ${firstBlockedAt})`,
);

const fifth = fatigueCheck({
  clubId: RUN,
  sponsor: { id: "gatorade", category: "sports_nutrition" },
  at: AFTER_WEEK,
});
ok(!fifth.withinCaps, "the fifth endurance brand in the same week is refused");
ok(
  fifth.violations.some((v) => v.rule === "max_per_sector_per_month"),
  "and the refusal names max_per_sector_per_month",
);
ok(
  fifth.violations.every((v) => typeof v.limit === "number" && typeof v.observed === "number"),
  "every fatigue violation states the limit and what was observed",
);

// The loophole: an activation that "is just a sponsored run" still puts a brand
// in front of members, so it still counts against the cap. Only money that
// arrives without a pitch is exempt.
ok(isCommercial("weekly_run"), "a sponsored weekly run counts as commercial");
ok(isCommercial("workshop"), "so does a workshop");
ok(!isCommercial("scholarship"), "a scholarship does not: it is money without a pitch");
ok(!isCommercial("competition_funding"), "nor does a covered entry fee");

const summary = exposureSummary(RUN, AFTER_WEEK);
ok(summary.week === 2, "only the two that got through count against the week");
ok(
  summary.bySector[0].sector === "endurance_sport",
  "exposure is summarised by sector, not by fine-grained category",
);

// An internal recommendation nobody saw does not spend the club's attention.
recordExposure({
  clubId: RUN,
  sponsorId: "asics",
  sponsorCategory: "footwear",
  stage: "recommended",
  occurredAt: dayOf(1),
});
ok(
  exposureSummary(RUN, AFTER_WEEK).week === 2,
  "a 'recommended' candidate that was never shown does not count against a cap",
);

// A different sector is not blocked by endurance crowding.
const bank = fatigueCheck({
  clubId: RUN,
  sponsor: { id: "chase", category: "financial_services" },
  at: AFTER_WEEK,
});
ok(
  bank.violations.every((v) => v.rule !== "max_per_sector_per_month"),
  "a sponsor from an unrelated sector is not caught by the sector cap",
);

// Member-level exposure is refused unless the club permits it AND consent is
// pointed at.
assert.throws(
  () =>
    recordExposure({
      clubId: RUN,
      sponsorId: "nike",
      sponsorCategory: "footwear",
      stage: "shown",
      memberId: "member-1",
      consentBasis: "consent-123",
    }),
  /Member-level exposure refused/,
  "member-level exposure is refused when the club shares aggregate only",
);
checks++;
setClubPolicy(officerUser, RUN, { memberDataSharing: "opt_in_per_campaign" });
assert.throws(
  () =>
    recordExposure({
      clubId: RUN,
      sponsorId: "nike",
      sponsorCategory: "footwear",
      stage: "shown",
      memberId: "member-1",
    }),
  /no consent reference supplied/,
  "and refused when consent cannot be pointed at",
);
checks++;
recordExposure({
  clubId: RUN,
  sponsorId: "nike",
  sponsorCategory: "footwear",
  stage: "shown",
  memberId: "member-1",
  consentBasis: "consent-123",
  occurredAt: dayOf(3),
});
ok(memberExposureCount("member-1", AFTER_WEEK) === 1, "a permissioned member exposure is counted");
ok(
  exposureSummary(RUN, AFTER_WEEK).week === 2,
  "member rows do not double-count against the club cap",
);
setClubPolicy(officerUser, RUN, { memberDataSharing: "none" });

// The eligibility layer inherits the cap and names it.
const capped = eligibilityFor(
  RUN,
  sponsor({ id: "hoka", category: "footwear", activationTypes: ["weekly_run"], minimumAudience: 20 }),
  AFTER_WEEK,
);
ok(
  capped.reasons.some((r) => r.filter === "frequency_limit"),
  "eligibility rejects an over-cap sponsor and names frequency_limit",
);

// ============================================================ 4. ranking
// Give the store a planning-only factor and a sponsor-permitted one, both live
// at the decision time, so the gate has something real to withhold.
const cal = termCalendar("cornell", "FA26").calendar;
computeAndStore(regimeTurnoutPrior, "cornell", { calendar: cal, at: AT }, AT, {
  occurredAt: AT,
  observedAt: AT,
});
computeAndStore(assessmentPressure, "cornell", { calendar: cal, at: AT }, AT, {
  occurredAt: AT,
  observedAt: AT,
});

// Both are in the store for a planning read...
const planningRead = factorsAsOf({
  entityType: "campus",
  entityId: "cornell",
  asOf: AT,
  use: "planning",
  registry: CONTEXT_FACTORS,
});
ok(
  planningRead.factors.some((f) => f.factor === "assessment_pressure"),
  "assessment_pressure is readable for planning",
);

// ...and the sponsor read cannot see the planning-only one.
const sponsorRead = factorsAsOf({
  entityType: "campus",
  entityId: "cornell",
  asOf: AT,
  use: "sponsor_ranking",
  registry: CONTEXT_FACTORS,
});
ok(
  sponsorRead.factors.every((f) => f.factor !== "assessment_pressure"),
  "a sponsor read cannot see assessment_pressure",
);
ok(
  sponsorRead.omitted.some((o) => o.factor === "assessment_pressure"),
  "and the omission is stated rather than silent",
);
ok(
  sponsorRead.factors.some((f) => f.factor === "regime_turnout_prior"),
  "while a factor that declared sponsor_ranking is returned",
);

const result = rankCandidates({
  sponsor: sponsor(),
  clubIds: [CEC, RUN, "club-that-does-not-exist"],
  at: AT,
});

ok(result.ranked.length >= 1, "ranking returns at least one candidate");
ok(
  result.rejected.some((r) => r.clubId === "club-that-does-not-exist"),
  "an ineligible club is reported as rejected rather than ranked low",
);
ok(
  result.rejected.every((r) => r.reasons.length > 0 && r.reasons.every((x) => x.filter)),
  "every rejected club carries named filters",
);
ok(
  result.omittedFactors.some((o) => o.factor === "assessment_pressure"),
  "the ranking result states which factors the sponsor read was denied",
);

const top = result.ranked[0];

// --- multiple SEPARATE outcome predictions, not one score -------------------
for (const outcome of PREDICTED_OUTCOMES)
  ok(top.predictions[outcome], `candidate predicts ${outcome} separately`);
ok(
  Object.keys(top.predictions).length === 6,
  "six outcomes are predicted, not collapsed into one match score",
);
const values = PREDICTED_OUTCOMES.map((o) => top.predictions[o].value);
ok(
  new Set(values.map((v) => Math.round(v * 1000))).size > 1,
  "the six predictions are genuinely different numbers, not one value copied six ways",
);
for (const outcome of PREDICTED_OUTCOMES) {
  const p = top.predictions[outcome];
  ok(Array.isArray(p.interval) && p.interval.length === 2, `${outcome} carries an interval`);
  ok(p.interval[0] <= p.value && p.value <= p.interval[1], `${outcome} value sits inside its interval`);
  ok(p.model.name === "cec.campaigns.ranking", `${outcome} is stamped with a model version`);
  ok(typeof p.reading === "string" && p.reading.length > 0, `${outcome} reads in plain language`);
  ok(
    p.status === "prior_only" ? p.limitations.length > 0 : true,
    `${outcome} states its limitation when it is only a prior`,
  );
}

// --- every candidate carries an explanation ---------------------------------
for (const c of result.ranked) {
  ok(c.explanation && c.explanation.headline.length > 0, `${c.clubId} candidate has a headline`);
  ok(c.explanation.forSponsor.length > 0, "the explanation says what the sponsor gets");
  ok(c.explanation.forClub.length > 0, "and what the club gets");
  ok(c.explanation.forMember.length > 0, "and why a member would care");
  ok(c.explanation.drivers.length === 6, "all six objective terms are named as drivers");
}

// --- the objective is multi-objective, and burden/fatigue actually subtract --
const t = top.terms;
ok(
  Math.abs(
    t.score -
      (t.sponsorValue + t.clubValue + t.memberRelevance - t.operationalBurden - t.sponsorFatigue - t.risk),
  ) < 1e-9,
  "the score is exactly the six-term objective, with nothing hidden in it",
);
ok(t.operationalBurden > 0, "operational burden is charged, not externalised onto the club");

// A crowded club scores lower than the same club uncrowded. Fatigue is priced.
const quiet = rankCandidates({ sponsor: sponsor(), clubIds: [CEC], at: AT }).ranked[0];
recordExposure({
  clubId: CEC,
  sponsorId: "filler-0",
  sponsorCategory: "media",
  stage: "shown",
  occurredAt: new Date(Date.parse(AT) - 86400e3).toISOString(),
});
const crowded = rankCandidates({ sponsor: sponsor(), clubIds: [CEC], at: AT }).ranked[0];
ok(
  crowded.terms.sponsorFatigue > quiet.terms.sponsorFatigue,
  "a club that has already been sold to this month carries more fatigue",
);
ok(crowded.terms.score < quiet.terms.score, "and therefore ranks lower for the same sponsor");

// ============================================================ 5. the funnel
registerSponsor(officerUser, sponsor());
ok(sponsorProfile("adidas").category === "athletic_apparel", "a sponsor round-trips");
ok(
  sponsorProfile("adidas").history.campaignsRun === 6,
  "and so does its campaign history",
);

const camp = createCampaign(officerUser, {
  sponsorId: "adidas",
  name: "Fall 2026 campus running",
  objective: "trial",
  budget: 40000,
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-12-01T00:00:00.000Z",
});

const snap = snapshot(CEC, AT, sponsorRead.factors, sponsorRead.omitted, "at recommendation");
const candidateId = recordCandidate({
  campaignId: camp.id,
  clubId: CEC,
  inventoryId: top.inventoryId,
  activationType: top.activationType,
  rank: 1,
  score: top.terms.score,
  terms: top.terms,
  explanation: top.explanation,
  eligibility: { checks: top.eligibility.length },
  snapshot: snap,
  asOf: AT,
});
ok(candidateId, "a ranked candidate is persisted");

assert.throws(
  () =>
    recordCandidate({
      campaignId: camp.id,
      clubId: CEC,
      inventoryId: null,
      activationType: "workshop",
      rank: 2,
      score: 0.5,
      terms: top.terms,
      explanation: {},
      eligibility: {},
      snapshot: snap,
      asOf: AT,
    }),
  /must carry an explanation/,
  "a candidate with no explanation is refused rather than stored",
);
checks++;

for (const outcome of PREDICTED_OUTCOMES)
  recordPrediction({
    campaignId: camp.id,
    candidateId,
    clubId: CEC,
    outcome,
    prediction: top.predictions[outcome],
  });

// Walk the whole funnel, each stage with the context live at that moment.
const stages = [
  ["activation_recommended", "2026-09-15T18:00:00.000Z", 0],
  ["club_shown", "2026-09-16T18:00:00.000Z", 0],
  ["club_accepted", "2026-09-18T18:00:00.000Z", 0],
  ["event_planned", "2026-09-20T18:00:00.000Z", 0],
  ["members_invited", "2026-09-22T18:00:00.000Z", 140],
  ["rsvp", "2026-09-28T18:00:00.000Z", 61],
  ["attendance", "2026-10-02T22:00:00.000Z", 44],
  ["engagement", "2026-10-02T23:00:00.000Z", 31],
  ["product_trial", "2026-10-02T23:30:00.000Z", 27],
  ["redemption", "2026-10-09T12:00:00.000Z", 12],
  ["purchase", "2026-10-20T12:00:00.000Z", 5],
  ["feedback", "2026-10-22T12:00:00.000Z", 18],
  ["sponsor_renewal", "2026-12-01T12:00:00.000Z", 0],
];
for (const [stage, occurredAt, n] of stages) {
  const stageFactors = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: occurredAt,
    use: "sponsor_ranking",
    registry: CONTEXT_FACTORS,
  });
  recordStage({
    campaignId: camp.id,
    clubId: CEC,
    candidateId,
    stage,
    n,
    occurredAt,
    snapshot: snapshot(CEC, occurredAt, stageFactors.factors, stageFactors.omitted, `at ${stage}`),
    context: { stage_note: stage },
  });
}

const f = funnel(camp.id, CEC);
ok(f.length === stages.length, "every stage of the funnel is preserved");
ok(
  FUNNEL_STAGES.indexOf(f[0].stage) < FUNNEL_STAGES.indexOf(f[f.length - 1].stage),
  "the funnel comes back in stage order",
);
ok(
  f.every((r) => r.contextSnapshotId.length > 0),
  "every stage row carries a context snapshot id",
);
ok(
  f.every((r) => Array.isArray(r.factors)),
  "every stage row carries the factors that were live at that moment",
);
ok(
  f.find((r) => r.stage === "attendance").factors.some((x) => x.factor === "regime_turnout_prior"),
  "the attendance row records the campus factors that were live when it happened",
);
ok(
  f.every((r) => r.factors.every((x) => x.factor !== "assessment_pressure")),
  "and never records a factor the sponsor context was not permitted to see",
);
ok(
  new Set(f.map((r) => r.contextSnapshotId)).size === stages.length,
  "each stage has its OWN snapshot: the context moved between them",
);
ok(f.find((r) => r.stage === "attendance").n === 44, "stage counts survive the round trip");

assert.throws(
  () =>
    recordStage({
      campaignId: camp.id,
      clubId: CEC,
      stage: "teleportation",
      occurredAt: AT,
      snapshot: snap,
    }),
  /Unknown funnel stage/,
  "an unknown stage is refused",
);
checks++;

const raw = rawConversions(camp.id);
ok(
  raw.every((r) => r.caveat.includes("not an effect")),
  "raw conversions are labelled as counts, not as effects",
);

// ============================================================ 6. lift
// No holdout: refuse, and say why.
const noHoldout = createExperiment(officerUser, {
  campaignId: camp.id,
  name: "everyone got it",
  design: "none",
  treatment: [CEC, RUN],
  holdout: [],
  assignedAt: "2026-09-01T00:00:00.000Z",
  outcomeStage: "attendance",
});
const lift1 = incrementalLift(noHoldout.id);
ok(lift1.lift === null, "incrementalLift returns null with no holdout");
ok(lift1.refused === true, "and says it refused");
ok(
  lift1.reason.includes("no holdout") || lift1.reason.includes("There is no holdout"),
  "and names the missing holdout as the reason",
);
ok(
  lift1.reading.includes("conversion count"),
  "and states that a conversion count is not an effect",
);
ok(lift1.treatment.n === 2, "while still reporting the raw arms honestly");

// A holdout that is too small: still refuse.
const tiny = createExperiment(officerUser, {
  campaignId: camp.id,
  name: "four clubs",
  design: "randomized_holdout",
  treatment: [CEC, "b", "c"],
  holdout: ["d", "e", "f"],
  assignedAt: "2026-09-01T00:00:00.000Z",
  outcomeStage: "attendance",
});
const lift2 = incrementalLift(tiny.id);
ok(lift2.lift === null, "a three-per-arm experiment gets no number");
ok(lift2.reason.includes("Arms too small"), "and is told the arms are too small");

// A matched design that cannot name its covariates: refuse.
const unmatched = createExperiment(officerUser, {
  campaignId: camp.id,
  name: "comparable clubs, allegedly",
  design: "matched_clubs",
  treatment: Array.from({ length: 12 }, (_, i) => `t${i}`),
  holdout: Array.from({ length: 12 }, (_, i) => `h${i}`),
  assignedAt: "2026-09-01T00:00:00.000Z",
  outcomeStage: "attendance",
});
const lift3 = incrementalLift(unmatched.id);
ok(lift3.lift === null, "a matched design with no stated covariates gets no number");
ok(
  lift3.reason.includes("convenience sample"),
  "and is told what it actually is",
);

assert.throws(
  () =>
    createExperiment(officerUser, {
      campaignId: camp.id,
      name: "both arms",
      design: "randomized_holdout",
      treatment: ["x"],
      holdout: ["x"],
      assignedAt: AT,
      outcomeStage: "attendance",
    }),
  /cannot be in both arms/,
  "a club cannot be in both arms",
);
checks++;

// A real randomized holdout with enough clubs: now it answers, with an interval.
const treatment = Array.from({ length: 14 }, (_, i) => `treat-${i}`);
const holdout = Array.from({ length: 14 }, (_, i) => `hold-${i}`);
const real = createExperiment(officerUser, {
  campaignId: camp.id,
  name: "randomized holdout",
  design: "randomized_holdout",
  treatment,
  holdout,
  assignedAt: "2026-09-01T00:00:00.000Z",
  outcomeStage: "attendance",
});
const emptySnap = snapshot(CEC, "2026-10-02T22:00:00.000Z", [], [], "backfilled arm outcome");
treatment.slice(0, 10).forEach((c, i) =>
  recordStage({
    campaignId: camp.id,
    clubId: c,
    stage: "attendance",
    n: 30,
    occurredAt: `2026-10-0${(i % 9) + 1}T22:00:00.000Z`,
    snapshot: emptySnap,
  }),
);
holdout.slice(0, 4).forEach((c, i) =>
  recordStage({
    campaignId: camp.id,
    clubId: c,
    stage: "attendance",
    n: 30,
    occurredAt: `2026-10-0${(i % 9) + 1}T22:00:00.000Z`,
    snapshot: emptySnap,
  }),
);
const lift4 = incrementalLift(real.id);
ok(lift4.lift !== null, "a real randomized holdout with adequate n does get a number");
ok(Array.isArray(lift4.interval), "and the number comes with an interval");
ok(lift4.lift > 0.3 && lift4.lift < 0.6, "and the point estimate is the arithmetic we expect");
ok(
  lift4.reading.includes("percentage points"),
  "and the reading states the unit rather than a bare ratio",
);

// Outcomes recorded BEFORE assignment do not count: that would be a post-hoc split.
const late = createExperiment(officerUser, {
  campaignId: camp.id,
  name: "assigned after the fact",
  design: "randomized_holdout",
  treatment,
  holdout,
  assignedAt: "2026-11-01T00:00:00.000Z",
  outcomeStage: "attendance",
});
const lift5 = incrementalLift(late.id);
ok(
  lift5.treatment.converted === 0 && lift5.holdout.converted === 0,
  "outcomes before assignment are not credited to an experiment assigned afterwards",
);

// ============================================================ 7. execution
recordExecution(slot.id, "offered", AT);
recordExecution(slot.id, "accepted", AT);
const hist = recordExecution(slot.id, "occurred", AT, 44);
ok(hist.occurred === 1 && hist.offered === 1, "execution history accumulates");
ok(hist.medianAttendance === 44, "and records realised attendance");
const withHistory = rankCandidates({ sponsor: sponsor(), clubIds: [CEC], at: AT }).ranked.find(
  (c) => c.inventoryId === slot.id,
);
ok(
  withHistory.predictions.club_accepts.status === "baseline_unvalidated",
  "once there is history, the acceptance prediction stops being prior-only",
);
ok(
  withHistory.predictions.club_accepts.sampleSize === 1,
  "and reports the one observation behind it rather than implying more",
);

console.log(`campaigns: ${checks} checks passed`);

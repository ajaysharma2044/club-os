// The economic demand engine and the vendor layer, against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/economics.mjs
//
// The case under test is the one in the brief: a 300-person conference implies
// a venue, food, microphones, badges, a photographer. The tests exist mostly to
// pin down what the system must NOT do with that implication — record it as a
// purchase, keep suggesting it after a club has said no, put vendors next to a
// guess, or contain any function capable of contacting a vendor at all.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-economics-"));
process.env.CEC_DATABASE = join(dir, "economics.sqlite");

const { db } = await import("../lib/cec/db.ts");
const { forecastAttendance, betaBinomialQuantile } = await import("../lib/cec/forecast.ts");
const { computeFactor, mayUse } = await import("../lib/cec/factors.ts");

const demand = await import("../lib/cec/economics/demand.ts");
const vendorsModule = await import("../lib/cec/economics/vendors.ts");
const {
  NEED_CATEGORIES,
  NEED_STATUSES,
  PLANNING_QUANTILES,
  CATERING_RATIO_BAND,
  CONFIDENCE_CEILING,
  canSizeFromForecast,
  inferNeeds,
  cateringOrder,
  demandInit,
  recordInferredNeeds,
  need,
  confirmNeed,
  declineNeed,
  needsForEvent,
  needsForClub,
  confirmedNeeds,
  eventEconomicScaleFactor,
  needConfirmationRateFactor,
} = demand;
const {
  vendorsInit,
  addVendor,
  deactivateVendor,
  recordEngagement,
  listVendors,
  mayRecommendFor,
  recommendVendors,
  groupPurchaseOpportunities,
  MATCH_WEIGHTS,
} = vendorsModule;

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a, b, msg) => {
  assert.deepStrictEqual(a, b, msg);
  checks++;
};

demandInit();
vendorsInit();

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
const pres = user("Priya, President", "officer");
const treasurer = user("Tomas, Treasurer", "officer");

/** n identical comparable events, so the only thing that varies is how many. */
const rep = (n, rsvps, attended) => Array.from({ length: n }, () => ({ rsvps, attended }));

// 400 RSVPs, a club with a real check-in history at 70% conversion: the
// 300-person conference of the brief.
const rich = forecastAttendance({ rsvps: 400, comparables: rep(12, 100, 70) });
// The same event at a club that has checked people in three times.
const thin = forecastAttendance({ rsvps: 400, comparables: rep(3, 100, 70) });
// A club that has never checked anyone in. The forecast says so itself.
const blind = forecastAttendance({ rsvps: 400, comparables: [] });
// Announced, nobody has answered yet.
const noRsvps = forecastAttendance({ rsvps: 0, comparables: rep(12, 100, 70) });

const CONFERENCE = {
  id: "evt-conference",
  clubId: "cornell-ec",
  title: "Startup Summit",
  startsAt: "2026-03-05T13:00:00Z",
  endsAt: "2026-03-05T21:00:00Z",
  capacity: 400,
  format: "conference",
  foodProvided: true,
  ticketed: true,
  externalSpeakers: 2,
};

// ===========================================================================
// 1. An inference is an inference. It is never a purchase.
// ===========================================================================

const inferred = inferNeeds(CONFERENCE, rich, "2026-02-01T00:00:00Z");
ok(inferred.length >= 8, `a 300-person conference implies several needs: ${inferred.length}`);

ok(
  !NEED_STATUSES.includes("confirmed"),
  "there is no bare 'confirmed' status: the name has to say who confirmed it",
);
for (const n of inferred) {
  ok(n.status === "inferred", `${n.category} comes back inferred, not ${n.status}`);
  ok(n.status !== "confirmed", `${n.category} is never 'confirmed' by inference`);
  ok(n.confirmedAt === null && n.confirmedBy === null, `${n.category} has nobody's name on it`);
  ok(n.declinedAt === null, `${n.category} has not been declined either`);
  ok(n.basis.length > 30, `${n.category} states its basis in words, not a code`);
  ok(
    n.confidence > 0 && n.confidence <= CONFIDENCE_CEILING,
    `${n.category} confidence ${n.confidence} sits inside (0, ${CONFIDENCE_CEILING}]`,
  );
  ok(n.quantityHigh >= n.quantityLow, `${n.category} range is the right way round`);
  ok(NEED_CATEGORIES.includes(n.category), `${n.category} is a declared category`);
  ok(n.id === "", "inference writes nothing: an unstored need has no id");
}

const byCategory = new Map(inferred.map((n) => [n.category, n]));
for (const c of ["venue", "catering", "av_equipment", "printing", "photography"])
  ok(byCategory.has(c), `a 300-person conference implies ${c}`);
// Nobody said the event leaves campus, so nobody gets buses.
ok(!byCategory.has("transportation"), "travel is not inferred from an event being large");

// Inference is deterministic: two runs are the same object, so a refresh does
// not reshuffle a list an officer is reading.
eq(
  JSON.stringify(inferNeeds(CONFERENCE, rich, "2026-02-01T00:00:00Z")),
  JSON.stringify(inferred),
  "inference is deterministic",
);

// ===========================================================================
// 2. Thin data is refused, not filled in.
// ===========================================================================

ok(canSizeFromForecast(rich).ok, "twelve comparable events can carry a quantity");
ok(!canSizeFromForecast(blind).ok, "no comparable events cannot carry a quantity");
ok(
  canSizeFromForecast(blind).reason.length > 40,
  "and the refusal says why, in words an officer can act on",
);
ok(!canSizeFromForecast(noRsvps).ok, "no RSVPs means nothing to size against");

const blindNeeds = inferNeeds(CONFERENCE, blind, "2026-02-01T00:00:00Z");
const blindCats = new Set(blindNeeds.map((n) => n.category));
ok(!blindCats.has("catering"), "no history ⇒ no catering quantity invented");
ok(!blindCats.has("venue"), "no history ⇒ no venue size invented");
ok(!blindCats.has("printing"), "no history ⇒ no print run invented");
ok(
  blindCats.has("speaker_travel"),
  "…but a speaker count an officer typed survives a useless forecast",
);
eq(
  blindNeeds.find((n) => n.category === "speaker_travel").quantityHigh,
  2,
  "and it is their number, unchanged",
);
eq(inferNeeds(CONFERENCE, noRsvps).some((n) => n.category === "catering"), false, "…as does the RSVP refusal");

// ===========================================================================
// 3. Quantities come from the predictive DISTRIBUTION, and widen with doubt.
// ===========================================================================

const printRich = byCategory.get("printing");
eq(
  printRich.quantityLow,
  betaBinomialQuantile(PLANNING_QUANTILES.low, rich.predictive.n, rich.predictive.alpha, rich.predictive.beta),
  "the low end is a quantile of the attendance predictive",
);
eq(
  printRich.quantityHigh,
  betaBinomialQuantile(PLANNING_QUANTILES.high, rich.predictive.n, rich.predictive.alpha, rich.predictive.beta),
  "the high end is a quantile of the attendance predictive",
);
ok(
  printRich.quantityHigh > rich.expected,
  `the planning range reaches above the point estimate: ${printRich.quantityHigh} vs ${rich.expected}`,
);

const thinNeeds = inferNeeds(CONFERENCE, thin, "2026-02-01T00:00:00Z");
const printThin = thinNeeds.find((n) => n.category === "printing");
const width = (n) => n.quantityHigh - n.quantityLow;
ok(
  width(printThin) > width(printRich),
  `three comparables give a wider range than twelve: ${width(printThin)} vs ${width(printRich)}`,
);
ok(
  Math.abs(thin.expected - rich.expected) <= 2,
  "…while the point estimate barely moves, which is exactly why the point estimate is not the answer",
);

// Confidence falls with the thinness of the history behind it.
ok(
  printThin.confidence < printRich.confidence,
  `thinner history ⇒ lower confidence: ${printThin.confidence} vs ${printRich.confidence}`,
);
// A stated fact does not get discounted for a thin forecast.
eq(
  thinNeeds.find((n) => n.category === "speaker_travel").confidence,
  byCategory.get("speaker_travel").confidence,
  "a speaker count somebody typed is not discounted for our uncertainty",
);

// ===========================================================================
// 4. Catering is a newsvendor, and it respects the cost asymmetry.
// ===========================================================================

const cautious = cateringOrder(rich, CATERING_RATIO_BAND.cautious);
const evenCost = cateringOrder(rich, { shortage: 1, surplus: 1 });
const generous = cateringOrder(rich, CATERING_RATIO_BAND.generous);

ok(
  generous.quantity > evenCost.quantity,
  `"running out is four times worse" orders above the median: ${generous.quantity} vs ${evenCost.quantity}`,
);
ok(
  cautious.quantity < evenCost.quantity,
  `"waste is twice as bad" orders below the median: ${cautious.quantity} vs ${evenCost.quantity}`,
);
ok(
  generous.expectedShortfallProbability < cautious.expectedShortfallProbability,
  "and the generous order runs short less often, which is what the ratio bought",
);
eq(evenCost.quantity, betaBinomialQuantile(0.5, rich.predictive.n, rich.predictive.alpha, rich.predictive.beta), "equal costs order at the median");

const cater = byCategory.get("catering");
eq(cater.method, "newsvendor_band", "catering is sized by the newsvendor, not a rule of thumb");
eq(cater.quantityLow, cautious.quantity, "the band's low end is the cautious fractile");
eq(cater.quantityHigh, generous.quantity, "the band's high end is the generous fractile");
ok(
  cater.basis.includes("newsvendor") && cater.basis.includes("ratio"),
  "and the basis tells the club the ratio is theirs to state",
);

// The wrapper refuses to guess the ratio, where recommendFoodOrder politely
// defaults to 1:1. That refusal is the whole point of it existing.
assert.throws(() => cateringOrder(rich, null), /ratio|running out/i);
assert.throws(() => cateringOrder(rich, { shortage: 0, surplus: 1 }), /ratio|running out/i);
checks += 2;

// ===========================================================================
// 5. Storage: the club decides, and a decision is never overwritten.
// ===========================================================================

const ids = recordInferredNeeds(pres, inferred);
eq(ids.length, inferred.length, "every inferred need is stored");
for (const row of needsForEvent(CONFERENCE.id))
  ok(row.status === "inferred", `${row.category} is stored as inferred`);

const cateringRow = needsForEvent(CONFERENCE.id).find((n) => n.category === "catering");
const merchRow = needsForEvent(CONFERENCE.id).find((n) => n.category === "merchandise");
const printRow = needsForEvent(CONFERENCE.id).find((n) => n.category === "printing");

const confirmedCatering = confirmNeed(treasurer, cateringRow.id, { notes: "Ordering through Dining" });
eq(confirmedCatering.status, "club_confirmed", "a club confirming is the only way this changes");
eq(confirmedCatering.confirmedBy, treasurer.id, "and the confirmation carries a person's name");
ok(confirmedCatering.confirmedAt !== null, "and the moment they did it");

// "Club control" means a person with authority, not any caller with a handle.
const rank = user("Mira, Member", "member");
assert.throws(() => confirmNeed(rank, printRow.id), /Officer access required/);
assert.throws(() => declineNeed(rank, printRow.id), /Officer access required/);
assert.throws(() => recordInferredNeeds(rank, inferred), /Officer access required/);
checks += 3;
eq(need(printRow.id).status, "inferred", "and the refused confirmation changed nothing");

// Merchandise is sized off an attach rate nobody has measured, and the method
// says so rather than borrowing catering's credibility.
eq(
  merchRow.method,
  "assumed_attach_rate",
  "a guess scaled by an assumption is labelled as one, not as a predictive quantile",
);

const declinedMerch = declineNeed(treasurer, merchRow.id, "No merch this year");
eq(declinedMerch.status, "declined", "a club declining is recorded, not deleted");
ok(declinedMerch.confirmedAt === null, "declining clears any confirmation");

// Re-run the inference with a DIFFERENT forecast. The still-inferred row moves;
// the confirmed and declined rows do not. This is the clause that stops a "no"
// decaying back into a suggestion every time the forecast refreshes.
recordInferredNeeds(pres, thinNeeds);
const after = new Map(needsForEvent(CONFERENCE.id).map((n) => [n.category, n]));
eq(after.get("catering").status, "club_confirmed", "re-inference does not un-confirm a need");
eq(after.get("merchandise").status, "declined", "re-inference does not resurrect a declined need");
eq(
  after.get("catering").quantityHigh,
  cater.quantityHigh,
  "and it does not quietly restate the confirmed quantity either",
);
ok(
  printThin.quantityHigh !== printRich.quantityHigh,
  "the two forecasts genuinely disagree about the print run",
);
eq(
  after.get("printing").quantityHigh,
  printThin.quantityHigh,
  "…so a row nobody has ruled on does refresh",
);
eq(after.get("printing").id, printRow.id, "refreshing a need keeps its identity");

eq(
  confirmedNeeds().every((n) => n.status === "club_confirmed"),
  true,
  "confirmedNeeds() can only ever return confirmed rows",
);
eq(
  needsForClub("cornell-ec", { status: "declined" }).map((n) => n.category),
  ["merchandise"],
  "declines are queryable, which is how we find out the inference was wrong",
);

// ===========================================================================
// 6. Factors.
// ===========================================================================

const clubNeeds = needsForClub("cornell-ec");
const scale = computeFactor(eventEconomicScaleFactor, "cornell-ec", { needs: clubNeeds }, "2026-02-10T00:00:00Z");
eq(scale.status, "ok", "the economic scale factor computes");
ok(scale.value > 0 && scale.value <= 1, `and is an index in (0,1]: ${scale.value}`);
ok(scale.drivers.length > 0, "with a named contribution per category");
ok(
  scale.reading.includes("breadth"),
  "and a reading that refuses to call it money: " + scale.reading,
);
const missing = computeFactor(eventEconomicScaleFactor, "cornell-ec", {}, "2026-02-10T00:00:00Z");
eq(missing.status, "missing_input", "a factor that is not given its input errors rather than zeroes");

const rate = computeFactor(needConfirmationRateFactor, "cornell-ec", { needs: clubNeeds }, "2026-02-10T00:00:00Z");
eq(
  rate.status,
  "insufficient_data",
  "two decisions cannot tell a useful inference engine from a coin",
);
const decided = [
  ...Array.from({ length: 4 }, () => ({ status: "club_confirmed", category: "venue", confidence: 1 })),
  ...Array.from({ length: 2 }, () => ({ status: "declined", category: "decor", confidence: 1 })),
  { status: "inferred", category: "prizes", confidence: 0.4 },
];
const rate2 = computeFactor(needConfirmationRateFactor, "cornell-ec", { needs: decided }, "2026-02-10T00:00:00Z");
eq(rate2.status, "ok", "six answered suggestions is enough to say something");
ok(Math.abs(rate2.value - 4 / 6) < 1e-12, "and the pending one is excluded from both sides");

// The privacy gate is the point of declaring uses at all.
ok(
  mayUse(eventEconomicScaleFactor, "sponsor_ranking").allowed,
  "a sponsor may weigh how big a club's events are",
);
ok(
  !mayUse(needConfirmationRateFactor, "sponsor_ranking").allowed,
  "a sponsor may NOT rank a club on how often it says no to our guesses",
);

// ===========================================================================
// 7. Vendors: recommendations carry reasons, and only for confirmed needs.
// ===========================================================================

const alpha = addVendor(pres, { name: "Alpha Catering", category: "catering", institutionId: "cornell" });
const beta = addVendor(pres, { name: "Beta Catering", category: "catering", institutionId: "cornell" });
const ceres = addVendor(pres, { name: "Ceres Catering", category: "catering" }); // no campus stated
const delta = addVendor(pres, { name: "Delta Catering", category: "catering", institutionId: "otherU" });
const echo = addVendor(pres, { name: "Echo Catering", category: "catering", institutionId: "cornell" });
const flint = addVendor(pres, { name: "Flint Catering", category: "catering", institutionId: "cornell" });
addVendor(pres, { name: "Gale Printing", category: "printing", institutionId: "cornell" });
deactivateVendor(pres, echo);

recordEngagement(pres, { vendorId: alpha, clubId: "cornell-ec", status: "completed", amountCents: 120000 });
recordEngagement(pres, { vendorId: alpha, clubId: "cornell-ec", status: "completed", amountCents: 90000 });
recordEngagement(pres, { vendorId: flint, clubId: "another-club", status: "fell_through" });

const confirmedCateringNeed = need(cateringRow.id);
const recs = recommendVendors(confirmedCateringNeed);
ok(recs.length >= 3, `a confirmed need gets a shortlist: ${recs.length}`);
for (const r of recs) {
  ok(r.reasons.length >= 1, `${r.vendor.name} carries at least one reason`);
  ok(
    r.reasons.every((x) => typeof x.label === "string" && Number.isFinite(x.contribution)),
    `${r.vendor.name}'s reasons are named contributions, not a score`,
  );
  ok(r.score >= 0 && r.score <= 1, `${r.vendor.name} scores inside [0,1]: ${r.score}`);
  ok(
    /nobody has been contacted/i.test(r.reading) && /nothing has been booked/i.test(r.reading),
    `${r.vendor.name}'s reading says out loud that nothing was arranged`,
  );
}
const names = recs.map((r) => r.vendor.name);
ok(!names.includes("Delta Catering"), "a vendor pinned to another campus is not a candidate");
ok(!names.includes("Echo Catering"), "a deactivated vendor is not a candidate");
ok(!names.some((n) => n.includes("Printing")), "and neither is a printer, for a catering need");
eq(names[0], "Alpha Catering", "the vendor this club has actually completed work with ranks first");
ok(
  recs[0].reasons.some((r) => /finished/.test(r.label)),
  "and the reason says so, rather than just ranking them",
);
ok(
  names.indexOf("Ceres Catering") > names.indexOf("Beta Catering"),
  "a campus-listed vendor outranks one listed nowhere",
);
ok(
  names.indexOf("Flint Catering") > names.indexOf("Ceres Catering"),
  "and a vendor whose last job fell through sinks below both",
);
ok(
  recs
    .find((r) => r.vendor.name === "Flint Catering")
    .reasons.some((r) => r.contribution < 0 && /fell through/.test(r.label)),
  "the penalty is shown as a named negative reason, not hidden in a score",
);
ok(
  recs.find((r) => r.vendor.name === "Beta Catering").caveats.some((c) => /no club has recorded/i.test(c)),
  "a vendor with no history says so",
);
eq(
  JSON.stringify(recommendVendors(confirmedCateringNeed)),
  JSON.stringify(recs),
  "recommendation is deterministic: same inputs, same order, every time",
);
eq(
  Math.abs(recs[0].score - (MATCH_WEIGHTS.categoryMatch + MATCH_WEIGHTS.sameInstitution + MATCH_WEIGHTS.priorEngagementWithClub + MATCH_WEIGHTS.completedForClub)) < 1e-9,
  true,
  "the score is exactly the sum of the stated weights that fired",
);

// A declined need gets nothing, and says why.
const declinedNeed = need(merchRow.id);
eq(recommendVendors(declinedNeed), [], "a declined need produces no vendor recommendations");
eq(mayRecommendFor(declinedNeed).ok, false, "and the refusal is explicit");
ok(
  /do not need this/i.test(mayRecommendFor(declinedNeed).reason),
  "with a reason a UI can show: " + mayRecommendFor(declinedNeed).reason,
);

// An inferred need gets nothing either: only a club confirming turns a guess
// into a marketplace opportunity.
const stillInferred = need(printRow.id);
eq(stillInferred.status, "inferred", "printing is still our guess");
eq(recommendVendors(stillInferred), [], "an inferred need produces no vendor recommendations");
ok(
  /still our inference/i.test(mayRecommendFor(stillInferred).reason),
  "and the reason says whose guess it is",
);
ok(listVendors({ category: "catering" }).length === 5, "the deactivated vendor is out of the list too");

// ===========================================================================
// 8. Group purchasing finds real overlaps and invents none.
// ===========================================================================

const win = (a, b) => ({ start: a, end: b });
const mkNeed = (clubId, category, status, low, high, window, unit = "pieces") => ({
  id: `${clubId}-${category}-${window.start}`,
  clubId,
  eventId: `${clubId}-evt`,
  category,
  status,
  quantityLow: low,
  quantityHigh: high,
  unit,
  method: "predictive_interval",
  confidence: 0.5,
  basis: "test fixture",
  drivers: [],
  inferredAt: "2026-02-01T00:00:00Z",
  confirmedAt: status === "club_confirmed" ? "2026-02-02T00:00:00Z" : null,
  confirmedBy: status === "club_confirmed" ? pres.id : null,
  declinedAt: status === "declined" ? "2026-02-02T00:00:00Z" : null,
  notes: "",
  window,
});

const MAR_4 = "2026-03-04T00:00:00Z";
const MAR_6 = "2026-03-06T00:00:00Z";
const MAR_5 = "2026-03-05T00:00:00Z";
const MAR_9 = "2026-03-09T00:00:00Z";
const JUN = "2026-06-10T00:00:00Z";

const windowed = [
  mkNeed("club-a", "printing", "club_confirmed", 200, 260, win(MAR_4, MAR_6)),
  mkNeed("club-b", "printing", "club_confirmed", 90, 120, win(MAR_5, MAR_9)),
  mkNeed("club-c", "printing", "club_confirmed", 40, 55, win(MAR_5, MAR_6)),
  // Same category, three months away. Not a group purchase however alike it looks.
  mkNeed("club-d", "printing", "club_confirmed", 300, 400, win(JUN, JUN)),
  // Overlapping, but the club has not confirmed it. Our guess must not be
  // combined into somebody else's order.
  mkNeed("club-e", "printing", "inferred", 500, 900, win(MAR_5, MAR_6)),
  // Overlapping and confirmed, but declined clubs are not participants either.
  mkNeed("club-f", "printing", "declined", 500, 900, win(MAR_5, MAR_6)),
  // One club, two of its own events. Not a group.
  mkNeed("club-g", "decor", "club_confirmed", 1, 1, win(MAR_4, MAR_6), "packages"),
  mkNeed("club-g", "decor", "club_confirmed", 1, 1, win(MAR_5, MAR_6), "packages"),
];

const groups = groupPurchaseOpportunities(windowed);
eq(groups.length, 1, "exactly one genuine overlap is found");
const g = groups[0];
eq(g.category, "printing", "in the category the clubs share");
eq(g.clubs, ["club-a", "club-b", "club-c"], "naming the clubs, sorted so the output is stable");
eq(g.combinedQuantityLow, 330, "combined low is the sum of the members' lows");
eq(g.combinedQuantityHigh, 435, "combined high is the sum of the members' highs");
eq(g.unit, "pieces", "and it is a sum of one unit, not a mix");
ok(g.window !== null, "a window every member actually shares exists");
eq(Date.parse(g.window.start), Date.parse(MAR_5), "the shared window starts at the latest start");
eq(Date.parse(g.window.end), Date.parse(MAR_6), "and ends at the earliest end");
ok(!g.clubs.includes("club-d"), "a club three months away is not swept in");
ok(!g.clubs.includes("club-e"), "an inferred need is not combined into a real order");
ok(!g.clubs.includes("club-f"), "nor a declined one");
ok(
  g.caveats.some((c) => /nobody has been contacted/i.test(c)),
  "the opportunity says out loud that nothing has been arranged",
);
ok(/worth asking together/i.test(g.reading), "and reads as a suggestion to talk, not an order");

eq(
  groupPurchaseOpportunities(windowed.filter((n) => n.clubId === "club-g")),
  [],
  "one club with two events is not a group purchase",
);
eq(
  groupPurchaseOpportunities([
    mkNeed("club-a", "printing", "club_confirmed", 10, 20, win(MAR_4, MAR_5)),
    mkNeed("club-b", "printing", "club_confirmed", 10, 20, win(JUN, JUN)),
  ]),
  [],
  "two clubs with no overlap produce nothing at all",
);
// Widening the window is a deliberate act and the output says it happened.
const widened = groupPurchaseOpportunities(
  [
    mkNeed("club-a", "printing", "club_confirmed", 10, 20, win(MAR_4, MAR_5)),
    mkNeed("club-b", "printing", "club_confirmed", 10, 20, win(MAR_9, MAR_9)),
  ],
  { maxGapDays: 7 },
);
eq(widened.length, 1, "a caller who says the goods keep can widen the window");
ok(
  widened[0].caveats.some((c) => /days? apart/i.test(c)),
  "…and the result admits it was widened",
);

// Every member of a reported group overlaps EVERY other member, not just the
// first one. Chained-but-disjoint windows must not form a group.
const chained = groupPurchaseOpportunities([
  mkNeed("club-a", "printing", "club_confirmed", 10, 20, win("2026-03-01T00:00:00Z", "2026-03-03T00:00:00Z")),
  mkNeed("club-b", "printing", "club_confirmed", 10, 20, win("2026-03-02T00:00:00Z", "2026-03-08T00:00:00Z")),
  mkNeed("club-c", "printing", "club_confirmed", 10, 20, win("2026-03-06T00:00:00Z", "2026-03-09T00:00:00Z")),
]);
eq(chained.length, 1, "a chain of overlaps yields one group");
eq(chained[0].clubs, ["club-a", "club-b"], "…containing only the clubs that share one window");

// The DB path works too: confirmed rows from two clubs combine.
const otherClubNeeds = inferNeeds({ ...CONFERENCE, id: "evt-b", clubId: "club-b" }, rich, "2026-02-01T00:00:00Z");
const otherIds = recordInferredNeeds(pres, otherClubNeeds);
const otherCatering = needsForEvent("evt-b").find((n) => n.category === "catering");
confirmNeed(pres, otherCatering.id);
const fromDb = confirmedNeeds({ category: "catering" }).map((n) => ({
  ...n,
  window: win(MAR_5, MAR_6),
}));
const dbGroups = groupPurchaseOpportunities(fromDb);
eq(dbGroups.length, 1, "two clubs' confirmed catering needs combine");
eq(dbGroups[0].clubs, ["club-b", "cornell-ec"], "naming both clubs");
eq(
  dbGroups[0].combinedQuantityHigh,
  cater.quantityHigh * 2,
  "and combining the newsvendor bands, not the point estimates",
);
ok(otherIds.length > 0, "the second club's needs were stored");

// ===========================================================================
// 9. There is no function here that books or contacts anyone.
// ===========================================================================

// Asserted on the exported surface rather than trusted to a comment: if
// somebody adds sendInquiry() one afternoon, this test is what stops it.
const FORBIDDEN_VERB =
  /^(send|order|book|contact|buy|pay|checkout|place|email|dispatch|submit|reserve|charge|invoice|initiate|request)/i;
for (const name of Object.keys({ ...vendorsModule, ...demand }))
  ok(
    !FORBIDDEN_VERB.test(name),
    `no exported name may read as an outbound action: "${name}"`,
  );
for (const forbidden of [
  "sendInquiry",
  "placeOrder",
  "bookVendor",
  "contactVendor",
  "orderFrom",
  "requestQuote",
  "checkout",
  "pay",
  "notifyVendor",
  "emailVendor",
])
  ok(
    vendorsModule[forbidden] === undefined && demand[forbidden] === undefined,
    `${forbidden}() does not exist, and its absence is the design`,
  );

// And the modules have no capability to reach anything: no network call, no
// write to the delivery outbox.
for (const file of ["lib/cec/economics/vendors.ts", "lib/cec/economics/demand.ts"]) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  ok(!/\bfetch\s*\(/.test(src), `${file} makes no network call`);
  ok(!/\bemit\s*\(/.test(src), `${file} writes nothing to the delivery outbox`);
  ok(!/XMLHttpRequest|nodemailer|sendMail/.test(src), `${file} has no mail or transport client`);
}

console.log(`${checks} economics assertions passed.`);

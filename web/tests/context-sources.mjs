// The context source registry, canonical campus events, and entity resolution,
// against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/context-sources.mjs
//
// The cases under test are the ones that decide whether this layer is honest:
// a host that says Disallow and an endpoint that answers anyway; an event we
// learned about in November being invisible to a question asked in September;
// two feeds describing one career fair; two different things in one room at one
// hour; and a title the classifier cannot read.
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The database path must be set before any module imports db.ts, which resolves
// it once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-context-"));
process.env.CEC_DATABASE = join(dir, "context.sqlite");

const { db } = await import("../lib/cec/db.ts");
const { parseLocalist, parseLiveWhale } = await import("../lib/cec/campus.ts");
const { computeFactor, mayUse } = await import("../lib/cec/factors.ts");
const {
  sourcesInit,
  registerSource,
  sourcesFor,
  source,
  maySource,
  mayCrawl,
  crawlableSources,
  recordAttempt,
  recordSuccess,
  recordFailure,
  sourceRuns,
  staleSources,
  institutions,
  TRUST_CONFIDENCE,
} = await import("../lib/cec/context/sources.ts");
const {
  campusEventsInit,
  classify,
  CANONICAL_TYPES,
  ingestContextRecords,
  campusEventsAsOf,
  canonicalEvent,
  eventSources,
  canonicalFor,
  fromCampusEvent,
  recordCampusEvent,
  mergeCanonical,
  CAMPUS_CONTEXT_FACTORS,
  campusContextRegistry,
  campusEventDensity,
  employerActivity,
  competitionActivity,
} = await import("../lib/cec/context/campus-events.ts");
const {
  matchScore,
  resolve,
  normalizeTitle,
  normalizeUrl,
  titleSimilarity,
  explainMatch,
  MATCH_THRESHOLDS,
} = await import("../lib/cec/context/entity-resolution.ts");

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

sourcesInit();
campusEventsInit();

// ===================================================== 1. source registration

{
  const cornell = sourcesFor("cornell");
  ok(cornell.length === 1, `Cornell is seeded as exactly one row, got ${cornell.length}`);
  ok(cornell[0].source_id === "cornell_localist", "the seeded id names the institution and the platform");
  ok(cornell[0].institution_id === "cornell", "institution is a column, not an assumption");
  ok(cornell[0].permission_basis === "robots_allowed", "the seed carries its permission basis over from CAMPUS_SOURCES");
  ok(cornell[0].permission_checked_at === "2026-09-11", "and the date that basis was reviewed");
  ok(cornell[0].active === 1, "seeded sources are active");

  sourcesInit();
  ok(sourcesFor("cornell").length === 1, "re-running init does not duplicate the seed");
}

{
  // A second institution proves nothing here is Cornell-shaped.
  registerSource({
    sourceId: "testu_livewhale",
    institutionId: "testu",
    name: "Test University",
    sourceType: "livewhale",
    baseUrl: "https://events.testu.edu",
    permissionBasis: "robots_allowed",
    trustLevel: "published",
    permissionCheckedAt: "2026-09-11",
  });
  registerSource({
    sourceId: "testu_registrar",
    institutionId: "testu",
    name: "Test University Registrar",
    sourceType: "html",
    baseUrl: "https://registrar.testu.edu",
    permissionBasis: "unreviewed",
    trustLevel: "authoritative",
    crawlFrequency: "termly",
  });
  ok(sourcesFor("testu").length === 2, "a second institution registers independently");
  ok(sourcesFor("cornell").length === 1, "and does not leak into Cornell's list");
  ok(institutions().includes("testu") && institutions().includes("cornell"), "both institutions are enumerable");

  const updated = registerSource({
    sourceId: "testu_livewhale",
    institutionId: "testu",
    name: "Test University Events",
    sourceType: "livewhale",
    baseUrl: "https://events.testu.edu",
    permissionBasis: "robots_allowed",
    parserVersion: "1.1.0",
  });
  ok(updated.name === "Test University Events", "re-registering updates in place");
  ok(sourcesFor("testu").length === 2, "and does not add a row");
  ok(updated.parser_version === "1.1.0", "the parser version is carried on the source, not in code");
}

throws(
  () => registerSource({ sourceId: "Bad-Id", institutionId: "testu", name: "x", sourceType: "html", baseUrl: "https://x.edu" }),
  /source_id/i,
  "an id that is not lower_snake_case is refused",
);
throws(
  () => registerSource({ sourceId: "ok_id", institutionId: "testu", name: "x", sourceType: "html", baseUrl: "ftp://x.edu" }),
  /http/i,
  "a non-http base URL is refused",
);
throws(
  () => registerSource({ sourceId: "ok_id", institutionId: "testu", name: "x", sourceType: "telepathy", baseUrl: "https://x.edu" }),
  /source_type/i,
  "an unknown source type is refused",
);

{
  const defaulted = registerSource({
    sourceId: "defaulted_source",
    institutionId: "testu",
    name: "Unreviewed by default",
    sourceType: "rss",
    baseUrl: "https://blog.testu.edu",
  });
  ok(defaulted.permission_basis === "unreviewed", "permission defaults to unreviewed, never to allowed");
  ok(maySource(defaulted).allowed === false, "and unreviewed is not fetchable");
}

// ============================================== 2. the permission gate refuses

{
  // Yale's Localist API returns perfectly good JSON. Yale's robots.txt says
  // Disallow: /. The endpoint responding is not permission.
  const yale = registerSource({
    sourceId: "yale_localist",
    institutionId: "yale",
    name: "Yale University",
    sourceType: "localist",
    baseUrl: "https://events.yale.edu",
    permissionBasis: "robots_disallowed",
    permissionCheckedAt: "2026-09-11",
  });
  const gate = maySource(yale);
  ok(gate.allowed === false, "a robots_disallowed source is never fetchable");
  ok(/not permission/i.test(gate.reason), `the refusal says why: "${gate.reason}"`);
  ok(source("yale_localist").base_url === "https://events.yale.edu", "it is still recorded — detection is allowed, fetching is not");
  ok(crawlableSources("yale").length === 0, "and it never appears in the crawl list");

  // Reactivating must not read like a way around consent.
  registerSource({
    sourceId: "yale_localist",
    institutionId: "yale",
    name: "Yale University",
    sourceType: "localist",
    baseUrl: "https://events.yale.edu",
    permissionBasis: "robots_disallowed",
    active: true,
  });
  ok(maySource(source("yale_localist")).allowed === false, "active=1 does not override robots_disallowed");

  const refusal = mayCrawl("yale_localist");
  ok(refusal.allowed === false, "mayCrawl refuses too");
  const runs = sourceRuns("yale_localist");
  ok(runs.length === 1 && runs[0].status === "refused", "and the refusal is written to the run log");
  ok(/not permission/i.test(runs[0].error), "with the reason, so a refusal is not mistaken for a source nobody tried");

  const paused = registerSource({
    sourceId: "paused_source",
    institutionId: "testu",
    name: "Paused feed",
    sourceType: "ics",
    baseUrl: "https://ics.testu.edu",
    permissionBasis: "robots_allowed",
    active: false,
  });
  ok(maySource(paused).allowed === false, "a deactivated source is not crawled");
  ok(/deactivated/i.test(maySource(paused).reason), "and says it is paused, not that consent was refused");
}

// ==================================================== 3. the crawl attempt log

{
  const before = source("cornell_localist");
  ok(before.last_attempt_at === null, "a never-crawled source has no attempt stamp");
  const runId = recordAttempt("cornell_localist", "2026-09-15T00:00:00.000Z");
  ok(source("cornell_localist").last_attempt_at === "2026-09-15T00:00:00.000Z", "the attempt is stamped before the fetch, so a crash still leaves a trace");
  ok(source("cornell_localist").last_success_at === null, "an attempt is not a success");

  recordSuccess(runId, { rowsSeen: 120, rowsNew: 12 }, "2026-09-15T00:00:09.000Z");
  ok(source("cornell_localist").last_success_at === "2026-09-15T00:00:09.000Z", "success stamps the source");
  const [run] = sourceRuns("cornell_localist");
  ok(run.status === "success" && run.rows_seen === 120 && run.rows_new === 12, "the run records both counts, because their ratio is the health signal");

  const failing = recordAttempt("cornell_localist", "2026-09-16T00:00:00.000Z");
  recordFailure(failing, "502 from events.cornell.edu", "2026-09-16T00:00:05.000Z");
  ok(source("cornell_localist").last_success_at === "2026-09-15T00:00:09.000Z", "a failure does not touch last_success_at");
  ok(sourceRuns("cornell_localist").some((r) => r.status === "error" && /502/.test(r.error)), "the error is kept verbatim");

  const stale = staleSources("cornell", "2026-09-20T00:00:00.000Z");
  ok(stale.length === 1, "five days without rows is stale for a daily feed");
  ok(/missing data, not/i.test(stale[0].reason), "and the reason says an empty feed is missing data, not a quiet campus");
  ok(staleSources("cornell", "2026-09-15T06:00:00.000Z").length === 0, "a fresh feed is not flagged");
}

// ====================================================== 4. classify() refuses

{
  ok(CANONICAL_TYPES.includes("unknown"), "'unknown' is a canonical type, not an error path");
  const fair = classify({ title: "Fall Career Fair 2026" });
  ok(fair.type === "career_fair", `a career fair classifies, got ${fair.type}`);
  ok(fair.confidence > 0 && fair.confidence <= 1, "with a stated confidence");

  const withTag = classify({ title: "Fall Career Fair 2026", tags: ["Career Fair", "Professional"] });
  ok(withTag.confidence > fair.confidence, "a source tag agreeing with the title raises confidence");

  ok(classify({ title: "TechHacks 2026 Hackathon" }).type === "hackathon", "a hackathon classifies");
  ok(classify({ title: "Goldman Sachs Information Session" }).type === "employer_event", "an info session is employer-facing");
  ok(classify({ title: "Spring 2027 Add/Drop Deadline" }).type === "academic_deadline", "a registrar deadline classifies");
  ok(classify({ title: "Commencement Ceremony" }).type === "graduation", "commencement classifies");

  // The refusals, which matter more than the hits.
  const weak = classify({ title: "Weekly Seminar" });
  ok(weak.type === "unknown", `a bare weak keyword is unknown, got ${weak.type}`);
  ok(weak.confidence === 0, "and carries no confidence");
  ok(/weak keyword is not a classification/i.test(weak.reasons.join(" ")), "and says why");

  const ambiguous = classify({ title: "Alumni Networking Night" });
  ok(ambiguous.type === "unknown", `an evenly-matched title is unknown, got ${ambiguous.type}`);
  ok(/ambiguous/i.test(ambiguous.reasons.join(" ")), "an ambiguous record is reported, not resolved by rule order");

  ok(classify({ title: "Untitled" }).type === "unknown", "a meaningless title is unknown");
  ok(classify({}).type === "unknown", "no title and no tags is unknown, not a crash");
  ok(classify({ title: "" }).confidence === 0, "an empty title yields no confidence");
}

// ============================================ 5. entity resolution: pure rules

const cand = (over) => ({
  key: over.key || `${over.sourceId}:${over.externalId}`,
  sourceId: "a_source",
  externalId: "1",
  title: "Untitled",
  startAt: null,
  ...over,
});

{
  // Deterministic first: the same record fetched twice.
  const a = cand({ sourceId: "s1", externalId: "99", title: "Fall Career Fair", startAt: "2026-10-01T18:00:00Z" });
  const b = cand({ sourceId: "s1", externalId: "99", title: "Completely different words here", startAt: "2027-03-03T18:00:00Z" });
  const m = matchScore(a, b);
  ok(m.method === "external_id" && m.score === 1, "same source and external id is certain, regardless of the fields");

  // Deterministic: a shared event URL across sources.
  const c = cand({ sourceId: "s1", externalId: "1", title: "Career Fair", startAt: "2026-10-01T18:00:00Z", url: "https://events.cornell.edu/event/fall_fair?utm_source=news" });
  const d = cand({ sourceId: "s2", externalId: "7", title: "Fall Fair", startAt: "2026-10-01T18:00:00Z", url: "https://www.events.cornell.edu/event/Fall_Fair/" });
  const urlMatch = matchScore(c, d);
  ok(urlMatch.method === "url" && urlMatch.score === 1, "a shared event URL is certain across sources");
  ok(normalizeUrl("https://events.cornell.edu/") === "", "a calendar homepage is not a record identifier");

  const home1 = cand({ sourceId: "s1", externalId: "1", title: "Salsa Practice", startAt: "2026-10-01T18:00:00Z", url: "https://events.cornell.edu/" });
  const home2 = cand({ sourceId: "s2", externalId: "2", title: "Chess Club Meeting", startAt: "2026-10-01T18:00:00Z", url: "https://events.cornell.edu" });
  ok(matchScore(home1, home2).score === 0, "two unrelated events linking to the same homepage do not merge");
}

{
  // Same room, same hour, different events. The normal case on a campus.
  const fair = cand({ sourceId: "s1", externalId: "1", title: "Fall Career Fair", startAt: "2026-10-01T18:00:00Z", location: "Barton Hall" });
  const salsa = cand({ sourceId: "s2", externalId: "2", title: "Salsa Club Open Practice", startAt: "2026-10-01T18:00:00Z", location: "Barton Hall" });
  const m = matchScore(fair, salsa);
  ok(m.score === 0, `different titles in the same room at the same hour do not merge, got ${m.score}`);
  ok(/floor/i.test(m.reasons.join(" ")), "the title floor is named in the reasons");

  // Same title, a week apart. A weekly meeting is not one event.
  const week1 = cand({ sourceId: "s1", externalId: "11", title: "Chess Club Weekly Meeting", startAt: "2026-10-01T18:00:00Z" });
  const week2 = cand({ sourceId: "s1", externalId: "12", title: "Chess Club Weekly Meeting", startAt: "2026-10-08T18:00:00Z" });
  ok(matchScore(week1, week2).score === 0, "a repeating title is not a repeated event");
  ok(/apart/i.test(matchScore(week1, week2).reasons.join(" ")), "and the gap is stated");
}

{
  // The fuzzy path, which must be strong but never certain.
  const localist = cand({ sourceId: "cornell_localist", externalId: "500", title: "Fall Career Fair 2026", startAt: "2026-10-01T18:00:00Z", endAt: "2026-10-01T22:00:00Z", location: "Barton Hall" });
  const livewhale = cand({ sourceId: "cornell_livewhale", externalId: "77", title: "Fall Career Fair", startAt: "2026-10-01T18:00:00Z", location: "Barton Hall" });
  const m = matchScore(localist, livewhale);
  ok(m.score >= MATCH_THRESHOLDS.merge, `the same fair from two feeds merges, got ${m.score.toFixed(3)}`);
  ok(m.score < MATCH_THRESHOLDS.certain, "but a fuzzy match never reaches certainty");
  ok(m.method === "title_time_location", "and says which features carried it");
  ok(normalizeTitle("Fall Career Fair 2026") === normalizeTitle("Fall Career Fair"), "a bare year is redundant with start_at and is dropped");
  ok(titleSimilarity("Fall Career Fair", "Salsa Night") === 0, "unrelated titles share nothing");
}

{
  // Nothing merges silently below the threshold.
  const a = cand({ sourceId: "s1", externalId: "1", title: "Startup Career Fair", startAt: "2026-10-01T18:00:00Z" });
  const b = cand({ sourceId: "s2", externalId: "2", title: "Startup Career Fair Networking Reception", startAt: "2026-10-01T19:12:00Z" });
  const m = matchScore(a, b);
  ok(
    m.score >= MATCH_THRESHOLDS.review && m.score < MATCH_THRESHOLDS.merge,
    `a borderline pair scores in the review band, got ${m.score.toFixed(3)}`,
  );
  const r = resolve([a, b]);
  ok(r.clusters.length === 2, "a borderline pair stays two rows");
  ok(r.review.length === 1, "and is surfaced for review rather than dropped");
  ok(r.threshold === MATCH_THRESHOLDS.merge, "the threshold it was judged against is reported");
  ok(/below the/i.test(explainMatch(a, b)), "explainMatch says it was held, in one sentence");
}

{
  // Clustering, with each member carrying the edge that justified it.
  const rows = [
    cand({ sourceId: "s1", externalId: "1", title: "Fall Career Fair 2026", startAt: "2026-10-01T18:00:00Z", endAt: "2026-10-01T22:00:00Z", location: "Barton Hall", url: "https://events.cornell.edu/event/fair" }),
    cand({ sourceId: "s2", externalId: "2", title: "Fall Career Fair", startAt: "2026-10-01T18:00:00Z", location: "Barton Hall" }),
    cand({ sourceId: "s3", externalId: "3", title: "Salsa Club Open Practice", startAt: "2026-10-01T18:00:00Z", location: "Barton Hall" }),
  ];
  const r = resolve(rows);
  ok(r.clusters.length === 2, `three records, two real events, got ${r.clusters.length} clusters`);
  const fairCluster = r.clusters.find((c) => c.members.length === 2);
  ok(!!fairCluster, "the two fair records cluster together");
  ok(fairCluster.representative.key === "s1:1", "the most complete record is the representative");
  const seed = fairCluster.members.find((m) => m.matchMethod === "seed");
  const merged = fairCluster.members.find((m) => m.matchMethod !== "seed");
  ok(seed && seed.matchConfidence === 1, "the seed is matched against nothing");
  ok(merged.matchConfidence >= MATCH_THRESHOLDS.merge, "every merged member carries the confidence that justified it");
  ok(merged.matchedTo === "s1:1", "and which record it matched against");
  ok(resolve([]).clusters.length === 0, "an empty batch resolves to nothing, not a crash");
  ok(resolve([rows[0]]).clusters[0].members[0].matchMethod === "seed", "a lone record is its own cluster");
}

// ============================ 6. ingest: two feeds, one event, full provenance

const OBSERVED = "2026-09-15T00:00:00.000Z";

{
  // Real parser output from both platforms, describing one career fair.
  const localist = parseLocalist(
    {
      events: [
        {
          event: {
            id: 500,
            title: "Fall Career Fair 2026",
            location_name: "Barton Hall",
            localist_url: "https://events.cornell.edu/event/fall_career_fair",
            tags: ["Career Fair"],
            event_instances: [
              { event_instance: { id: 5001, start: "2026-10-01T14:00:00-04:00", end: "2026-10-01T18:00:00-04:00" } },
            ],
          },
        },
      ],
    },
    "cornell_localist",
  );
  const livewhale = parseLiveWhale(
    [
      {
        id: 77,
        title: "Fall Career Fair",
        date_iso: "2026-10-01T18:00:00Z",
        location_title: "Barton Hall",
        event_types: ["Professional"],
      },
    ],
    "cornell_livewhale",
  );
  ok(localist.length === 1 && livewhale.length === 1, "both platform parsers produced one row each");

  const result = ingestContextRecords({
    institutionId: "cornell",
    observedAt: OBSERVED,
    records: [...localist, ...livewhale].map((e) => fromCampusEvent(e)),
  });
  ok(result.canonicalIds.length === 1, `two source records became one canonical event, got ${result.canonicalIds.length}`);
  ok(result.created === 1 && result.linked === 1, "one row created, one record linked into it");

  const id = result.canonicalIds[0];
  const links = eventSources(id);
  ok(links.length === 2, "both source records are attached");
  ok(new Set(links.map((l) => l.source_id)).size === 2, "one from each feed");
  ok(links.every((l) => l.match_method && l.match_confidence > 0), "every link carries a method and a confidence");
  ok(links.some((l) => l.match_method === "seed"), "one link is the seed");
  ok(links.some((l) => l.match_method === "title_time_location"), "the other names the features that merged it");
  ok(links.every((l) => l.raw_title), "each link keeps what its source actually said");
  ok(canonicalFor("cornell_livewhale", "77") === id, "a source record can be traced forward to its canonical event");

  const ev = canonicalEvent(id);
  ok(ev.canonical_type === "career_fair", `the merged event is classified, got ${ev.canonical_type}`);
  ok(ev.location === "Barton Hall", "the canonical row took the representative's location");
  ok(ev.observed_at === OBSERVED, "observed_at is the crawl clock, not the writer's clock");
  ok(ev.start_at === "2026-10-01T18:00:00.000Z", "the start is normalised to UTC");
  ok(ev.occurred_at === null, "a future event has not occurred; occurred_at stays null");
  ok(ev.source_confidence === TRUST_CONFIDENCE.published, "confidence is inherited from the source's registered trust level");
  ok(ev.source_hash.length === 64, "a change-detection fingerprint is stored");

  // Idempotency, and the fact that a later crawl cannot move observed_at forward.
  const again = ingestContextRecords({
    institutionId: "cornell",
    observedAt: "2026-09-16T00:00:00.000Z",
    records: [...localist, ...livewhale].map((e) => fromCampusEvent(e)),
  });
  ok(again.canonicalIds.length === 1 && again.canonicalIds[0] === id, "re-crawling lands on the same canonical event");
  ok(again.created === 0, "and creates nothing new");
  ok(eventSources(id).length === 2, "and adds no duplicate provenance rows");
  ok(canonicalEvent(id).observed_at === OBSERVED, "observed_at only ever moves backwards: it is when we FIRST knew");
}

// ======================================= 7. genuinely different events survive

{
  const before = campusEventsAsOf("cornell", "2026-09-20T00:00:00.000Z").length;
  ingestContextRecords({
    institutionId: "cornell",
    observedAt: OBSERVED,
    records: [
      {
        sourceId: "cornell_livewhale",
        externalId: "88",
        title: "Salsa Club Open Practice",
        startAt: "2026-10-01T18:00:00.000Z",
        location: "Barton Hall",
      },
    ],
  });
  const after = campusEventsAsOf("cornell", "2026-09-20T00:00:00.000Z");
  ok(after.length === before + 1, "a different event in the same room at the same hour is its own canonical row");
  const salsa = after.find((e) => /salsa/i.test(e.title));
  ok(eventSources(salsa.id).length === 1, "and carries only its own source record");
  ok(salsa.canonical_type === "unknown", "an unreadable title is stored as unknown rather than guessed into a type");
}

// ====================================== 8. point-in-time: observed_at governs

{
  // Test University learns about two events at very different times.
  ingestContextRecords({
    institutionId: "testu",
    observedAt: "2026-09-01T00:00:00.000Z",
    records: [
      {
        sourceId: "testu_livewhale",
        externalId: "a1",
        title: "Autumn Employer Info Session",
        startAt: "2026-10-05T18:00:00.000Z",
        location: "Kline Center",
      },
    ],
  });
  ingestContextRecords({
    institutionId: "testu",
    observedAt: "2026-09-25T00:00:00.000Z",
    records: [
      {
        sourceId: "testu_livewhale",
        externalId: "a2",
        title: "Winter Robotics Competition",
        startAt: "2026-12-05T18:00:00.000Z",
        location: "Field House",
      },
    ],
  });

  const asOfEarly = campusEventsAsOf("testu", "2026-09-10T00:00:00.000Z");
  ok(asOfEarly.length === 1, `only the event we had already seen is visible, got ${asOfEarly.length}`);
  ok(/Employer/.test(asOfEarly[0].title), "and it is the right one");

  const asOfLate = campusEventsAsOf("testu", "2026-09-30T00:00:00.000Z");
  ok(asOfLate.length === 2, "both are visible once both have been observed");

  // The hard case: a past event we only learn about later.
  ingestContextRecords({
    institutionId: "testu",
    observedAt: "2026-11-20T00:00:00.000Z",
    records: [
      {
        sourceId: "testu_registrar",
        externalId: "b1",
        title: "Provost Announces Revised Space Reservation Policy",
        startAt: "2026-03-02T15:00:00.000Z",
        publishedAt: "2026-03-02T16:00:00.000Z",
      },
    ],
  });
  const backdated = campusEventsAsOf("testu", "2026-12-01T00:00:00.000Z").find((e) => /Provost/.test(e.title));
  ok(!!backdated, "the backdated announcement is stored");
  ok(backdated.canonical_type === "campus_policy_change", "and classified");
  ok(backdated.occurred_at === "2026-03-02T15:00:00.000Z", "occurred_at is March: it had already happened when we saw it");
  ok(backdated.observed_at === "2026-11-20T00:00:00.000Z", "observed_at is November: that is when we learned of it");
  ok(backdated.published_at === "2026-03-02T16:00:00.000Z", "published_at is the source's own clock, distinct from both");
  ok(backdated.occurred_at !== backdated.observed_at, "the three clocks are genuinely distinct for external data");
  ok(
    campusEventsAsOf("testu", "2026-06-01T00:00:00.000Z").every((e) => !/Provost/.test(e.title)),
    "and a question asked in June cannot see a fact we only learned in November, even though it happened in March",
  );
}

// ================================ 9. merging never destroys a source record

{
  const first = recordCampusEvent(
    {
      institutionId: "mergeu",
      canonicalType: "speaker_event",
      title: "Keynote: The State of Robotics",
      startAt: "2026-10-09T18:00:00.000Z",
      observedAt: "2026-09-01T00:00:00.000Z",
    },
    { sourceId: "m_src_a", externalRecordId: "1", matchMethod: "seed", matchConfidence: 1 },
  );
  const second = recordCampusEvent(
    {
      institutionId: "mergeu",
      canonicalType: "speaker_event",
      title: "Keynote on Robotics",
      startAt: "2026-10-09T18:00:00.000Z",
      observedAt: "2026-09-03T00:00:00.000Z",
    },
    { sourceId: "m_src_b", externalRecordId: "2", matchMethod: "seed", matchConfidence: 1 },
  );
  ok(first !== second, "two independently recorded rows start as two canonical events");

  mergeCanonical(second, first, "title_time_location", 0.88, "2026-09-04T00:00:00.000Z");
  ok(canonicalEvent(second) === null, "the emptied shell is gone");
  const links = eventSources(first);
  ok(links.length === 2, "but both source records survive the merge");
  ok(links.some((l) => l.source_id === "m_src_b" && l.match_confidence === 0.88), "the repointed record carries the merge's method and confidence");
  ok(
    db().prepare("SELECT COUNT(*) n FROM campus_event_sources WHERE source_id='m_src_b'").get().n === 1,
    "no source record was deleted by the cascade",
  );
  ok(canonicalEvent(first).observed_at === "2026-09-01T00:00:00.000Z", "the earliest observation survives the merge");
}

// ========================================================= 10. factors compute

{
  ok(CAMPUS_CONTEXT_FACTORS.length >= 3, "at least three campus factors are registered");
  const registry = campusContextRegistry();
  ok(registry.byEntity("campus").length === CAMPUS_CONTEXT_FACTORS.length, "all of them are campus-scoped");
  ok(
    CAMPUS_CONTEXT_FACTORS.every((f) => f.privacy === "public_context"),
    "campus context has no person in it",
  );
  ok(
    CAMPUS_CONTEXT_FACTORS.every((f) => f.availableAt.includes("observed_at")),
    "each states its point-in-time contract in terms of observed_at",
  );
  ok(mayUse(campusEventDensity, "planning").allowed, "density may drive planning");
  ok(!mayUse(campusEventDensity, "employer_evidence").allowed, "and may not reach an employer");

  // A night with plenty on.
  const asOf = "2026-10-01T12:00:00.000Z";
  ingestContextRecords({
    institutionId: "cornell",
    observedAt: OBSERVED,
    records: [
      { sourceId: "cornell_livewhale", externalId: "201", title: "Goldman Sachs Information Session", startAt: "2026-10-01T20:00:00.000Z", location: "Statler Auditorium" },
      { sourceId: "cornell_livewhale", externalId: "202", title: "BigRed Hackathon Kickoff", startAt: "2026-10-01T21:00:00.000Z", location: "Duffield Atrium" },
      { sourceId: "cornell_livewhale", externalId: "203", title: "Big Red Football vs Harvard", startAt: "2026-10-01T23:00:00.000Z", location: "Schoellkopf" },
      { sourceId: "cornell_livewhale", externalId: "204", title: "Guest Speaker: Ada Rivera on Climate Finance", startAt: "2026-10-01T22:00:00.000Z", location: "Uris Hall" },
      { sourceId: "cornell_livewhale", externalId: "205", title: "Alumni Reunion Brunch", startAt: "2026-10-01T15:00:00.000Z", location: "Willard Straight" },
    ],
  });

  const events = campusEventsAsOf("cornell", asOf);
  ok(events.length >= 7, `the canonical calendar has ${events.length} events as of the crawl`);

  const density = computeFactor(campusEventDensity, "cornell", { events }, asOf);
  ok(density.status === "ok", `density computes, status ${density.status}`);
  ok(density.value === 7, `seven events overlap the 24h window, got ${density.value}`);
  ok(density.drivers.length > 0, "with named contributions by canonical type");
  ok(/overlap this window/.test(density.reading), "and a sentence an officer can read");

  const employer = computeFactor(employerActivity, "cornell", { events }, asOf);
  ok(employer.status === "ok", `employer activity computes, status ${employer.status}`);
  ok(employer.value > 0 && employer.value < 1, `employer share is a proportion, got ${employer.value}`);
  ok(employer.basis.employerEvents === 2, "the career fair and the info session are the employer-facing pair");

  const competition = computeFactor(competitionActivity, "cornell", { events }, asOf);
  ok(competition.status === "ok", `competition activity computes, status ${competition.status}`);
  ok(competition.value === 1, `the hackathon is the only competitive thing on, got ${competition.value}`);
  ok(competitionActivity.expectedSign === null, "and its direction is declared unknown rather than guessed");

  // The refusals.
  const empty = computeFactor(campusEventDensity, "cornell", { events: [] }, asOf);
  ok(empty.status === "insufficient_data", "an empty feed refuses rather than reporting a quiet night");
  ok(empty.value === null, "and returns no number");
  ok(/at least 1 are needed/.test(empty.reading), "the registry's central refusal rule supplies the reason");
  ok(/missing data/i.test(campusEventDensity.explain(null, null)), "and the factor's own explanation says an empty feed is missing data, not a quiet night");

  const thin = computeFactor(employerActivity, "cornell", { events: events.slice(0, 2) }, asOf);
  ok(thin.status === "insufficient_data", "a two-event window cannot report a share");

  const missing = computeFactor(campusEventDensity, "cornell", {}, asOf);
  ok(missing.status === "missing_input", "a caller who forgets the events gets an error, not a zero");

  const quiet = computeFactor(campusEventDensity, "testu", { events: campusEventsAsOf("testu", asOf) }, asOf);
  ok(quiet.status === "ok" && quiet.value === 0, "a genuinely quiet night with a live feed reports zero");
}

console.log(`${checks} context-source-registry assertions passed.`);

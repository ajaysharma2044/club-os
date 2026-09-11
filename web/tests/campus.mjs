// Campus event ingestion, tested against a REAL captured Cornell payload
// (tests/fixtures/cornell-localist.json, pulled live from events.cornell.edu).
// Parsing is pure, so this needs no network and no database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/campus.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseLocalist,
  parseLiveWhale,
  competingEvents,
  quietestSlots,
  feedUrl,
  sourceFor,
  mayFetch,
  fetchableSources,
  fetchCampusEvents,
} from "../lib/cec/campus.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

// --- real payload ----------------------------------------------------------
const payload = JSON.parse(
  readFileSync(new URL("./fixtures/cornell-localist.json", import.meta.url), "utf8"),
);
const events = parseLocalist(payload, "cornell");
ok(events.length > 0, `parsed real Cornell events, got ${events.length}`);
ok(
  events.every((e) => typeof e.title === "string" && e.title.length > 0),
  "every event has a title",
);
ok(
  events.every((e) => !Number.isNaN(Date.parse(e.startsAt))),
  "every start time parses as a date",
);
ok(
  events.every((e) => e.startsAt.endsWith("Z")),
  "times are normalised to UTC ISO, not left in local offsets",
);
ok(
  new Set(events.map((e) => e.externalId)).size === events.length,
  "external ids are unique per instance",
);
ok(events.every((e) => e.source === "cornell"), "source is stamped");

// --- a recurring event must become one row PER INSTANCE --------------------
// Collapsing instances to the parent would undercount competing programming,
// which is the whole point of the feed.
{
  const many = {
    events: [
      {
        event: {
          id: 1,
          title: "Weekly seminar",
          event_instances: [
            { event_instance: { id: 11, start: "2026-09-15T19:00:00-04:00" } },
            { event_instance: { id: 12, start: "2026-09-22T19:00:00-04:00" } },
            { event_instance: { id: 13, start: "2026-09-29T19:00:00-04:00" } },
          ],
        },
      },
    ],
  };
  const parsed = parseLocalist(many);
  ok(parsed.length === 3, `3 instances -> 3 rows, got ${parsed.length}`);
  ok(new Set(parsed.map((p) => p.externalId)).size === 3, "each instance is distinct");
}

// --- malformed input must not throw ---------------------------------------
ok(parseLocalist(null).length === 0, "null payload yields nothing");
ok(parseLocalist({}).length === 0, "empty payload yields nothing");
ok(parseLocalist({ events: [{}, { event: null }] }).length === 0, "junk entries are skipped");
ok(
  parseLocalist({ events: [{ event: { id: 9, title: "No instances", event_instances: [] } }] })
    .length === 0,
  "an event with no instances occupies no slot",
);
ok(parseLiveWhale(null).length === 0, "LiveWhale handles null");
ok(
  parseLiveWhale([{ id: 1, title: "Talk", date_utc: "2026-09-15T23:00:00Z", location: "Statler" }])
    .length === 1,
  "LiveWhale parses a flat array",
);

// --- competing events: OVERLAP, not just start time -----------------------
const base = (startsAt, endsAt = null, extra = {}) => ({
  source: "t",
  externalId: Math.random().toString(36).slice(2),
  title: "x",
  startsAt,
  endsAt,
  locationName: "",
  url: "",
  tags: [],
  cancelled: false,
  ...extra,
});
{
  // A talk running 18:00-21:00 competes with a 19:00 meeting even though it
  // started first. Counting only start times inside the window would miss it.
  const overlapping = base("2026-09-15T22:00:00Z", "2026-09-16T01:00:00Z");
  const at = "2026-09-15T23:00:00Z";
  ok(
    competingEvents([overlapping], at, { windowHours: 0 }).count === 1,
    "an event already in progress competes",
  );
  const longFinished = base("2026-09-15T12:00:00Z", "2026-09-15T13:00:00Z");
  ok(
    competingEvents([longFinished], at, { windowHours: 0 }).count === 0,
    "an event that already ended does not compete",
  );
  const cancelled = base("2026-09-15T23:00:00Z", "2026-09-16T00:00:00Z", { cancelled: true });
  ok(
    competingEvents([cancelled], at, { windowHours: 0 }).count === 0,
    "a cancelled event does not compete",
  );
  const own = base("2026-09-15T23:00:00Z", null, { externalId: "mine" });
  ok(
    competingEvents([own], at, { excludeId: "mine" }).count === 0,
    "the club's own event is excluded from its own count",
  );
}

// --- the window widens the search, monotonically --------------------------
{
  const spread = [
    base("2026-09-15T20:00:00Z", "2026-09-15T21:00:00Z"),
    base("2026-09-15T23:00:00Z", "2026-09-16T00:00:00Z"),
    base("2026-09-16T04:00:00Z", "2026-09-16T05:00:00Z"),
  ];
  const at = "2026-09-15T23:00:00Z";
  const narrow = competingEvents(spread, at, { windowHours: 0 }).count;
  const wide = competingEvents(spread, at, { windowHours: 4 }).count;
  ok(wide >= narrow, `a wider window never finds fewer, ${narrow} -> ${wide}`);
  ok(narrow >= 1, "the concurrent event is always found");
  ok(
    competingEvents(spread, at).sample.length <= 5,
    "the sample is capped so a busy night does not dump the whole calendar",
  );
}

// --- quietest slots rank correctly ----------------------------------------
{
  const busyNight = Array.from({ length: 6 }, () =>
    base("2026-09-15T23:00:00Z", "2026-09-16T00:30:00Z"),
  );
  const ranked = quietestSlots(
    busyNight,
    ["2026-09-15T23:00:00Z", "2026-09-17T23:00:00Z"],
    { windowHours: 1 },
  );
  ok(ranked[0].competing <= ranked[1].competing, "sorted ascending by competition");
  ok(ranked[0].at === "2026-09-17T23:00:00Z", "the genuinely free night ranks first");
  ok(ranked[1].competing === 6, "the busy night reports all six");
}

// --- invalid time in, zero out rather than a crash ------------------------
ok(competingEvents([], "not-a-date").count === 0, "an unparseable time yields zero, not NaN");

// --- URL construction ------------------------------------------------------
const cornell = sourceFor("cornell");
ok(cornell !== null, "Cornell is a configured source");
ok(
  feedUrl(cornell, 7, 100, 1) === "https://events.cornell.edu/api/2/events?days=7&pp=100&page=1",
  "Localist feed URL matches the verified live endpoint",
);
ok(sourceFor("nowhere") === null, "an unknown campus is null, not a guess");
ok(
  feedUrl({ ...cornell, platform: "livewhale", base: "https://events.example.edu" }) ===
    "https://events.example.edu/live/json/events",
  "LiveWhale uses /live/json/events, NOT ?format=json which returns HTML",
);

// --- RSVP intent, where the platform publishes it -------------------------
{
  const wrapped = parseLiveWhale({
    meta: {}, data: [{ id: 5, title: "Wrapped shape", date_iso: "2026-09-15T23:00:00Z" }],
  });
  ok(wrapped.length === 1, "the wrapped LiveWhale shape parses");
  const bare = parseLiveWhale([
    {
      id: 7, title: "Success and Sundaes", date_iso: "2026-09-15T23:00:00Z",
      location_title: "Memorial Student Center", rsvp_total: 358, registration_limit: 400,
      is_canceled: false, event_types: ["Professional"],
    },
    { id: 8, title: "No registration", date_iso: "2026-09-15T23:00:00Z" },
    { id: 9, title: "Called off", date_iso: "2026-09-15T23:00:00Z", is_canceled: true },
  ]);
  ok(bare.length === 3, "the bare-array LiveWhale shape parses");
  ok(bare[0].rsvpTotal === 358, `rsvp_total is captured, got ${bare[0].rsvpTotal}`);
  ok(bare[0].registrationLimit === 400, "registration_limit is captured");
  ok(bare[0].locationName === "Memorial Student Center", "location_title is preferred");
  ok(
    bare[1].rsvpTotal === null,
    "an event without published RSVPs is null, never assumed zero",
  );
  ok(bare[2].cancelled === true, "is_canceled (one l) is honoured");
  ok(parseLocalist(payload)[0].rsvpTotal === null, "Localist publishes no RSVP counts");
}

// --- permission is separate from detection --------------------------------
// Yale's Localist API returns good JSON and Yale's robots.txt says Disallow: /.
// The endpoint responding is not consent.
{
  const yale = { key: "yale", label: "Yale", platform: "localist", base: "https://events.yale.edu", permission: "robots_disallowed" };
  ok(mayFetch(yale).allowed === false, "a disallowed host is not fetchable");
  ok(/not permission/i.test(mayFetch(yale).reason), `the reason says why: "${mayFetch(yale).reason}"`);
  ok(
    feedUrl(yale).includes("events.yale.edu"),
    "we can still construct and record its URL — detection is allowed, fetching is not",
  );
  const unreviewed = { ...yale, permission: "unreviewed" };
  ok(mayFetch(unreviewed).allowed === false, "unreviewed defaults to not fetchable");
  ok(mayFetch(cornell).allowed === true, "Cornell is reviewed and allowed");
  ok(
    fetchableSources().every((s) => mayFetch(s).allowed),
    "fetchableSources only returns hosts we may actually call",
  );
  let threw = false;
  try {
    await fetchCampusEvents(yale);
  } catch {
    threw = true;
  }
  ok(threw, "fetching a disallowed source throws rather than quietly proceeding");
}

console.log(`${checks} campus-ingest assertions passed.`);

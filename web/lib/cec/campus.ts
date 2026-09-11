// Campus event ingestion: what else is happening, and when.
//
// A club's turnout is not decided only by the club. The field evidence
// (docs/12 §1) has an officer watching a room fill badly against competing
// programming, and docs/14 §6c makes "competing events in a two-hour window"
// a feature of the attendance forecast. This module supplies that feature.
//
// Cornell publishes its whole campus calendar through Localist with no API key
// (verified live: https://events.cornell.edu/api/2/events?days=7&pp=100).
// Localist and LiveWhale between them cover a large share of US campuses, so
// the adapter is written against the PLATFORM rather than the school — adding
// a campus is a row of config, not a new scraper.
//
// Parsing is pure and separated from fetching so it can be tested against
// captured payloads without hitting the network.

export type CampusEvent = {
  source: string;
  externalId: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string | null;
  locationName: string;
  url: string;
  /** the campus's own categorisation, kept verbatim */
  tags: string[];
  /** true when the platform marks this as cancelled */
  cancelled: boolean;
  /**
   * Committed RSVPs, where the platform publishes them. LiveWhale exposes
   * `rsvp_total` and `registration_limit` publicly, which is a free
   * attendance-INTENT signal for other people's events — a far better weight
   * for competition than a raw headcount of listings. Null when unpublished,
   * which is most events; never assume zero.
   */
  rsvpTotal: number | null;
  registrationLimit: number | null;
};

export type CampusSource = {
  key: string;
  label: string;
  platform: "localist" | "livewhale";
  /** base URL of the calendar, no trailing slash */
  base: string;
  /**
   * Why we are allowed to fetch this. Detection and PERMISSION are separate
   * questions and must stay separate in code.
   *
   * Yale is the case that proves it: `events.yale.edu/api/2/events` returns
   * perfectly good Localist JSON, and Yale's robots.txt is `Disallow: /`. The
   * endpoint working is not consent. A source with `robots_disallowed` is
   * detected, recorded, and never fetched.
   */
  permission: "robots_allowed" | "robots_disallowed" | "partnership" | "unreviewed";
  /** when the permission basis was last checked */
  permissionCheckedAt?: string;
};

/** Verified working. Others are added here, not in code. */
export const CAMPUS_SOURCES: CampusSource[] = [
  {
    key: "cornell",
    label: "Cornell University",
    platform: "localist",
    base: "https://events.cornell.edu",
    // Localist's default robots.txt permits /api/ and affirmatively Allows
    // /calendar/ics. Verified in research/28.
    permission: "robots_allowed",
    permissionCheckedAt: "2026-09-11",
  },
];

/** Sources we may actually call. Everything else is detected but left alone. */
export function fetchableSources(): CampusSource[] {
  return CAMPUS_SOURCES.filter(
    (s) => s.permission === "robots_allowed" || s.permission === "partnership",
  );
}

export function mayFetch(s: CampusSource): { allowed: boolean; reason: string } {
  if (s.permission === "robots_disallowed")
    return {
      allowed: false,
      reason: `${s.label} asks crawlers not to fetch this host. The endpoint responding is not permission.`,
    };
  if (s.permission === "unreviewed")
    return {
      allowed: false,
      reason: `${s.label} has not had its robots.txt and terms reviewed yet.`,
    };
  return { allowed: true, reason: "" };
}

export function sourceFor(key: string): CampusSource | null {
  return CAMPUS_SOURCES.find((s) => s.key === key) || null;
}

export function feedUrl(s: CampusSource, days = 14, perPage = 100, page = 1) {
  if (s.platform === "localist")
    return `${s.base}/api/2/events?days=${days}&pp=${perPage}&page=${page}`;
  // NOT `?format=json` — that returns HTML. Verified live in research/28.
  return `${s.base}/live/json/events`;
}

// ------------------------------------------------------------------ parsing

const str = (v: unknown, max = 400) =>
  typeof v === "string" ? v.slice(0, max) : "";

/**
 * Localist returns one `event` per entry with an `event_instances` array —
 * a recurring event is ONE event with many instances. Each instance is its own
 * occupied slot on the calendar, so every instance becomes a row. Collapsing
 * them to the parent would undercount competing programming, which is the
 * entire point of this feed.
 */
export function parseLocalist(payload: any, source = "localist"): CampusEvent[] {
  const out: CampusEvent[] = [];
  const events = Array.isArray(payload?.events) ? payload.events : [];
  for (const wrapper of events) {
    const e = wrapper?.event;
    if (!e || typeof e !== "object") continue;
    const instances = Array.isArray(e.event_instances) ? e.event_instances : [];
    const tags = [
      ...(Array.isArray(e.tags) ? e.tags : []),
      ...(Array.isArray(e.filters?.event_types)
        ? e.filters.event_types.map((t: any) => t?.name)
        : []),
    ]
      .filter((t: unknown): t is string => typeof t === "string")
      .slice(0, 12);
    for (const wrap of instances) {
      const i = wrap?.event_instance;
      if (!i?.start) continue;
      out.push({
        source,
        externalId: String(i.id ?? `${e.id}:${i.start}`),
        title: str(e.title, 300),
        startsAt: new Date(i.start).toISOString(),
        endsAt: i.end ? new Date(i.end).toISOString() : null,
        locationName: str(e.location_name || e.location, 200),
        url: str(e.localist_url || e.url, 500),
        tags,
        // Localist marks cancellation on the event, not the instance.
        cancelled: e.status === "cancelled" || i.cancelled === true,
        // Localist does not publish RSVP counts.
        rsvpTotal: null,
        registrationLimit: null,
      });
    }
  }
  return out;
}

/**
 * LiveWhale ships two response shapes: a wrapped `{meta, links, data: [...]}`
 * and a bare array. Both are live on real campuses, so both are handled.
 * The bare shape returns the full field set including RSVP counts; the wrapped
 * one returns a lean default.
 */
export function parseLiveWhale(payload: any, source = "livewhale"): CampusEvent[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.events)
        ? payload.events
        : [];
  const num = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const out: CampusEvent[] = [];
  for (const e of rows) {
    const raw = e?.date_iso || e?.date_utc || e?.date;
    if (!raw) continue;
    const start = new Date(raw);
    if (!Number.isFinite(start.getTime())) continue;
    const endRaw = e.date2_iso || e.date2_utc;
    const tags = [
      ...(Array.isArray(e.tags) ? e.tags : []),
      ...(Array.isArray(e.event_types) ? e.event_types : []),
      ...(Array.isArray(e.event_types_audience) ? e.event_types_audience : []),
    ].filter((t: unknown): t is string => typeof t === "string");
    out.push({
      source,
      externalId: String(e.id ?? `${e.title}:${start.toISOString()}`),
      title: str(e.title, 300),
      startsAt: start.toISOString(),
      endsAt: endRaw && Number.isFinite(new Date(endRaw).getTime())
        ? new Date(endRaw).toISOString()
        : null,
      locationName: str(e.location_title || e.location, 200),
      url: str(e.url, 500),
      tags: tags.slice(0, 12),
      // LiveWhale spells it `is_canceled`.
      cancelled: e.is_canceled === true || e.is_canceled === "1" || e.status === "cancelled",
      rsvpTotal: num(e.rsvp_total),
      registrationLimit: num(e.registration_limit),
    });
  }
  return out;
}

export function parseFeed(platform: CampusSource["platform"], payload: any, source: string) {
  return platform === "localist"
    ? parseLocalist(payload, source)
    : parseLiveWhale(payload, source);
}

// ------------------------------------------------------- the actual feature

/**
 * How many other things are running against a proposed time.
 *
 * An event competes if it OVERLAPS the window, not merely if it starts inside
 * it — a talk running 6-9pm competes with a 7pm meeting even though it started
 * first. Cancelled events do not compete. The club's own event is excluded by
 * passing its external id.
 */
export function competingEvents(
  events: CampusEvent[],
  at: string,
  opts: { windowHours?: number; excludeId?: string; durationHours?: number } = {},
): { count: number; sample: CampusEvent[] } {
  const windowMs = (opts.windowHours ?? 2) * 3600e3;
  const durationMs = (opts.durationHours ?? 1.5) * 3600e3;
  const start = Date.parse(at);
  if (!Number.isFinite(start)) return { count: 0, sample: [] };
  // The proposed event's own footprint, widened by the window either side.
  const lo = start - windowMs;
  const hi = start + durationMs + windowMs;

  const hits = events.filter((e) => {
    if (e.cancelled) return false;
    if (opts.excludeId && e.externalId === opts.excludeId) return false;
    const s = Date.parse(e.startsAt);
    if (!Number.isFinite(s)) return false;
    const en = e.endsAt ? Date.parse(e.endsAt) : s + durationMs;
    return s < hi && en > lo; // interval overlap
  });
  return {
    count: hits.length,
    sample: hits
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, 5),
  };
}

/**
 * The quieter slots in a range, so an officer can be told WHERE to move an
 * event rather than only that the night they picked is bad.
 */
export function quietestSlots(
  events: CampusEvent[],
  candidates: string[],
  opts: { windowHours?: number; durationHours?: number } = {},
): { at: string; competing: number }[] {
  return candidates
    .map((at) => ({ at, competing: competingEvents(events, at, opts).count }))
    .sort((a, b) => a.competing - b.competing);
}

// ------------------------------------------------------------------ fetching

/**
 * Fetch a campus feed. Deliberately conservative: a short timeout, a single
 * page by default, an identifying user agent, and a hard cap on pages so a
 * misconfigured loop cannot hammer a university's calendar. These are public
 * .edu endpoints served without a key; the etiquette is ours to keep.
 */
export async function fetchCampusEvents(
  source: CampusSource,
  opts: { days?: number; perPage?: number; maxPages?: number; timeoutMs?: number } = {},
): Promise<CampusEvent[]> {
  const gate = mayFetch(source);
  if (!gate.allowed) throw new Error(gate.reason);
  const days = Math.min(Math.max(opts.days ?? 14, 1), 60);
  const perPage = Math.min(Math.max(opts.perPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(opts.maxPages ?? 1, 1), 5);
  const out: CampusEvent[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(feedUrl(source, days, perPage, page), {
      headers: {
        Accept: "application/json",
        "User-Agent": "ClubOS/1.0 (campus calendar ingest; contact via club officers)",
      },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) break;
    const payload = await res.json();
    const batch = parseFeed(source.platform, payload, source.key);
    out.push(...batch);
    if (batch.length < perPage) break; // last page
  }
  // One row per instance, deduped in case pages overlap.
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.source}:${e.externalId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

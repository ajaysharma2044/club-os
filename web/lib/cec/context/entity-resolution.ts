// Entity resolution for external context records. Pure functions, no database,
// no network, no clock beyond what the caller passes.
//
// Two feeds covering one campus will describe the same career fair twice, with
// different titles, different ids, and one of them missing the end time. Left
// alone that is a doubled `campus_event_density` and a model that thinks the
// night is twice as crowded as it is. Merged carelessly it is worse: two
// genuinely different things in the same building at the same hour collapsed
// into one, and no way to tell afterwards that it happened.
//
// The design follows from that asymmetry.
//
//   DETERMINISTIC FEATURES FIRST. The same source publishing the same external
//   id twice is one record, full stop. Two records sharing an event-level URL
//   are the same event. Neither of these is a similarity judgement, so neither
//   gets a similarity score — they return 1.0 and say which rule fired.
//
//   FUZZY MATCHES NEVER REACH CERTAINTY. A fuzzy score is capped below 1.0 even
//   when every feature agrees, because "identical title, identical minute,
//   identical room" is still an inference and the store should be able to tell
//   an inference from an identifier a year from now.
//
//   NOTHING MERGES SILENTLY BELOW THE THRESHOLD. Pairs between the review floor
//   and the merge threshold are RETURNED, not merged. A human or a later rule
//   decides. The alternative — nudging the threshold down until the counts look
//   right — is how a dedup layer starts inventing events.
//
// Every merge carries the method that produced it and the confidence it had, so
// `campus_event_sources` can record why two rows became one.

// ================================================================ candidates

export type ResolutionCandidate = {
  /** Caller's handle for this record, unique within the batch. */
  key: string;
  sourceId: string;
  externalId: string;
  title: string;
  /** ISO. Null when the source published no time; the time feature then abstains. */
  startAt: string | null;
  endAt?: string | null;
  location?: string;
  /** Hosting department, club or employer, where the feed names one. */
  organizer?: string;
  url?: string;
};

export const MATCH_METHODS = [
  /** Same source, same external id. The same record fetched twice. */
  "external_id",
  /** Same event-level URL across sources. */
  "url",
  /** Weighted title / time / location / organizer agreement. */
  "title_time_location",
  /** The first member of a cluster, matched against nothing. */
  "seed",
  "none",
] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export type MatchResult = {
  score: number;
  method: MatchMethod;
  reasons: string[];
};

/**
 * Stated once, here, so that "we merged at 0.82" is a fact about the system
 * rather than a number someone remembers typing.
 *
 * `merge` is where two records become one canonical row. `review` is where a
 * pair is surfaced to a human and left as two rows in the meantime. Below
 * `review` the pair is not mentioned again.
 */
export const MATCH_THRESHOLDS = {
  /** Deterministic identity. Only an id or a URL rule can reach it. */
  certain: 1,
  merge: 0.82,
  review: 0.62,
} as const;

/** A fuzzy match is an inference. It may be strong; it is never an identifier. */
const FUZZY_CEILING = 0.97;

/**
 * Two records whose starts are further apart than this are different events
 * however alike they read. A weekly meeting has the same title every week.
 */
const MAX_START_GAP_HOURS = 12;

/**
 * Below this much title agreement nothing else can rescue a pair. A lecture
 * hall runs six unrelated things a day in the same room; time and location
 * agreement between two differently-titled records is the NORMAL case on a
 * campus calendar, not evidence.
 */
const MIN_TITLE_SIMILARITY = 0.34;

// =============================================================== normalising

const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "at", "in", "on", "for", "to", "with",
  "presents", "presented", "by", "our", "your",
]);

/**
 * Reduce a title to the words that identify the event.
 *
 * A bare four-digit year is dropped: "Fall Career Fair 2026" and "Fall Career
 * Fair" are the same event, and the year is already carried by `startAt` far
 * more reliably than by the title. Status decorations ("CANCELLED:",
 * "[Virtual]", "POSTPONED -") are dropped too — they describe the listing, not
 * the event, and a cancelled listing is still the same event.
 */
export function normalizeTitle(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[\[(]\s*(virtual|online|in[- ]person|hybrid|cancell?ed|postponed|rescheduled)\s*[\])]/g, " ")
    .replace(/^\s*(cancell?ed|postponed|rescheduled|updated)\s*[:\-–—]\s*/g, " ")
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

export function titleTokens(raw: string): Set<string> {
  const n = normalizeTitle(raw);
  return new Set(n ? n.split(" ") : []);
}

/**
 * Jaccard over content words, with exact normalized equality short-circuited.
 *
 * Jaccard rather than edit distance because campus titles differ by ADDED
 * words ("Fall Career Fair" vs "Fall Career Fair — Engineering & Science"),
 * which edit distance punishes far more than the difference deserves.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union ? shared / union : 0;
}

/**
 * Strip a URL to the part that identifies a record.
 *
 * Tracking parameters and fragments are noise. A URL whose path is empty or "/"
 * is a calendar homepage, not a record identifier, and returns "" so that two
 * unrelated events both linking to events.example.edu are never declared the
 * same event by the deterministic rule.
 */
export function normalizeUrl(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    if (!path) return "";
    const host = u.host.replace(/^www\./, "").toLowerCase();
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !/^(utm_|fbclid|gclid|mc_|ref$)/i.test(k))
      .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return `${host}${path.toLowerCase()}${params ? "?" + params : ""}`;
  } catch {
    return "";
  }
}

export function normalizePlace(raw: string | undefined): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/\b(room|rm|hall|bldg|building|center|centre|floor|fl)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ============================================================== the features

/** 1 at the same minute, decaying to 0 at MAX_START_GAP_HOURS. Null when either side abstains. */
export function startProximity(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  const gapHours = Math.abs(ta - tb) / 3600e3;
  if (gapHours > MAX_START_GAP_HOURS) return 0;
  if (gapHours <= 1 / 12) return 1; // within five minutes
  return Math.max(0, 1 - gapHours / MAX_START_GAP_HOURS);
}

/** Fraction of the shorter interval that the two share. Null when either has no interval. */
export function intervalOverlap(
  a: { startAt: string | null; endAt?: string | null },
  b: { startAt: string | null; endAt?: string | null },
): number | null {
  if (!a.startAt || !b.startAt || !a.endAt || !b.endAt) return null;
  const [aStart, aEnd, bStart, bEnd] = [a.startAt, a.endAt, b.startAt, b.endAt].map((v) =>
    Date.parse(v as string),
  );
  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite) || aEnd <= aStart || bEnd <= bStart)
    return null;
  const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
  if (overlap <= 0) return 0;
  return overlap / Math.min(aEnd - aStart, bEnd - bStart);
}

/** Exact normalized match, containment, or nothing. Null when either side is blank. */
function placeAgreement(a: string | undefined, b: string | undefined): number | null {
  const na = normalizePlace(a);
  const nb = normalizePlace(b);
  if (!na || !nb) return null;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.75;
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = ta.size + tb.size - shared;
  return union ? shared / union : 0;
}

/**
 * Weights over the fuzzy features. They do not need to sum to 1 — a feature
 * that abstains has its weight removed from the denominator rather than scoring
 * zero, because "this feed publishes no room numbers" is not evidence that two
 * events are in different rooms.
 */
const WEIGHTS = { title: 0.5, time: 0.3, location: 0.1, organizer: 0.1 };

// ================================================================ the scorer

/**
 * How likely two records are to be the same event, and on what grounds.
 *
 * Deterministic rules are tried first and return immediately; there is no
 * blending of an identifier with a similarity. `reasons` is written to be read
 * by a person looking at a merge months later and asking why.
 */
export function matchScore(a: ResolutionCandidate, b: ResolutionCandidate): MatchResult {
  const reasons: string[] = [];

  // --- deterministic -------------------------------------------------------
  if (a.sourceId === b.sourceId && a.externalId && a.externalId === b.externalId)
    return {
      score: MATCH_THRESHOLDS.certain,
      method: "external_id",
      reasons: [`same source (${a.sourceId}) and same external id (${a.externalId})`],
    };

  const ua = normalizeUrl(a.url);
  const ub = normalizeUrl(b.url);
  if (ua && ua === ub)
    return {
      score: MATCH_THRESHOLDS.certain,
      method: "url",
      reasons: [`both records point at the same event URL (${ua})`],
    };

  // --- hard gates ----------------------------------------------------------
  const proximity = startProximity(a.startAt, b.startAt);
  if (proximity === 0)
    return {
      score: 0,
      method: "none",
      reasons: [`starts are more than ${MAX_START_GAP_HOURS}h apart; a repeating title is not a repeated event`],
    };

  const title = titleSimilarity(a.title, b.title);
  if (title < MIN_TITLE_SIMILARITY)
    return {
      score: 0,
      method: "none",
      reasons: [
        `titles agree on ${(title * 100).toFixed(0)}% of content words, below the ${(MIN_TITLE_SIMILARITY * 100).toFixed(0)}% floor`,
        "same room at the same hour is the normal case on a campus calendar, not evidence",
      ],
    };
  reasons.push(`titles agree on ${(title * 100).toFixed(0)}% of content words`);

  // --- weighted, with abstentions removed from the denominator -------------
  let num = WEIGHTS.title * title;
  let den = WEIGHTS.title;

  if (proximity === null) reasons.push("one record publishes no start time; time abstains");
  else {
    const overlap = intervalOverlap(a, b);
    // Proximity carries the judgement; overlap only confirms it when both sides
    // published an end time, which most feeds do not.
    const timeScore = overlap === null ? proximity : 0.7 * proximity + 0.3 * overlap;
    num += WEIGHTS.time * timeScore;
    den += WEIGHTS.time;
    reasons.push(
      overlap === null
        ? `starts are ${describeGap(a.startAt, b.startAt)} apart`
        : `starts are ${describeGap(a.startAt, b.startAt)} apart and the intervals overlap ${(overlap * 100).toFixed(0)}%`,
    );
  }

  const place = placeAgreement(a.location, b.location);
  if (place === null) reasons.push("one record publishes no location; location abstains");
  else {
    num += WEIGHTS.location * place;
    den += WEIGHTS.location;
    reasons.push(place === 1 ? "same location" : `locations agree ${(place * 100).toFixed(0)}%`);
  }

  const org = placeAgreement(a.organizer, b.organizer);
  if (org === null) reasons.push("one record names no organizer; organizer abstains");
  else {
    num += WEIGHTS.organizer * org;
    den += WEIGHTS.organizer;
    reasons.push(org === 1 ? "same organizer" : `organizers agree ${(org * 100).toFixed(0)}%`);
  }

  const score = den ? Math.min(FUZZY_CEILING, num / den) : 0;
  return {
    score,
    method: score >= MATCH_THRESHOLDS.review ? "title_time_location" : "none",
    reasons,
  };
}

function describeGap(a: string | null, b: string | null): string {
  if (!a || !b) return "an unknown interval";
  const minutes = Math.abs(Date.parse(a) - Date.parse(b)) / 60000;
  if (!Number.isFinite(minutes)) return "an unknown interval";
  if (minutes < 1) return "0 minutes";
  if (minutes < 90) return `${Math.round(minutes)} minutes`;
  return `${(minutes / 60).toFixed(1)} hours`;
}

// =============================================================== clustering

export type ResolvedMember = {
  key: string;
  sourceId: string;
  externalId: string;
  matchMethod: MatchMethod;
  matchConfidence: number;
  /** Which member of the cluster it matched against. Null for the seed. */
  matchedTo: string | null;
  reasons: string[];
};

export type ResolvedCluster = {
  /** The record whose fields the canonical row should take. */
  representative: ResolutionCandidate;
  members: ResolvedMember[];
};

export type ReviewPair = {
  a: string;
  b: string;
  score: number;
  method: MatchMethod;
  reasons: string[];
};

export type Resolution = {
  clusters: ResolvedCluster[];
  /** Scored between the review floor and the merge threshold. NOT merged. */
  review: ReviewPair[];
  threshold: number;
};

/**
 * Group candidates into canonical clusters.
 *
 * Union-find over pairs at or above the merge threshold, which means the
 * clusters are the TRANSITIVE closure: A~B and B~C puts C with A even if A and
 * C were never compared favourably. That is the right default for a feed where
 * the same event arrives with a short title from one source and a long one from
 * another, and it is also the failure mode to watch — one bad edge can chain
 * two clusters together. Each member therefore records the best edge that
 * actually justified its inclusion, so a chained merge is visible in the
 * provenance rather than hidden in it.
 *
 * O(n²) comparisons. At campus scale (a few hundred rows a night) that is
 * nothing; at ten thousand it would need blocking by day, which is a change to
 * the pair enumeration and not to the scoring.
 */
export function resolve(
  candidates: ResolutionCandidate[],
  opts: { threshold?: number; reviewFloor?: number } = {},
): Resolution {
  const threshold = opts.threshold ?? MATCH_THRESHOLDS.merge;
  const reviewFloor = opts.reviewFloor ?? MATCH_THRESHOLDS.review;
  const rows = candidates.filter((c) => c && c.key);

  const parent = new Map<string, string>();
  for (const c of rows) parent.set(c.key, c.key);
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(k) !== root) {
      const next = parent.get(k)!;
      parent.set(k, root);
      k = next;
    }
    return root;
  };

  type Edge = { a: string; b: string; score: number; method: MatchMethod; reasons: string[] };
  const edges: Edge[] = [];
  const review: ReviewPair[] = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const m = matchScore(rows[i], rows[j]);
      if (m.score >= threshold)
        edges.push({ a: rows[i].key, b: rows[j].key, score: m.score, method: m.method, reasons: m.reasons });
      else if (m.score >= reviewFloor)
        review.push({ a: rows[i].key, b: rows[j].key, score: m.score, method: m.method, reasons: m.reasons });
    }
  }

  // Strongest evidence first, so the edge recorded against a member is the best
  // one available rather than whichever happened to be enumerated first.
  edges.sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : 1));
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) parent.set(rb, ra);
  }

  const bestEdge = new Map<string, Edge>();
  for (const e of edges) {
    for (const [self, other] of [
      [e.a, e.b],
      [e.b, e.a],
    ] as const) {
      const current = bestEdge.get(self);
      if (!current || e.score > current.score)
        bestEdge.set(self, { ...e, a: self, b: other });
    }
  }

  const groups = new Map<string, ResolutionCandidate[]>();
  for (const c of rows) {
    const root = find(c.key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(c);
  }

  const clusters: ResolvedCluster[] = [];
  for (const members of groups.values()) {
    const representative = pickRepresentative(members);
    const seen = new Set<string>();
    const resolved: ResolvedMember[] = members.map((m) => {
      if (m.key === representative.key)
        return {
          key: m.key,
          sourceId: m.sourceId,
          externalId: m.externalId,
          matchMethod: "seed" as MatchMethod,
          matchConfidence: 1,
          matchedTo: null,
          reasons: ["first record of this event; the canonical row takes its fields"],
        };
      const edge = bestEdge.get(m.key);
      return {
        key: m.key,
        sourceId: m.sourceId,
        externalId: m.externalId,
        matchMethod: edge?.method ?? "none",
        matchConfidence: edge?.score ?? 0,
        matchedTo: edge?.b ?? null,
        reasons: edge?.reasons ?? ["merged transitively; no direct edge above the threshold"],
      };
    });
    for (const r of resolved) {
      const dupe = `${r.sourceId}:${r.externalId}`;
      if (seen.has(dupe)) r.reasons = [...r.reasons, "duplicate source record within the cluster"];
      seen.add(dupe);
    }
    clusters.push({ representative, members: resolved });
  }

  // Stable output: earliest start first, then key, so two runs over the same
  // batch produce the same clusters in the same order.
  clusters.sort((x, y) => {
    const sx = x.representative.startAt ?? "";
    const sy = y.representative.startAt ?? "";
    return sx < sy ? -1 : sx > sy ? 1 : x.representative.key < y.representative.key ? -1 : 1;
  });
  review.sort((x, y) => y.score - x.score);

  return { clusters, review, threshold };
}

/**
 * The record whose fields the canonical row takes: the most complete one.
 *
 * Completeness rather than recency, because the newest crawl is often the lean
 * wrapped payload while the fuller record came from the feed that publishes end
 * times and RSVP counts. Ties break on key so the choice is deterministic.
 */
function pickRepresentative(members: ResolutionCandidate[]): ResolutionCandidate {
  const completeness = (c: ResolutionCandidate) =>
    (c.startAt ? 2 : 0) +
    (c.endAt ? 1 : 0) +
    (normalizeUrl(c.url) ? 2 : 0) +
    (c.location ? 1 : 0) +
    (c.organizer ? 1 : 0) +
    Math.min(3, titleTokens(c.title).size / 4);
  return [...members].sort((a, b) => {
    const d = completeness(b) - completeness(a);
    return d !== 0 ? d : a.key < b.key ? -1 : 1;
  })[0];
}

/**
 * Would these two merge, and if not, why not — in one sentence, for a person.
 *
 * Exists because "the dedup did not fire" is the single most common question
 * about a resolution layer and the worst one to answer by reading scores.
 */
export function explainMatch(
  a: ResolutionCandidate,
  b: ResolutionCandidate,
  threshold = MATCH_THRESHOLDS.merge,
): string {
  const m = matchScore(a, b);
  if (m.score >= MATCH_THRESHOLDS.certain)
    return `Same record with certainty (${m.method}): ${m.reasons[0]}.`;
  if (m.score >= threshold)
    return `Merged at ${m.score.toFixed(2)} (${m.method}): ${m.reasons.join("; ")}.`;
  if (m.score >= MATCH_THRESHOLDS.review)
    return `Held for review at ${m.score.toFixed(2)}, below the ${threshold} merge threshold: ${m.reasons.join("; ")}.`;
  return `Kept apart at ${m.score.toFixed(2)}: ${m.reasons.join("; ")}.`;
}

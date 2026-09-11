// Canonical campus events: one row per real-world thing, however many feeds
// described it.
//
// ../campus.ts parses feeds into `CampusEvent`, which is a faithful copy of what
// one source said. This is the layer above: the institution's calendar as we
// believe it to be, with every source record that contributed still attached.
//
// THREE CLOCKS, AND THEY ARE NOT THE SAME CLOCK.
//
//   occurred_at  — when the thing happened in the world. Null for anything that
//                  has not happened yet, which is most of the calendar.
//   published_at — when the source put it on the internet.
//   observed_at  — when WE learned of it.
//
// Internal records collapse these because we are present at the moment the fact
// is created. External context cannot: a career fair is published in August,
// observed by our crawler in September, and occurs in October; a funding
// announcement occurred in March and is observed in November because that is
// when someone pointed us at the press release. A model trained on
// `observed_at = occurred_at` for external data is a model trained on
// information it did not have, and every backtest it produces is a lie about
// what was knowable.
//
// So `campusEventsAsOf()` filters on `observed_at <= asOf` and nothing else.
// A row about a March event we first saw in November is invisible to any
// question asked about September, which is exactly right.
//
// SOURCE RECORDS ARE NEVER DESTROYED. Merging two canonical events repoints
// `campus_event_sources` rows; it never deletes them. Every canonical row can
// be taken apart into the source records that built it, each stamped with the
// method and confidence that put it there. A dedup layer you cannot undo is a
// dedup layer you cannot trust.

import { db, fail, hash, id, timestamp } from "../db";
import type { CampusEvent } from "../campus";
import {
  defineFactor,
  FactorRegistry,
  type FactorDef,
  type FactorReading,
} from "../factors";
import {
  matchScore,
  normalizePlace,
  normalizeTitle,
  resolve,
  MATCH_THRESHOLDS,
  type MatchMethod,
  type ResolutionCandidate,
  type ReviewPair,
} from "./entity-resolution";
import { findSource, TRUST_CONFIDENCE, type TrustLevel } from "./sources";

// ================================================================= taxonomy

/**
 * What kind of thing this is, in OUR vocabulary rather than the source's.
 *
 * Localist says "Career Development"; LiveWhale says "Professional"; a
 * department page says nothing at all. The source's own words are kept verbatim
 * in `event_category`, because they are evidence and will be needed when a
 * classifier is retrained. `canonical_type` is what the rest of the system is
 * allowed to reason about.
 */
export const CANONICAL_TYPES = [
  "career_fair",
  "employer_event",
  "speaker_event",
  "club_event",
  "sports_event",
  "academic_deadline",
  "exam_period",
  "break",
  "grant_deadline",
  "competition",
  "hackathon",
  "research_opportunity",
  "entrepreneurship_program",
  "funding_announcement",
  "campus_policy_change",
  "alumni_event",
  "recruitment_period",
  "club_recruitment",
  "orientation",
  "graduation",
  /** Not a guess. The classifier says this when it does not know. */
  "unknown",
] as const;
export type CanonicalType = (typeof CANONICAL_TYPES)[number];

/** Types that compete for the same students an employer-facing club event wants. */
export const EMPLOYER_FACING: CanonicalType[] = [
  "career_fair",
  "employer_event",
  "recruitment_period",
];

/** Types that indicate a build-and-compete season rather than a talk season. */
export const COMPETITION_FACING: CanonicalType[] = [
  "competition",
  "hackathon",
  "grant_deadline",
  "entrepreneurship_program",
];

export type CanonicalEvent = {
  id: string;
  institution_id: string;
  canonical_type: CanonicalType;
  title: string;
  description: string;
  start_at: string | null;
  end_at: string | null;
  occurred_at: string | null;
  observed_at: string;
  published_at: string | null;
  location: string;
  audiences: string[];
  topics: string[];
  organizations: string[];
  career_categories: string[];
  event_category: string;
  url: string;
  source_confidence: number;
  source_hash: string;
  parser_version: string;
  created_at: string;
  updated_at: string;
};

export type EventSourceLink = {
  canonical_event_id: string;
  source_id: string;
  external_record_id: string;
  match_method: MatchMethod;
  match_confidence: number;
  matched_at: string;
  raw_title: string;
  raw_start_at: string | null;
  observed_at: string;
};

// =================================================================== schema

let ready = false;
export function campusEventsInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS campus_events(
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  canonical_type TEXT NOT NULL DEFAULT 'unknown',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_at TEXT,
  end_at TEXT,
  occurred_at TEXT,
  observed_at TEXT NOT NULL,
  published_at TEXT,
  location TEXT NOT NULL DEFAULT '',
  audiences TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  organizations TEXT NOT NULL DEFAULT '[]',
  career_categories TEXT NOT NULL DEFAULT '[]',
  event_category TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  source_confidence REAL NOT NULL DEFAULT 0.5,
  source_hash TEXT NOT NULL DEFAULT '',
  parser_version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS campus_event_pit ON campus_events(institution_id,observed_at);
CREATE INDEX IF NOT EXISTS campus_event_start ON campus_events(institution_id,start_at);
CREATE TABLE IF NOT EXISTS campus_event_sources(
  canonical_event_id TEXT NOT NULL REFERENCES campus_events(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  external_record_id TEXT NOT NULL,
  match_method TEXT NOT NULL,
  match_confidence REAL NOT NULL,
  matched_at TEXT NOT NULL,
  raw_title TEXT NOT NULL DEFAULT '',
  raw_start_at TEXT,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(source_id,external_record_id));
CREATE INDEX IF NOT EXISTS campus_event_src_canon ON campus_event_sources(canonical_event_id);
`);
  ready = true;
}

// ================================================================ classifier

type Rule = { type: CanonicalType; strong: RegExp[]; weak?: RegExp[] };

/**
 * Keyword rules, ordered for reading rather than precedence — precedence is
 * decided by the score, not by position.
 *
 * These are stated rather than learned because there is no labelled corpus and
 * inventing one by hand would produce a classifier that agrees with whoever
 * labelled it. When there are enough merged events with human corrections, this
 * becomes the baseline a model has to beat, and `classify` keeps its signature.
 */
const RULES: Rule[] = [
  {
    type: "career_fair",
    strong: [/\bcareer fair\b/, /\bjob fair\b/, /\binternship fair\b/, /\bcareer expo\b/],
  },
  {
    type: "employer_event",
    strong: [
      /\binfo ?session\b/,
      /\binformation session\b/,
      /\bemployer\b/,
      /\bon-?campus interview/,
      /\bcoffee chat\b/,
      /\bnetworking night\b/,
    ],
    weak: [/\brecruiter\b/, /\bindustry\b/],
  },
  {
    type: "speaker_event",
    strong: [
      /\bguest (speaker|lecture)\b/,
      /\bkeynote\b/,
      /\bfireside chat\b/,
      /\bpanel discussion\b/,
      /\bdistinguished lecture\b/,
      /\bcolloquium\b/,
    ],
    weak: [/\bseminar\b/, /\blecture\b/, /\btalk\b/, /\bpanel\b/],
  },
  {
    type: "club_event",
    strong: [/\bgeneral body meeting\b/, /\bgbm\b/, /\b(club|society) (meeting|social|night)\b/],
    weak: [/\bmeeting\b/, /\bsocial\b/],
  },
  {
    type: "sports_event",
    strong: [
      /\b(football|basketball|hockey|lacrosse|soccer|volleyball|baseball|softball|rowing|wrestling)\b/,
      /\bhome game\b/,
      /\btailgate\b/,
      /\bathletics\b/,
    ],
    weak: [/\bgame\b/, /\bmatch\b/, /\btournament\b/],
  },
  {
    type: "academic_deadline",
    strong: [
      /\badd ?\/? ?drop\b/,
      /\b(drop|withdrawal|registration|enrollment) deadline\b/,
      /\bdeadline to (add|drop|withdraw|enroll)\b/,
      /\bcourse enrollment\b/,
    ],
  },
  {
    type: "exam_period",
    strong: [/\bfinal exams?\b/, /\bprelim\b/, /\bmidterm\b/, /\bexam period\b/, /\bstudy days?\b/],
  },
  {
    type: "break",
    strong: [
      /\b(fall|spring|winter|summer|thanksgiving|february|april) break\b/,
      /\b(winter|spring|fall) recess\b/,
      /\bno classes\b/,
    ],
    weak: [/\bholiday\b/],
  },
  {
    type: "grant_deadline",
    strong: [
      /\b(grant|fellowship|scholarship) (deadline|application)\b/,
      /\bcall for proposals\b/,
      /\bfunding deadline\b/,
      /\brequest for proposals\b/,
    ],
    weak: [/\bapplications? due\b/],
  },
  {
    type: "competition",
    strong: [
      /\bcase competition\b/,
      /\bpitch (competition|contest|night)\b/,
      /\bbusiness plan competition\b/,
      /\bcompetition\b/,
      /\bcontest\b/,
    ],
    weak: [/\bchallenge\b/],
  },
  {
    type: "hackathon",
    strong: [/\bhackathon\b/, /\bmakeathon\b/, /\bdatathon\b/, /\bhack ?night\b/],
  },
  {
    type: "research_opportunity",
    strong: [
      /\bresearch (opportunity|opportunities|position|assistant|symposium)\b/,
      /\burop\b/,
      /\blab (opening|position)\b/,
      /\bundergraduate research\b/,
    ],
  },
  {
    type: "entrepreneurship_program",
    strong: [
      /\baccelerator\b/,
      /\bincubator\b/,
      /\bstartup (program|bootcamp|school)\b/,
      /\bventure (program|studio)\b/,
      /\bfounders? program\b/,
      /\bdemo day\b/,
      /\bpre-?seed program\b/,
    ],
  },
  {
    type: "funding_announcement",
    strong: [
      /\bseed round\b/,
      /\bseries [a-e]\b/,
      /\bfunding announcement\b/,
      /\braises \$/,
      /\bawarded \$/,
    ],
  },
  {
    type: "campus_policy_change",
    strong: [
      /\bpolicy (change|update|revision|announcement)\b/,
      // A policy announcement names the change before the noun far more often
      // than after it: "revised space reservation policy", "new guest policy".
      /\b(revised|updated|new|interim)\b[a-z ]{0,40}\bpolic(y|ies)\b/,
      /\bcode of conduct\b/,
      /\bguidelines? (update|change)\b/,
    ],
  },
  {
    type: "alumni_event",
    strong: [/\balumni\b/, /\balumnae\b/, /\breunion\b/, /\bhomecoming\b/],
  },
  {
    type: "recruitment_period",
    strong: [
      /\brecruit(ing|ment) (season|period|week|timeline)\b/,
      /\bon-?campus recruiting\b/,
      /\bfull-?time recruiting\b/,
    ],
  },
  {
    type: "club_recruitment",
    strong: [
      /\bclub ?fest\b/,
      /\b(activities|involvement|organization|club) fair\b/,
      /\brush (week|event)?\b/,
      /\bcallout\b/,
      /\brecruitment (info ?session|night)\b/,
    ],
    weak: [/\bapplications? open\b/, /\bnew members?\b/],
  },
  {
    type: "orientation",
    strong: [/\borientation\b/, /\bmove-?in\b/, /\bwelcome week\b/, /\bnew student\b/],
  },
  {
    type: "graduation",
    strong: [/\bcommencement\b/, /\bgraduation\b/, /\bconvocation\b/, /\bsenior week\b/],
  },
];

export type Classification = {
  type: CanonicalType;
  confidence: number;
  reasons: string[];
};

/**
 * Map a raw record onto a canonical type, or refuse.
 *
 * A strong pattern is worth 3 and a weak one 1, in the title and again in the
 * tags. The winner must score at least 3 — one strong hit — AND lead the runner
 * up by at least 2, so that a single weak keyword never decides and a genuine
 * tie never resolves. "Alumni Networking Night" hits `alumni_event` and
 * `employer_event` equally hard and comes back `unknown`, which is the honest
 * answer: it is both, and the caller should look at it.
 *
 * Returning `unknown` with a stated reason is a result. Guessing a type at 0.35
 * confidence and letting it into `campus_event_density` is not.
 */
export function classify(rec: { title?: string; tags?: string[]; description?: string }): Classification {
  const title = ` ${normalizeTitle(rec.title || "")} `;
  const tags = (rec.tags || []).map((t) => ` ${normalizeTitle(String(t))} `);
  if (!title.trim() && !tags.length)
    return { type: "unknown", confidence: 0, reasons: ["no title and no tags to read"] };

  const scored: { type: CanonicalType; score: number; reasons: string[] }[] = [];
  for (const rule of RULES) {
    let score = 0;
    const reasons: string[] = [];
    const hitIn = (pats: RegExp[], hay: string) => pats.find((p) => p.test(hay));

    const titleStrong = hitIn(rule.strong, title);
    if (titleStrong) {
      score += 3;
      reasons.push(`title matches ${titleStrong.source}`);
    }
    const tagStrong = tags.map((t) => hitIn(rule.strong, t)).find(Boolean);
    if (tagStrong) {
      score += 3;
      reasons.push(`a source tag matches ${tagStrong.source}`);
    }
    if (rule.weak) {
      if (hitIn(rule.weak, title)) {
        score += 1;
        reasons.push("title carries a weak keyword");
      }
      if (tags.map((t) => hitIn(rule.weak!, t)).find(Boolean)) {
        score += 1;
        reasons.push("a source tag carries a weak keyword");
      }
    }
    if (score > 0) scored.push({ type: rule.type, score, reasons });
  }

  if (!scored.length)
    return { type: "unknown", confidence: 0, reasons: ["no rule matched the title or the tags"] };

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const runnerUp = scored[1];

  if (best.score < 3)
    return {
      type: "unknown",
      confidence: 0,
      reasons: [
        `the strongest candidate was ${best.type} on weak keywords alone`,
        "a weak keyword is not a classification",
      ],
    };
  if (runnerUp && best.score - runnerUp.score < 2)
    return {
      type: "unknown",
      confidence: 0,
      reasons: [
        `${best.type} and ${runnerUp.type} matched equally hard`,
        "an ambiguous record is reported as ambiguous, not resolved by rule order",
      ],
    };

  const confidence = best.score >= 6 ? 0.9 : best.score >= 4 ? 0.8 : 0.7;
  return { type: best.type, confidence, reasons: best.reasons };
}

// ============================================================== ingest types

export type IngestRecord = {
  sourceId: string;
  externalId: string;
  title: string;
  description?: string;
  startAt?: string | null;
  endAt?: string | null;
  publishedAt?: string | null;
  location?: string;
  organizer?: string;
  url?: string;
  /** The source's own categorisation, kept verbatim. */
  tags?: string[];
  audiences?: string[];
  topics?: string[];
  organizations?: string[];
  careerCategories?: string[];
  eventCategory?: string;
  /** Overrides the source's registered trust level, when the caller knows better. */
  sourceConfidence?: number;
  /** Overrides the classifier, for a human correction. */
  canonicalType?: CanonicalType;
};

/** Adapt ../campus.ts's parser output without re-stating its field names. */
export function fromCampusEvent(e: CampusEvent, sourceId = e.source): IngestRecord {
  return {
    sourceId,
    externalId: e.externalId,
    title: e.title,
    startAt: e.startsAt,
    endAt: e.endsAt,
    location: e.locationName,
    url: e.url,
    tags: e.tags,
    // The platform's categorisation is an audience/topic mix we do not try to
    // split apart here; it is kept whole so nothing is invented.
    eventCategory: e.tags.slice(0, 3).join(", "),
    description: e.cancelled ? "Cancelled by the source." : "",
  };
}

export type CanonicalDraft = {
  institutionId: string;
  canonicalType: CanonicalType;
  title: string;
  description?: string;
  startAt?: string | null;
  endAt?: string | null;
  publishedAt?: string | null;
  /** REQUIRED. The crawl clock, not `Date.now()` inside the writer. */
  observedAt: string;
  location?: string;
  audiences?: string[];
  topics?: string[];
  organizations?: string[];
  careerCategories?: string[];
  eventCategory?: string;
  url?: string;
  sourceConfidence?: number;
  parserVersion?: string;
};

export type Provenance = {
  sourceId: string;
  externalRecordId: string;
  matchMethod: MatchMethod;
  matchConfidence: number;
  /** Merge into this canonical row instead of creating one. */
  canonicalEventId?: string;
  matchedAt?: string;
};

const jsonList = (v: unknown): string =>
  JSON.stringify(Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 24) : []);

const parseList = (v: unknown): string[] => {
  try {
    const out = JSON.parse(String(v || "[]"));
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
};

function hydrate(row: any): CanonicalEvent {
  return {
    ...row,
    audiences: parseList(row.audiences),
    topics: parseList(row.topics),
    organizations: parseList(row.organizations),
    career_categories: parseList(row.career_categories),
  } as CanonicalEvent;
}

/**
 * A stable fingerprint of what makes this event this event.
 *
 * Not a dedup key — entity resolution does that, and it is a judgement. This is
 * a change detector: if a re-crawl produces the same hash, nothing that matters
 * moved and the row does not need rewriting.
 */
export function sourceHash(d: {
  institutionId: string;
  title: string;
  startAt?: string | null;
  location?: string;
}): string {
  return hash(
    [d.institutionId, normalizeTitle(d.title), d.startAt || "", normalizePlace(d.location)].join("|"),
  );
}

/**
 * Did this event already happen, as far as we know?
 *
 * `occurred_at` is only filled in when the start is at or before the moment we
 * observed the record — we saw something that had already taken place. A future
 * event has NOT occurred and gets null, and it stays null unless a later crawl
 * re-observes it after the fact. Deriving `occurred_at` from `start_at` alone
 * would hand a backtest the outcome of every event it was supposed to predict.
 */
function deriveOccurredAt(startAt: string | null | undefined, observedAt: string): string | null {
  if (!startAt) return null;
  const s = Date.parse(startAt);
  const o = Date.parse(observedAt);
  if (!Number.isFinite(s) || !Number.isFinite(o)) return null;
  return s <= o ? startAt : null;
}

// ================================================================== writing

/**
 * Write one source record into the canonical store.
 *
 * The link row is keyed on (source_id, external_record_id), so re-crawling a
 * record UPDATES where it points rather than adding a second row. Repointing is
 * the only way a source record ever moves; there is no path in this module that
 * deletes one.
 */
export function recordCampusEvent(draft: CanonicalDraft, p: Provenance): string {
  campusEventsInit();
  if (!draft.institutionId?.trim()) fail("A canonical event needs an institution_id.");
  if (!draft.title?.trim()) fail("A canonical event needs a title.");
  if (!draft.observedAt?.trim()) fail("A canonical event needs observed_at: when WE learned of it.");
  if (!CANONICAL_TYPES.includes(draft.canonicalType)) fail("Unknown canonical_type.");

  const now = timestamp();
  const matchedAt = p.matchedAt || now;
  const existingLink = db()
    .prepare(
      "SELECT canonical_event_id FROM campus_event_sources WHERE source_id=? AND external_record_id=?",
    )
    .get(p.sourceId, p.externalRecordId) as { canonical_event_id: string } | undefined;

  const targetId = existingLink?.canonical_event_id || p.canonicalEventId || id();
  const current = db()
    .prepare("SELECT * FROM campus_events WHERE id=?")
    .get(targetId) as any | undefined;

  const confidence = clamp01(draft.sourceConfidence ?? 0.5);
  const fingerprint = sourceHash({
    institutionId: draft.institutionId,
    title: draft.title,
    startAt: draft.startAt,
    location: draft.location,
  });

  if (!current) {
    db()
      .prepare(
        `INSERT INTO campus_events(id,institution_id,canonical_type,title,description,start_at,end_at,occurred_at,observed_at,published_at,location,audiences,topics,organizations,career_categories,event_category,url,source_confidence,source_hash,parser_version,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        targetId,
        draft.institutionId,
        draft.canonicalType,
        draft.title.slice(0, 400),
        (draft.description || "").slice(0, 4000),
        draft.startAt || null,
        draft.endAt || null,
        deriveOccurredAt(draft.startAt, draft.observedAt),
        draft.observedAt,
        draft.publishedAt || null,
        (draft.location || "").slice(0, 300),
        jsonList(draft.audiences),
        jsonList(draft.topics),
        jsonList(draft.organizations),
        jsonList(draft.careerCategories),
        (draft.eventCategory || "").slice(0, 300),
        (draft.url || "").slice(0, 600),
        confidence,
        fingerprint,
        draft.parserVersion || "1.0.0",
        now,
        now,
      );
  } else {
    // A more confident source overwrites the descriptive fields; a less
    // confident one only fills blanks. Otherwise the last crawl to run wins,
    // which makes the canonical row a function of cron order.
    const better = confidence >= Number(current.source_confidence ?? 0);
    const keep = <T>(incoming: T, existing: T, blank: T): T =>
      better && incoming !== blank && incoming !== null && incoming !== undefined
        ? incoming
        : existing === blank || existing === null || existing === undefined
          ? incoming
          : existing;

    // observed_at only ever moves BACKWARDS. It is the first moment this event
    // was knowable to us, and a later crawl cannot make it later.
    const observed =
      draft.observedAt < String(current.observed_at) ? draft.observedAt : String(current.observed_at);
    const startAt = keep(draft.startAt || null, current.start_at, null);

    db()
      .prepare(
        `UPDATE campus_events SET
           canonical_type=?, title=?, description=?, start_at=?, end_at=?, occurred_at=?,
           observed_at=?, published_at=?, location=?, audiences=?, topics=?, organizations=?,
           career_categories=?, event_category=?, url=?, source_confidence=?, source_hash=?,
           parser_version=?, updated_at=?
         WHERE id=?`,
      )
      .run(
        draft.canonicalType !== "unknown" && (better || current.canonical_type === "unknown")
          ? draft.canonicalType
          : current.canonical_type,
        keep(draft.title.slice(0, 400), current.title, ""),
        keep((draft.description || "").slice(0, 4000), current.description, ""),
        startAt,
        keep(draft.endAt || null, current.end_at, null),
        deriveOccurredAt(startAt, observed),
        observed,
        keep(draft.publishedAt || null, current.published_at, null),
        keep((draft.location || "").slice(0, 300), current.location, ""),
        better && draft.audiences?.length ? jsonList(draft.audiences) : current.audiences,
        better && draft.topics?.length ? jsonList(draft.topics) : current.topics,
        better && draft.organizations?.length ? jsonList(draft.organizations) : current.organizations,
        better && draft.careerCategories?.length
          ? jsonList(draft.careerCategories)
          : current.career_categories,
        keep((draft.eventCategory || "").slice(0, 300), current.event_category, ""),
        keep((draft.url || "").slice(0, 600), current.url, ""),
        Math.max(confidence, Number(current.source_confidence ?? 0)),
        fingerprint,
        draft.parserVersion || current.parser_version,
        now,
        targetId,
      );
  }

  db()
    .prepare(
      `INSERT INTO campus_event_sources(canonical_event_id,source_id,external_record_id,match_method,match_confidence,matched_at,raw_title,raw_start_at,observed_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(source_id,external_record_id) DO UPDATE SET
         canonical_event_id=excluded.canonical_event_id,
         match_method=excluded.match_method,
         match_confidence=excluded.match_confidence,
         matched_at=excluded.matched_at,
         raw_title=excluded.raw_title,
         raw_start_at=excluded.raw_start_at`,
    )
    .run(
      targetId,
      p.sourceId,
      p.externalRecordId,
      p.matchMethod,
      clamp01(p.matchConfidence),
      matchedAt,
      draft.title.slice(0, 400),
      draft.startAt || null,
      draft.observedAt,
    );

  return targetId;
}

/**
 * Fold one canonical row into another.
 *
 * Provenance is repointed FIRST, then the emptied shell is deleted. The order
 * is load-bearing: `campus_event_sources` cascades on delete, so removing the
 * loser before its links move would destroy the source records, which is the
 * one thing this module promises never to do. After the repoint the shell holds
 * no observation of its own — every fact about the event lives in the links.
 *
 * The store is not bitemporal: a merge is not itself point-in-time queryable,
 * so a backtest replayed across a merge sees today's grouping of yesterday's
 * events. Stated because it is a real limitation, not because it is fine.
 */
export function mergeCanonical(
  loserId: string,
  winnerId: string,
  method: MatchMethod,
  confidence: number,
  at = timestamp(),
): void {
  campusEventsInit();
  if (loserId === winnerId) return;
  const winner = db().prepare("SELECT id FROM campus_events WHERE id=?").get(winnerId);
  if (!winner) fail("Cannot merge into a canonical event that does not exist.", 404);
  db()
    .prepare(
      "UPDATE campus_event_sources SET canonical_event_id=?, match_method=?, match_confidence=?, matched_at=? WHERE canonical_event_id=?",
    )
    .run(winnerId, method, clamp01(confidence), at, loserId);
  // The loser's earliest observation must survive the merge, or a point-in-time
  // query loses an event it used to be able to see.
  const loser = db()
    .prepare("SELECT observed_at FROM campus_events WHERE id=?")
    .get(loserId) as { observed_at: string } | undefined;
  if (loser)
    db()
      .prepare("UPDATE campus_events SET observed_at=MIN(observed_at,?), updated_at=? WHERE id=?")
      .run(loser.observed_at, at, winnerId);
  db().prepare("DELETE FROM campus_events WHERE id=?").run(loserId);
}

function clamp01(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

// ================================================================== reading

/**
 * The institution's calendar as it was knowable at `asOf`.
 *
 * `observed_at <= asOf` is the whole contract. Nothing else in this function is
 * allowed to reintroduce a fact we had not yet learned, which is why the start
 * window is optional and the observation filter is not.
 */
export function campusEventsAsOf(
  institutionId: string,
  asOf: string,
  opts: { from?: string; to?: string; types?: CanonicalType[]; limit?: number } = {},
): CanonicalEvent[] {
  campusEventsInit();
  const where = ["institution_id=?", "observed_at<=?"];
  const args: (string | number)[] = [institutionId, asOf];
  if (opts.from) {
    where.push("(start_at IS NULL OR start_at>=?)");
    args.push(opts.from);
  }
  if (opts.to) {
    where.push("(start_at IS NULL OR start_at<=?)");
    args.push(opts.to);
  }
  if (opts.types?.length) {
    where.push(`canonical_type IN (${opts.types.map(() => "?").join(",")})`);
    args.push(...opts.types);
  }
  args.push(Math.min(Math.max(opts.limit ?? 2000, 1), 20000));
  const rows = db()
    .prepare(
      `SELECT * FROM campus_events WHERE ${where.join(" AND ")} ORDER BY start_at, id LIMIT ?`,
    )
    .all(...args) as any[];
  return rows.map(hydrate);
}

export function canonicalEvent(eventId: string): CanonicalEvent | null {
  campusEventsInit();
  const row = db().prepare("SELECT * FROM campus_events WHERE id=?").get(eventId) as any;
  return row ? hydrate(row) : null;
}

/** Every source record behind one canonical event, with how it got there. */
export function eventSources(eventId: string): EventSourceLink[] {
  campusEventsInit();
  return db()
    .prepare(
      "SELECT * FROM campus_event_sources WHERE canonical_event_id=? ORDER BY matched_at, source_id",
    )
    .all(eventId) as EventSourceLink[];
}

/** Which canonical event a source record ended up in. Null when never ingested. */
export function canonicalFor(sourceId: string, externalRecordId: string): string | null {
  campusEventsInit();
  const row = db()
    .prepare(
      "SELECT canonical_event_id FROM campus_event_sources WHERE source_id=? AND external_record_id=?",
    )
    .get(sourceId, externalRecordId) as { canonical_event_id: string } | undefined;
  return row?.canonical_event_id ?? null;
}

// =================================================================== ingest

const CANONICAL_KEY = "__canonical__";

export type IngestResult = {
  canonicalIds: string[];
  created: number;
  linked: number;
  merged: number;
  /** Pairs that scored below the merge threshold and were left as separate rows. */
  review: ReviewPair[];
  unclassified: number;
};

/**
 * Ingest a batch of source records: resolve, then write.
 *
 * Stored canonical events that start near an incoming record are pulled into
 * the resolution batch as candidates. Without that, dedup would only ever work
 * within one crawl, and the same event arriving tomorrow under a new external
 * id would become a second row — which is the failure this layer exists to
 * prevent, showing up one day later.
 *
 * `observedAt` is the caller's crawl clock and is required. The writer never
 * calls `Date.now()` for it, because a backfill replaying an August crawl must
 * be able to say so.
 */
export function ingestContextRecords(input: {
  institutionId: string;
  observedAt: string;
  records: IngestRecord[];
  threshold?: number;
  parserVersion?: string;
}): IngestResult {
  campusEventsInit();
  if (!input.institutionId?.trim()) fail("Ingest needs an institution_id.");
  if (!input.observedAt?.trim()) fail("Ingest needs observedAt: when this crawl happened.");
  const threshold = input.threshold ?? MATCH_THRESHOLDS.merge;

  const byKey = new Map<string, IngestRecord>();
  const candidates: ResolutionCandidate[] = [];
  for (const r of input.records) {
    if (!r?.sourceId || !r?.externalId || !r?.title?.trim()) continue;
    const key = `${r.sourceId}:${r.externalId}`;
    byKey.set(key, r);
    candidates.push({
      key,
      sourceId: r.sourceId,
      externalId: r.externalId,
      title: r.title,
      startAt: r.startAt ?? null,
      endAt: r.endAt ?? null,
      location: r.location,
      organizer: r.organizer,
      url: r.url,
    });
  }

  for (const stored of neighbours(input.institutionId, candidates, input.observedAt))
    candidates.push(stored);

  const resolution = resolve(candidates, { threshold });
  const out: IngestResult = {
    canonicalIds: [],
    created: 0,
    linked: 0,
    merged: 0,
    review: resolution.review,
    unclassified: 0,
  };

  for (const cluster of resolution.clusters) {
    const incoming = cluster.members.filter((m) => m.sourceId !== CANONICAL_KEY);
    const stored = cluster.members.filter((m) => m.sourceId === CANONICAL_KEY);
    if (!incoming.length) continue; // a stored event nothing in this batch touched

    // The oldest stored canonical wins; anything else in the cluster folds into
    // it. Oldest, so an event's id is stable from the first day we saw it.
    const storedIds = stored
      .map((s) => canonicalEvent(s.externalId))
      .filter((e): e is CanonicalEvent => !!e)
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    let targetId = storedIds[0]?.id;
    for (const extra of storedIds.slice(1)) {
      const edge = stored.find((s) => s.externalId === extra.id);
      mergeCanonical(
        extra.id,
        targetId!,
        edge?.matchMethod ?? "title_time_location",
        edge?.matchConfidence ?? threshold,
        input.observedAt,
      );
      out.merged++;
    }

    // Classify from whichever member's words are clearest. A second source's
    // tags routinely carry the category the first source's title does not.
    const classification = bestClassification(incoming.map((m) => byKey.get(m.key)!));
    if (classification.type === "unknown") out.unclassified++;

    // The representative writes the canonical row first, so the surviving
    // fields are the most complete ones rather than the first ones enumerated.
    const ordered = [...incoming].sort((a, b) =>
      a.key === cluster.representative.key ? -1 : b.key === cluster.representative.key ? 1 : 0,
    );

    for (const member of ordered) {
      const rec = byKey.get(member.key)!;
      const before = targetId;
      targetId = recordCampusEvent(
        draftOf(rec, input.institutionId, input.observedAt, classification, input.parserVersion),
        {
          sourceId: rec.sourceId,
          externalRecordId: rec.externalId,
          matchMethod: member.matchMethod,
          matchConfidence: member.matchConfidence,
          canonicalEventId: targetId,
          matchedAt: input.observedAt,
        },
      );
      if (!before) out.created++;
      else out.linked++;
    }
    if (targetId) out.canonicalIds.push(targetId);
  }

  return out;
}

/**
 * Stored canonical events close enough in time to be worth comparing against.
 *
 * The window is the same 12 hours the scorer refuses to look past, so nothing
 * that could have matched is left out of the batch, and nothing that could not
 * is loaded.
 */
function neighbours(
  institutionId: string,
  incoming: ResolutionCandidate[],
  observedAt: string,
): ResolutionCandidate[] {
  const starts = incoming.map((c) => (c.startAt ? Date.parse(c.startAt) : NaN)).filter(Number.isFinite);
  if (!starts.length) return [];
  const pad = 12 * 3600e3;
  const from = new Date(Math.min(...starts) - pad).toISOString();
  const to = new Date(Math.max(...starts) + pad).toISOString();
  return campusEventsAsOf(institutionId, observedAt, { from, to }).map((e) => ({
    key: `${CANONICAL_KEY}:${e.id}`,
    sourceId: CANONICAL_KEY,
    externalId: e.id,
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
    location: e.location,
    url: e.url,
  }));
}

function bestClassification(records: IngestRecord[]): Classification {
  let best: Classification = { type: "unknown", confidence: 0, reasons: ["nothing classified"] };
  for (const r of records) {
    if (r.canonicalType)
      return { type: r.canonicalType, confidence: 1, reasons: ["set explicitly by the caller"] };
    const c = classify({ title: r.title, tags: r.tags, description: r.description });
    if (c.type !== "unknown" && c.confidence > best.confidence) best = c;
  }
  return best;
}

function draftOf(
  rec: IngestRecord,
  institutionId: string,
  observedAt: string,
  classification: Classification,
  parserVersion?: string,
): CanonicalDraft {
  return {
    institutionId,
    canonicalType: classification.type,
    title: rec.title,
    description: rec.description,
    startAt: rec.startAt ?? null,
    endAt: rec.endAt ?? null,
    publishedAt: rec.publishedAt ?? null,
    observedAt,
    location: rec.location,
    audiences: rec.audiences,
    topics: rec.topics,
    organizations: rec.organizations ?? (rec.organizer ? [rec.organizer] : []),
    careerCategories: rec.careerCategories,
    eventCategory: rec.eventCategory,
    url: rec.url,
    sourceConfidence: rec.sourceConfidence ?? confidenceOf(rec.sourceId),
    parserVersion,
  };
}

/**
 * What a record from this source is worth, taken from the registry rather than
 * from the record. An unregistered source is not trusted at the default — it is
 * trusted less, because nobody has said where it came from.
 */
function confidenceOf(sourceId: string): number {
  const row = findSource(sourceId);
  if (!row) return 0.4;
  return TRUST_CONFIDENCE[row.trust_level as TrustLevel] ?? 0.5;
}

/** Would these two records merge? Exposed for operators staring at a duplicate. */
export function wouldMerge(a: ResolutionCandidate, b: ResolutionCandidate) {
  return matchScore(a, b);
}

// ================================================================== factors

export type CampusContextInput = {
  /** Point-in-time rows, i.e. the output of `campusEventsAsOf`. */
  events: CanonicalEvent[];
  /** How far forward from `asOf` to look. Defaults to a day. */
  windowHours?: number;
};

const DEFAULT_DURATION_MS = 1.5 * 3600e3;

function inWindow(events: CanonicalEvent[], asOf: string, windowHours: number): CanonicalEvent[] {
  const lo = Date.parse(asOf);
  if (!Number.isFinite(lo)) return [];
  const hi = lo + windowHours * 3600e3;
  return events.filter((e) => {
    if (!e.start_at) return false;
    const s = Date.parse(e.start_at);
    if (!Number.isFinite(s)) return false;
    const end = e.end_at ? Date.parse(e.end_at) : s + DEFAULT_DURATION_MS;
    return s < hi && end > lo; // interval overlap, same rule as campus.ts
  });
}

function typeDrivers(events: CanonicalEvent[]) {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.canonical_type, (counts.get(e.canonical_type) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, contribution]) => ({ label, contribution }));
}

/**
 * How much else is running.
 *
 * `n` is the size of the WHOLE feed, not the window, and the minimum is 1. An
 * empty feed means the crawler did not run, not that campus is quiet, and the
 * difference between those two readings is the difference between "move your
 * event" and "we have no idea". See `staleSources` in ./sources.ts.
 */
export const campusEventDensity = defineFactor<CampusContextInput>({
  id: "campus_event_density",
  name: "Campus event density",
  description:
    "Canonical campus events overlapping the window that opens at asOf, from every ingested source.",
  entity: "campus",
  valueType: "count",
  hypothesis:
    "Turnout falls as the number of other campus events overlapping the same hours rises; two otherwise identical Tuesdays differing only in competing programming should differ in attendance, and if they do not, this factor is worthless.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  minimumSampleSize: 1,
  halfLifeDays: null,
  sources: ["campus_events"],
  availableAt:
    "Rows with observed_at <= asOf only. Campus calendars publish ahead of time, so a future event is usually knowable, but only once a crawl has actually seen it — never at its start_at.",
  version: "1.0.0",
  status: "experimental",
  requires: ["events"],
  compute: (input, asOf): FactorReading | null => {
    const events = input.events || [];
    const window = inWindow(events, asOf, input.windowHours ?? 24);
    return {
      value: window.length,
      n: events.length,
      drivers: typeDrivers(window),
      basis: { windowHours: input.windowHours ?? 24, feedSize: events.length },
    };
  },
  explain: (value, reading) =>
    value === null
      ? "No campus events have been ingested for this window, so nothing can be said about how crowded it is. An empty feed is missing data, not a quiet night."
      : `${value} other campus event${value === 1 ? "" : "s"} overlap this window` +
        (reading?.drivers?.length ? `, mostly ${reading.drivers[0].label.replace(/_/g, " ")}.` : "."),
});

/**
 * How much of the window is employers.
 *
 * Separate from raw density because employer programming competes differently:
 * it takes the same students a professional club wants, at the same hours, with
 * an attendance incentive a club meeting cannot match.
 */
export const employerActivity = defineFactor<CampusContextInput>({
  id: "employer_activity",
  name: "Employer activity",
  description:
    "Share of campus events in the window that are employer-facing: career fairs, info sessions, on-campus recruiting.",
  entity: "campus",
  valueType: "rate",
  hypothesis:
    "A window that is one-third employer programming costs a professional club more turnout than a window with the same total event count and no employers in it; if employer share adds nothing over raw density, drop it.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  minimumSampleSize: 5,
  halfLifeDays: null,
  sources: ["campus_events"],
  availableAt:
    "Rows with observed_at <= asOf. Employer events are listed weeks ahead, but the share is computed only from what a crawl had already returned at asOf.",
  version: "1.0.0",
  status: "experimental",
  requires: ["events"],
  compute: (input, asOf): FactorReading | null => {
    const window = inWindow(input.events || [], asOf, input.windowHours ?? 24);
    if (!window.length) return null;
    const hits = window.filter((e) => EMPLOYER_FACING.includes(e.canonical_type));
    // An unclassified window cannot report a share: the denominator would be
    // real and the numerator would be whatever the classifier happened to know.
    const classified = window.filter((e) => e.canonical_type !== "unknown");
    if (classified.length < window.length / 2) return null;
    return {
      value: hits.length / window.length,
      n: window.length,
      drivers: typeDrivers(hits),
      basis: { employerEvents: hits.length, windowEvents: window.length, classified: classified.length },
    };
  },
  explain: (value, reading) =>
    value === null
      ? "Too few classified events in this window to say how much of it is employer programming."
      : `${Math.round(value * 100)}% of the ${reading?.n ?? 0} events in this window are employer-facing.`,
});

/**
 * How much of the window is building and competing.
 *
 * `expectedSign` is null on purpose. A hackathon weekend plausibly drains a
 * club meeting AND plausibly marks the weeks when the same students are most
 * willing to show up for anything technical. We do not know which dominates,
 * and declaring a sign we cannot defend is how a factor gets marked "validated"
 * for agreeing with a guess.
 */
export const competitionActivity = defineFactor<CampusContextInput>({
  id: "competition_activity",
  name: "Competition activity",
  description:
    "Competitions, hackathons, grant deadlines and accelerator programming in the window.",
  entity: "campus",
  valueType: "count",
  hypothesis:
    "Weeks dense with competitions and funding deadlines differ systematically in club engagement from quiet weeks; the direction is unknown, and a null correlation falsifies the factor either way.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: null,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "research"],
  minimumSampleSize: 1,
  halfLifeDays: null,
  sources: ["campus_events"],
  availableAt:
    "Rows with observed_at <= asOf. Deadlines are announced ahead; announcements observed after asOf are excluded even when the deadline itself precedes it.",
  version: "1.0.0",
  status: "experimental",
  requires: ["events"],
  compute: (input, asOf): FactorReading | null => {
    const events = input.events || [];
    const window = inWindow(events, asOf, input.windowHours ?? 24 * 7);
    const hits = window.filter((e) => COMPETITION_FACING.includes(e.canonical_type));
    return {
      value: hits.length,
      n: events.length,
      drivers: typeDrivers(hits),
      basis: { windowHours: input.windowHours ?? 24 * 7, windowEvents: window.length },
    };
  },
  explain: (value) =>
    value === null
      ? "No ingested campus events, so nothing can be said about competition activity."
      : value === 0
        ? "Nothing competitive is scheduled in this window."
        : `${value} competition, hackathon or funding deadline${value === 1 ? "" : "s"} falls in this window.`,
});

export const CAMPUS_CONTEXT_FACTORS: FactorDef<CampusContextInput>[] = [
  campusEventDensity,
  employerActivity,
  competitionActivity,
];

/** A registry holding just these, for a caller that does not want the global one. */
export function campusContextRegistry(): FactorRegistry {
  const registry = new FactorRegistry();
  for (const f of CAMPUS_CONTEXT_FACTORS) registry.register(f);
  return registry;
}

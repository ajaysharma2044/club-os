// The skill evidence graph: what a person can show, bolted to the rows that show it.
//
// A résumé line is a claim. This is the claim plus the receipt. Every row in
// `evidence_skill_links` names a skill, a person, and the id of a REAL record —
// an episode, an activity event, an artifact, or an outcome — plus a sentence
// saying why that record supports that skill. `linkEvidence()` reads the target
// row before it writes, and refuses when the row is absent or is about somebody
// else. There is deliberately no code path that creates a link from a guess.
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE:
//
//   A single experience is not a skill.
//
// Someone who ran the sponsorship pipeline for one semester has done it once.
// That is a fact worth showing, and it is not "proficient in sponsorship sales".
// The distinction disappears the moment you sum evidence into a number, because
// four events inside one project sum exactly like four events across four
// projects. So `skillSummary()` counts DISTINCT episodes, DISTINCT contexts and
// DISTINCT terms separately, and returns a `verdict` word — single_instance,
// repeated, consistent — that no amount of repeated evidence inside one episode
// can move past `single_instance`. Repetition across teams and semesters is the
// only thing that raises confidence, because that is the only thing that
// distinguishes a durable skill from one good month.
//
// WHY THERE IS A NEW ARTIFACT TABLE.
//
// The repo has no artifact entity. `submissions` is the closest thing and it is
// mutable in place — its `feedback`, `status` and `url` are UPDATEd, with
// UNIQUE(course_id,user_id) forcing one row per person per course, so a resubmit
// overwrites the history. A record that can change after a claim was built on it
// cannot back that claim: the row an employer reads today may not be the row the
// link was asserted against. `skill_artifacts` is therefore append-only, with
// update and delete triggers in the same style as `activity_events`. Fixing
// `submissions` is a separate migration and is deliberately not attempted here.
//
// WHY STRENGTH AND CONFIDENCE NEVER LEAVE THE BUILDING.
//
// `evidence_strength` and `SkillSummary.confidence` are internal, person_private
// numbers: they order a member's own evidence page and tell an officer where the
// record is thin. docs/11 §7 forbids "a portable reliability or
// leadership-potential score sold to employers" and docs/10 §6 says "evidence,
// never a score". Neither number is permitted in any external payload; profiles.ts
// carries a runtime guard that refuses to release one. See the comment there.
//
// Point in time: every read takes `asOf` and filters on the EVIDENCE's own
// `occurred_at` and `observed_at`, the same pair `evidenceRead`/`personalFeatures`
// filter on. A link row's `created_at` is provenance, not a filter — a link is a
// derived assertion over evidence, so re-deriving it as of a past date must give
// the same answer whether the row was written then or today.

import {
  db,
  fail,
  id,
  text,
  timestamp,
  audit,
  member,
  officer,
  type User,
} from "../db";
import { evidenceInit } from "../evidence";
import { outcomesInit } from "../outcomes";
import type { Driver } from "../factors";
import { isSkill, skillName } from "./definitions";

export const MODEL_VERSION = "skill-evidence-v1";

export const EVIDENCE_KINDS = [
  "episode", // a whole piece of work with a goal
  "activity_event", // one recorded act inside an episode
  "artifact", // a thing that exists afterwards and can be looked at
  "outcome", // a labelled result
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/**
 * What the person actually did in the episode. This is the difference between
 * "built the payments integration" and "was on the team that did", and it is
 * asserted by whoever records the link rather than inferred from event counts —
 * event volume measures who used the tool, not who did the work.
 */
export const ROLE_CONTEXTS = [
  "owner",
  "lead",
  "implementer",
  "contributor",
  "reviewer",
  "supporter",
  "observer",
] as const;
export type RoleContext = (typeof ROLE_CONTEXTS)[number];

const ROLE_WEIGHT: Record<RoleContext, number> = {
  owner: 1,
  lead: 0.95,
  implementer: 0.9,
  contributor: 0.7,
  reviewer: 0.6,
  supporter: 0.45,
  observer: 0.2,
};

/** How much a kind of record can carry on its own. */
const KIND_WEIGHT: Record<EvidenceKind, number> = {
  artifact: 1, // something exists and can be inspected
  outcome: 0.9, // a result, labelled by someone
  episode: 0.8, // a goal that was pursued
  activity_event: 0.6, // one act; on its own it is a trace, not a claim
};

/**
 * Provenance weight, using the `evidence_level` vocabulary already in
 * activity_events. Self-reported is halved rather than dropped: saying what you
 * did is legitimate evidence, it is simply weaker than someone else confirming.
 */
const LEVEL_WEIGHT: Record<string, number> = {
  counterparty_confirmed: 1,
  system_observed: 0.85,
  system_derived: 0.8,
  self_reported: 0.5,
};

export const ARTIFACT_KINDS = [
  "repository",
  "pull_request",
  "deck",
  "document",
  "design",
  "dataset",
  "analysis",
  "recording",
  "budget",
  "contract",
  "campaign",
  "usage_record", // somebody outside the club used the thing
  "other",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

const DAY = 86400e3;
const HALF_LIFE_DAYS = 365;
/**
 * Recency never decays below this. Work done two years ago is still work that
 * was done; a decay that approaches zero would quietly erase a graduating
 * senior's entire first two years, which is the opposite of the point.
 */
const RECENCY_FLOOR = 0.25;

let ready = false;
export function skillsInit() {
  if (ready) return;
  // Episodes, activity events and outcomes are the evidence this graph points
  // at, so their tables must exist before any link can be verified.
  evidenceInit();
  outcomesInit();
  db().exec(`
-- Append-only. A thing that exists afterwards and can be looked at: a repo, a
-- deck, a budget, a recording. See the file header for why this is not
-- 'submissions'.
CREATE TABLE IF NOT EXISTS skill_artifacts(
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES accounts(id),
  episode_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  -- when the thing was made, which is not when we heard about it
  produced_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES accounts(id),
  evidence_level TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX IF NOT EXISTS artifact_identity ON skill_artifacts(person_id,kind,source_ref);
CREATE INDEX IF NOT EXISTS artifact_person ON skill_artifacts(person_id,produced_at);
CREATE INDEX IF NOT EXISTS artifact_episode ON skill_artifacts(episode_id);
CREATE TRIGGER IF NOT EXISTS skill_artifact_no_update BEFORE UPDATE ON skill_artifacts BEGIN SELECT RAISE(ABORT,'append only; record a superseding artifact'); END;
CREATE TRIGGER IF NOT EXISTS skill_artifact_no_delete BEFORE DELETE ON skill_artifacts BEGIN SELECT RAISE(ABORT,'append only; use a governed erasure migration'); END;

-- The graph itself. One row = one skill, one person, one real record, one reason.
CREATE TABLE IF NOT EXISTS evidence_skill_links(
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES accounts(id),
  skill_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  -- points at episodes.id / activity_events.id / skill_artifacts.id / outcomes.id
  evidence_id TEXT NOT NULL,
  -- a snapshot of the strength at the moment the link was asserted, kept for
  -- audit; reads recompute against their own asOf (see evidenceStrength)
  evidence_strength REAL NOT NULL,
  role_context TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model_version TEXT NOT NULL,
  reason TEXT NOT NULL,
  -- copied from the evidence row so point-in-time reads never need a join, and
  -- so the filter is the evidence's own clock rather than ours
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  evidence_level TEXT NOT NULL DEFAULT 'self_reported',
  outcome_value REAL,
  episode_id TEXT NOT NULL DEFAULT '',
  -- the setting the work happened in: a team, a project, a hackathon
  context_key TEXT NOT NULL,
  -- the academic term the evidence falls in, derived from the calendar
  term TEXT NOT NULL,
  -- a wrong link is retracted, never deleted: the person must be able to
  -- contest a claim and have the contest itself be on the record
  retracted_at TEXT,
  retracted_reason TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS skill_link_identity ON evidence_skill_links(person_id,skill_id,evidence_kind,evidence_id);
CREATE INDEX IF NOT EXISTS skill_link_person ON evidence_skill_links(person_id,skill_id,occurred_at);
`);
  ready = true;
}

// ==================================================================== calendar

/**
 * The academic term a date falls in. A property of the calendar, not an
 * inference about a person: nothing here reads anyone's enrolment.
 */
export function termOf(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "unknown";
  const m = d.getUTCMonth() + 1;
  return `${d.getUTCFullYear()}-${m <= 5 ? "SP" : m <= 7 ? "SU" : "FA"}`;
}

// ==================================================================== strength

export type StrengthInput = {
  evidenceKind: EvidenceKind;
  /** the evidence row's own `evidence_level` */
  evidenceLevel: string;
  roleContext: RoleContext;
  occurredAt: string;
  asOf: string;
  /** artifacts attached to the same episode; something you can look at */
  artifactSupport?: number;
  /** a labelled outcome on the same work, 0..1, or null when none */
  outcomeValue?: number | null;
  /** other links for this person and skill, for corroboration */
  repeatCount?: number;
  /** distinct settings those links span */
  distinctContexts?: number;
  halfLifeDays?: number;
};

export type Strength = {
  /** 0..1. INTERNAL. Never appears in an external payload. */
  value: number;
  /** the same Driver shape the factor registry uses (docs/20 §B3) */
  drivers: Driver[];
  reading: string;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * How much one piece of evidence carries, as of a moment.
 *
 * Multiplicative, because these are qualifiers on the same claim rather than
 * independent contributions: an observer role on a self-reported event should
 * not be rescued by a large recency term. Corroboration and support are the two
 * terms allowed above 1.0, and both are capped, so no amount of piling on can
 * turn weak evidence into strong evidence.
 *
 * Recomputed at read time rather than trusted from the row, because recency is a
 * property of the question ("as of when?") and not of the evidence.
 */
export function evidenceStrength(i: StrengthInput): Strength {
  const quality = LEVEL_WEIGHT[i.evidenceLevel] ?? 0.5;
  const role = ROLE_WEIGHT[i.roleContext] ?? 0.2;
  const kind = KIND_WEIGHT[i.evidenceKind] ?? 0.5;

  const ageDays = Math.max(
    0,
    (Date.parse(i.asOf) - Date.parse(i.occurredAt)) / DAY,
  );
  const halfLife = i.halfLifeDays ?? HALF_LIFE_DAYS;
  const recency = Math.max(RECENCY_FLOOR, Math.pow(0.5, ageDays / halfLife));

  const artifacts = Math.max(0, i.artifactSupport ?? 0);
  const artifactSupport = 1 + 0.15 * Math.min(artifacts, 3);

  const outcome = i.outcomeValue == null ? null : clamp01(i.outcomeValue);
  // A recorded outcome that went badly is still evidence that the work was
  // carried to a conclusion, so the floor is 1.0 and the bonus scales with it.
  const outcomeSupport = outcome === null ? 1 : 1 + 0.2 * outcome;

  const repeats = Math.max(0, (i.repeatCount ?? 1) - 1);
  const contexts = Math.max(0, (i.distinctContexts ?? 1) - 1);
  const corroboration =
    1 + 0.08 * Math.min(repeats, 5) + 0.12 * Math.min(contexts, 3);

  const value = clamp01(
    quality * role * kind * recency * artifactSupport * outcomeSupport * corroboration,
  );

  const drivers: Driver[] = [
    { label: "provenance", contribution: quality },
    { label: "role", contribution: role },
    { label: "evidence kind", contribution: kind },
    { label: "recency", contribution: recency },
    { label: "artifact support", contribution: artifactSupport },
    { label: "outcome", contribution: outcomeSupport },
    { label: "corroboration", contribution: corroboration },
  ];

  return {
    value,
    drivers,
    reading:
      `${i.roleContext} on ${i.evidenceKind} evidence, ${i.evidenceLevel}, ` +
      `${Math.round(ageDays)} days old` +
      (artifacts ? `, ${artifacts} artifact${artifacts === 1 ? "" : "s"} attached` : "") +
      (contexts ? `, corroborated across ${contexts + 1} settings` : "") +
      ".",
  };
}

// ==================================================================== artifacts

export function recordArtifact(
  u: User,
  a: {
    personId: string;
    kind: ArtifactKind;
    title: string;
    episodeId?: string;
    url?: string;
    detail?: string;
    producedAt?: string;
    evidenceLevel?: string;
    sourceRef?: string;
    context?: Record<string, unknown>;
  },
): string {
  skillsInit();
  member(u);
  if (u.id !== a.personId) officer(u);
  if (!ARTIFACT_KINDS.includes(a.kind)) fail("Unknown artifact kind.");
  const title = text(a.title, 240);
  const sourceRef = (a.sourceRef || a.url || title).slice(0, 400);
  const now = timestamp();
  const producedAt = a.producedAt || now;
  const key = id();
  db()
    .prepare(
      `INSERT INTO skill_artifacts(id,person_id,episode_id,kind,title,url,detail,produced_at,recorded_at,recorded_by,evidence_level,source_ref,context)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(person_id,kind,source_ref) DO NOTHING`,
    )
    .run(
      key,
      a.personId,
      a.episodeId || "",
      a.kind,
      title,
      a.url || "",
      (a.detail || "").slice(0, 2000),
      producedAt,
      now,
      u.id,
      // An officer recording someone else's artifact has confirmed it exists;
      // recording your own is your word for it, and is labelled as such.
      a.evidenceLevel || (u.id === a.personId ? "self_reported" : "counterparty_confirmed"),
      sourceRef,
      JSON.stringify(a.context || {}),
    );
  const row = db()
    .prepare(
      "SELECT id FROM skill_artifacts WHERE person_id=? AND kind=? AND source_ref=?",
    )
    .get(a.personId, a.kind, sourceRef) as { id: string } | undefined;
  if (!row) fail("Artifact could not be recorded.", 500);
  audit(u, "skill.artifact.record", row.id, { person: a.personId, kind: a.kind });
  return row.id;
}

// ================================================================== the linking

/**
 * Was this person actually in this episode?
 *
 * An episode and an episode-scoped outcome are both CONTAINERS: nothing in the
 * row itself names a participant, so without this check anyone could be attached
 * to the club's best project. Owning it or appearing in one of its recorded acts
 * is the weakest defensible test, and it is the one the schema can answer.
 */
function participatedIn(episodeId: string, personId: string): boolean {
  if (!episodeId) return false;
  const owned = db()
    .prepare("SELECT 1 FROM episodes WHERE id=? AND owner=?")
    .get(episodeId, personId);
  if (owned) return true;
  return !!db()
    .prepare(
      "SELECT 1 FROM activity_events WHERE episode_id=? AND (actor_id=? OR subject_id=?) LIMIT 1",
    )
    .get(episodeId, personId, personId);
}

type ResolvedEvidence = {
  occurredAt: string;
  observedAt: string;
  episodeId: string;
  evidenceLevel: string;
  label: string;
  outcomeValue: number | null;
};

/**
 * Read the row the caller says exists, and refuse if it does not, or if it is
 * about somebody else. This is the whole anti-fabrication guarantee: there is no
 * other way into `evidence_skill_links`.
 */
function resolveEvidence(
  kind: EvidenceKind,
  evidenceId: string,
  personId: string,
): ResolvedEvidence {
  if (kind === "episode") {
    const e = db()
      .prepare("SELECT id,title,created_at,owner,source_type FROM episodes WHERE id=?")
      .get(evidenceId) as
      | { id: string; title: string; created_at: string; owner: string; source_type: string }
      | undefined;
    if (!e) fail("That episode does not exist; a skill link needs a real record.", 404);
    if (!participatedIn(e.id, personId))
      fail("That episode has no record of this person working in it.", 422);
    return {
      occurredAt: e.created_at,
      observedAt: e.created_at,
      episodeId: e.id,
      // An episode is a container, not an observation. Its provenance is the
      // weakest thing it could be; the acts inside it carry their own levels.
      evidenceLevel: "system_observed",
      label: e.title,
      outcomeValue: null,
    };
  }
  if (kind === "activity_event") {
    const e = db()
      .prepare(
        "SELECT id,episode_id,actor_id,subject_id,event_type,occurred_at,observed_at,evidence_level FROM activity_events WHERE id=?",
      )
      .get(evidenceId) as
      | {
          id: string;
          episode_id: string;
          actor_id: string;
          subject_id: string;
          event_type: string;
          occurred_at: string;
          observed_at: string;
          evidence_level: string;
        }
      | undefined;
    if (!e) fail("That activity event does not exist; a skill link needs a real record.", 404);
    // The person must be in the row. Linking someone to an event they neither
    // acted in nor were the subject of is exactly the fabrication this refuses.
    if (e.actor_id !== personId && e.subject_id !== personId)
      fail("That event is not about this person.", 422);
    return {
      occurredAt: e.occurred_at,
      observedAt: e.observed_at,
      episodeId: e.episode_id,
      evidenceLevel: e.evidence_level,
      label: e.event_type,
      outcomeValue: null,
    };
  }
  if (kind === "artifact") {
    const a = db()
      .prepare(
        "SELECT id,person_id,episode_id,kind,title,produced_at,recorded_at,evidence_level FROM skill_artifacts WHERE id=?",
      )
      .get(evidenceId) as
      | {
          id: string;
          person_id: string;
          episode_id: string;
          kind: string;
          title: string;
          produced_at: string;
          recorded_at: string;
          evidence_level: string;
        }
      | undefined;
    if (!a) fail("That artifact does not exist; a skill link needs a real record.", 404);
    if (a.person_id !== personId) fail("That artifact is not this person's.", 422);
    return {
      occurredAt: a.produced_at,
      observedAt: a.recorded_at,
      episodeId: a.episode_id,
      evidenceLevel: a.evidence_level,
      label: a.title,
      outcomeValue: null,
    };
  }
  const o = db()
    .prepare(
      "SELECT id,subject_type,subject_id,kind,value,occurred_at,observed_at,evidence_level,context FROM outcomes WHERE id=?",
    )
    .get(evidenceId) as
    | {
        id: string;
        subject_type: string;
        subject_id: string;
        kind: string;
        value: number;
        occurred_at: string;
        observed_at: string;
        evidence_level: string;
        context: string;
      }
    | undefined;
  if (!o) fail("That outcome does not exist; a skill link needs a real record.", 404);
  if (o.subject_type === "person" && o.subject_id !== personId)
    fail("That outcome is about someone else.", 422);
  let ctx: Record<string, unknown> = {};
  try {
    ctx = JSON.parse(o.context);
  } catch {
    ctx = {};
  }
  const outcomeEpisode =
    o.subject_type === "episode" ? o.subject_id : String(ctx.episode_id || "");
  // A result achieved by work this person is nowhere in is not their evidence.
  if (o.subject_type !== "person" && !participatedIn(outcomeEpisode, personId))
    fail("That outcome belongs to work this person has no record in.", 422);
  return {
    occurredAt: o.occurred_at,
    observedAt: o.observed_at,
    episodeId: outcomeEpisode,
    evidenceLevel: o.evidence_level,
    label: o.kind,
    outcomeValue: Number.isFinite(o.value) ? o.value : null,
  };
}

/**
 * The default setting for an episode when the caller does not name one.
 *
 * `episodes.source_type` is the only grouping the schema actually has, so two
 * different projects both land in "project" and count as ONE context. That
 * under-counts breadth on purpose: a caller who knows the team should pass
 * `contextKey`, and in its absence the graph should claim less, not more.
 */
function defaultContext(episodeId: string): string {
  if (!episodeId) return "unassigned";
  const e = db()
    .prepare("SELECT source_type FROM episodes WHERE id=?")
    .get(episodeId) as { source_type: string } | undefined;
  return e?.source_type || "unassigned";
}

function artifactCount(personId: string, episodeId: string, asOf: string): number {
  if (!episodeId) return 0;
  const r = db()
    .prepare(
      "SELECT COUNT(*) n FROM skill_artifacts WHERE person_id=? AND episode_id=? AND produced_at<=? AND recorded_at<=?",
    )
    .get(personId, episodeId, asOf, asOf) as { n: number };
  return r.n;
}

export function linkEvidence(
  u: User,
  l: {
    personId: string;
    skillId: string;
    evidenceKind: EvidenceKind;
    evidenceId: string;
    roleContext: RoleContext;
    /** Human-readable, required, and stored: the link must be arguable. */
    reason: string;
    contextKey?: string;
    term?: string;
  },
): string {
  skillsInit();
  member(u);
  // You may assert about your own work; anyone else's takes an officer.
  if (u.id !== l.personId) officer(u);
  if (!isSkill(l.skillId))
    fail("Unknown skill. The skill vocabulary is a curated list.", 422);
  if (!EVIDENCE_KINDS.includes(l.evidenceKind)) fail("Unknown evidence kind.");
  if (!ROLE_CONTEXTS.includes(l.roleContext)) fail("Name the role in the work.");
  // No reason, no link. A link nobody can argue with is a link nobody can correct.
  const reason = text(l.reason, 600);
  const evidenceId = text(l.evidenceId, 64);

  const resolved = resolveEvidence(l.evidenceKind, evidenceId, l.personId);
  const now = timestamp();
  const contextKey = (l.contextKey || "").trim() || defaultContext(resolved.episodeId);
  const term = (l.term || "").trim() || termOf(resolved.occurredAt);

  const prior = db()
    .prepare(
      "SELECT COUNT(*) n FROM evidence_skill_links WHERE person_id=? AND skill_id=? AND retracted_at IS NULL",
    )
    .get(l.personId, l.skillId) as { n: number };
  const contexts = db()
    .prepare(
      "SELECT COUNT(DISTINCT context_key) n FROM evidence_skill_links WHERE person_id=? AND skill_id=? AND retracted_at IS NULL",
    )
    .get(l.personId, l.skillId) as { n: number };

  // Snapshot strength as of now. skillSummary recomputes against its own asOf,
  // because recency is a property of the question and not of the row.
  const strength = evidenceStrength({
    evidenceKind: l.evidenceKind,
    evidenceLevel: resolved.evidenceLevel,
    roleContext: l.roleContext,
    occurredAt: resolved.occurredAt,
    asOf: now,
    artifactSupport: artifactCount(l.personId, resolved.episodeId, now),
    outcomeValue: resolved.outcomeValue,
    repeatCount: prior.n + 1,
    distinctContexts: Math.max(contexts.n, 1),
  });

  const key = id();
  db()
    .prepare(
      `INSERT INTO evidence_skill_links(id,person_id,skill_id,evidence_kind,evidence_id,evidence_strength,role_context,created_at,model_version,reason,occurred_at,observed_at,evidence_level,outcome_value,episode_id,context_key,term)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(person_id,skill_id,evidence_kind,evidence_id) DO NOTHING`,
    )
    .run(
      key,
      l.personId,
      l.skillId,
      l.evidenceKind,
      evidenceId,
      strength.value,
      l.roleContext,
      now,
      MODEL_VERSION,
      reason,
      resolved.occurredAt,
      resolved.observedAt,
      resolved.evidenceLevel,
      resolved.outcomeValue,
      resolved.episodeId,
      contextKey,
      term,
    );
  const row = db()
    .prepare(
      "SELECT id FROM evidence_skill_links WHERE person_id=? AND skill_id=? AND evidence_kind=? AND evidence_id=?",
    )
    .get(l.personId, l.skillId, l.evidenceKind, evidenceId) as
    | { id: string }
    | undefined;
  if (!row) fail("Skill link could not be recorded.", 500);
  audit(u, "skill.link", row.id, {
    person: l.personId,
    skill: l.skillId,
    evidence: `${l.evidenceKind}:${evidenceId}`,
  });
  return row.id;
}

/**
 * Withdraw a link. Not a delete: the person disputing a claim about them is
 * itself part of the record, and a deleted row cannot be audited.
 */
export function retractLink(u: User, linkId: string, reason: string): boolean {
  skillsInit();
  const row = db()
    .prepare("SELECT id,person_id,retracted_at FROM evidence_skill_links WHERE id=?")
    .get(linkId) as
    | { id: string; person_id: string; retracted_at: string | null }
    | undefined;
  if (!row) fail("Skill link not found.", 404);
  if (u.id !== row.person_id) officer(u);
  if (row.retracted_at) return false;
  const why = text(reason, 600);
  db()
    .prepare(
      "UPDATE evidence_skill_links SET retracted_at=?,retracted_reason=? WHERE id=?",
    )
    .run(timestamp(), why, linkId);
  audit(u, "skill.link.retract", linkId, { reason: why });
  return true;
}

// ===================================================================== reading

export type SkillLinkRow = {
  id: string;
  person_id: string;
  skill_id: string;
  evidence_kind: EvidenceKind;
  evidence_id: string;
  evidence_strength: number;
  role_context: RoleContext;
  created_at: string;
  model_version: string;
  reason: string;
  occurred_at: string;
  observed_at: string;
  evidence_level: string;
  outcome_value: number | null;
  episode_id: string;
  context_key: string;
  term: string;
  retracted_at: string | null;
  retracted_reason: string;
};

/** Events somebody has filed a correction against, on or before `asOf`. */
function disputedEvents(asOf: string): Set<string> {
  const rows = db()
    .prepare(
      "SELECT json_extract(context,'$.corrects') c FROM activity_events WHERE event_type='evidence.correction' AND occurred_at<=? AND observed_at<=?",
    )
    .all(asOf, asOf) as { c: string | null }[];
  return new Set(rows.map((r) => r.c).filter((c): c is string => !!c));
}

/**
 * Links that were true as of a moment: the evidence had happened AND had been
 * observed, the link had not been retracted, and nobody had filed a correction
 * against the underlying event.
 */
export function skillLinks(
  personId: string,
  skillId: string | null,
  asOf: string = timestamp(),
): SkillLinkRow[] {
  skillsInit();
  const rows = db()
    .prepare(
      `SELECT * FROM evidence_skill_links
        WHERE person_id=?${skillId ? " AND skill_id=?" : ""}
          AND occurred_at<=? AND observed_at<=?
          AND (retracted_at IS NULL OR retracted_at>?)
        ORDER BY occurred_at`,
    )
    .all(
      ...([personId, ...(skillId ? [skillId] : []), asOf, asOf, asOf] as any[]),
    ) as SkillLinkRow[];
  const disputed = disputedEvents(asOf);
  return rows.filter(
    (r) => !(r.evidence_kind === "activity_event" && disputed.has(r.evidence_id)),
  );
}

export type SkillVerdict =
  | "no_evidence"
  | "single_instance"
  | "repeated"
  | "consistent";

export type SkillSummary = {
  person_id: string;
  skill_id: string;
  canonical_name: string;
  /** 0..1, INTERNAL ONLY. Orders a member's own page; never leaves the club. */
  strength: number;
  /** distinct episodes, not events: four acts in one project is one episode */
  episodes: number;
  distinctContexts: number;
  distinctTerms: number;
  /** 0..1, INTERNAL ONLY. Confidence in the EVIDENCE BASE, not in the person. */
  confidence: number;
  verdict: SkillVerdict;
  reading: string;
  links: SkillLinkRow[];
  as_of: string;
  model_version: string;
};

/**
 * What the record supports for one person and one skill, as of a moment.
 *
 * The verdict ladder is the point. `single_instance` is a ceiling that no
 * quantity of evidence inside one episode can climb: the counts that move it are
 * distinct episodes, distinct settings and distinct terms. `consistent` requires
 * all three, because a skill that only ever appears in one team in one semester
 * is a skill we have seen once under one set of conditions.
 */
export function skillSummary(
  personId: string,
  skillId: string,
  asOf: string = timestamp(),
): SkillSummary {
  skillsInit();
  const links = skillLinks(personId, skillId, asOf);
  const base = {
    person_id: personId,
    skill_id: skillId,
    canonical_name: skillName(skillId),
    links,
    as_of: asOf,
    model_version: MODEL_VERSION,
  };
  if (!links.length)
    return {
      ...base,
      strength: 0,
      episodes: 0,
      distinctContexts: 0,
      distinctTerms: 0,
      confidence: 0,
      verdict: "no_evidence",
      reading: `No recorded evidence of ${skillName(skillId)} as of ${asOf}.`,
    };

  const episodeIds = new Set(links.map((l) => l.episode_id).filter(Boolean));
  // Evidence with no episode (a standalone artifact) is still one instance.
  const episodes = episodeIds.size || (links.length ? 1 : 0);
  const contexts = new Set(links.map((l) => l.context_key));
  const terms = new Set(links.map((l) => l.term));

  // Recomputed rather than read from `evidence_strength`, which is a snapshot of
  // the moment the link was asserted. Two things it cannot know: how old the
  // evidence is by the time someone asks, and how much else has since
  // corroborated it. Both are properties of the question, not of the row — the
  // row carries the inputs (level, outcome, times) so the recomputation is exact.
  const recomputed = links.map((l) =>
    evidenceStrength({
      evidenceKind: l.evidence_kind,
      evidenceLevel: l.evidence_level,
      roleContext: l.role_context,
      occurredAt: l.occurred_at,
      asOf,
      artifactSupport: artifactCount(personId, l.episode_id, asOf),
      outcomeValue: l.outcome_value,
      repeatCount: links.length,
      distinctContexts: contexts.size,
    }),
  );
  const strength =
    recomputed.reduce((a, r) => a + r.value, 0) / recomputed.length;

  const breadth = Math.min(episodes, 4) / 4;
  const spread = Math.min(contexts.size, 3) / 3;
  const span = Math.min(terms.size, 3) / 3;
  let confidence = clamp01(
    (0.5 * breadth + 0.3 * spread + 0.2 * span) * (0.5 + 0.5 * strength),
  );
  // The rule, in the number as well as the word. One episode cannot produce
  // high confidence however good the evidence inside it is, because what is
  // missing is not quality — it is a second occasion.
  if (episodes <= 1) confidence = Math.min(confidence, 0.25);

  const verdict: SkillVerdict =
    episodes <= 1
      ? "single_instance"
      : episodes >= 3 && contexts.size >= 2 && terms.size >= 2
        ? "consistent"
        : "repeated";

  const name = skillName(skillId);
  const reading =
    verdict === "single_instance"
      ? `${name}: one episode (${[...contexts][0]}, ${[...terms][0]}), ${links.length} record${links.length === 1 ? "" : "s"}. ` +
        "One experience is one experience. This shows the work was done once; it is not evidence of a durable skill."
      : verdict === "repeated"
        ? `${name}: ${episodes} episodes across ${contexts.size} setting${contexts.size === 1 ? "" : "s"} and ${terms.size} term${terms.size === 1 ? "" : "s"}. ` +
          "Done more than once, but within a narrow range of conditions."
        : `${name}: ${episodes} episodes across ${contexts.size} settings and ${terms.size} terms. ` +
          "The work recurs in different settings and different semesters, which is what separates a skill from one good month.";

  return {
    ...base,
    strength,
    episodes,
    distinctContexts: contexts.size,
    distinctTerms: terms.size,
    confidence,
    verdict,
    reading,
  };
}

/** Every skill this person has any evidence for, as of a moment. */
export function personSkills(
  personId: string,
  asOf: string = timestamp(),
): SkillSummary[] {
  skillsInit();
  const ids = (
    db()
      .prepare(
        `SELECT DISTINCT skill_id FROM evidence_skill_links
          WHERE person_id=? AND occurred_at<=? AND observed_at<=?
            AND (retracted_at IS NULL OR retracted_at>?)`,
      )
      .all(personId, asOf, asOf, asOf) as { skill_id: string }[]
  ).map((r) => r.skill_id);
  return ids
    .map((s) => skillSummary(personId, s, asOf))
    .filter((s) => s.links.length)
    .sort((a, b) => b.episodes - a.episodes || a.skill_id.localeCompare(b.skill_id));
}

// =========================================================== supporting detail

export type ArtifactRow = {
  id: string;
  person_id: string;
  episode_id: string;
  kind: string;
  title: string;
  url: string;
  detail: string;
  produced_at: string;
  recorded_at: string;
  evidence_level: string;
};

export function artifactsFor(
  personId: string,
  episodeId: string,
  asOf: string = timestamp(),
): ArtifactRow[] {
  skillsInit();
  if (!episodeId) return [];
  return db()
    .prepare(
      "SELECT id,person_id,episode_id,kind,title,url,detail,produced_at,recorded_at,evidence_level FROM skill_artifacts WHERE person_id=? AND episode_id=? AND produced_at<=? AND recorded_at<=? ORDER BY produced_at",
    )
    .all(personId, episodeId, asOf, asOf) as ArtifactRow[];
}

export type EpisodeRow = {
  id: string;
  title: string;
  goal: string;
  status: string;
  owner: string;
  created_at: string;
  source_type: string;
};

export function episodeRow(episodeId: string): EpisodeRow | null {
  if (!episodeId) return null;
  skillsInit();
  return (
    (db()
      .prepare(
        "SELECT id,title,goal,status,owner,created_at,source_type FROM episodes WHERE id=?",
      )
      .get(episodeId) as EpisodeRow | undefined) || null
  );
}

export type OutcomeFact = {
  id: string;
  kind: string;
  value: number;
  occurred_at: string;
  evidence_level: string;
};

/** Outcomes attached to an episode, either directly or via context. */
export function outcomesForEpisode(
  episodeId: string,
  asOf: string = timestamp(),
): OutcomeFact[] {
  if (!episodeId) return [];
  skillsInit();
  return db()
    .prepare(
      `SELECT id,kind,value,occurred_at,evidence_level FROM outcomes
        WHERE ((subject_type='episode' AND subject_id=?)
               OR json_extract(context,'$.episode_id')=?)
          AND occurred_at<=? AND observed_at<=?
        ORDER BY occurred_at`,
    )
    .all(episodeId, episodeId, asOf, asOf) as OutcomeFact[];
}

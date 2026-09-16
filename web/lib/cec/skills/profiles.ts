// The external views: what an employer or an investor is allowed to see.
//
// ===========================================================================
// EVIDENCE, NEVER A SCORE. THIS IS THE WHOLE DESIGN CONSTRAINT.
//
// docs/10 §6, on the premium talent-verification tier: "The ethical design does
// not change. Same rule as employers: evidence, never a score. Per-audience,
// revocable consent. No ranking that could function as an automated decision
// tool. A quant firm or a venture scout gets to see verified facts, exactly as
// an employer does, and makes its own judgment."
//
// docs/11 §7, the do-not-compute list: "No portable reliability or
// leadership-potential score sold to employers."
//
// The reason is the incentive test in that same section. A number crossing this
// boundary does not stay a number. It becomes a filter, then a threshold, then
// the reason a twenty-year-old is screened out of a role by a rule nobody will
// ever explain to them — and it does that whether or not the number is any good,
// because the recipient has every incentive to sort by it and no way to audit
// it. Mount St. Mary's is the worked example in the same document.
//
// So the boundary is enforced twice. Once in the shape: these payloads carry
// episodes, artifacts, outcomes, roles, dates and counts, and the verdict WORDS
// from skillSummary ("single_instance", "repeated", "consistent"), which an
// employer can read but cannot meaningfully sort a cohort by. And once at
// runtime: `externalSafety()` walks the finished payload and refuses to release
// it if any key looks like a score or any number is not a plain non-negative
// count. `evidence_strength` and `confidence` exist in this codebase and are
// useful internally; if a future change lets one leak into an employer payload,
// the request fails instead of succeeding quietly.
//
// Counts survive that guard on purpose. "Four episodes across three settings and
// two terms" is a fact about the record; 0.72 is a judgment about a person
// dressed as one.
// ===========================================================================
//
// CONSENT IS PER AUDIENCE AND REVOCABLE.
//
// A grant is (person, audience, scope). An employer grant does not open the
// investor view; revoking one does not touch the other. Every external function
// here checks a live grant as of the query time and returns an EMPTY payload
// when there is none — not a redacted one, not a partial one. A partial payload
// tells the recipient that something is being withheld, which is itself a
// disclosure about the person.
//
// JOB SPECIFICITY: Profile(person, job) is not Profile(person).
//
// A general profile dumps everything and makes the reader do the matching, which
// in practice means they read the first two lines. A job-scoped view answers the
// question actually being asked — what has this person done that bears on THIS
// role — so the same person's backend evidence and sponsorship evidence are two
// different documents built from two disjoint sets of episodes.

import { db, fail, id, timestamp, audit, type User } from "../db";
import { skill, skillName, isSkill } from "./definitions";
import {
  MODEL_VERSION,
  skillsInit,
  skillSummary,
  personSkills,
  skillLinks,
  artifactsFor,
  episodeRow,
  outcomesForEpisode,
  type SkillSummary,
  type SkillVerdict,
} from "./evidence";

export const POLICY = "external-evidence-no-score-v1";
const DAY = 86400e3;

// ===================================================================== consent

export const AUDIENCES = ["employer", "recruiter", "investor", "accelerator"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const PROFILE_SCOPES = ["skill_evidence", "venture_evidence"] as const;
export type ProfileScope = (typeof PROFILE_SCOPES)[number];

/** Which audiences may ever be shown which scope. Consent narrows this; it never widens it. */
const SCOPE_AUDIENCES: Record<ProfileScope, Audience[]> = {
  skill_evidence: ["employer", "recruiter", "investor", "accelerator"],
  venture_evidence: ["investor", "accelerator"],
};

let grantsReady = false;
export function profilesInit() {
  if (grantsReady) return;
  skillsInit();
  db().exec(`
-- Per-audience, revocable consent (docs/10 §6). A revocation is a row edit and
-- not a delete, so "they could see this between March and June" stays answerable.
CREATE TABLE IF NOT EXISTS professional_profile_grants(
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES accounts(id),
  audience TEXT NOT NULL,
  scope TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  granted_by TEXT NOT NULL REFERENCES accounts(id),
  note TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS grant_live ON professional_profile_grants(person_id,audience,scope) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS grant_person ON professional_profile_grants(person_id,granted_at);
`);
  grantsReady = true;
}

export type GrantRow = {
  id: string;
  person_id: string;
  audience: string;
  scope: string;
  granted_at: string;
  revoked_at: string | null;
  note: string;
};

/**
 * Only the person may open their own record. There is no officer override: a
 * club cannot consent on a member's behalf to an employer seeing their work.
 */
export function grantProfileAccess(
  u: User,
  g: { personId: string; audience: Audience; scope: ProfileScope; note?: string },
): string {
  profilesInit();
  if (u.id !== g.personId)
    fail("Only the person can grant access to their own record.", 403);
  if (!AUDIENCES.includes(g.audience)) fail("Unknown audience.");
  if (!PROFILE_SCOPES.includes(g.scope)) fail("Unknown scope.");
  if (!SCOPE_AUDIENCES[g.scope].includes(g.audience))
    fail("That scope is not offered to that audience.", 422);
  const key = id();
  db()
    .prepare(
      `INSERT INTO professional_profile_grants(id,person_id,audience,scope,granted_at,granted_by,note)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(person_id,audience,scope) WHERE revoked_at IS NULL DO NOTHING`,
    )
    .run(
      key,
      g.personId,
      g.audience,
      g.scope,
      timestamp(),
      u.id,
      (g.note || "").slice(0, 500),
    );
  const row = db()
    .prepare(
      "SELECT id FROM professional_profile_grants WHERE person_id=? AND audience=? AND scope=? AND revoked_at IS NULL",
    )
    .get(g.personId, g.audience, g.scope) as { id: string } | undefined;
  if (!row) fail("Grant could not be recorded.", 500);
  audit(u, "profile.grant", row.id, { audience: g.audience, scope: g.scope });
  return row.id;
}

export function revokeProfileAccess(
  u: User,
  g: { personId: string; audience: Audience; scope: ProfileScope },
): boolean {
  profilesInit();
  if (u.id !== g.personId)
    fail("Only the person can revoke access to their own record.", 403);
  const now = timestamp();
  const row = db()
    .prepare(
      "SELECT id FROM professional_profile_grants WHERE person_id=? AND audience=? AND scope=? AND revoked_at IS NULL",
    )
    .get(g.personId, g.audience, g.scope) as { id: string } | undefined;
  if (!row) return false;
  db()
    .prepare("UPDATE professional_profile_grants SET revoked_at=? WHERE id=?")
    .run(now, row.id);
  audit(u, "profile.revoke", row.id, { audience: g.audience, scope: g.scope });
  return true;
}

/**
 * The live grant as of a moment, or null. Point-in-time both ways: a grant made
 * after `asOf` had not happened yet, and one revoked on or before `asOf` was
 * already gone.
 */
export function activeGrant(
  personId: string,
  audience: Audience,
  scope: ProfileScope,
  asOf: string = timestamp(),
): GrantRow | null {
  profilesInit();
  return (
    (db()
      .prepare(
        `SELECT id,person_id,audience,scope,granted_at,revoked_at,note
           FROM professional_profile_grants
          WHERE person_id=? AND audience=? AND scope=?
            AND granted_at<=? AND (revoked_at IS NULL OR revoked_at>?)
          ORDER BY granted_at DESC LIMIT 1`,
      )
      .get(personId, audience, scope, asOf, asOf) as GrantRow | undefined) || null
  );
}

// ================================================================== the guard

/**
 * Key fragments that mean "a number about this person". Substring match, so
 * `reliability_score`, `leadership_index` and `percentile_rank` are all caught.
 */
const FORBIDDEN_EXTERNAL_KEYS = [
  "score",
  "rating",
  "rank",
  "percentile",
  "strength",
  "confidence",
  "grade",
  "points",
  "proficiency",
  "tier",
  "weight",
  "probability",
  "index",
  "stars",
];

/**
 * Walk a finished external payload and report every way it breaks the rule.
 *
 * Two checks. Names, because a field called `reliability_score` is a score
 * whatever is in it. And values: every number leaving here must be a plain
 * non-negative integer, because that is what a count and a whole number of days
 * look like, and it is not what a normalised 0..1 judgment looks like. The
 * second check is the one that catches a leak somebody forgot to name.
 */
export function externalSafety(payload: unknown, path = "$"): string[] {
  const out: string[] = [];
  const walk = (node: unknown, at: string) => {
    if (node === null || node === undefined) return;
    if (typeof node === "number") {
      if (!Number.isInteger(node) || node < 0)
        out.push(
          `${at} carries ${node}: external output may contain counts and whole days only, never a rate or an index.`,
        );
      return;
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${at}[${i}]`));
      return;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const lowered = k.toLowerCase();
      const hit = FORBIDDEN_EXTERNAL_KEYS.find((f) => lowered.includes(f));
      if (hit)
        out.push(
          `${at}.${k} reads as a score ("${hit}"). Employers and investors receive evidence, never a score (docs/10 §6).`,
        );
      walk(v, `${at}.${k}`);
    }
  };
  walk(payload, path);
  return out;
}

/** Fail closed. A payload that breaks the rule is not released in a degraded form. */
function release<T>(payload: T): T {
  const violations = externalSafety(payload);
  if (violations.length)
    fail(
      "Refusing to release this profile: " + violations.join(" "),
      500,
    );
  return payload;
}

// ================================================================== exhibits

export type ExternalOutcome = {
  kind: string;
  /** "met" / "not_met", never the raw 0..1 value: a label, not a measurement. */
  result: "met" | "not_met";
  recorded_by: string;
  occurred_at: string;
};

export type ExternalArtifact = {
  kind: string;
  title: string;
  url: string;
  produced_at: string;
};

export type EvidenceExhibit = {
  skill_id: string;
  canonical_name: string;
  role: string;
  setting: string;
  term: string;
  /** the sentence whoever made the link had to write */
  why: string;
  evidence_kind: string;
  evidence_id: string;
  occurred_at: string;
  episode: {
    id: string;
    title: string;
    goal: string;
    status: string;
    started_at: string;
  } | null;
  artifacts: ExternalArtifact[];
  outcomes: ExternalOutcome[];
};

export type SkillEvidenceSection = {
  skill_id: string;
  canonical_name: string;
  category: string;
  /** the verdict word from skillSummary. A word, deliberately, not a number. */
  standing: SkillVerdict;
  episode_count: number;
  setting_count: number;
  term_count: number;
  record_count: number;
  reading: string;
  exhibits: EvidenceExhibit[];
};

function exhibits(personId: string, skillId: string, asOf: string): EvidenceExhibit[] {
  return skillLinks(personId, skillId, asOf).map((l) => {
    const ep = episodeRow(l.episode_id);
    return {
      skill_id: l.skill_id,
      canonical_name: skillName(l.skill_id),
      role: l.role_context,
      setting: l.context_key,
      term: l.term,
      why: l.reason,
      evidence_kind: l.evidence_kind,
      evidence_id: l.evidence_id,
      occurred_at: l.occurred_at,
      episode: ep
        ? {
            id: ep.id,
            title: ep.title,
            goal: ep.goal,
            status: ep.status,
            started_at: ep.created_at,
          }
        : null,
      artifacts: artifactsFor(personId, l.episode_id, asOf).map((a) => ({
        kind: a.kind,
        title: a.title,
        url: a.url,
        produced_at: a.produced_at,
      })),
      outcomes: outcomesForEpisode(l.episode_id, asOf).map((o) => ({
        kind: o.kind,
        result: (o.value >= 0.5 ? "met" : "not_met") as "met" | "not_met",
        recorded_by: o.evidence_level,
        occurred_at: o.occurred_at,
      })),
    };
  });
}

function section(summary: SkillSummary, asOf: string): SkillEvidenceSection {
  const def = skill(summary.skill_id);
  return {
    skill_id: summary.skill_id,
    canonical_name: summary.canonical_name,
    category: def?.category || "uncategorised",
    standing: summary.verdict,
    episode_count: summary.episodes,
    setting_count: summary.distinctContexts,
    term_count: summary.distinctTerms,
    record_count: summary.links.length,
    reading: summary.reading,
    exhibits: exhibits(summary.person_id, summary.skill_id, asOf),
  };
}

function personName(personId: string): string {
  const r = db().prepare("SELECT name FROM users WHERE id=?").get(personId) as
    | { name: string }
    | undefined;
  return r?.name || personId;
}

const NO_SCORE_NOTE =
  "This record contains evidence, not a score. There is no reliability, potential or ranking number here, " +
  "by design (docs/10 §6, docs/11 §7): make your own judgment from the episodes, artifacts and outcomes below.";

const SINGLE_INSTANCE_NOTE =
  'A "single_instance" standing means the person did this once. That is a real fact and it is not proficiency; ' +
  '"repeated" and "consistent" mean the work recurred across settings and semesters.';

// ============================================================ the person view

export type EvidenceProfile = {
  granted: boolean;
  person: { id: string; name: string };
  audience: Audience;
  scope: ProfileScope;
  skills: SkillEvidenceSection[];
  as_of: string;
  policy: string;
  model_version: string;
  notes: string[];
};

/**
 * Everything the person has consented to show this audience, unfiltered by any
 * role. Kept mainly so `jobEvidenceMatch` has something to be different from:
 * see the file header on why the job-scoped view is the one to use.
 */
export function evidenceProfile(input: {
  personId: string;
  audience: Audience;
  asOf?: string;
}): EvidenceProfile {
  profilesInit();
  const asOf = input.asOf || timestamp();
  const base = {
    person: { id: input.personId, name: personName(input.personId) },
    audience: input.audience,
    scope: "skill_evidence" as ProfileScope,
    as_of: asOf,
    policy: POLICY,
    model_version: MODEL_VERSION,
  };
  const grant = activeGrant(input.personId, input.audience, "skill_evidence", asOf);
  if (!grant)
    return release({
      ...base,
      granted: false,
      skills: [],
      notes: [
        `No live ${input.audience} grant for this person as of ${asOf}. Nothing is released — not a partial record.`,
      ],
    });
  return release({
    ...base,
    granted: true,
    skills: personSkills(input.personId, asOf).map((s) => section(s, asOf)),
    notes: [NO_SCORE_NOTE, SINGLE_INSTANCE_NOTE],
  });
}

// =============================================================== the job view

export type RequirementSkill = {
  skill_id: string;
  necessity: "required" | "preferred" | "bonus";
  /** what the employer means by it, in their words */
  note?: string;
};

export type JobRequirement = {
  id: string;
  title: string;
  employer: string;
  skills: RequirementSkill[];
  context?: string;
};

export type RequirementEvidence = SkillEvidenceSection & {
  necessity: RequirementSkill["necessity"];
  employer_note: string;
};

export type PersonJobEvidenceMatch = {
  granted: boolean;
  person: { id: string; name: string };
  job: { id: string; title: string; employer: string };
  audience: Audience;
  /** one section per required skill that has evidence behind it */
  requirements: RequirementEvidence[];
  /** named plainly rather than omitted: a gap the reader can see is honest */
  unevidenced: { skill_id: string; canonical_name: string; necessity: string }[];
  as_of: string;
  policy: string;
  model_version: string;
  notes: string[];
};

/**
 * A job requirement is a caller-supplied document, so validate it rather than
 * trusting it: an unknown skill id would silently match nothing and read as
 * "this person has no evidence", which is a different claim from "we do not
 * track that".
 */
export function checkRequirement(job: JobRequirement): string[] {
  const problems: string[] = [];
  if (!job.id?.trim()) problems.push("job id is required");
  if (!job.title?.trim()) problems.push("job title is required");
  if (!Array.isArray(job.skills) || !job.skills.length)
    problems.push("a job must name at least one skill");
  for (const s of job.skills || []) {
    if (!isSkill(s.skill_id))
      problems.push(
        `"${s.skill_id}" is not in the skill vocabulary; this system cannot speak to it either way`,
      );
    if (!["required", "preferred", "bonus"].includes(s.necessity))
      problems.push(`"${s.skill_id}" needs a necessity of required, preferred or bonus`);
  }
  return problems;
}

/**
 * The evidence this person has for THIS job.
 *
 * Only the skills the job names are surfaced. That is the whole difference
 * between this and `evidenceProfile`, and it is the reason the same person's
 * backend match and sponsorship match share no episodes: the work was different
 * work, and a general profile hides that behind a wall of everything.
 */
export function jobEvidenceMatch(input: {
  personId: string;
  job: JobRequirement;
  audience: Audience;
  asOf?: string;
}): PersonJobEvidenceMatch {
  profilesInit();
  const problems = checkRequirement(input.job);
  if (problems.length) fail("This job description cannot be matched: " + problems.join("; "), 422);
  const asOf = input.asOf || timestamp();
  const base = {
    person: { id: input.personId, name: personName(input.personId) },
    job: { id: input.job.id, title: input.job.title, employer: input.job.employer },
    audience: input.audience,
    as_of: asOf,
    policy: POLICY,
    model_version: MODEL_VERSION,
  };

  const grant = activeGrant(input.personId, input.audience, "skill_evidence", asOf);
  if (!grant)
    return release({
      ...base,
      granted: false,
      requirements: [],
      unevidenced: [],
      notes: [
        `No live ${input.audience} grant for this person as of ${asOf}. Nothing is released — not a partial record.`,
      ],
    });

  const requirements: RequirementEvidence[] = [];
  const unevidenced: PersonJobEvidenceMatch["unevidenced"] = [];
  for (const want of input.job.skills) {
    const summary = skillSummary(input.personId, want.skill_id, asOf);
    if (!summary.links.length) {
      unevidenced.push({
        skill_id: want.skill_id,
        canonical_name: summary.canonical_name,
        necessity: want.necessity,
      });
      continue;
    }
    requirements.push({
      ...section(summary, asOf),
      necessity: want.necessity,
      employer_note: want.note || "",
    });
  }

  return release({
    ...base,
    granted: true,
    requirements,
    unevidenced,
    notes: [
      NO_SCORE_NOTE,
      SINGLE_INSTANCE_NOTE,
      `Scoped to the ${input.job.skills.length} skills this role names. Work outside them is not shown, and its absence here says nothing about it.`,
      "Absence of evidence is absence of a club record, which is not the same as absence of the skill.",
    ],
  });
}

// ================================================================ the VC view

const WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];
const word = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type CollaborationPair = {
  people: string[];
  shared_episodes: number;
  first_together: string;
  last_together: string;
  episodes: { id: string; title: string }[];
};

export type VentureEvidence = {
  granted: boolean;
  venture: { name: string };
  founders: { id: string; name: string }[];
  /** ids the caller asked about that have not consented, so they can be asked */
  withheld: string[];
  audience: Audience;
  team_formation: {
    founder_count: number;
    first_shared_episode: { id: string; title: string; started_at: string } | null;
    known_each_other_days: number;
  };
  repeated_collaboration: {
    shared_episodes: number;
    prior_shared_episodes: number;
    pairs: CollaborationPair[];
  };
  shipping: {
    artifacts: (ExternalArtifact & { person: string })[];
    completed_episodes: { id: string; title: string; status: string }[];
  };
  persistence: {
    first_activity: string | null;
    last_activity: string | null;
    active_days: number;
    days_active_after_origin: number;
    origin: { id: string; title: string; ended_at: string; basis: string } | null;
  };
  iteration: {
    revisions: number;
    working_days: number;
    median_gap_days: number;
  };
  external_usage: (ExternalArtifact & { person: string; detail: string })[];
  continuation: {
    episodes_started_after_origin: { id: string; title: string; started_at: string }[];
    still_active: boolean;
  };
  as_of: string;
  policy: string;
  model_version: string;
  reading: string;
  notes: string[];
};

type Ev = {
  episode_id: string;
  actor_id: string;
  subject_id: string;
  action_family: string;
  event_type: string;
  occurred_at: string;
};

/**
 * What an investor gets: how the team came together, how often these people have
 * worked together before, what they shipped, and whether they kept going after
 * the thing that brought them together ended.
 *
 * Same rule as the employer view — facts and dates, no score. The judgment an
 * investor is paying for is their own; what this removes is the part where they
 * have to take a founder's word for the timeline.
 *
 * Consent is ALL-OR-NOTHING across the named founders. A team narrative built
 * from the two people who consented misrepresents a team of three, and the
 * omission is invisible to the reader, which makes it worse than no answer.
 */
export function vcProfile(input: {
  founders: string[];
  audience: Audience;
  venture?: { name?: string; originEpisodeId?: string };
  asOf?: string;
}): VentureEvidence {
  profilesInit();
  const asOf = input.asOf || timestamp();
  const founders = [...new Set(input.founders)].filter(Boolean);
  if (!founders.length) fail("Name at least one founder.");
  if (!SCOPE_AUDIENCES.venture_evidence.includes(input.audience))
    fail("Venture evidence is not offered to that audience.", 422);

  const empty = (withheld: string[], why: string): VentureEvidence =>
    release({
      granted: false,
      venture: { name: input.venture?.name || "" },
      founders: [],
      withheld,
      audience: input.audience,
      team_formation: {
        founder_count: 0,
        first_shared_episode: null,
        known_each_other_days: 0,
      },
      repeated_collaboration: { shared_episodes: 0, prior_shared_episodes: 0, pairs: [] },
      shipping: { artifacts: [], completed_episodes: [] },
      persistence: {
        first_activity: null,
        last_activity: null,
        active_days: 0,
        days_active_after_origin: 0,
        origin: null,
      },
      iteration: { revisions: 0, working_days: 0, median_gap_days: 0 },
      external_usage: [],
      continuation: { episodes_started_after_origin: [], still_active: false },
      as_of: asOf,
      policy: POLICY,
      model_version: MODEL_VERSION,
      reading: why,
      notes: [why],
    });

  const withheld = founders.filter(
    (f) => !activeGrant(f, input.audience, "venture_evidence", asOf),
  );
  if (withheld.length)
    return empty(
      withheld,
      `${withheld.length} of ${founders.length} named founders have no live ${input.audience} grant as of ${asOf}. ` +
        "Nothing is released: a team record missing a founder is a misleading team record.",
    );

  const marks = founders.map(() => "?").join(",");
  const events = db()
    .prepare(
      `SELECT episode_id,actor_id,subject_id,action_family,event_type,occurred_at
         FROM activity_events
        WHERE occurred_at<=? AND observed_at<=?
          AND (actor_id IN (${marks}) OR subject_id IN (${marks}))
        ORDER BY occurred_at`,
    )
    .all(...([asOf, asOf, ...founders, ...founders] as any[])) as Ev[];

  // Who appears in which episode, and when.
  const byEpisode = new Map<string, { people: Set<string>; first: string; last: string }>();
  for (const e of events) {
    if (!e.episode_id) continue;
    const slot =
      byEpisode.get(e.episode_id) ||
      { people: new Set<string>(), first: e.occurred_at, last: e.occurred_at };
    for (const p of [e.actor_id, e.subject_id])
      if (founders.includes(p)) slot.people.add(p);
    if (e.occurred_at < slot.first) slot.first = e.occurred_at;
    if (e.occurred_at > slot.last) slot.last = e.occurred_at;
    byEpisode.set(e.episode_id, slot);
  }

  const titles = new Map<string, { title: string; status: string; created_at: string }>();
  for (const eid of byEpisode.keys()) {
    const ep = episodeRow(eid);
    if (ep) titles.set(eid, { title: ep.title, status: ep.status, created_at: ep.created_at });
  }

  const origin = input.venture?.originEpisodeId || "";

  // "The hackathon ended" is an event, not a vibe: prefer the recorded outcome
  // on the origin episode, and say plainly when falling back to its start date.
  let originEnd = "";
  let originBasis = "";
  if (origin) {
    const out = db()
      .prepare(
        "SELECT occurred_at FROM activity_events WHERE episode_id=? AND event_type='episode.outcome_recorded' AND occurred_at<=? ORDER BY occurred_at DESC LIMIT 1",
      )
      .get(origin, asOf) as { occurred_at: string } | undefined;
    if (out) {
      originEnd = out.occurred_at;
      originBasis = "the recorded outcome on the origin episode";
    } else {
      const ep = episodeRow(origin);
      originEnd = ep?.created_at || "";
      originBasis =
        "the origin episode's start date; no outcome was ever recorded on it, so any gap measured from here is the longer reading";
    }
  }

  const shared = [...byEpisode.entries()].filter(([, v]) => v.people.size >= 2);
  // "Previous" means before, not merely other. With an origin episode named,
  // a prior project is one these people were already working on together when
  // the venture started; the continuation work that came afterwards is
  // evidence of persistence and is counted there instead, not twice.
  const priorShared = origin
    ? shared.filter(([eid, v]) => eid !== origin && (!originEnd || v.first < originEnd))
    : shared;

  // Team formation: the earliest episode in which two of them appear together.
  const firstSharedEntry = shared
    .slice()
    .sort((a, b) => a[1].first.localeCompare(b[1].first))[0];
  const firstShared = firstSharedEntry
    ? {
        id: firstSharedEntry[0],
        title: titles.get(firstSharedEntry[0])?.title || "",
        started_at: firstSharedEntry[1].first,
      }
    : null;

  // Pairwise, because "the team has worked together" hides which pair has.
  const pairs: CollaborationPair[] = [];
  for (let i = 0; i < founders.length; i++)
    for (let j = i + 1; j < founders.length; j++) {
      const both = [...byEpisode.entries()].filter(
        ([, v]) => v.people.has(founders[i]) && v.people.has(founders[j]),
      );
      if (!both.length) continue;
      pairs.push({
        people: [personName(founders[i]), personName(founders[j])],
        shared_episodes: both.length,
        first_together: both.reduce((m, [, v]) => (v.first < m ? v.first : m), both[0][1].first),
        last_together: both.reduce((m, [, v]) => (v.last > m ? v.last : m), both[0][1].last),
        episodes: both.map(([eid]) => ({ id: eid, title: titles.get(eid)?.title || "" })),
      });
    }

  // Shipping: things that exist afterwards, plus episodes that actually closed.
  const artifactRows = db()
    .prepare(
      `SELECT person_id,kind,title,url,detail,produced_at FROM skill_artifacts
        WHERE person_id IN (${marks}) AND produced_at<=? AND recorded_at<=?
        ORDER BY produced_at`,
    )
    .all(...([...founders, asOf, asOf] as any[])) as {
    person_id: string;
    kind: string;
    title: string;
    url: string;
    detail: string;
    produced_at: string;
  }[];
  const completed = [...titles.entries()]
    .filter(([, t]) => t.status === "completed")
    .map(([eid, t]) => ({ id: eid, title: t.title, status: t.status }));

  // Persistence: did they keep going after the thing that brought them together?
  const firstActivity = events.length ? events[0].occurred_at : null;
  const lastActivity = events.length ? events[events.length - 1].occurred_at : null;
  const wholeDays = (from: string, to: string) =>
    Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / DAY));
  const activeDays = firstActivity && lastActivity ? wholeDays(firstActivity, lastActivity) : 0;
  const afterOrigin =
    originEnd && lastActivity ? wholeDays(originEnd, lastActivity) : 0;

  // Iteration: how often the work came back for another pass, and how bunched
  // the working days are. Whole days only; a median in fractional days would be
  // a number about people wearing a precision it has not earned.
  const revisions = events.filter((e) =>
    ["REVISE", "REVIEW"].includes(e.action_family),
  ).length;
  const days = [...new Set(events.map((e) => e.occurred_at.slice(0, 10)))].sort();
  const gaps: number[] = [];
  for (let i = 1; i < days.length; i++) gaps.push(wholeDays(days[i - 1], days[i]));
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length
    ? Math.round((gaps[Math.floor((gaps.length - 1) / 2)] + gaps[Math.ceil((gaps.length - 1) / 2)]) / 2)
    : 0;

  const usage = artifactRows.filter((a) => a.kind === "usage_record");
  const startedAfter = originEnd
    ? [...byEpisode.entries()]
        .filter(([eid, v]) => eid !== origin && v.first > originEnd)
        .map(([eid, v]) => ({
          id: eid,
          title: titles.get(eid)?.title || "",
          started_at: v.first,
        }))
    : [];

  const reading =
    `${cap(word(founders.length))} founder${founders.length === 1 ? "" : "s"} ` +
    (priorShared.length
      ? `have collaborated across ${word(priorShared.length)} previous project${priorShared.length === 1 ? "" : "s"}`
      : "have no previously recorded shared project") +
    (originEnd && afterOrigin
      ? ` and continued working for ${afterOrigin} days after ${titles.get(origin)?.title || "the origin project"}.`
      : ".") +
    (artifactRows.length
      ? ` ${cap(word(artifactRows.length))} artifact${artifactRows.length === 1 ? "" : "s"} are on the record.`
      : "");

  return release({
    granted: true,
    venture: { name: input.venture?.name || "" },
    founders: founders.map((f) => ({ id: f, name: personName(f) })),
    withheld: [],
    audience: input.audience,
    team_formation: {
      founder_count: founders.length,
      first_shared_episode: firstShared,
      known_each_other_days:
        firstShared && lastActivity ? wholeDays(firstShared.started_at, lastActivity) : 0,
    },
    repeated_collaboration: {
      shared_episodes: shared.length,
      prior_shared_episodes: priorShared.length,
      pairs,
    },
    shipping: {
      artifacts: artifactRows
        .filter((a) => a.kind !== "usage_record")
        .map((a) => ({
          person: personName(a.person_id),
          kind: a.kind,
          title: a.title,
          url: a.url,
          produced_at: a.produced_at,
        })),
      completed_episodes: completed,
    },
    persistence: {
      first_activity: firstActivity,
      last_activity: lastActivity,
      active_days: activeDays,
      days_active_after_origin: afterOrigin,
      origin: origin
        ? {
            id: origin,
            title: titles.get(origin)?.title || episodeRow(origin)?.title || "",
            ended_at: originEnd,
            basis: originBasis,
          }
        : null,
    },
    iteration: { revisions, working_days: days.length, median_gap_days: medianGap },
    external_usage: usage.map((a) => ({
      person: personName(a.person_id),
      kind: a.kind,
      title: a.title,
      url: a.url,
      detail: a.detail,
      produced_at: a.produced_at,
    })),
    continuation: {
      episodes_started_after_origin: startedAfter,
      still_active: !!lastActivity && wholeDays(lastActivity, asOf) <= 30,
    },
    as_of: asOf,
    policy: POLICY,
    model_version: MODEL_VERSION,
    reading,
    notes: [
      NO_SCORE_NOTE,
      "Counts are of club records only. Work these people did elsewhere is not here and its absence means nothing.",
      "Every founder named in this request has an active grant for this audience; a team with any founder withholding returns nothing at all.",
    ],
  });
}

/** What a member sees about their own external exposure. The mirror test. */
export function myGrants(u: User): GrantRow[] {
  profilesInit();
  return db()
    .prepare(
      "SELECT id,person_id,audience,scope,granted_at,revoked_at,note FROM professional_profile_grants WHERE person_id=? ORDER BY granted_at DESC",
    )
    .all(u.id) as GrantRow[];
}

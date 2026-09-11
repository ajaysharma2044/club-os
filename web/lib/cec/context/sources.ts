// The context source registry: which external feeds exist, whose they are, and
// whether we are allowed to touch them.
//
// `CAMPUS_SOURCES` in ../campus.ts is an array literal with one entry. That was
// the right shape for one school and is the wrong shape the moment a second
// exists: a source's permission basis gets re-reviewed, a parser gets a new
// version, a crawl fails for three days running, and none of that is
// expressible in a constant that ships with the bundle. Those are facts about
// the world that change on their own schedule, so they live in a table.
//
// Two rules this module exists to enforce:
//
//   1. INSTITUTION IS A COLUMN, NOT AN ASSUMPTION. Nothing here hard-codes
//      Cornell. Cornell is one seeded row, derived from CAMPUS_SOURCES so its
//      facts are stated once. `sourcesFor(institutionId)` is the only way in.
//
//   2. DETECTION AND PERMISSION STAY SEPARATE. Yale's Localist endpoint returns
//      perfectly good JSON and Yale's robots.txt says `Disallow: /`. We record
//      the source, we construct its URL, and we never fetch it. The gate is
//      ../campus.ts's `mayFetch` reused verbatim rather than reimplemented,
//      because two copies of a consent rule is one copy of a consent rule plus
//      a future bug.
//
// Every crawl attempt is logged whether it succeeded, failed, or was refused.
// A source that silently stopped returning rows three weeks ago looks exactly
// like a quiet campus unless the attempt log says otherwise.

import { db, fail, id, timestamp } from "../db";
import { CAMPUS_SOURCES, mayFetch, type CampusSource } from "../campus";

// ================================================================= taxonomy

/**
 * How the feed is shaped, not what it contains. `localist` and `livewhale` map
 * onto the parsers in ../campus.ts; the rest are registered-but-unparsed today
 * and exist so a source can be recorded before an adapter is written.
 */
export const SOURCE_TYPES = [
  "localist",
  "livewhale",
  "ics",
  "rss",
  "json_api",
  "html",
  "manual",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** Deliberately identical to `CampusSource["permission"]` so `mayFetch` applies unchanged. */
export const PERMISSION_BASES = [
  "robots_allowed",
  "robots_disallowed",
  "partnership",
  "unreviewed",
] as const;
export type PermissionBasis = (typeof PERMISSION_BASES)[number];

/**
 * How much the source's own words are worth.
 *
 * `authoritative` is the institution stating a fact about itself (the registrar
 * publishing the add/drop deadline). `published` is the institution publishing
 * someone else's event. `aggregated` is a third party restating both. `inferred`
 * is us, and is the only level that should ever be argued with.
 */
export const TRUST_LEVELS = ["authoritative", "published", "aggregated", "inferred"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

/** Default confidence a canonical record inherits from the source it came from. */
export const TRUST_CONFIDENCE: Record<TrustLevel, number> = {
  authoritative: 0.95,
  published: 0.8,
  aggregated: 0.6,
  inferred: 0.4,
};

export const CRAWL_FREQUENCIES = ["hourly", "daily", "weekly", "termly", "manual"] as const;
export type CrawlFrequency = (typeof CRAWL_FREQUENCIES)[number];

export const RUN_STATUSES = ["attempted", "success", "error", "refused"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export type SourceRow = {
  source_id: string;
  institution_id: string;
  name: string;
  source_type: SourceType;
  base_url: string;
  permission_basis: PermissionBasis;
  trust_level: TrustLevel;
  parser_version: string;
  crawl_frequency: CrawlFrequency;
  last_attempt_at: string | null;
  last_success_at: string | null;
  active: number;
  notes: string;
  permission_checked_at: string | null;
};

export type RunRow = {
  id: string;
  source_id: string;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  rows_seen: number;
  rows_new: number;
  error: string;
  parser_version: string;
};

// ================================================================== schema

let ready = false;
export function sourcesInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS context_sources(
  source_id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  permission_basis TEXT NOT NULL DEFAULT 'unreviewed',
  trust_level TEXT NOT NULL DEFAULT 'published',
  parser_version TEXT NOT NULL DEFAULT '1.0.0',
  crawl_frequency TEXT NOT NULL DEFAULT 'daily',
  last_attempt_at TEXT,
  last_success_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  notes TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS context_source_inst ON context_sources(institution_id,active);
CREATE TABLE IF NOT EXISTS context_source_runs(
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES context_sources(source_id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'attempted',
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_new INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  parser_version TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS context_source_run_src ON context_source_runs(source_id,started_at);
`);
  // Additive migration for databases created before the permission basis had a
  // review date. Nullable, because for an existing row we genuinely do not know
  // when it was last checked and a default would be a lie.
  const cols = db().prepare("PRAGMA table_info(context_sources)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "permission_checked_at"))
    db().exec("ALTER TABLE context_sources ADD COLUMN permission_checked_at TEXT");

  seedFromCode();
  ready = true;
}

/**
 * Bring the in-code sources into the table.
 *
 * Cornell lands here as ONE row, with `institution_id = "cornell"`. The point
 * of doing it this way rather than writing an INSERT with Cornell's URL in it
 * is that the seed loop does not know Cornell exists — it copies whatever
 * CAMPUS_SOURCES holds. Adding a school stays a row of config.
 *
 * Idempotent, and it never overwrites a row an operator has edited: the
 * registry is the live record once it exists, the code constant is only the
 * bootstrap.
 */
function seedFromCode() {
  const insert = db().prepare(
    `INSERT INTO context_sources(source_id,institution_id,name,source_type,base_url,permission_basis,trust_level,parser_version,crawl_frequency,active,notes,permission_checked_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?)
     ON CONFLICT(source_id) DO NOTHING`,
  );
  for (const s of CAMPUS_SOURCES) {
    insert.run(
      `${s.key}_${s.platform}`,
      s.key,
      s.label,
      s.platform,
      s.base,
      s.permission,
      "published",
      "1.0.0",
      "daily",
      `Seeded from CAMPUS_SOURCES in lib/cec/campus.ts.`,
      s.permissionCheckedAt ?? null,
    );
  }
}

// ============================================================== registration

export type SourceInput = {
  sourceId: string;
  institutionId: string;
  name: string;
  sourceType: SourceType;
  baseUrl: string;
  permissionBasis?: PermissionBasis;
  trustLevel?: TrustLevel;
  parserVersion?: string;
  crawlFrequency?: CrawlFrequency;
  active?: boolean;
  notes?: string;
  permissionCheckedAt?: string | null;
};

const KEY_RE = /^[a-z][a-z0-9_]{2,63}$/;

/**
 * Register or update a source.
 *
 * `permission_basis` defaults to `unreviewed`, which is NOT fetchable. Anyone
 * adding a feed has to state why we may read it; forgetting produces a source
 * that is recorded and left alone rather than one that is quietly crawled.
 *
 * An update deliberately leaves `last_attempt_at` and `last_success_at` alone.
 * Re-registering a source with a new parser version must not erase the evidence
 * that it has been failing since Tuesday.
 */
export function registerSource(input: SourceInput): SourceRow {
  sourcesInit();
  if (!KEY_RE.test(input.sourceId ?? ""))
    fail("source_id must be lower_snake_case, 3-64 characters.");
  if (!KEY_RE.test(input.institutionId ?? ""))
    fail("institution_id must be lower_snake_case, 3-64 characters.");
  if (!input.name?.trim()) fail("A source needs a human-readable name.");
  if (!SOURCE_TYPES.includes(input.sourceType))
    fail(`source_type must be one of ${SOURCE_TYPES.join(", ")}.`);
  if (!/^https?:\/\//.test(input.baseUrl ?? "")) fail("base_url must be an http(s) URL.");

  const permission = input.permissionBasis ?? "unreviewed";
  if (!PERMISSION_BASES.includes(permission))
    fail(`permission_basis must be one of ${PERMISSION_BASES.join(", ")}.`);
  const trust = input.trustLevel ?? "published";
  if (!TRUST_LEVELS.includes(trust)) fail(`trust_level must be one of ${TRUST_LEVELS.join(", ")}.`);
  const frequency = input.crawlFrequency ?? "daily";
  if (!CRAWL_FREQUENCIES.includes(frequency))
    fail(`crawl_frequency must be one of ${CRAWL_FREQUENCIES.join(", ")}.`);

  db()
    .prepare(
      `INSERT INTO context_sources(source_id,institution_id,name,source_type,base_url,permission_basis,trust_level,parser_version,crawl_frequency,active,notes,permission_checked_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(source_id) DO UPDATE SET
         institution_id=excluded.institution_id,
         name=excluded.name,
         source_type=excluded.source_type,
         base_url=excluded.base_url,
         permission_basis=excluded.permission_basis,
         trust_level=excluded.trust_level,
         parser_version=excluded.parser_version,
         crawl_frequency=excluded.crawl_frequency,
         active=excluded.active,
         notes=excluded.notes,
         permission_checked_at=excluded.permission_checked_at`,
    )
    .run(
      input.sourceId,
      input.institutionId,
      input.name.trim().slice(0, 200),
      input.sourceType,
      input.baseUrl.replace(/\/$/, ""),
      permission,
      trust,
      (input.parserVersion || "1.0.0").slice(0, 32),
      frequency,
      input.active === false ? 0 : 1,
      (input.notes || "").slice(0, 2000),
      input.permissionCheckedAt ?? null,
    );
  return source(input.sourceId);
}

export function source(sourceId: string): SourceRow {
  sourcesInit();
  const row = db()
    .prepare("SELECT * FROM context_sources WHERE source_id=?")
    .get(sourceId) as SourceRow | undefined;
  if (!row) fail("Context source not found.", 404);
  return row;
}

export function findSource(sourceId: string): SourceRow | null {
  sourcesInit();
  return (
    (db()
      .prepare("SELECT * FROM context_sources WHERE source_id=?")
      .get(sourceId) as SourceRow | undefined) ?? null
  );
}

/**
 * Every source belonging to one institution. Inactive rows are included by
 * default because "what feeds does this school have" and "what may we crawl
 * tonight" are different questions with different answers.
 */
export function sourcesFor(
  institutionId: string,
  opts: { activeOnly?: boolean } = {},
): SourceRow[] {
  sourcesInit();
  const sql = opts.activeOnly
    ? "SELECT * FROM context_sources WHERE institution_id=? AND active=1 ORDER BY name"
    : "SELECT * FROM context_sources WHERE institution_id=? ORDER BY name";
  return db().prepare(sql).all(institutionId) as SourceRow[];
}

export function institutions(): string[] {
  sourcesInit();
  return (
    db()
      .prepare("SELECT DISTINCT institution_id FROM context_sources ORDER BY institution_id")
      .all() as { institution_id: string }[]
  ).map((r) => r.institution_id);
}

// ============================================================ the consent gate

/**
 * Shape a registry row so ../campus.ts's `mayFetch` can judge it.
 *
 * `platform` is filled in with whatever the parser would use and is irrelevant
 * to the decision — consent is a property of the host, not of the response
 * format. Only `permission` and `label` are read.
 */
function forGate(row: SourceRow): CampusSource {
  return {
    key: row.source_id,
    label: row.name,
    platform: row.source_type === "livewhale" ? "livewhale" : "localist",
    base: row.base_url,
    permission: row.permission_basis,
    permissionCheckedAt: row.permission_checked_at ?? undefined,
  };
}

/**
 * May we fetch this source?
 *
 * Permission is checked BEFORE `active`, and the order matters: a disallowed
 * host is never fetchable for any reason, and flipping `active` back on must
 * not read like a way to get past that. Deactivation is an operational pause;
 * `robots_disallowed` is a refusal.
 */
export function maySource(row: SourceRow): { allowed: boolean; reason: string } {
  const gate = mayFetch(forGate(row));
  if (!gate.allowed) return gate;
  if (!row.active)
    return {
      allowed: false,
      reason: `${row.name} is deactivated in the registry.`,
    };
  return { allowed: true, reason: "" };
}

/**
 * The gate a crawler must pass, with the refusal written to the run log.
 *
 * A refusal that leaves no trace is indistinguishable from a source nobody ever
 * tried, which is how a feed quietly disappears from a model's inputs.
 */
export function mayCrawl(sourceId: string): { allowed: boolean; reason: string; runId?: string } {
  const row = source(sourceId);
  const gate = maySource(row);
  if (gate.allowed) return gate;
  const runId = id();
  const now = timestamp();
  db()
    .prepare(
      `INSERT INTO context_source_runs(id,source_id,started_at,finished_at,status,rows_seen,rows_new,error,parser_version)
       VALUES (?,?,?,?,'refused',0,0,?,?)`,
    )
    .run(runId, sourceId, now, now, gate.reason.slice(0, 1000), row.parser_version);
  return { ...gate, runId };
}

/** Sources for one institution that we may actually call tonight. */
export function crawlableSources(institutionId: string): SourceRow[] {
  return sourcesFor(institutionId).filter((s) => maySource(s).allowed);
}

// ================================================================ crawl log

/**
 * Open a run. Stamps `last_attempt_at` immediately, before the fetch, so a
 * crawl that hangs or crashes still leaves the attempt on the record.
 */
export function recordAttempt(sourceId: string, at = timestamp()): string {
  const row = source(sourceId);
  const runId = id();
  db()
    .prepare(
      `INSERT INTO context_source_runs(id,source_id,started_at,status,parser_version)
       VALUES (?,?,?,'attempted',?)`,
    )
    .run(runId, sourceId, at, row.parser_version);
  db().prepare("UPDATE context_sources SET last_attempt_at=? WHERE source_id=?").run(at, sourceId);
  return runId;
}

/**
 * Close a run that worked.
 *
 * `rowsSeen` and `rowsNew` are both recorded because their ratio is the health
 * signal: a feed returning 400 rows of which 0 are new every night is either
 * stable or broken upstream, and only the trend can tell you which.
 */
export function recordSuccess(
  runId: string,
  counts: { rowsSeen: number; rowsNew: number },
  at = timestamp(),
): void {
  sourcesInit();
  const run = db()
    .prepare("SELECT source_id FROM context_source_runs WHERE id=?")
    .get(runId) as { source_id: string } | undefined;
  if (!run) fail("Crawl run not found.", 404);
  const seen = Math.max(0, Math.trunc(Number(counts.rowsSeen) || 0));
  const added = Math.max(0, Math.trunc(Number(counts.rowsNew) || 0));
  db()
    .prepare(
      "UPDATE context_source_runs SET finished_at=?, status='success', rows_seen=?, rows_new=? WHERE id=?",
    )
    .run(at, seen, added, runId);
  db()
    .prepare("UPDATE context_sources SET last_success_at=? WHERE source_id=?")
    .run(at, run.source_id);
}

/** Close a run that did not work. `last_success_at` is deliberately untouched. */
export function recordFailure(runId: string, error: string, at = timestamp()): void {
  sourcesInit();
  db()
    .prepare(
      "UPDATE context_source_runs SET finished_at=?, status='error', error=? WHERE id=?",
    )
    .run(at, String(error || "unknown error").slice(0, 1000), runId);
}

export function sourceRuns(sourceId: string, limit = 50): RunRow[] {
  sourcesInit();
  return db()
    .prepare(
      "SELECT * FROM context_source_runs WHERE source_id=? ORDER BY started_at DESC, id DESC LIMIT ?",
    )
    .all(sourceId, Math.min(Math.max(limit, 1), 500)) as RunRow[];
}

/**
 * Sources whose last success is older than their crawl frequency allows.
 *
 * This is the report that catches the failure mode the whole run log exists
 * for: a model reading an empty feed and concluding the campus is quiet.
 */
export function staleSources(
  institutionId: string,
  asOf = timestamp(),
): { source: SourceRow; hoursSince: number | null; reason: string }[] {
  const budgetHours: Record<CrawlFrequency, number> = {
    hourly: 3,
    daily: 36,
    weekly: 10 * 24,
    termly: 120 * 24,
    manual: Infinity,
  };
  const now = Date.parse(asOf);
  const out: { source: SourceRow; hoursSince: number | null; reason: string }[] = [];
  for (const s of crawlableSources(institutionId)) {
    const budget = budgetHours[s.crawl_frequency] ?? 36;
    if (!Number.isFinite(budget)) continue;
    if (!s.last_success_at) {
      out.push({ source: s, hoursSince: null, reason: `${s.name} has never returned rows.` });
      continue;
    }
    const hours = (now - Date.parse(s.last_success_at)) / 3600e3;
    if (hours > budget)
      out.push({
        source: s,
        hoursSince: hours,
        reason: `${s.name} last returned rows ${Math.round(hours)}h ago, past its ${s.crawl_frequency} budget. Treat an empty feed as missing data, not as a quiet campus.`,
      });
  }
  return out;
}

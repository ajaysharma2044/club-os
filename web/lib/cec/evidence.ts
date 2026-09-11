import {
  db,
  tx,
  type User,
  type Item,
  member,
  officer,
  item,
  id,
  timestamp,
  text,
  fail,
  date,
  hash,
} from "./db";

export const FAMILIES = [
  "JOIN",
  "INITIATE",
  "COMMIT",
  "EXECUTE",
  "HANDOFF",
  "COORDINATE",
  "HELP",
  "REQUEST_HELP",
  "DECIDE",
  "COMMUNICATE",
  "REVIEW",
  "REVISE",
  "ESCALATE",
  "COMPLETE",
  "OUTCOME",
] as const;
type Family = (typeof FAMILIES)[number];
const ORG = "cornell-ec";
const POLICY = "native-episode-evidence-v1";
export const BLOCKERS = [
  "waiting_on_person",
  "waiting_on_external_partner",
  "need_information",
  "need_approval",
  "need_resources",
  "scope_unclear",
  "technical_issue",
  "time_constraint",
  "other",
];

export function evidenceInit() {
  db().exec(`
CREATE TABLE IF NOT EXISTS episodes(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,goal TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',source_type TEXT NOT NULL,source_id TEXT NOT NULL,created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,UNIQUE(source_type,source_id));
CREATE TABLE IF NOT EXISTS episode_objects(object_type TEXT NOT NULL,object_id TEXT NOT NULL,episode_id TEXT NOT NULL REFERENCES episodes(id),PRIMARY KEY(object_type,object_id));
CREATE TABLE IF NOT EXISTS activity_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,source_key TEXT UNIQUE NOT NULL,organization_id TEXT NOT NULL,episode_id TEXT NOT NULL REFERENCES episodes(id),actor_id TEXT NOT NULL REFERENCES users(id),subject_id TEXT NOT NULL REFERENCES users(id),action_family TEXT NOT NULL,event_type TEXT NOT NULL,object_type TEXT NOT NULL,object_id TEXT NOT NULL,occurred_at TEXT NOT NULL,observed_at TEXT NOT NULL,source TEXT NOT NULL,source_ref TEXT NOT NULL,evidence_level TEXT NOT NULL,visibility TEXT NOT NULL,policy TEXT NOT NULL,context TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS activity_episode ON activity_events(episode_id,seq);
CREATE INDEX IF NOT EXISTS activity_subject ON activity_events(subject_id,seq);
CREATE TABLE IF NOT EXISTS evidence_snapshots(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),as_of TEXT NOT NULL,computed_at TEXT NOT NULL,policy TEXT NOT NULL,evidence_hash TEXT NOT NULL,features TEXT NOT NULL,UNIQUE(user_id,as_of,policy,evidence_hash));
CREATE TABLE IF NOT EXISTS work_blockers(id TEXT PRIMARY KEY,episode_id TEXT NOT NULL REFERENCES episodes(id),task_id TEXT NOT NULL REFERENCES items(id),reporter TEXT NOT NULL REFERENCES users(id),category TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT,resolver TEXT REFERENCES users(id),resolution TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS blocker_open ON work_blockers(task_id) WHERE resolved_at IS NULL;
CREATE TRIGGER IF NOT EXISTS activity_no_update BEFORE UPDATE ON activity_events BEGIN SELECT RAISE(ABORT,'append only; add a correction'); END;
CREATE TRIGGER IF NOT EXISTS activity_no_delete BEFORE DELETE ON activity_events BEGIN SELECT RAISE(ABORT,'append only; use a governed erasure migration'); END;
`);
}
export function ensureEpisode(
  u: User,
  type: string,
  sourceId: string,
  title: string,
  goal = "",
  owner = u.id,
) {
  evidenceInit();
  const prior = db()
    .prepare(
      "SELECT episode_id FROM episode_objects WHERE object_type=? AND object_id=?",
    )
    .get(type, sourceId) as any;
  if (prior) return prior.episode_id as string;
  const eid = id();
  db()
    .prepare(
      "INSERT INTO episodes(id,organization_id,owner,title,goal,source_type,source_id,created_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(eid, ORG, owner, title, goal, type, sourceId, timestamp());
  db()
    .prepare("INSERT INTO episode_objects VALUES(?,?,?)")
    .run(type, sourceId, eid);
  return eid;
}
export function recordEvidence(
  u: User,
  e: {
    episode: string;
    subject?: string;
    family: Family;
    type: string;
    objectType: string;
    object: string;
    sourceKey?: string;
    level?:
      | "system_observed"
      | "self_reported"
      | "counterparty_confirmed"
      | "system_derived"
      | "external_published";
    context?: Record<string, unknown>;
    /**
     * When the thing actually happened. Defaults to now, which is correct for
     * native writes — a member clicking "accept" happens as we learn it.
     *
     * It is NOT correct for anything we ingest. A campus event published on
     * 1 September and read by us on 11 September genuinely has two different
     * times, and collapsing them makes every backtest fiction: a model
     * replaying 5 September would "know" a fact nobody had yet.
     *
     * Until now nothing in this codebase ever passed these separately, so the
     * bitemporal column pair was degenerate — present in the schema, never
     * exercised. Every correct reader already filters BOTH columns (see the
     * snapshot query below), so splitting them here is safe; the half-filtered
     * readers in signals.ts are the ones to fix next.
     */
    occurredAt?: string;
    /** When WE learned it. Always defaults to now and should rarely be passed. */
    observedAt?: string;
    /** Where it came from. "club_os" for native work, a source id for ingest. */
    source?: string;
    visibility?: string;
    policy?: string;
  },
) {
  const key = e.sourceKey || id(),
    now = timestamp();
  const observedAt = e.observedAt || now;
  const occurredAt = e.occurredAt || observedAt;
  // We cannot have observed something before it happened. A source claiming
  // otherwise is malformed, and silently accepting it would put a row in the
  // record that no point-in-time query can ever return correctly.
  if (occurredAt > observedAt)
    fail("Evidence cannot occur after it was observed.", 422);
  db()
    .prepare(
      "INSERT OR IGNORE INTO activity_events(id,source_key,organization_id,episode_id,actor_id,subject_id,action_family,event_type,object_type,object_id,occurred_at,observed_at,source,source_ref,evidence_level,visibility,policy,context) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      id(),
      key,
      ORG,
      e.episode,
      u.id,
      e.subject || u.id,
      e.family,
      e.type,
      e.objectType,
      e.object,
      occurredAt,
      observedAt,
      e.source || "club_os",
      e.sourceKey || e.object,
      e.level || "system_observed",
      e.visibility || "club_internal",
      e.policy || POLICY,
      JSON.stringify(e.context || {}),
    );
}
function taskEpisode(u: User, r: Item) {
  evidenceInit();
  const prior = db()
    .prepare(
      "SELECT episode_id FROM episode_objects WHERE object_type='task' AND object_id=?",
    )
    .get(r.id) as any;
  if (prior) return prior.episode_id as string;
  if (!r.data.project_id)
    return ensureEpisode(u, "task", r.id, r.data.title, r.data.origin, r.owner);
  const project = item(r.data.project_id, "project");
  const eid = ensureEpisode(
    u,
    "project",
    project.id,
    project.data.title,
    project.data.description,
    project.owner,
  );
  db().prepare("INSERT INTO episode_objects VALUES('task',?,?)").run(r.id, eid);
  return eid;
}
// Called inside the operational transaction. No historical actions are guessed or backfilled.
export function captureItem(
  u: User,
  r: Item,
  sourceKey: string,
  previous?: Item,
) {
  if (!["task", "project", "event", "meeting"].includes(r.kind)) return;
  const episode =
    r.kind === "task"
      ? taskEpisode(u, r)
      : ensureEpisode(
          u,
          r.kind,
          r.id,
          r.data.title,
          r.data.description || r.data.agenda || "",
          r.owner,
        );
  recordEvidence(u, {
    episode,
    sourceKey,
    subject: r.kind === "task" ? r.data.assignee : r.owner,
    family: previous ? "REVISE" : r.kind === "task" ? "COORDINATE" : "INITIATE",
    type: r.kind + (previous ? ".updated" : ".created"),
    objectType: r.kind,
    object: r.id,
    context: {
      title: r.data.title,
      version: r.version,
      status: r.data.status || null,
      assignee: r.data.assignee || null,
      previous_assignee: previous?.data.assignee || null,
      ownership_basis:
        r.kind === "task" ? "assigned_responsibility" : "record_creator",
      ...(r.kind === "task" ? { due_at: r.data.due_at } : {}),
      // WHERE and WHEN an event moved, not just that it was edited.
      //
      // docs/12 §1 is the most expensive failure in the field evidence: a room
      // changed, the listing was never updated, officers and attendees walked
      // to the wrong building, and "URGENT" went out at 6:55pm for a 7pm start.
      // The record knew the event had been edited and could not say what about
      // it had moved, so no interface could warn anyone.
      //
      // Recorded only when the value actually changed, so the common case adds
      // nothing to the row.
      ...(r.kind === "event" || r.kind === "meeting"
        ? {
            ...(previous && previous.data.location !== r.data.location
              ? { previous_location: previous.data.location ?? null }
              : {}),
            ...(previous && previous.data.starts_at !== r.data.starts_at
              ? { previous_starts_at: previous.data.starts_at ?? null }
              : {}),
          }
        : {}),
    },
  });
}
export function captureTask(u: User, r: Item, from: string, sourceKey: string) {
  const episode = taskEpisode(u, r),
    status = r.data.status;
  const family: Family =
    status === "accepted"
      ? from === "submitted"
        ? "REVISE"
        : "COMMIT"
      : status === "submitted"
        ? "COMPLETE"
        : status === "completed"
          ? "REVIEW"
          : "OUTCOME";
  recordEvidence(u, {
    episode,
    sourceKey,
    subject: r.data.assignee,
    family,
    type: "task." + status,
    objectType: "task",
    object: r.id,
    level:
      status === "completed" && u.id !== r.data.assignee
        ? "counterparty_confirmed"
        : status === "submitted"
          ? "self_reported"
          : "system_observed",
    context: {
      title: r.data.title,
      from,
      to: status,
      due_at: r.data.due_at,
      meaning:
        status === "submitted"
          ? "submitted_for_review"
          : status === "completed"
            ? "officer_approved"
            : status,
    },
  });
}
export function capturePresence(
  u: User,
  eventId: string,
  subject: string,
  status: string,
  attendance: boolean,
  sourceKey: string,
) {
  const event = item(eventId, "event"),
    episode = ensureEpisode(
      u,
      "event",
      event.id,
      event.data.title,
      event.data.description,
      event.owner,
    );
  recordEvidence(u, {
    episode,
    subject,
    sourceKey,
    family: attendance ? "OUTCOME" : status === "yes" ? "COMMIT" : "REVISE",
    type: attendance ? "event.attendance_recorded" : "event.rsvp",
    objectType: "event",
    object: event.id,
    level:
      attendance && u.id !== subject
        ? "counterparty_confirmed"
        : "system_observed",
    context: {
      status,
      meaning: attendance ? "officer_recorded_attendance" : "registration_only",
    },
  });
}
function episodeById(eid: string) {
  const e = db()
    .prepare("SELECT * FROM episodes WHERE id=? AND organization_id=?")
    .get(eid, ORG) as any;
  if (!e) fail("Episode not found.", 404);
  return e;
}
function taskAuthority(u: User, r: Item) {
  if (r.data.assignee !== u.id) officer(u);
}
export function evidenceAction(u: User, action: string, b: any) {
  member(u);
  evidenceInit();
  return tx(() => {
    if (action === "snapshot") {
      const asOf = b.as_of ? date(b.as_of) : timestamp();
      if (asOf > timestamp()) fail("Snapshot time cannot be in the future.");
      const events = (
        db()
          .prepare(
            "SELECT * FROM activity_events WHERE organization_id=? AND occurred_at<=? AND observed_at<=? ORDER BY seq",
          )
          .all(ORG, asOf, asOf) as any[]
      ).map((e) => ({ ...e, context: JSON.parse(e.context) }));
      const features = personalFeatures(events, u.id, asOf);
      const inputHash = hash(
        JSON.stringify(
          events.filter((e) => features.source_event_ids.includes(e.id)),
        ),
      );
      const prior = db()
        .prepare(
          "SELECT * FROM evidence_snapshots WHERE user_id=? AND as_of=? AND policy=? AND evidence_hash=?",
        )
        .get(u.id, asOf, features.policy, inputHash) as any;
      if (prior) return { ...prior, features: JSON.parse(prior.features) };
      const sid = id();
      db()
        .prepare("INSERT INTO evidence_snapshots VALUES(?,?,?,?,?,?,?)")
        .run(
          sid,
          u.id,
          asOf,
          features.computed_at,
          features.policy,
          inputHash,
          JSON.stringify(features),
        );
      return {
        id: sid,
        user_id: u.id,
        as_of: asOf,
        computed_at: features.computed_at,
        policy: features.policy,
        evidence_hash: inputHash,
        features,
      };
    }
    if (action === "block") {
      const r = item(text(b.task_id), "task");
      taskAuthority(u, r);
      if (!["accepted", "submitted"].includes(r.data.status))
        fail("Accept the task before reporting a blocker.");
      if (!BLOCKERS.includes(b.category)) fail("Choose a blocker category.");
      const note = text(b.note, 1000),
        episode = taskEpisode(u, r);
      const old = db()
        .prepare(
          "SELECT * FROM work_blockers WHERE task_id=? AND resolved_at IS NULL",
        )
        .get(r.id) as any;
      if (old) {
        if (
          old.category === b.category &&
          old.note === note &&
          old.reporter === u.id
        )
          return { id: old.id };
        fail("Resolve the existing blocker first.", 409);
      }
      const bid = id();
      db()
        .prepare(
          "INSERT INTO work_blockers(id,episode_id,task_id,reporter,category,note,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(bid, episode, r.id, u.id, b.category, note, timestamp());
      recordEvidence(u, {
        episode,
        subject: r.data.assignee,
        family: "ESCALATE",
        type: "blocker.reported",
        objectType: "blocker",
        object: bid,
        level: "self_reported",
        context: { task_id: r.id, category: b.category, note },
      });
      return { id: bid };
    }
    if (action === "resolve") {
      const bkr = db()
        .prepare("SELECT * FROM work_blockers WHERE id=?")
        .get(text(b.blocker_id)) as any;
      if (!bkr) fail("Blocker not found.", 404);
      const r = item(bkr.task_id, "task");
      taskAuthority(u, r);
      if (bkr.resolved_at) return { ok: true };
      const resolution = text(b.resolution, 1000),
        at = timestamp();
      db()
        .prepare(
          "UPDATE work_blockers SET resolved_at=?,resolver=?,resolution=? WHERE id=?",
        )
        .run(at, u.id, resolution, bkr.id);
      recordEvidence(u, {
        episode: bkr.episode_id,
        subject: r.data.assignee,
        family: u.id === r.data.assignee ? "REVISE" : "HELP",
        type: "blocker.resolved",
        objectType: "blocker",
        object: bkr.id,
        level: "self_reported",
        context: {
          task_id: r.id,
          resolution,
          elapsed_hours:
            (Date.parse(at) - Date.parse(bkr.created_at)) / 3600000,
        },
      });
      return { ok: true };
    }
    if (action === "outcome") {
      const e = episodeById(text(b.episode_id));
      if (e.owner !== u.id) officer(u);
      if (e.version !== Number(b.version))
        fail("Episode changed. Refresh first.", 409);
      if (!["completed", "cancelled", "unsuccessful"].includes(b.status))
        fail("Choose an outcome.");
      const summary = text(b.summary, 2000);
      const metric =
        b.metric === undefined || b.metric === "" ? null : Number(b.metric);
      if (
        metric !== null &&
        (!Number.isFinite(metric) || Math.abs(metric) > 1e12)
      )
        fail("Use a finite outcome value.");
      const unit = metric === null ? "" : text(b.unit, 80);
      db()
        .prepare("UPDATE episodes SET status=?,version=version+1 WHERE id=?")
        .run(b.status, e.id);
      recordEvidence(u, {
        episode: e.id,
        subject: e.owner,
        family: "OUTCOME",
        type: "episode.outcome_recorded",
        objectType: "episode",
        object: e.id,
        level: "self_reported",
        context: {
          status: b.status,
          summary,
          metric,
          unit,
          version: e.version + 1,
          meaning: "reported_result_not_external_verification",
        },
      });
      return { ok: true };
    }
    if (action === "correct") {
      const original = db()
        .prepare(
          "SELECT * FROM activity_events WHERE id=? AND organization_id=?",
        )
        .get(text(b.event_id), ORG) as any;
      if (!original) fail("Evidence not found.", 404);
      if (original.actor_id !== u.id && original.subject_id !== u.id)
        officer(u);
      if (original.event_type === "evidence.correction")
        fail("Add corrections to the original event.");
      const statement = text(b.statement, 2000);
      const duplicate = db()
        .prepare(
          "SELECT id FROM activity_events WHERE actor_id=? AND event_type='evidence.correction' AND json_extract(context,'$.corrects')=? AND json_extract(context,'$.statement')=?",
        )
        .get(u.id, original.id, statement);
      if (duplicate) return { ok: true };
      recordEvidence(u, {
        episode: original.episode_id,
        subject: original.subject_id,
        family: "REVISE",
        type: "evidence.correction",
        objectType: original.object_type,
        object: original.object_id,
        level: "self_reported",
        context: {
          corrects: original.id,
          statement,
          meaning: "disputed_claim_original_retained",
        },
      });
      return { ok: true };
    }
    fail("Not found.", 404);
  });
}
export function evidenceRead(u: User) {
  member(u);
  evidenceInit();
  const episodes = db()
    .prepare(
      "SELECT * FROM episodes WHERE organization_id=? ORDER BY created_at DESC",
    )
    .all(ORG);
  const events = (
    db()
      .prepare(
        "SELECT e.*,a.name actor_name,s.name subject_name FROM activity_events e JOIN users a ON a.id=e.actor_id JOIN users s ON s.id=e.subject_id WHERE e.organization_id=? ORDER BY e.seq",
      )
      .all(ORG) as any[]
  ).map((e) => ({ ...e, context: JSON.parse(e.context) }));
  const blockers = db()
    .prepare("SELECT * FROM work_blockers ORDER BY created_at DESC")
    .all() as any[];
  const mine = events.filter(
    (e) => e.subject_id === u.id || e.actor_id === u.id,
  );
  const resolved = blockers.filter((b) => b.resolved_at);
  const hours = resolved
    .map(
      (b) => (Date.parse(b.resolved_at) - Date.parse(b.created_at)) / 3600000,
    )
    .sort((a, b) => a - b);
  const median = hours.length
    ? (hours[Math.floor((hours.length - 1) / 2)] +
        hours[Math.ceil((hours.length - 1) / 2)]) /
      2
    : null;
  const active = blockers.filter((b) => !b.resolved_at);
  const nodes = new Map<string, any>();
  for (const e of episodes as any[])
    nodes.set("episode:" + e.id, {
      id: "episode:" + e.id,
      type: "episode",
      source_id: e.id,
      title: e.title,
    });
  for (const e of events) {
    nodes.set("person:" + e.actor_id, {
      id: "person:" + e.actor_id,
      type: "person",
      source_id: e.actor_id,
    });
    nodes.set("person:" + e.subject_id, {
      id: "person:" + e.subject_id,
      type: "person",
      source_id: e.subject_id,
    });
    nodes.set(e.object_type + ":" + e.object_id, {
      id: e.object_type + ":" + e.object_id,
      type: e.object_type,
      source_id: e.object_id,
    });
  }
  return {
    episodes,
    events,
    blockers,
    personal_timeline: mine,
    snapshots: (
      db()
        .prepare(
          "SELECT * FROM evidence_snapshots WHERE user_id=? ORDER BY computed_at DESC LIMIT 20",
        )
        .all(u.id) as any[]
    ).map((s) => ({ ...s, features: JSON.parse(s.features) })),
    features: personalFeatures(events, u.id, timestamp()),
    operations: {
      open_blockers: active.length,
      resolved_blockers: hours.length,
      median_resolution_hours: median,
      open_blocker_categories: BLOCKERS.map((category) => ({
        category,
        count: active.filter((b) => b.category === category).length,
      })),
      interpretation:
        "Resolution median includes resolved blockers only; open blockers are censored, not zero-duration.",
    },
    graph: {
      nodes: [...nodes.values()],
      edges: events
        .filter((e) => e.event_type !== "evidence.correction")
        .map((e) => ({
          from: "person:" + e.actor_id,
          to: e.object_type + ":" + e.object_id,
          actor_id: e.actor_id,
          subject_id: e.subject_id,
          action: e.action_family,
          object_type: e.object_type,
          object_id: e.object_id,
          episode_id: e.episode_id,
          evidence_id: e.id,
          correction_ids: events
            .filter((c) => c.context.corrects === e.id)
            .map((c) => c.id),
        })),
    },
    visibility: "club_internal",
    policy: POLICY,
  };
}

function personalFeatures(events: any[], uid: string, asOf: string) {
  const mine = events.filter((e) => e.subject_id === uid || e.actor_id === uid);
  const disputed = new Set(
    events
      .filter(
        (e) =>
          e.event_type === "evidence.correction" && e.object_type === "task",
      )
      .map((e) => e.object_id),
  );
  const accepted = new Set(
    mine
      .filter(
        (e) =>
          e.subject_id === uid &&
          e.event_type === "task.accepted" &&
          e.action_family === "COMMIT",
      )
      .map((e) => e.object_id),
  );
  const completed = new Set(
    mine
      .filter((e) => e.subject_id === uid && e.event_type === "task.completed")
      .map((e) => e.object_id),
  );
  const cancelled = new Set(
    mine
      .filter((e) => e.subject_id === uid && e.event_type === "task.cancelled")
      .map((e) => e.object_id),
  );
  const eligible = [...accepted].filter((k) => !disputed.has(k));
  const approved = eligible.filter((k) => completed.has(k)).length,
    cancelledCount = eligible.filter((k) => cancelled.has(k)).length;
  const denominator = eligible.length - cancelledCount;
  return {
    policy: "episode-descriptive-v1",
    computed_at: timestamp(),
    as_of: asOf,
    accepted: eligible.length,
    approved,
    cancelled: cancelledCount,
    unresolved: denominator - approved,
    completion_fraction: denominator ? approved / denominator : null,
    disputed_excluded: [...accepted].filter((k) => disputed.has(k)).length,
    source_event_ids: mine
      .filter((e) => e.object_type === "task")
      .map((e) => e.id),
    interpretation:
      "Approved / accepted non-cancelled tasks. Open work remains unresolved; this is not a reliability estimate.",
  };
}

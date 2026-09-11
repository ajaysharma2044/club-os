// Interview rounds: capacity feasibility, panel assembly, and self-healing drops.
//
// Built from observed CEC operations (docs/12-cec-field-evidence.md): ~35 first
// rounds at panel size 1-2 plus ~17 second rounds at panel size 4, across 7
// officers with class schedules, inside one week. The recruitment lead was
// computing capacity by hand and got as far as "2 max per person" before
// deciding to recruit more interviewers instead.
//
// The product is the feasibility answer, not the calendar. See
// docs/14-quant-per-feature.md §1.

import {
  db,
  fail,
  id,
  text,
  timestamp,
  officer,
  audit,
  emit,
  type User,
} from "./db";
import {
  computeFeasibility,
  computeAssignment,
  type SchedulerInput,
  type Feasibility,
} from "./scheduler";

export function interviewsInit() {
  db().exec(`
CREATE TABLE IF NOT EXISTS interview_rounds(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT NOT NULL,
  panel_size INTEGER NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS interview_panelists(
  round_id TEXT NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekly_cap INTEGER NOT NULL DEFAULT 3,
  PRIMARY KEY(round_id,user_id));
CREATE TABLE IF NOT EXISTS interview_availability(
  round_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  side TEXT NOT NULL,
  slot TEXT NOT NULL,
  PRIMARY KEY(round_id,person_id,side,slot));
CREATE TABLE IF NOT EXISTS interview_candidates(
  round_id TEXT NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  PRIMARY KEY(round_id,candidate_id));
CREATE TABLE IF NOT EXISTS interview_conflicts(
  round_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  PRIMARY KEY(round_id,candidate_id,user_id));
CREATE TABLE IF NOT EXISTS interview_assignments(
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES interview_rounds(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  panel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offered',
  created_at TEXT NOT NULL,
  UNIQUE(round_id,candidate_id));
CREATE INDEX IF NOT EXISTS interview_assign_round ON interview_assignments(round_id,status);
`);
}

type Round = {
  id: string;
  name: string;
  stage: string;
  panel_size: number;
  slot_minutes: number;
  status: string;
  created_at: string;
};

function round(roundId: string): Round {
  const r = db()
    .prepare("SELECT * FROM interview_rounds WHERE id=?")
    .get(roundId) as Round | undefined;
  if (!r) fail("Interview round not found.", 404);
  return r;
}

function avail(roundId: string, side: "panelist" | "candidate") {
  const rows = db()
    .prepare(
      "SELECT person_id,slot FROM interview_availability WHERE round_id=? AND side=?",
    )
    .all(roundId, side) as { person_id: string; slot: string }[];
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.person_id)) map.set(r.person_id, new Set());
    map.get(r.person_id)!.add(r.slot);
  }
  return map;
}

function conflicts(roundId: string) {
  const rows = db()
    .prepare(
      "SELECT candidate_id,user_id FROM interview_conflicts WHERE round_id=?",
    )
    .all(roundId) as { candidate_id: string; user_id: string }[];
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.candidate_id)) map.set(r.candidate_id, new Set());
    map.get(r.candidate_id)!.add(r.user_id);
  }
  return map;
}

// Load a round out of SQLite into the pure scheduler's input shape. All the
// math lives in scheduler.ts so it can be tested and replayed without a
// database; this function is only plumbing.
function input(roundId: string): SchedulerInput {
  const r = round(roundId);
  const candidates = (
    db()
      .prepare(
        "SELECT candidate_id FROM interview_candidates WHERE round_id=? AND status<>'withdrawn'",
      )
      .all(roundId) as { candidate_id: string }[]
  ).map((c) => c.candidate_id);
  const panelists = (
    db()
      .prepare(
        "SELECT user_id,weekly_cap FROM interview_panelists WHERE round_id=?",
      )
      .all(roundId) as { user_id: string; weekly_cap: number }[]
  ).map((p) => ({ id: p.user_id, cap: p.weekly_cap }));

  const toRecord = (m: Map<string, Set<string>>) =>
    Object.fromEntries([...m].map(([k, v]) => [k, [...v]]));

  return {
    panelSize: Math.max(1, r.panel_size),
    candidates,
    panelists,
    candidateSlots: toRecord(avail(roundId, "candidate")),
    panelistSlots: toRecord(avail(roundId, "panelist")),
    conflicts: toRecord(conflicts(roundId)),
  };
}

export function feasibility(roundId: string): Feasibility {
  return computeFeasibility(input(roundId));
}

export function solve(roundId: string) {
  const { assignments, unplaced, load } = computeAssignment(input(roundId));
  return {
    assignments: assignments.map((a) => ({
      candidate_id: a.candidate,
      slot: a.slot,
      panel: a.panel,
    })),
    unplaced,
    load,
  };
}

export function interviewState(u: User) {
  officer(u);
  const rounds = db()
    .prepare("SELECT * FROM interview_rounds ORDER BY created_at DESC")
    .all() as Round[];
  return {
    rounds: rounds.map((r) => {
      const counts = db()
        .prepare(
          "SELECT COUNT(*) n FROM interview_candidates WHERE round_id=? AND status<>'withdrawn'",
        )
        .get(r.id) as { n: number };
      const assigned = db()
        .prepare(
          "SELECT COUNT(*) n FROM interview_assignments WHERE round_id=? AND status<>'cancelled'",
        )
        .get(r.id) as { n: number };
      return {
        ...r,
        candidates: counts.n,
        assigned: assigned.n,
        feasibility: r.status === "draft" ? null : feasibility(r.id),
      };
    }),
  };
}

export function interviews(u: User, action: string, b: any) {
  officer(u);
  const now = timestamp();

  if (action === "round/create") {
    const key = id();
    const panel = Math.max(1, Math.min(8, Number(b.panel_size) || 1));
    db()
      .prepare(
        "INSERT INTO interview_rounds(id,name,stage,panel_size,slot_minutes,status,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(
        key,
        text(b.name, 120),
        text(b.stage, 40) || "first",
        panel,
        Math.max(10, Math.min(180, Number(b.slot_minutes) || 30)),
        "open",
        now,
      );
    audit(u, "interview.round.create", key, { panel_size: panel });
    emit(u, "interview_round", "round", key, { panel_size: panel });
    return { id: key };
  }

  if (action === "panelist/set") {
    const roundId = text(b.round_id, 64);
    round(roundId);
    db()
      .prepare(
        "INSERT INTO interview_panelists(round_id,user_id,weekly_cap) VALUES (?,?,?) ON CONFLICT(round_id,user_id) DO UPDATE SET weekly_cap=excluded.weekly_cap",
      )
      .run(roundId, text(b.user_id, 64), Math.max(0, Number(b.weekly_cap) || 0));
    audit(u, "interview.panelist.set", roundId, { user: b.user_id });
    return { ok: true };
  }

  if (action === "availability/set") {
    const roundId = text(b.round_id, 64);
    round(roundId);
    const side = b.side === "candidate" ? "candidate" : "panelist";
    const person = text(b.person_id, 64) || u.id;
    const slots: string[] = Array.isArray(b.slots)
      ? b.slots.slice(0, 400).map((s: unknown) => text(s, 40))
      : [];
    db()
      .prepare(
        "DELETE FROM interview_availability WHERE round_id=? AND person_id=? AND side=?",
      )
      .run(roundId, person, side);
    const ins = db().prepare(
      "INSERT OR IGNORE INTO interview_availability(round_id,person_id,side,slot) VALUES (?,?,?,?)",
    );
    for (const s of slots) if (s) ins.run(roundId, person, side, s);
    audit(u, "interview.availability.set", roundId, {
      person,
      side,
      slots: slots.length,
    });
    return { ok: true, slots: slots.length };
  }

  if (action === "candidate/add") {
    const roundId = text(b.round_id, 64);
    round(roundId);
    const list: string[] = Array.isArray(b.candidate_ids)
      ? b.candidate_ids.slice(0, 500).map((c: unknown) => text(c, 64))
      : [text(b.candidate_id, 64)];
    const ins = db().prepare(
      "INSERT OR IGNORE INTO interview_candidates(round_id,candidate_id) VALUES (?,?)",
    );
    let n = 0;
    for (const c of list) if (c) (ins.run(roundId, c), n++);
    audit(u, "interview.candidate.add", roundId, { count: n });
    return { ok: true, added: n };
  }

  if (action === "conflict/add") {
    const roundId = text(b.round_id, 64);
    round(roundId);
    db()
      .prepare(
        "INSERT OR IGNORE INTO interview_conflicts(round_id,candidate_id,user_id,reason) VALUES (?,?,?,?)",
      )
      .run(
        roundId,
        text(b.candidate_id, 64),
        text(b.user_id, 64),
        text(b.reason, 200) || "prior contact",
      );
    audit(u, "interview.conflict.add", roundId, {});
    return { ok: true };
  }

  if (action === "feasibility") {
    return feasibility(text(b.round_id, 64));
  }

  if (action === "solve") {
    const roundId = text(b.round_id, 64);
    const r = round(roundId);
    const { assignments, unplaced } = solve(roundId);
    if (b.commit) {
      db()
        .prepare(
          "DELETE FROM interview_assignments WHERE round_id=? AND status='offered'",
        )
        .run(roundId);
      const ins = db().prepare(
        "INSERT INTO interview_assignments(id,round_id,candidate_id,slot,panel,status,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(round_id,candidate_id) DO UPDATE SET slot=excluded.slot,panel=excluded.panel,status='offered'",
      );
      for (const a of assignments)
        ins.run(
          id(),
          roundId,
          a.candidate_id,
          a.slot,
          JSON.stringify(a.panel),
          "offered",
          now,
        );
      audit(u, "interview.solve.commit", roundId, {
        placed: assignments.length,
        unplaced: unplaced.length,
      });
      emit(u, "interview_schedule", "round", roundId, {
        placed: assignments.length,
        unplaced: unplaced.length,
        panel_size: r.panel_size,
      });
    }
    return {
      assignments,
      unplaced,
      placed: assignments.length,
      committed: !!b.commit,
    };
  }

  // A drop returns the slot to the pool and immediately re-solves for whoever
  // is still unplaced. Today this failure surfaces as an officer learning about
  // it from the candidate emailing back for a new person.
  if (action === "assignment/drop") {
    const key = text(b.assignment_id, 64);
    const row = db()
      .prepare("SELECT * FROM interview_assignments WHERE id=?")
      .get(key) as any;
    if (!row) fail("Assignment not found.", 404);
    db()
      .prepare("UPDATE interview_assignments SET status='cancelled' WHERE id=?")
      .run(key);
    db()
      .prepare(
        "UPDATE interview_candidates SET status='pending' WHERE round_id=? AND candidate_id=?",
      )
      .run(row.round_id, row.candidate_id);
    audit(u, "interview.assignment.drop", key, {
      reason: text(b.reason, 200),
    });
    emit(u, "interview_drop", "assignment", key, {
      round_id: row.round_id,
      reason: text(b.reason, 200),
    });
    return { ok: true, refill: solve(row.round_id) };
  }

  if (action === "assignment/status") {
    const key = text(b.assignment_id, 64);
    const status = text(b.status, 24);
    if (!["offered", "accepted", "completed", "no_show"].includes(status))
      fail("Unknown status.");
    db()
      .prepare("UPDATE interview_assignments SET status=? WHERE id=?")
      .run(status, key);
    audit(u, "interview.assignment.status", key, { status });
    // No-shows and completions are the labels every downstream model needs.
    emit(u, "interview_outcome", "assignment", key, { status });
    return { ok: true };
  }

  fail("Unknown interview action.", 404);
}

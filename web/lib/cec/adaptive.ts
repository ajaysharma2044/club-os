import { db, fail, id, timestamp, tx, User, url, officer } from "./db";

export const POLICY = "weekly-information-gap-v1";
const PURPOSES = ["startup_hours", "coffee_chat", "recruitment"];
const STAGES = ["exploring", "idea", "building", "launched"];
const TOPICS = ["software", "hardware", "design", "business"];
const FIELDS = [
  "stage",
  "need",
  "artifact",
  "contribution",
  "availability",
  "connection",
];
const MAX_QUESTIONS = 3;
type Option = { value: string; label: string };
type Question = {
  id: string;
  field: string;
  prompt: string;
  options: Option[];
  seconds: number;
};
const options = (pairs: string[][]) =>
  pairs.map(([value, label]) => ({ value, label }));
const BANK: Question[] = [
  {
    id: "stage-v1",
    field: "stage",
    prompt: "Where is your project today?",
    seconds: 10,
    options: options([
      ["exploring", "Exploring what to build"],
      ["idea", "An idea I want to test"],
      ["building", "Building a prototype"],
      ["launched", "Launched something people can use"],
    ]),
  },
  {
    id: "need-v1",
    field: "need",
    prompt: "What would help you most this week?",
    seconds: 15,
    options: options([
      ["build", "Help building"],
      ["feedback", "Customer or product feedback"],
      ["team", "Finding collaborators"],
      ["funding", "Understanding funding options"],
      ["explore", "Finding a direction"],
    ]),
  },
  {
    id: "artifact-v1",
    field: "artifact",
    prompt: "What work could you show someone right now?",
    seconds: 15,
    options: options([
      ["live", "A live product"],
      ["prototype", "A working prototype"],
      ["plan", "A design or written plan"],
      ["none", "Nothing ready to share yet"],
    ]),
  },
  {
    id: "contribution-v1",
    field: "contribution",
    prompt: "What work would you like to contribute to?",
    seconds: 15,
    options: options([
      ["engineering", "Engineering or building"],
      ["design", "Design"],
      ["customers", "Customer research or growth"],
      ["operations", "Events or operations"],
      ["explore", "I want to explore"],
    ]),
  },
  {
    id: "availability-v1",
    field: "availability",
    prompt:
      "How much time would you like to set aside for a collaboration this week?",
    seconds: 10,
    options: options([
      ["under1", "Less than one hour"],
      ["1to3", "One to three hours"],
      ["over3", "More than three hours"],
      ["unknown", "I am not sure yet"],
    ]),
  },
  {
    id: "connection-v1",
    field: "connection",
    prompt: "Who would be most useful to meet next?",
    seconds: 10,
    options: options([
      ["technical", "A technical mentor"],
      ["customer", "A potential customer"],
      ["builder", "Another builder"],
      ["investor", "Someone who can explain fundraising"],
      ["none", "No introduction right now"],
    ]),
  },
];
function init() {
  db().exec(`
CREATE TABLE IF NOT EXISTS adaptive_preferences(user_id TEXT PRIMARY KEY REFERENCES accounts(id),shared INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS adaptive_facts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),field TEXT NOT NULL,value TEXT NOT NULL,source_type TEXT NOT NULL,source_url TEXT NOT NULL,observed_at TEXT NOT NULL,policy TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS adaptive_facts_user ON adaptive_facts(user_id,observed_at);
CREATE TABLE IF NOT EXISTS adaptive_sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES accounts(id),week TEXT NOT NULL,purpose TEXT NOT NULL,policy TEXT NOT NULL,created_at TEXT NOT NULL,completed_at TEXT,UNIQUE(user_id,week));
CREATE TABLE IF NOT EXISTS adaptive_decisions(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES adaptive_sessions(id),question_id TEXT NOT NULL,snapshot TEXT NOT NULL,selected_at TEXT NOT NULL,exposed_at TEXT,answered_at TEXT,answer TEXT,status TEXT NOT NULL DEFAULT 'selected');
`);
}
function weekKey() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function facts(uid: string) {
  const rows = db()
    .prepare("SELECT * FROM adaptive_facts WHERE user_id=? ORDER BY rowid")
    .all(uid) as any[];
  const latest: Record<string, any> = {};
  for (const r of rows) latest[r.field] = r;
  return latest;
}
function freshness(f: any) {
  return f
    ? Math.pow(
        2,
        -Math.max(0, Date.now() - Date.parse(f.observed_at)) / 86400000 / 28,
      )
    : 0;
}
function summary(uid: string) {
  const fs = facts(uid),
    known = FIELDS.filter((k) => fs[k]);
  return {
    facts: fs,
    coverage: known.length / FIELDS.length,
    covered_fields: known.length,
    total_fields: FIELDS.length,
    freshness: known.length
      ? known.reduce((n, k) => n + freshness(fs[k]), 0) / known.length
      : 0,
    provenance: "participant_confirmed; not independently verified",
    half_life_days: 28,
  };
}
function rank(session: any) {
  const fs = facts(session.user_id),
    decisions = db()
      .prepare("SELECT * FROM adaptive_decisions WHERE session_id=?")
      .all(session.id) as any[];
  const asked = new Set(decisions.map((d) => d.question_id));
  const current = (field: string, days: number) =>
    fs[field] &&
    Date.now() - Date.parse(fs[field].observed_at) < days * 86400000
      ? fs[field].value
      : null;
  const currentNeed = current("need", 7),
    currentStage = current("stage", 28);
  return BANK.filter((q) => !asked.has(q.id))
    .map((q) => {
      const f = fs[q.field],
        age = f
          ? (Date.now() - Date.parse(f.observed_at)) / 86400000
          : Infinity;
      const refreshDays = ["need", "availability"].includes(q.field) ? 7 : 28;
      // Known fields are not eligible until their explicit refresh interval has elapsed.
      if (f && age < refreshDays) return null;
      // A uniform categorical prior is an explicit untrained baseline. Refresh mass is a policy assumption.
      const entropy = Math.log2(q.options.length),
        gap = f ? 1 - freshness(f) : 1;
      let relevance = q.field === "need" ? 1.4 : 0.65;
      if (
        session.purpose === "recruitment" &&
        ["contribution", "availability"].includes(q.field)
      )
        relevance = 1.25;
      if (session.purpose === "coffee_chat" && q.field === "connection")
        relevance = 1.35;
      if (
        currentNeed === "team" &&
        ["contribution", "availability", "connection"].includes(q.field)
      )
        relevance += 0.7;
      if (currentNeed === "feedback" && q.field === "artifact")
        relevance += 0.9;
      if (currentStage === "launched" && q.field === "connection")
        relevance += 0.3;
      if (currentStage === "exploring" && q.field === "artifact")
        relevance = 0.1;
      const burden = q.seconds / 60,
        utility = entropy * gap * relevance - 0.35 * burden;
      let prompt = q.prompt;
      if (q.field === "need" && currentStage === "launched")
        prompt =
          "For your launched project, what would help you most this week?";
      if (q.field === "need" && currentStage === "building")
        prompt =
          "For what you are building, what would help you most this week?";
      return {
        ...q,
        prompt,
        entropy_bits: entropy,
        gap,
        relevance,
        burden_minutes: burden,
        utility,
        reason:
          (f
            ? "This answer is due for a refresh."
            : "This information has not been confirmed yet.") +
          " Relevant to " +
          session.purpose.replace("_", " ") +
          ".",
        context: {
          stage: currentStage || null,
          need: currentNeed || null,
        },
        policy: POLICY,
      };
    })
    .filter((q): q is NonNullable<typeof q> => q !== null && q.utility > 0)
    .sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id));
}
function sessionOwned(uid: string, sid: string) {
  const s = db()
    .prepare("SELECT * FROM adaptive_sessions WHERE id=? AND user_id=?")
    .get(sid, uid) as any;
  if (!s) fail("Check-in not found.", 404);
  return s;
}
function next(session: any) {
  if (session.completed_at) return null;
  const pending = db()
    .prepare(
      "SELECT * FROM adaptive_decisions WHERE session_id=? AND status='selected'",
    )
    .get(session.id) as any;
  if (pending)
    return {
      ...JSON.parse(pending.snapshot),
      decision_id: pending.id,
      exposed: !!pending.exposed_at,
    };
  const count = (
    db()
      .prepare("SELECT COUNT(*) n FROM adaptive_decisions WHERE session_id=?")
      .get(session.id) as any
  ).n;
  const ranked = count < MAX_QUESTIONS ? rank(session) : [];
  if (!ranked.length) {
    session.completed_at = timestamp();
    db()
      .prepare("UPDATE adaptive_sessions SET completed_at=? WHERE id=?")
      .run(session.completed_at, session.id);
    return null;
  }
  const q = ranked[0],
    did = id();
  db()
    .prepare(
      "INSERT INTO adaptive_decisions(id,session_id,question_id,snapshot,selected_at) VALUES(?,?,?,?,?)",
    )
    .run(
      did,
      session.id,
      q.id,
      JSON.stringify({
        ...q,
        candidate_utilities: ranked.map((r) => ({
          id: r.id,
          utility: r.utility,
        })),
      }),
      timestamp(),
    );
  return { ...q, decision_id: did, exposed: false };
}
function view(uid: string, select = true) {
  const s = db()
    .prepare("SELECT * FROM adaptive_sessions WHERE user_id=? AND week=?")
    .get(uid, weekKey()) as any;
  const selectedQuestion = s && select ? next(s) : null;
  const decisions = s
    ? db()
        .prepare(
          "SELECT * FROM adaptive_decisions WHERE session_id=? ORDER BY rowid",
        )
        .all(s.id)
    : [];
  return {
    profile: summary(uid),
    shared: !!(
      db()
        .prepare("SELECT shared FROM adaptive_preferences WHERE user_id=?")
        .get(uid) as any
    )?.shared,
    week: weekKey(),
    session: s || null,
    decisions,
    history: db()
      .prepare(
        "SELECT field,value,source_type,source_url,observed_at FROM adaptive_facts WHERE user_id=? ORDER BY rowid DESC LIMIT 50",
      )
      .all(uid),
    question: s
      ? select
        ? selectedQuestion
        : (() => {
            const d = db()
              .prepare(
                "SELECT * FROM adaptive_decisions WHERE session_id=? AND status='selected'",
              )
              .get(s.id) as any;
            return d
              ? {
                  ...JSON.parse(d.snapshot),
                  decision_id: d.id,
                  exposed: !!d.exposed_at,
                }
              : null;
          })()
      : null,
  };
}
function fact(
  uid: string,
  field: string,
  value: string,
  source: string,
  sourceUrl = "",
) {
  db()
    .prepare("INSERT INTO adaptive_facts VALUES(?,?,?,?,?,?,?,?)")
    .run(id(), uid, field, value, source, sourceUrl, timestamp(), POLICY);
}
export function adaptiveRead(u: User, action: string) {
  init();
  if (action === "me") return view(u.id, false);
  if (action === "profiles") {
    officer(u);
    return {
      profiles: (
        db()
          .prepare(
            "SELECT u.id,u.name FROM users u JOIN adaptive_preferences p ON p.user_id=u.id WHERE p.shared=1",
          )
          .all() as any[]
      ).map((person) => ({ ...person, ...summary(person.id) })),
    };
  }
  fail("Not found.", 404);
}
export function adaptive(u: User, action: string, b: any) {
  init();
  if (action === "preview") {
    if (typeof b.text !== "string" || b.text.length > 4000)
      fail("Use up to 4,000 characters.");
    // Untrusted text supplies suggestions only. It is not executed, fetched or persisted.
    const s = b.text.toLowerCase();
    const stage = /\b(launched|live product)\b/.test(s)
      ? "launched"
      : /\b(building|prototype)\b/.test(s)
        ? "building"
        : /\b(idea|exploring)\b/.test(s)
          ? "idea"
          : "";
    const topics = TOPICS.filter((t) =>
      ({
        software: /\b(software|python|typescript|developer|ai)\b/,
        hardware: /\b(hardware|robotics|electronics)\b/,
        design: /\b(design|designer|figma)\b/,
        business: /\b(business|marketing|operations|sales)\b/,
      })[t]!.test(s),
    );
    return {
      stage,
      topics,
      notice:
        "Suggestions from your supplied text. Correct and confirm them before use. No LinkedIn page was fetched.",
    };
  }
  return tx(() => {
    if (action === "start") {
      if (!PURPOSES.includes(b.purpose)) fail("Choose a check-in purpose.");
      if (b.confirmed !== true)
        fail("Confirm the context or choose to start without it.");
      const old = db()
        .prepare("SELECT * FROM adaptive_sessions WHERE user_id=? AND week=?")
        .get(u.id, weekKey()) as any;
      if (old) return view(u.id);
      const link = b.source_url ? url(b.source_url) : "";
      if (b.stage && !STAGES.includes(b.stage))
        fail("Choose a valid project stage.");
      if (
        b.topics !== undefined &&
        (!Array.isArray(b.topics) ||
          b.topics.some((t: unknown) => !TOPICS.includes(String(t))))
      )
        fail("Choose valid topics.");
      if (b.stage)
        fact(
          u.id,
          "stage",
          b.stage,
          b.from_text === true ? "participant_confirmed_text" : "self_report",
          link,
        );
      if (b.topics?.length)
        fact(
          u.id,
          "topics",
          [...new Set(b.topics)].join(", "),
          b.from_text === true ? "participant_confirmed_text" : "self_report",
          link,
        );
      const sid = id();
      db()
        .prepare(
          "INSERT INTO adaptive_sessions(id,user_id,week,purpose,policy,created_at) VALUES(?,?,?,?,?,?)",
        )
        .run(sid, u.id, weekKey(), b.purpose, POLICY, timestamp());
      return view(u.id);
    }
    if (action === "sharing") {
      if (typeof b.shared !== "boolean") fail("Choose a sharing preference.");
      db()
        .prepare(
          "INSERT INTO adaptive_preferences VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET shared=excluded.shared",
        )
        .run(u.id, b.shared ? 1 : 0);
      return view(u.id);
    }
    if (action === "forget") {
      if (![...FIELDS, "topics"].includes(b.field)) fail("Unknown field.");
      // Forget all source evidence and dependent decision snapshots for this field and user.
      db()
        .prepare("DELETE FROM adaptive_facts WHERE user_id=? AND field=?")
        .run(u.id, b.field);
      db()
        .prepare(
          "DELETE FROM adaptive_decisions WHERE session_id IN (SELECT id FROM adaptive_sessions WHERE user_id=?)",
        )
        .run(u.id);
      db().prepare("DELETE FROM adaptive_sessions WHERE user_id=?").run(u.id);
      return view(u.id, false);
    }
    if (action === "clear") {
      db()
        .prepare(
          "DELETE FROM adaptive_decisions WHERE session_id IN (SELECT id FROM adaptive_sessions WHERE user_id=?)",
        )
        .run(u.id);
      db().prepare("DELETE FROM adaptive_sessions WHERE user_id=?").run(u.id);
      db().prepare("DELETE FROM adaptive_facts WHERE user_id=?").run(u.id);
      db()
        .prepare("DELETE FROM adaptive_preferences WHERE user_id=?")
        .run(u.id);
      return view(u.id);
    }
    const s = sessionOwned(u.id, String(b.session_id || ""));
    if (s.week !== weekKey()) fail("Start this week’s check-in.", 409);
    const d = db()
      .prepare("SELECT * FROM adaptive_decisions WHERE id=? AND session_id=?")
      .get(String(b.decision_id || ""), s.id) as any;
    if (!d) fail("Question not found.", 404);
    if (action === "exposure") {
      if (d.status !== "selected") return { ok: true };
      db()
        .prepare(
          "UPDATE adaptive_decisions SET exposed_at=COALESCE(exposed_at,?) WHERE id=?",
        )
        .run(timestamp(), d.id);
      return { ok: true };
    }
    if (!["answer", "skip"].includes(action))
      fail("Unknown check-in action.", 404);
    if (!d.exposed_at) fail("View the question first.", 409);
    if (d.status !== "selected") {
      if (
        (action === "answer" &&
          d.status === "answered" &&
          d.answer === b.value) ||
        (action === "skip" && d.status === "skipped")
      )
        return view(u.id);
      fail("This question already has a response.", 409);
    }
    const q = JSON.parse(d.snapshot);
    if (
      action === "answer" &&
      !q.options.some((o: Option) => o.value === b.value)
    )
      fail("Choose one of the offered answers.");
    db()
      .prepare(
        "UPDATE adaptive_decisions SET status=?,answer=?,answered_at=? WHERE id=?",
      )
      .run(
        action === "answer" ? "answered" : "skipped",
        action === "answer" ? b.value : null,
        timestamp(),
        d.id,
      );
    if (action === "answer") fact(u.id, q.field, b.value, "self_report");
    return view(u.id);
  });
}

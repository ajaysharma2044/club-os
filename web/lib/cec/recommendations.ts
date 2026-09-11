import { db, fail, id, items, timestamp, tx, User } from "./db";

// Separate decisions from observed exposures and self-reported outcomes.
// This is a deterministic baseline, not a trained talent or employability model.
const model = "project-token-cosine-v1";
const features = "declared-interests-project-text-v1";
function init() {
  db()
    .exec(`CREATE TABLE IF NOT EXISTS model_versions(id TEXT PRIMARY KEY,feature_version TEXT NOT NULL,description TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recommendations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),project_id TEXT NOT NULL REFERENCES items(id),model_version TEXT NOT NULL,feature_version TEXT NOT NULL,score REAL NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS recommendation_events(id TEXT PRIMARY KEY,recommendation_id TEXT NOT NULL REFERENCES recommendations(id),kind TEXT NOT NULL,value TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(recommendation_id,kind,value));`);
  db()
    .prepare("INSERT OR IGNORE INTO model_versions VALUES(?,?,?)")
    .run(
      model,
      features,
      "Binary token cosine on declared interests and shared project title/description; no behavioral or sensitive profile features.",
    );
}
function tokens(s: string) {
  return new Set(
    (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
      (t) => !["the", "and", "for", "with", "this", "that", "from"].includes(t),
    ),
  );
}
function eligible(u: User) {
  return items("project").filter(
    (p) =>
      p.owner !== u.id &&
      p.data.shared &&
      db()
        .prepare(
          "SELECT 1 FROM users WHERE id=? AND shared=1 AND role!='applicant'",
        )
        .get(p.owner),
  );
}
export function recommendations(u: User, action: string, b: any) {
  if (u.role === "applicant") fail("Membership is required.", 403);
  init();
  if (action === "generate")
    return tx(() => {
      const interests = tokens(u.interests);
      if (!interests.size)
        return {
          recommendations: [],
          explanation: "Add interests in your account to find shared projects.",
        };
      const ranked = eligible(u)
        .filter(
          (p) =>
            !db()
              .prepare(
                "SELECT 1 FROM recommendations r JOIN recommendation_events e ON e.recommendation_id=r.id WHERE r.user_id=? AND r.project_id=? AND e.kind='action' AND e.value='not_interested' AND e.created_at>?",
              )
              .get(
                u.id,
                p.id,
                new Date(Date.now() - 30 * 86400000).toISOString(),
              ),
        )
        .map((p) => {
          const terms = tokens(p.data.title + " " + p.data.description);
          const overlap = [...interests].filter((t) => terms.has(t));
          return {
            p,
            overlap,
            score: terms.size
              ? overlap.length / Math.sqrt(terms.size * interests.size)
              : 0,
          };
        })
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
      // One project per owner in this small slate; no global person ranking.
      const owners = new Set<string>();
      const slate = ranked
        .filter((r) => {
          if (owners.has(r.p.owner)) return false;
          owners.add(r.p.owner);
          return true;
        })
        .slice(0, 5);
      return {
        model_version: model,
        feature_version: features,
        recommendations: slate.map(({ p, overlap, score }) => {
          const rec = id(),
            reason = "Shared interests: " + overlap.join(", ");
          db()
            .prepare("INSERT INTO recommendations VALUES(?,?,?,?,?,?,?,?)")
            .run(rec, u.id, p.id, model, features, score, reason, timestamp());
          return {
            id: rec,
            project_id: p.id,
            title: p.data.title,
            description: p.data.description,
            url: p.data.url,
            reason,
          };
        }),
      };
    });
  const r = db()
    .prepare("SELECT * FROM recommendations WHERE id=? AND user_id=?")
    .get(String(b.id || ""), u.id) as any;
  if (!r) fail("Recommendation not found.", 404);
  if (!eligible(u).some((p) => p.id === r.project_id))
    fail("This project is no longer shared.", 410);
  if (Date.parse(r.created_at) < Date.now() - 7 * 86400000)
    fail("Refresh project suggestions.", 410);
  const allowed: Record<string, string[]> = {
    exposure: ["visible"],
    action: ["saved", "not_interested"],
    outcome: ["contacted", "collaborating", "completed"],
  };
  if (!allowed[action]?.includes(b.value))
    fail("Invalid recommendation feedback.");
  if (
    action !== "exposure" &&
    !db()
      .prepare(
        "SELECT 1 FROM recommendation_events WHERE recommendation_id=? AND kind='exposure'",
      )
      .get(r.id)
  )
    fail("View the recommendation first.", 409);
  db()
    .prepare("INSERT OR IGNORE INTO recommendation_events VALUES(?,?,?,?,?)")
    .run(id(), r.id, action, b.value, timestamp());
  return {
    ok: true,
    provenance: action === "outcome" ? "self_reported" : "member_interaction",
  };
}

import { migrateOrganizations, migrateMembershipControls, migrateEmail, installCECGuards } from "./migrations";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "officer" | "member" | "applicant";
  interests: string;
  shared: number;
};
export type Item = {
  id: string;
  kind: string;
  owner: string;
  organization_id: string;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
  version: number;
};
/**
 * Refuse to run the record on a filesystem that will throw it away.
 *
 * This whole backend is one SQLite file. On a serverless host — Netlify,
 * Vercel, Lambda — each invocation gets its own ephemeral filesystem, so the
 * database is created empty on every cold start, writes vanish when the
 * instance is recycled, and two concurrent requests can be looking at two
 * different databases.
 *
 * The failure is silent and that is what makes it dangerous. Nothing errors. A
 * member signs up, sees a confirmation, and is simply gone. An officer records
 * attendance for forty people and the record is empty next morning. A product
 * whose entire claim is that it keeps an honest record must not do that, and
 * README-CEC.md already says in as many words: do not deploy it onto ephemeral
 * serverless storage.
 *
 * So it fails loudly instead, at the first database touch, with the fix in the
 * message. Set CEC_ALLOW_EPHEMERAL=1 to override for a throwaway demo where
 * losing everything is the expected behaviour.
 */
function refuseEphemeralStorage(file: string) {
  if (process.env.CEC_ALLOW_EPHEMERAL === "1") return;
  const host = process.env.NETLIFY
    ? "Netlify"
    : process.env.VERCEL
      ? "Vercel"
      : process.env.AWS_LAMBDA_FUNCTION_NAME
        ? "AWS Lambda"
        : process.env.FUNCTIONS_WORKER_RUNTIME
          ? "Azure Functions"
          : null;
  // A path under /tmp or the Lambda task root is ephemeral wherever it runs.
  const ephemeralPath = /^\/tmp\//.test(file) || /^\/var\/task\//.test(file);
  if (!host && !ephemeralPath) return;
  throw new Error(
    `Club OS refuses to open its database here. ${
      host ? `This is running on ${host}, which gives each invocation a fresh, empty filesystem.` : ""
    }${ephemeralPath ? ` The database path (${file}) is ephemeral storage.` : ""} ` +
      "Every signup, RSVP, task and attendance record would be silently lost on the next cold start. " +
      "Run it on a host with a persistent volume instead — the Dockerfile at the repository root does this, " +
      "with CEC_DATABASE pointing at a mounted /data. " +
      "Set CEC_ALLOW_EPHEMERAL=1 only for a throwaway demo where losing all data is expected.",
  );
}

let connection: DatabaseSync;
export function db() {
  if (connection) return connection;
  const file =
    process.env.CEC_DATABASE || resolve(process.cwd(), ".data/cec.sqlite");
  refuseEphemeralStorage(file);
  mkdirSync(dirname(file), { recursive: true });
  connection = new DatabaseSync(file);
  connection.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,interests TEXT NOT NULL DEFAULT '',shared INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS rsvps(event_id TEXT REFERENCES items(id),user_id TEXT REFERENCES users(id),status TEXT NOT NULL,attendance TEXT,created_at TEXT NOT NULL,PRIMARY KEY(event_id,user_id));
 CREATE TABLE IF NOT EXISTS applications(user_id TEXT PRIMARY KEY REFERENCES users(id),track TEXT NOT NULL,statement TEXT NOT NULL,url TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'submitted',review TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bookings(slot_id TEXT PRIMARY KEY REFERENCES items(id),user_id TEXT REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY,form_id TEXT REFERENCES items(id),user_id TEXT REFERENCES users(id),answers TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(form_id,user_id));
 CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,course_id TEXT REFERENCES items(id),user_id TEXT REFERENCES users(id),url TEXT NOT NULL,note TEXT NOT NULL,feedback TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'submitted',created_at TEXT NOT NULL,UNIQUE(course_id,user_id));
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),channel TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,object_id TEXT NOT NULL,at TEXT NOT NULL,details TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,body TEXT NOT NULL,delivered INTEGER NOT NULL DEFAULT 0,error TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS ratelimits(key TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append only'); END;
 `);
  try {
  migrateOrganizations(connection);
  migrateMembershipControls(connection);
  migrateEmail(connection);
  const execute = connection.exec.bind(connection);
  installCECGuards(connection, execute);
  connection.exec = (sql: string) => {
    execute(sql);
    if (/CREATE\s+TABLE/i.test(sql)) installCECGuards(connection, execute);
  };
  return connection;
  } catch (error) { connection.close(); connection = undefined as any; throw error; }
}
let transactionDepth = 0;
export function tx<T>(f: () => T): T {
  const d = db(), depth = transactionDepth++;
  const savepoint = `cec_nested_${depth}`;
  try {
    d.exec(depth ? `SAVEPOINT ${savepoint}` : "BEGIN IMMEDIATE");
    try {
      const value = f();
      d.exec(depth ? `RELEASE ${savepoint}` : "COMMIT");
      return value;
    } catch (error) {
      d.exec(depth ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : "ROLLBACK");
      throw error;
    }
  } finally { transactionDepth--; }
}
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export function text(v: unknown, max = 1000): string {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    fail("Please complete all required fields.");
  return v.trim();
}
export function date(v: unknown): string {
  const s = text(v);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime()) || !/(Z|[+-]\d\d:\d\d)$/.test(s))
    fail("A date with timezone is required.");
  return d.toISOString();
}
export function url(v: unknown): string {
  if (v === "" || v === undefined) return "";
  const s = text(v, 2000);
  try {
    const u = new URL(s);
    if (!["https:", "http:"].includes(u.protocol)) fail("Use an HTTPS link.");
    return u.href;
  } catch {
    fail("Enter a valid link.");
  }
}
export function id() {
  return randomUUID();
}
export function timestamp() {
  return new Date().toISOString();
}
export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function password(
  value: string,
  salt = randomBytes(16).toString("hex"),
) {
  if (value.length < 12 || value.length > 256)
    fail("Use a password of 12–256 characters.");
  return salt + ":" + scryptSync(value, salt, 64).toString("hex");
}
export function verify(value: string, stored: string) {
  try {
    const [salt, key] = stored.split(":");
    return timingSafeEqual(
      Buffer.from(key, "hex"),
      scryptSync(value, salt, 64),
    );
  } catch {
    return false;
  }
}
export function user(token: string | undefined): User | null {
  if (!token) return null;
  return (
    (db()
      .prepare(
        "SELECT u.id,u.name,u.email,u.role,u.interests,u.shared FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.role IN ('applicant','member','officer')",
      )
      .get(hash(token), Date.now()) as User) || null
  );
}
export function session(userId: string) {
  const token = randomBytes(32).toString("hex");
  db()
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(hash(token), userId, Date.now() + 7 * 86400000);
  return token;
}
export function clubRole(userId: string): string | undefined {
  return (db().prepare("SELECT role FROM users WHERE id=? AND role IN ('applicant','member','officer')").get(userId) as any)?.role;
}
export function officer(u: User) {
  if (clubRole(u.id) !== "officer") fail("Officer access required.", 403);
}
export function member(u: User) {
  if (!["officer", "member"].includes(clubRole(u.id) || "")) fail("Club membership required.", 403);
}
export function throttle(key: string, max = 15) {
  const d = db();
  const now = Date.now();
  d.prepare("DELETE FROM ratelimits WHERE reset<?").run(now);
  const row = d.prepare("SELECT * FROM ratelimits WHERE key=?").get(key) as any;
  if (row && row.hits >= max)
    fail("Too many attempts. Try again in 15 minutes.", 429);
  d.prepare(
    "INSERT INTO ratelimits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1",
  ).run(key, now + 900000);
}
export function audit(
  u: User,
  action: string,
  object: string,
  details: Record<string, unknown> = {},
) {
  const key = id();
  db()
    .prepare(
      "INSERT INTO audit(id,actor,action,object_id,at,details) VALUES (?,?,?,?,?,?)",
    )
    .run(key, u.id, action, object, timestamp(), JSON.stringify(details));
  return key;
}
export function emit(
  u: User,
  kind: string,
  subject: string,
  object_id: string,
  payload: Record<string, unknown>,
) {
  const key = id();
  const body = {
    organization_id: "cornell-ec",
    source: "native",
    external_id: key,
    fact_key: `${kind}:${subject}:${object_id}`,
    kind,
    subject,
    object_id,
    occurred_at: timestamp(),
    payload,
  };
  db()
    .prepare("INSERT INTO outbox(id,body) VALUES (?,?)")
    .run(key, JSON.stringify({ ...body, _actor: u.id }));
}
export function items(kind?: string): Item[] {
  const rows = kind
    ? db()
        .prepare("SELECT * FROM items WHERE kind=? ORDER BY created_at DESC")
        .all(kind)
    : db().prepare("SELECT * FROM items ORDER BY created_at DESC").all();
  return rows.map((r: any) => ({ ...r, data: JSON.parse(r.data) }));
}
export function item(key: string, kind?: string): Item {
  const row = db().prepare("SELECT * FROM items WHERE id=?").get(key) as any;
  if (!row || (kind && row.kind !== kind)) fail("Record not found.", 404);
  return { ...row, data: JSON.parse(row.data) };
}
export function entity(
  u: User,
  kind: string,
  input: Record<string, any>,
  previous?: Item,
): Record<string, any> {
  const title = text(input.title, 160);
  const base = { title };
  switch (kind) {
    case "event": {
      const start = date(input.starts_at),
        end = date(input.ends_at);
      if (end <= start) fail("End must be after start.");
      const capacity = Number(input.capacity);
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
        fail("Capacity must be 1–10,000.");
      if (!["draft", "published", "closed"].includes(input.status))
        fail("Invalid status.");
      return {
        ...base,
        starts_at: start,
        ends_at: end,
        capacity,
        status: input.status,
        location: text(input.location, 240),
        description: text(input.description, 4000),
      };
    }
    case "task": {
      if (
        ![
          "assigned",
          "accepted",
          "submitted",
          "completed",
          "cancelled",
        ].includes(input.status)
      )
        fail("Invalid task status.");
      const assignee = text(input.assignee);
      if (
        !db()
          .prepare("SELECT 1 FROM users WHERE id=? AND role IN ('member','officer')")
          .get(assignee)
      )
        fail("Select a member.");
      if (input.project_id) item(input.project_id, "project");
      return {
        ...base,
        status: input.status,
        assignee,
        due_at: date(input.due_at),
        project_id: input.project_id || "",
        origin: String(input.origin || "").slice(0, 300),
        // Work and review history is server-owned; general edits cannot forge or erase it.
        work_history: previous?.data.work_history || [],
      };
    }
    case "project":
      return {
        ...base,
        description: text(input.description, 4000),
        stage: choose(input.stage, ["idea", "building", "launched"]),
        url: url(input.url),
        shared: input.shared === true,
      };
    case "doc":
      return {
        ...base,
        url: url(text(input.url)),
        category: choose(input.category, [
          "Playbook",
          "Meeting notes",
          "Project",
          "Resource",
        ]),
        description: String(input.description || "").slice(0, 2000),
      };
    case "contact":
      return {
        ...base,
        organization: text(input.organization, 160),
        email: String(input.email || "").slice(0, 200),
        relationship: choose(input.relationship, [
          "Sponsor",
          "Mentor",
          "Employer",
          "Alumni",
          "Vendor",
        ]),
        notes: String(input.notes || "").slice(0, 2000),
      };
    case "deal": {
      const contact_id = text(input.contact_id);
      item(contact_id, "contact");
      return {
        ...base,
        contact_id,
        stage: choose(input.stage, [
          "lead",
          "contacted",
          "proposed",
          "signed",
          "fulfilled",
          "lost",
        ]),
        amount_cents: cents(input.amount),
        next_step: String(input.next_step || "").slice(0, 1000),
      };
    }
    case "meeting":
      return {
        ...base,
        starts_at: date(input.starts_at),
        agenda: text(input.agenda, 4000),
        decision: String(input.decision || "").slice(0, 4000),
      };
    case "slot":
      return {
        ...base,
        starts_at: date(input.starts_at),
        ends_at: date(input.ends_at),
        location: text(input.location, 240),
      };
    case "course":
      return {
        ...base,
        instructions: text(input.instructions, 4000),
        url: url(input.url),
      };
    case "form": {
      if (
        !Array.isArray(input.fields) ||
        input.fields.length < 1 ||
        input.fields.length > 15
      )
        fail("Add 1–15 questions.");
      const fields = input.fields.map((f: any, index: number) => ({
        id: `q${index}`,
        label: text(f.label, 240),
        required: f.required === true,
      }));
      if (
        previous &&
        db()
          .prepare("SELECT 1 FROM responses WHERE form_id=?")
          .get(previous.id) &&
        JSON.stringify(fields) !== JSON.stringify(previous.data.fields)
      )
        fail(
          "Questions are locked after the first response. Create a new form.",
        );
      return { ...base, fields, open: input.open === true };
    }
    case "transaction":
      return {
        ...base,
        amount_cents: cents(input.amount),
        direction: choose(input.direction, ["income", "expense"]),
        status: choose(input.status, ["planned", "approved", "paid"]),
        category: text(input.category, 160),
        receipt: url(input.receipt),
      };
    default:
      fail("Unknown record type.");
  }
}
function choose(v: any, choices: string[]) {
  if (!choices.includes(v)) fail("Invalid selection.");
  return v;
}
function cents(v: any) {
  if (typeof v !== "string" || !/^\d{1,8}(\.\d{1,2})?$/.test(v))
    fail("Enter a nonnegative amount with at most two decimals.");
  return Math.round(Number(v) * 100);
}
export function createItem(
  u: User,
  kind: string,
  data: Record<string, any>,
  key = id(),
) {
  const at = timestamp();
  db()
    .prepare(
      "INSERT INTO items(id,kind,owner,data,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    )
    .run(key, kind, u.id, JSON.stringify(data), at, at);
  return item(key);
}
export function publishRecord(u: User, r: Item) {
  if (r.kind === "event")
    emit(u, "event", "cornell-ec", r.id, {
      title: r.data.title,
      status: r.data.status,
      starts_at: r.data.starts_at,
    });
  if (r.kind === "task")
    emit(u, "task", r.data.assignee, r.id, {
      title: r.data.title,
      status: r.data.status,
      due_at: r.data.due_at,
    });
  if (r.kind === "deal")
    emit(u, "opportunity", "cornell-ec", r.id, {
      title: r.data.title,
      status: r.data.stage,
    });
  if (r.kind === "meeting" && r.data.decision)
    emit(u, "decision", "cornell-ec", r.id, {
      title: r.data.decision.slice(0, 1000),
      status: "confirmed",
    });
  if (r.kind === "doc")
    emit(u, "artifact", u.id, r.id, { status: "submitted", url: r.data.url });
}

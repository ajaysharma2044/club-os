import {
  db,
  tx,
  text,
  url,
  date,
  fail,
  id,
  timestamp,
  hash,
  clubRole,
  officer,
  member,
  audit,
  item,
  items,
  type User,
} from "./db";
import { portalSchema } from "./portal-schema";
import { usesPostgres } from "./postgres/runtime";
const org = "cornell-ec";
export async function portalInit() {
  await db().exec(portalSchema);
  if (!usesPostgres())
    await db()
      .exec(`CREATE TRIGGER IF NOT EXISTS portal_contact_scope BEFORE INSERT ON portal_followups WHEN NEW.contact_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.contact_id AND organization_id=NEW.organization_id AND kind='contact') THEN RAISE(ABORT,'Choose a club contact') END; END;
 CREATE TRIGGER IF NOT EXISTS portal_contact_scope_update BEFORE UPDATE ON portal_followups WHEN NEW.contact_id IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.contact_id AND organization_id=NEW.organization_id AND kind='contact') THEN RAISE(ABORT,'Choose a club contact') END; END;`);
}
const parse = (r: any) => ({
  ...r,
  data: JSON.parse(r.data),
  ...(r.history ? { history: JSON.parse(r.history) } : {}),
});
const optional = (v: unknown, max = 2000) =>
  v == null || v === "" ? "" : text(v, max);
function choose(v: any, values: string[]) {
  if (!values.includes(v)) fail("Choose a valid option.");
  return v as string;
}
function link(v: any) {
  const value = url(optional(v, 2000));
  if (value && !value.startsWith("https://")) fail("Use an HTTPS link.");
  return value;
}
function version(row: any, b: any) {
  if (!Number.isInteger(b.version) || b.version !== (row?.version || 0))
    fail("This record changed. Refresh before saving.", 409);
}
async function principal(u: User | null) {
  if (!u) return null;
  const role = await clubRole(u.id);
  return role ? { ...u, role: role as User["role"] } : null;
}
async function get(table: string, key: string) {
  const r = await db()
    .prepare(`SELECT * FROM ${table} WHERE id=? AND organization_id=?`)
    .get(key, org);
  if (!r) fail("Record not found.", 404);
  return parse(r);
}
export async function portalState(input: User | null) {
  await portalInit();
  const u = await principal(input),
    isOfficer = u?.role === "officer",
    isMember = !!u && u.role !== "applicant";
  const content = (
    await db()
      .prepare(
        "SELECT * FROM portal_content WHERE organization_id=? ORDER BY created_at DESC",
      )
      .all(org)
  )
    .map(parse)
    .filter(
      (r) =>
        isOfficer ||
        (r.data.status === "published" &&
          (r.data.visibility === "public" || isMember)),
    );
  const own = u
    ? await db()
        .prepare(
          "SELECT * FROM portal_profiles WHERE organization_id=? AND user_id=?",
        )
        .get(org, u.id)
    : null;
  const people = isMember
    ? await db()
        .prepare(
          `SELECT id,name,role FROM users WHERE role IN ('member','officer'${isOfficer ? ",'applicant'" : ""}) ORDER BY name`,
        )
        .all()
    : [];
  const profiles = isMember
    ? (
        await db()
          .prepare("SELECT * FROM portal_profiles WHERE organization_id=?")
          .all(org)
      ).map(parse)
    : [];
  const requests = u
    ? (
        await db()
          .prepare(
            `SELECT * FROM portal_requests WHERE organization_id=? ${isOfficer ? "" : "AND owner=?"} ORDER BY created_at DESC`,
          )
          .all(...(isOfficer ? [org] : [org, u.id]))
      ).map(parse)
    : [];
  const followups = isOfficer
    ? (
        await db()
          .prepare(
            "SELECT * FROM portal_followups WHERE organization_id=? ORDER BY created_at DESC",
          )
          .all(org)
      ).map(parse)
    : [];
  return {
    user: u ? { id: u.id, name: u.name, role: u.role } : null,
    content,
    profile: own ? parse(own) : null,
    people: people.map((p: any) => ({
      ...p,
      profile:
        profiles.find(
          (r) =>
            r.user_id === p.id &&
            (r.data.visibility === "club" || p.id === u?.id),
        )?.data || null,
    })),
    requests,
    followups,
    contacts: isOfficer ? await items("contact") : [],
  };
}
export async function portalAction(input: User, action: string, b: any) {
  await portalInit();
  return tx(async () => {
    const u = await principal(input);
    if (!u) fail("Sign in to continue.", 401);
    if (b.organization_id && b.organization_id !== org)
      fail("This endpoint belongs to CEC.", 403);
    if (b.actor_id && b.actor_id !== u!.id)
      fail("Your account changed. Reload before saving.", 409);
    const now = timestamp();
    if (action === "profile") {
      const prior = await db()
        .prepare(
          "SELECT * FROM portal_profiles WHERE organization_id=? AND user_id=?",
        )
        .get(org, u!.id);
      version(prior, b);
      const year = optional(b.graduation_year, 4);
      if (year && !/^(19|20|21)\d{2}$/.test(year))
        fail("Enter a four-digit graduation year.");
      const data = {
        bio: optional(b.bio),
        major: optional(b.major, 120),
        graduation_year: year,
        skills: optional(b.skills, 500),
        committee: optional(b.committee, 120),
        photo_url: link(b.photo_url),
        linkedin_url: link(b.linkedin_url),
        website_url: link(b.website_url),
        visibility: choose(b.visibility, ["private", "club"]),
      };
      await db()
        .prepare(
          "INSERT INTO portal_profiles(organization_id,user_id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,version=portal_profiles.version+1",
        )
        .run(org, u!.id, JSON.stringify(data), now);
      await audit(u!, "portal.profile", u!.id, { visibility: data.visibility });
      return { ok: true };
    }
    if (action === "content/save") {
      await officer(u!);
      const prior = b.id ? await get("portal_content", text(b.id)) : null;
      version(prior, b);
      const data = {
        kind: choose(b.kind, [
          "About",
          "Leadership",
          "Recruitment",
          "FAQ",
          "Announcement",
          "Resource",
        ]),
        title: text(b.title, 160),
        body: text(b.body, 4000),
        url: link(b.url),
        visibility: choose(b.visibility, ["public", "club"]),
        status: choose(b.status, ["draft", "published", "archived"]),
      };
      const key = prior?.id || id();
      if (prior)
        await db()
          .prepare(
            "UPDATE portal_content SET data=?,version=version+1,updated_at=? WHERE id=? AND organization_id=?",
          )
          .run(JSON.stringify(data), now, key, org);
      else
        await db()
          .prepare(
            "INSERT INTO portal_content(id,owner,data,created_at,updated_at) VALUES(?,?,?,?,?)",
          )
          .run(key, u!.id, JSON.stringify(data), now, now);
      await audit(u!, "portal.content", key, {
        status: data.status,
        version: (prior?.version || 0) + 1,
      });
      return { id: key };
    }
    if (action === "request/create") {
      await member(u!);
      const data = {
        type: choose(b.type, [
          "Reimbursement",
          "Attendance correction",
          "Equipment",
          "Event proposal",
          "Other",
        ]),
        title: text(b.title, 160),
        description: text(b.description, 6000),
        url: link(b.url),
        amount: b.type === "Reimbursement" ? Number(b.amount) : null,
      };
      if (data.type === "Reimbursement") {
        const amount = Number(data.amount);
        if (
          !Number.isFinite(amount) ||
          amount <= 0 ||
          amount > 100000 ||
          Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
        )
          fail(
            "Enter a positive amount up to 100,000 with at most two decimal places.",
          );
        data.amount = Math.round(amount * 100) / 100;
      }
      const key = text(b.request_key, 100),
        fingerprint = hash(JSON.stringify(data));
      const prior = (await db()
        .prepare(
          "SELECT * FROM portal_requests WHERE organization_id=? AND owner=? AND request_key=?",
        )
        .get(org, u!.id, key)) as any;
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          fail("This request key was already used for different details.", 409);
        return { id: prior.id, replayed: true };
      }
      const rid = id(),
        history = [
          {
            actor: u!.id,
            at: now,
            status: "submitted",
            note: "Request submitted.",
          },
        ];
      await db()
        .prepare(
          "INSERT INTO portal_requests(id,owner,request_key,fingerprint,data,status,history,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          rid,
          u!.id,
          key,
          fingerprint,
          JSON.stringify(data),
          "submitted",
          JSON.stringify(history),
          now,
          now,
        );
      await audit(u!, "portal.request.created", rid, { type: data.type });
      return { id: rid };
    }
    if (action === "request/update") {
      await member(u!);
      const r = await get("portal_requests", text(b.id));
      if (r.owner !== u!.id) await officer(u!);
      version(r, b);
      const target = text(b.status),
        note = text(b.note, 4000);
      if (["approved", "declined", "cancelled"].includes(r.status))
        fail("This request is already closed.", 409);
      if (target === "cancelled") {
        if (r.owner !== u!.id) fail("Only the requester can cancel.", 403);
      } else if (target === "submitted") {
        if (r.owner !== u!.id || r.status !== "needs_info")
          fail("Only the requester can answer a request for information.", 403);
      } else {
        await officer(u!);
        if (r.owner === u!.id)
          fail("Another officer must review your request.", 403);
        choose(target, ["in_review", "needs_info", "approved", "declined"]);
        if (target === r.status) fail("Choose a different status.");
      }
      r.history.push({ actor: u!.id, at: now, status: target, note });
      await db()
        .prepare(
          "UPDATE portal_requests SET status=?,history=?,version=version+1,updated_at=? WHERE id=? AND organization_id=?",
        )
        .run(target, JSON.stringify(r.history), now, r.id, org);
      await audit(u!, "portal.request." + target, r.id, {
        version: r.version + 1,
      });
      return { ok: true };
    }
    if (action === "followup/save") {
      await officer(u!);
      const prior = b.id ? await get("portal_followups", text(b.id)) : null;
      version(prior, b);
      const person = optional(b.person_id, 100) || null,
        contact = optional(b.contact_id, 100) || null;
      if (!!person === !!contact) fail("Choose one person or contact.");
      if (
        person &&
        !(await db()
          .prepare(
            "SELECT 1 FROM memberships WHERE organization_id=? AND user_id=?",
          )
          .get(org, person))
      )
        fail("Choose a club member.");
      if (contact) await item(contact, "contact");
      if (prior && (prior.person_id !== person || prior.contact_id !== contact))
        fail("Follow-ups retain their original person or contact.");
      const owner = text(b.owner);
      if (
        !(await db()
          .prepare("SELECT 1 FROM users WHERE id=? AND role='officer'")
          .get(owner))
      )
        fail("Choose a current officer as owner.");
      const data = {
        title: text(b.title, 160),
        note: text(b.note, 6000),
        due_at: b.due_at ? date(b.due_at) : "",
        status: choose(b.status, ["open", "done"]),
        history: prior?.data.history || [],
      };
      data.history = [
        ...data.history,
        {
          actor: u!.id,
          at: now,
          note: data.note,
          status: data.status,
          owner,
          due_at: data.due_at,
        },
      ];
      const key = prior?.id || id();
      if (prior)
        await db()
          .prepare(
            "UPDATE portal_followups SET owner=?,data=?,updated_at=?,version=version+1 WHERE id=? AND organization_id=?",
          )
          .run(owner, JSON.stringify(data), now, key, org);
      else
        await db()
          .prepare(
            "INSERT INTO portal_followups(id,owner,person_id,contact_id,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          )
          .run(key, owner, person, contact, JSON.stringify(data), now, now);
      await audit(u!, "portal.followup", key, {
        version: (prior?.version || 0) + 1,
      });
      return { id: key };
    }
    fail("Unknown portal action.", 404);
  });
}

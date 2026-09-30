import { emailConfig, queueTaskEmail } from './email';
import { offer, respond } from "./opportunities";
import { timingSafeEqual } from "node:crypto";
import {
  captureItem,
  captureTask,
  capturePresence,
  evidenceInit,
} from "./evidence";
import {
  db,
  clubRole,
  tx,
  type User,
  type Item,
  fail,
  text,
  url,
  date,
  id,
  timestamp,
  password,
  verify,
  session,
  hash,
  officer,
  member,
  throttle,
  audit,
  emit,
  items,
  item,
  entity,
  createItem,
  publishRecord,
} from "./db";

export async function auth(action: string, b: any) {
  if (action === "logout") return {};
  const email = text(b.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Enter a valid email.");
  (await throttle("auth:" + hash(email), 10));
  const pw = text(b.password, 256);
  if (action === "login") {
    const u = (await db()
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email)) as any;
    if (!u || !verify(pw, u.password))
      fail("Email or password is incorrect.", 401);
    return { token: (await session(u.id)) };
  }
  if (!["register", "setup"].includes(action)) fail("Unknown action.");
  const name = text(b.name, 100);
  const encoded = password(pw);
  return (await tx(async () => {
    const isSetup = action === "setup";
    if (isSetup) {
      const secret = process.env.CEC_BOOTSTRAP_TOKEN || "";
      const supplied = String(b.bootstrap || "");
      if (
        !secret ||
        secret.length < 24 ||
        Buffer.byteLength(secret) !== Buffer.byteLength(supplied) ||
        !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))
      )
        fail("The setup key is incorrect.", 403);
      if ((await db().prepare("SELECT 1 FROM users WHERE role='officer'").get()))
        fail("Workspace setup is already complete.", 409);
    }
    if ((await db().prepare("SELECT 1 FROM users WHERE email=?").get(email)))
      fail("Unable to create account. Try signing in.", 409);
    const uid = id();
    (await db()
      .prepare(
        "INSERT INTO users(id,name,email,password,role) VALUES (?,?,?,?,?)",
      )
      .run(uid, name, email, encoded, isSetup ? "officer" : "applicant"));
    const u = {
      id: uid,
      name,
      email,
      role: isSetup ? "officer" : "applicant",
      interests: "",
      shared: 0,
    } as User;
    (await audit(u, "account.created", uid, { role: u.role }));
    if (isSetup) {
      (await emit(u, "membership", uid, "cornell-ec", {
        status: "active",
        role: "officer",
      }));
      (await createItem(u, "course", {
        title: "Welcome to CEC",
        instructions:
          "Introduce what you are building, read the club resources, and submit a link to a short project brief. An officer will review your submission.",
        url: "https://www.cornellec.com/",
      }));
      (await createItem(u, "doc", {
        title: "Cornell startup resources",
        url: "https://eship.cornell.edu/cornell-startups/how-to-launch-a-startup-at-cornell/",
        category: "Resource",
        description:
          "Official Cornell guide. External resource; no account connection.",
      }));
    }
    return { token: (await session(uid)) };
  }));
}
export async function state(u: User | null) {
  let emailAvailable = false;
  try {emailAvailable = !!emailConfig();} catch {}
  const capabilities = {
    analytics: process.env.CEC_STORAGE !== "postgres" || !!process.env.CEC_QUANT_DATABASE,
    email: emailAvailable,
  };
  if (u) {
    const role = (await clubRole(u.id));
    if (!role) fail("This account has no current membership in this organization.", 403);
    u = { ...u, role: role as User["role"] };
  }
  const all = (await items());
  const publicEvents = all
    .filter((r) => r.kind === "event" && r.data.status === "published")
    .map((r) => ({ ...r, owner: undefined }));
  if (!u)
    return {
      user: null,
      capabilities,
      setupNeeded: !(await db()
        .prepare("SELECT 1 FROM users WHERE role='officer'")
        .get()),
      items: publicEvents,
    };
  const isOfficer = u.role === "officer";
  const isMember = u.role !== "applicant";
  const visible = all.filter((r) => {
    if (r.kind === "event") return r.data.status !== "draft" || isOfficer;
    if (r.kind === "form") return r.data.open || isOfficer;
    if (r.kind === "slot") return true;
    if (["contact", "deal", "transaction"].includes(r.kind)) return isOfficer;
    return isMember;
  });
  const people = isOfficer
    ? (await db()
        .prepare(
          "SELECT id,name,email,role,interests,shared FROM users ORDER BY name",
        )
        .all())
    : isMember
      ? (await db()
          .prepare(
            "SELECT id,name,role FROM users WHERE role IN ('member','officer') ORDER BY name",
          )
          .all())
      : [];
  const bookings = (await db()
    .prepare("SELECT b.*,u.name FROM bookings b JOIN users u ON u.id=b.user_id")
    .all()) as any[];
  return {
    user: u,
    capabilities,
    items: visible,
    people,
    rsvps: isOfficer
      ? (await db()
          .prepare(
            "SELECT r.*,u.name,u.email FROM rsvps r JOIN users u ON u.id=r.user_id",
          )
          .all())
      : (await db().prepare("SELECT * FROM rsvps WHERE user_id=?").all(u.id)),
    applications: isOfficer
      ? (await db()
          .prepare(
            "SELECT a.*,u.name,u.email FROM applications a JOIN users u ON u.id=a.user_id ORDER BY a.created_at",
          )
          .all())
      : (await db()
          .prepare(
            "SELECT user_id,track,statement,url,stage,created_at FROM applications WHERE user_id=?",
          )
          .all(u.id)),
    bookings: bookings.map((b) =>
      isOfficer || b.user_id === u.id
        ? b
        : { slot_id: b.slot_id, occupied: true },
    ),
    responses: isOfficer
      ? (await db()
          .prepare(
            "SELECT r.*,u.name FROM responses r JOIN users u ON u.id=r.user_id",
          )
          .all())
      : (await db().prepare("SELECT * FROM responses WHERE user_id=?").all(u.id)),
    submissions: isOfficer
      ? (await db()
          .prepare(
            "SELECT s.*,u.name FROM submissions s JOIN users u ON u.id=s.user_id",
          )
          .all())
      : (await db().prepare("SELECT * FROM submissions WHERE user_id=?").all(u.id)),
    messages: isMember
      ? (await db()
          .prepare(
            "SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 100",
          )
          .all())
      : [],
    audit: isOfficer
      ? (await db()
          .prepare(
            "SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.seq DESC LIMIT 100",
          )
          .all())
      : [],
    outbox: isOfficer
      ? (await db()
          .prepare("SELECT COUNT(*) count FROM outbox WHERE delivered=0")
          .get())
      : undefined,
    stats: {
      published: publicEvents.length,
      projects: visible.filter((r) => r.kind === "project").length,
      openTasks: visible.filter(
        (r) =>
          r.kind === "task" &&
          !["completed", "cancelled"].includes(r.data.status),
      ).length,
    },
  };
}
export async function mutate(u: User, action: string, b: any) {
  const role = (await clubRole(u.id));
  if (!role) fail("This account has no current membership in this organization.", 403);
  u = { ...u, role: role as User["role"] };
  if ((b.organization_id && b.organization_id !== "cornell-ec") ||
      (b.data?.organization_id && b.data.organization_id !== "cornell-ec"))
    fail("This endpoint belongs to CEC.", 403);
  (await evidenceInit());
  return (await tx(async () => {
    if (action === "create" || action === "update") {
      const previous = action === "update" ? (await item(text(b.id))) : undefined;
      const kind = previous?.kind || text(b.kind);
      if (!["project", "doc"].includes(kind)) (await officer(u));
      else {
        (await member(u));
        if (previous && previous.owner !== u.id) (await officer(u));
      }
      if (!b.data || typeof b.data !== "object") fail("Missing fields.");
      const data = (await entity(u, kind, b.data, previous));
      if (kind === "task") {
        if (!previous && data.status !== "assigned")
          fail("New tasks start as assigned.");
        if (previous && data.status !== previous.data.status)
          fail("Use the task transition controls to change status.");
        if (previous && data.project_id !== previous.data.project_id)
          fail("A task retains its original project and evidence episode.");
        if (
          previous &&
          data.assignee !== previous.data.assignee &&
          previous.data.status !== "assigned"
        )
          fail("Cancel accepted work before assigning a replacement task.");
      }
      if (
        previous &&
        kind === "project" &&
        data.shared !== previous.data.shared &&
        previous.owner !== u.id
      )
        fail("Only the project owner can change sharing.", 403);
      if (
        kind === "event" &&
        data.status === "closed" &&
        data.ends_at > timestamp()
      )
        fail("Close the event after its scheduled end.");
      if (kind === "slot" && data.ends_at <= data.starts_at)
        fail("End must follow start.");
      if (previous) {
        if (Number(b.version) !== previous.version)
          fail("This record changed. Refresh and try again.", 409);
        if (
          kind === "event" &&
          previous.data.status === "closed" &&
          data.status !== "closed"
        )
          fail("Closed events cannot be reopened.");
        if (
          kind === "slot" &&
          (await db()
            .prepare("SELECT 1 FROM bookings WHERE slot_id=?")
            .get(previous.id))
        )
          fail("Cancel the booking before changing this slot.");
        if (kind === "task" && previous.data.assignee !== data.assignee)
          (await emit(u, "task", previous.data.assignee, previous.id, {
            title: previous.data.title,
            status: "cancelled",
            due_at: previous.data.due_at,
          }));
        (await db()
          .prepare(
            "UPDATE items SET data=?,updated_at=?,version=version+1 WHERE id=?",
          )
          .run(JSON.stringify(data), timestamp(), previous.id));
      }
      const r = previous ? (await item(previous.id)) : (await createItem(u, kind, data));
      const sourceKey = (await audit(u, kind + "." + action, r.id, {
        version: r.version,
        state: r.data,
      }));
      (await captureItem(u, r, sourceKey, previous));
      // Assignment is an offer. Recording it is what makes take rates fair:
      // an assignment nobody accepted was previously invisible.
      if (kind === "task") {
        if (!previous)
          (await offer(u, { kind: "task", objectType: "task", objectId: r.id, to: data.assignee }));
        else if (previous.data.assignee !== data.assignee) {
          (await respond(u, { objectType: "task", objectId: r.id, to: previous.data.assignee, response: "reassigned" }));
          (await offer(u, { kind: "task", objectType: "task", objectId: r.id, to: data.assignee }));
        }
      }
      if (kind === "task" && (!previous || previous.data.assignee !== data.assignee)) (await queueTaskEmail(r,"assignment"));
      (await publishRecord(u, r));
      return { id: r.id };
    }
    if (action === "task.status") {
      (await member(u));
      const r = (await item(text(b.id), "task"));
      if (r.data.assignee !== u.id) (await officer(u));
      const target = text(b.status);
      if (target === "submitted" && r.data.assignee !== u.id)
        fail("Only the assignee can submit their work.", 403);
      if (
        r.data.status === "assigned" &&
        target === "accepted" &&
        r.data.assignee !== u.id
      )
        fail("Only the assignee can accept a commitment.", 403);
      const flow: Record<string, string[]> = {
        assigned: ["accepted", "cancelled"],
        accepted: ["submitted", "cancelled"],
        submitted: ["completed", "accepted", "cancelled"],
        completed: [],
        cancelled: [],
      };
      if (!flow[r.data.status]?.includes(target))
        fail("Invalid task transition.");
      if (target === "completed") (await officer(u));
      // Returning submitted work for revision is a review decision, not a new
      // acceptance by the assignee. Match the officer-only Request revision UI.
      if (r.data.status === "submitted" && target === "accepted") (await officer(u));
      // An assignee may cancel work they have not yet accepted: that is
      // declining an offer, and it is a different behavioural fact from an
      // officer withdrawing it. Without this, "declined" is unreachable and
      // every take rate silently treats a refusal as someone else's decision.
      if (
        target === "cancelled" &&
        !(r.data.status === "assigned" && r.data.assignee === u.id)
      )
        (await officer(u));
      const reviewing = r.data.status === "submitted" &&
        (target === "accepted" || target === "completed");
      if (target === "submitted" || reviewing) {
        if (!Number.isInteger(b.version) || b.version !== r.version)
          fail("This task changed. Refresh and review the latest work before continuing.", 409);
      }
      const history = [...(r.data.work_history || [])];
      if (target === "submitted") {
        const note = b.submission_note === undefined || b.submission_note === ""
          ? "" : text(b.submission_note, 4000);
        const artifact = url(b.artifact_url);
        if (!note && !artifact) fail("Add a completion note or a link to your work.");
        history.push({ id: id(), kind: "submission", actor: u.id, at: timestamp(),
          note, artifact_url: artifact });
      } else if (reviewing) {
        const submission = history.findLast((entry: any) => entry.kind === "submission");
        history.push({ id: id(), kind: target === "completed" ? "approval" : "revision",
          actor: u.id, at: timestamp(), submission_id: submission?.id || null,
          note: target === "accepted" ? text(b.revision_note, 4000) : "" });
      }
      const data = { ...r.data, status: target, work_history: history };
      (await db()
        .prepare(
          "UPDATE items SET data=?,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(JSON.stringify(data), timestamp(), r.id));
      const sourceKey = (await audit(u, "task." + target, r.id));
      (await captureTask(u, (await item(r.id)), r.data.status, sourceKey));
      // r.data.status is the pre-transition state here.
      if (r.data.status === "assigned") {
        if (target === "accepted")
          (await respond(u, { objectType: "task", objectId: r.id, to: r.data.assignee, response: "accepted" }));
        else if (target === "cancelled")
          (await respond(u, {
            objectType: "task",
            objectId: r.id,
            to: r.data.assignee,
            response: u.id === r.data.assignee ? "declined" : "withdrawn",
          }));
      }
      if (r.data.status === "submitted" && target === "accepted") (await queueTaskEmail((await item(r.id)),"revision"));
      (await publishRecord(u, (await item(r.id))));
      return {};
    }
    if (action === "rsvp") {
      const e = (await item(text(b.event_id), "event"));
      if (e.data.status !== "published" || e.data.starts_at <= timestamp())
        fail("Registration is closed.");
      if (!["yes", "no"].includes(b.status)) fail("Invalid RSVP.");
      const existing = (await db()
        .prepare("SELECT status FROM rsvps WHERE event_id=? AND user_id=?")
        .get(e.id, u.id)) as any;
      const count = (
        (await db()
          .prepare(
            "SELECT COUNT(*) count FROM rsvps WHERE event_id=? AND status='yes'",
          )
          .get(e.id)) as any
      ).count;
      const status =
        b.status === "yes" &&
        existing?.status !== "yes" &&
        count >= e.data.capacity
          ? "waitlist"
          : b.status;
      (await db()
        .prepare(
          "INSERT INTO rsvps(event_id,user_id,status,created_at) VALUES (?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status",
        )
        .run(e.id, u.id, status, timestamp()));
      const sourceKey = (await audit(u, "event.rsvp", e.id, { status }));
      if (existing?.status !== status)
        (await capturePresence(u, e.id, u.id, status, false, sourceKey));
      (await emit(u, "rsvp", u.id, e.id, { status }));
      return { status };
    }
    if (action === "attendance") {
      (await officer(u));
      const e = (await item(text(b.event_id), "event"));
      if (e.data.starts_at > timestamp())
        fail("Check-in opens at event start.");
      const uid = text(b.user_id);
      if (!["present", "absent"].includes(b.status))
        fail("Invalid attendance.");
      if (
        !(await db()
          .prepare("SELECT 1 FROM rsvps WHERE event_id=? AND user_id=?")
          .get(e.id, uid))
      )
        fail("Register this person before check-in.");
      (await db()
        .prepare("UPDATE rsvps SET attendance=? WHERE event_id=? AND user_id=?")
        .run(b.status, e.id, uid));
      const sourceKey = (await audit(u, "event.attendance", e.id, {
        subject: uid,
        status: b.status,
      }));
      (await capturePresence(u, e.id, uid, b.status, true, sourceKey));
      (await emit(u, "attendance", uid, e.id, { status: b.status, method: "officer" }));
      return {};
    }
    if (action === "apply") {
      if (!["Events", "Media", "Generalist"].includes(b.track))
        fail("Select a track.");
      if ((await db().prepare("SELECT 1 FROM applications WHERE user_id=?").get(u.id)))
        fail("An application is already on file.");
      (await db()
        .prepare(
          "INSERT INTO applications(user_id,track,statement,url,created_at) VALUES (?,?,?,?,?)",
        )
        .run(u.id, b.track, text(b.statement, 4000), url(b.url), timestamp()));
      (await audit(u, "application.submitted", u.id));
      (await emit(u, "application", u.id, "fall-recruitment", { status: "submitted" }));
      return {};
    }
    if (action === "application.review") {
      (await officer(u));
      const uid = text(b.user_id);
      if (!["review", "accepted", "declined"].includes(b.stage))
        fail("Invalid stage.");
      if (!(await db().prepare("SELECT 1 FROM applications WHERE user_id=?").get(uid)))
        fail("Application not found.");
      (await db()
        .prepare("UPDATE applications SET stage=?,review=? WHERE user_id=?")
        .run(b.stage, String(b.review || "").slice(0, 4000), uid));
      if (b.stage === "accepted") {
        (await db()
          .prepare(
            "UPDATE users SET role='member' WHERE id=? AND role='applicant'",
          )
          .run(uid));
        (await emit(u, "membership", uid, "cornell-ec", {
          status: "active",
          role: "member",
        }));
      }
      (await audit(u, "application." + b.stage, uid));
      (await emit(u, "application", uid, "fall-recruitment", { status: b.stage }));
      return {};
    }
    if (action === "book") {
      const slot = (await item(text(b.slot_id), "slot"));
      if (slot.data.starts_at <= timestamp()) fail("This slot has passed.");
      const booked = (await db()
        .prepare(
          "SELECT b.slot_id,i.data FROM bookings b JOIN items i ON i.id=b.slot_id WHERE b.user_id=?",
        )
        .all(u.id)) as any[];
      if ((await db().prepare("SELECT 1 FROM bookings WHERE slot_id=?").get(slot.id)))
        fail("That slot has just been booked.", 409);
      if (
        booked.some((r) => {
          const s = JSON.parse(r.data);
          return (
            s.starts_at < slot.data.ends_at && s.ends_at > slot.data.starts_at
          );
        })
      )
        fail("You already have an overlapping booking.");
      (await db()
        .prepare("INSERT INTO bookings(slot_id,user_id,created_at) VALUES (?,?,?)")
        .run(slot.id, u.id, timestamp()));
      (await audit(u, "coffee_chat.booked", slot.id));
      (await emit(u, "coffee_chat", u.id, slot.id, {
        status: "booked",
        starts_at: slot.data.starts_at,
      }));
      return {};
    }
    if (action === "booking.cancel") {
      const slot = (await item(text(b.slot_id), "slot"));
      const booking = (await db()
        .prepare("SELECT * FROM bookings WHERE slot_id=?")
        .get(slot.id)) as any;
      if (!booking) fail("Booking not found.");
      if (booking.user_id !== u.id) (await officer(u));
      (await db().prepare("DELETE FROM bookings WHERE slot_id=?").run(slot.id));
      (await audit(u, "coffee_chat.cancelled", slot.id));
      (await emit(u, "coffee_chat", booking.user_id, slot.id, {
        status: "cancelled",
        starts_at: slot.data.starts_at,
      }));
      return {};
    }
    if (action === "respond") {
      const f = (await item(text(b.form_id), "form"));
      if (!f.data.open) fail("This form is closed.");
      const answers: Record<string, string> = {};
      for (const q of f.data.fields) {
        const a = String(b.answers?.[q.id] || "").trim();
        if (q.required && !a) fail("Please answer: " + q.label);
        if (a.length > 4000) fail("Answer is too long.");
        answers[q.id] = a;
      }
      if (
        (await db()
          .prepare("SELECT 1 FROM responses WHERE form_id=? AND user_id=?")
          .get(f.id, u.id))
      )
        fail("You have already submitted this form.");
      const rid = id();
      (await db()
        .prepare("INSERT INTO responses(id,form_id,user_id,answers,created_at) VALUES (?,?,?,?,?)")
        .run(rid, f.id, u.id, JSON.stringify(answers), timestamp()));
      (await audit(u, "form.submitted", f.id));
      return {};
    }
    if (action === "submit") {
      (await member(u));
      const c = (await item(text(b.course_id), "course"));
      const link = url(text(b.url));
      const note = String(b.note || "").slice(0, 4000);
      (await db()
        .prepare(
          "INSERT INTO submissions(id,course_id,user_id,url,note,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(course_id,user_id) DO UPDATE SET url=excluded.url,note=excluded.note,status='submitted',feedback=''",
        )
        .run(id(), c.id, u.id, link, note, timestamp()));
      (await audit(u, "learning.submitted", c.id));
      (await emit(u, "artifact", u.id, c.id, { status: "submitted", url: link }));
      return {};
    }
    if (action === "submission.review") {
      (await officer(u));
      if (!["reviewed", "revision"].includes(b.status)) fail("Invalid review.");
      const r = (await db()
        .prepare("SELECT * FROM submissions WHERE id=?")
        .get(text(b.id))) as any;
      if (!r) fail("Submission not found.");
      (await db()
        .prepare("UPDATE submissions SET status=?,feedback=? WHERE id=?")
        .run(b.status, text(b.feedback, 4000), r.id));
      (await audit(u, "learning.reviewed", r.course_id, { subject: r.user_id }));
      if (b.status === "reviewed")
        (await emit(u, "artifact", r.user_id, r.course_id, {
          status: "reviewed",
          url: r.url,
        }));
      return {};
    }
    if (action === "message") {
      (await member(u));
      if (!["general", "events", "builders"].includes(b.channel))
        fail("Unknown channel.");
      const key = id();
      (await db()
        .prepare("INSERT INTO messages(id,user_id,channel,body,created_at) VALUES (?,?,?,?,?)")
        .run(key, u.id, b.channel, text(b.body, 4000), timestamp()));
      (await audit(u, "message.sent", key, { channel: b.channel }));
      return {};
    }
    if (action === "profile") {
      (await db()
        .prepare("UPDATE users SET name=?,interests=?,shared=? WHERE id=?")
        .run(
          text(b.name, 100),
          String(b.interests || "").slice(0, 1000),
          b.shared === true ? 1 : 0,
          u.id,
        ));
      (await audit(u, "profile.updated", u.id, { shared: b.shared === true }));
      return {};
    }
    fail("Unknown action.", 404);
  }));
}

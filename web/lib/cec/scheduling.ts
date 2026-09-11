import * as chrono from "chrono-node";
import { randomBytes } from "node:crypto";
import { evidenceInit, ensureEpisode, recordEvidence } from "./evidence";
import {
  db,
  tx,
  User,
  member,
  fail,
  id,
  timestamp,
  text,
  date,
  hash,
  audit,
} from "./db";
const POLICY = "chat-schedule-proposal-v1";
export function scheduleInit() {
  evidenceInit();
  db().exec(`
CREATE TABLE IF NOT EXISTS schedule_proposals(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),source_ids TEXT NOT NULL,draft TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'proposed',created_at TEXT NOT NULL,policy TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scheduled_meetings(id TEXT PRIMARY KEY,proposal_id TEXT UNIQUE NOT NULL REFERENCES schedule_proposals(id),owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,location TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS meeting_participants(meeting_id TEXT REFERENCES scheduled_meetings(id),user_id TEXT REFERENCES users(id),status TEXT NOT NULL,ever_accepted INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(meeting_id,user_id));
CREATE TABLE IF NOT EXISTS calendar_preferences(user_id TEXT PRIMARY KEY REFERENCES users(id),token_hash TEXT,auto_add INTEGER NOT NULL DEFAULT 0);
`);
}
function parts(d: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
}
function offset(d: Date) {
  const p = parts(d);
  return (
    (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) -
      Math.floor(d.getTime() / 1000) * 1000) /
    60000
  );
}
function draftFromMessages(messages: any[]) {
  const candidates: any[] = [];
  const locations: string[] = [];
  for (const m of messages) {
    for (const match of chrono.parse(
      m.body,
      {
        instant: new Date(m.created_at),
        timezone: offset(new Date(m.created_at)),
      },
      { forwardDate: true },
    )) {
      const s = match.start;
      const hasTime =
        s.isCertain("hour") &&
        (s.isCertain("meridiem") || (s.get("hour") ?? 0) > 12);
      candidates.push({
        message_id: m.id,
        text: match.text,
        date: [
          s.get("year"),
          String(s.get("month")).padStart(2, "0"),
          String(s.get("day")).padStart(2, "0"),
        ].join("-"),
        time: hasTime
          ? String(s.get("hour")).padStart(2, "0") +
            ":" +
            String(s.get("minute")).padStart(2, "0")
          : null,
        has_date: s.isCertain("day") || s.isCertain("weekday"),
        ambiguous_time: s.isCertain("hour") && !hasTime,
      });
    }
    const found = m.body.match(
      /(?:\bat\s+|\bin\s+|let['’]s do\s+)((?:Gates|Uris|eHub|Kennedy|Duffield|Statler)\b[^.!?\n]{0,80})/i,
    );
    if (found) locations.push(found[1].trim());
  }
  const day = [...candidates].reverse().find((c) => c.has_date),
    time = [...candidates].reverse().find((c) => c.time || c.ambiguous_time);
  return {
    title: "Club meeting",
    date: day?.date || "",
    time: time?.time || "",
    location: locations.at(-1) || "",
    timezone: "America/New_York",
    candidates,
    locations,
    participant_suggestions: [...new Set(messages.map((m) => m.user_id))],
    notice:
      "Suggestions from selected messages. Confirm the exact date, AM/PM, duration, location, and attendees. Conversation alone does not establish agreement or room availability.",
    policy: POLICY,
  };
}
export function scheduleState(u: User) {
  member(u);
  scheduleInit();
  return {
    meetings: db()
      .prepare(
        "SELECT m.*,p.status participant_status FROM scheduled_meetings m JOIN meeting_participants p ON p.meeting_id=m.id WHERE p.user_id=? ORDER BY m.starts_at",
      )
      .all(u.id) as any[],
    preferences: db()
      .prepare(
        "SELECT auto_add,token_hash IS NOT NULL AS has_feed FROM calendar_preferences WHERE user_id=?",
      )
      .get(u.id) || { auto_add: 0, has_feed: 0 },
    proposals: (
      db()
        .prepare(
          "SELECT * FROM schedule_proposals WHERE owner=? AND status='proposed' ORDER BY created_at DESC LIMIT 10",
        )
        .all(u.id) as any[]
    ).map((p) => ({ ...p, draft: JSON.parse(p.draft) })),
  };
}
export function schedule(u: User, action: string, b: any) {
  member(u);
  scheduleInit();
  return tx(() => {
    if (action === "propose") {
      if (
        !Array.isArray(b.message_ids) ||
        !b.message_ids.length ||
        b.message_ids.length > 12
      )
        fail("Select 1–12 messages.");
      const ids = [...new Set<string>(b.message_ids.map(String))];
      const messages = ids.map(
        (mid) =>
          db()
            .prepare(
              "SELECT * FROM messages WHERE id=? AND channel IN ('general','events','builders')",
            )
            .get(mid) as any,
      );
      if (
        messages.some((m) => !m) ||
        new Set(messages.map((m) => m.channel)).size !== 1
      )
        fail("Select messages from one accessible club channel.");
      messages.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const source = JSON.stringify(messages.map((m) => m.id));
      const existing = db()
        .prepare(
          "SELECT * FROM schedule_proposals WHERE owner=? AND source_ids=? AND status='proposed'",
        )
        .get(u.id, source) as any;
      if (existing)
        return { id: existing.id, draft: JSON.parse(existing.draft) };
      const draft = draftFromMessages(messages),
        pid = id();
      db()
        .prepare(
          "INSERT INTO schedule_proposals(id,owner,source_ids,draft,created_at,policy) VALUES(?,?,?,?,?,?)",
        )
        .run(pid, u.id, source, JSON.stringify(draft), timestamp(), POLICY);
      audit(u, "schedule.proposed", pid, { source_ids: ids, policy: POLICY });
      return { id: pid, draft };
    }
    if (action === "dismiss") {
      const p = db()
        .prepare("SELECT * FROM schedule_proposals WHERE id=? AND owner=?")
        .get(String(b.proposal_id), u.id) as any;
      if (!p) fail("Proposal not found.", 404);
      if (p.status !== "proposed") fail("Proposal is already resolved.", 409);
      db()
        .prepare("UPDATE schedule_proposals SET status='dismissed' WHERE id=?")
        .run(p.id);
      audit(u, "schedule.dismissed", p.id);
      return { ok: true };
    }
    if (action === "confirm") {
      const p = db()
        .prepare("SELECT * FROM schedule_proposals WHERE id=? AND owner=?")
        .get(String(b.proposal_id), u.id) as any;
      if (!p) fail("Proposal not found.", 404);
      if (p.status === "confirmed")
        return {
          meeting: db()
            .prepare("SELECT * FROM scheduled_meetings WHERE proposal_id=?")
            .get(p.id),
        };
      if (p.status !== "proposed") fail("Proposal is no longer active.", 409);
      if (b.confirmed !== true) fail("Confirm the meeting details.");
      const title = text(b.title, 160),
        location = text(b.location, 240),
        start = date(b.starts_at),
        end = date(b.ends_at);
      if (
        start <= timestamp() ||
        end <= start ||
        Date.parse(end) - Date.parse(start) > 8 * 3600000
      )
        fail("Choose a future meeting lasting up to eight hours.");
      if (!Array.isArray(b.participants) || b.participants.length > 50)
        fail("Choose up to 50 participants.");
      const participants = [...new Set([u.id, ...b.participants.map(String)])];
      if (
        participants.some(
          (uid) =>
            !db()
              .prepare("SELECT 1 FROM users WHERE id=? AND role!='applicant'")
              .get(uid),
        )
      )
        fail("Choose current club members.");
      const mid = id();
      db()
        .prepare(
          "INSERT INTO scheduled_meetings(id,proposal_id,owner,title,starts_at,ends_at,location,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          mid,
          p.id,
          u.id,
          title,
          start,
          end,
          location,
          "confirmed",
          timestamp(),
        );
      for (const uid of participants) {
        const auto = (
          db()
            .prepare(
              "SELECT auto_add FROM calendar_preferences WHERE user_id=?",
            )
            .get(uid) as any
        )?.auto_add;
        const accepted = uid === u.id || !!auto;
        db()
          .prepare("INSERT INTO meeting_participants VALUES(?,?,?,?)")
          .run(mid, uid, accepted ? "accepted" : "pending", accepted ? 1 : 0);
      }
      db()
        .prepare("UPDATE schedule_proposals SET status='confirmed' WHERE id=?")
        .run(p.id);
      const sourceKey = audit(u, "schedule.confirmed", mid, {
        proposal_id: p.id,
        participants,
        starts_at: start,
        ends_at: end,
        location,
      });
      const episode = ensureEpisode(
        u,
        "scheduled_meeting",
        mid,
        title,
        "Meeting confirmed from selected club messages",
      );
      recordEvidence(u, {
        episode,
        sourceKey,
        family: "COORDINATE",
        type: "meeting.scheduled",
        objectType: "scheduled_meeting",
        object: mid,
        context: {
          proposal_id: p.id,
          source_ids: JSON.parse(p.source_ids),
          participants,
          starts_at: start,
          ends_at: end,
          location,
        },
      });
      for (const uid of participants) {
        const pstate = db()
          .prepare(
            "SELECT status FROM meeting_participants WHERE meeting_id=? AND user_id=?",
          )
          .get(mid, uid) as any;
        recordEvidence(u, {
          episode,
          subject: uid,
          family: pstate.status === "accepted" ? "COMMIT" : "COORDINATE",
          type:
            pstate.status === "accepted"
              ? "meeting.accepted"
              : "meeting.invited",
          objectType: "scheduled_meeting",
          object: mid,
          context: {
            basis:
              uid === u.id
                ? "organizer_confirmation"
                : pstate.status === "accepted"
                  ? "participant_auto_add_preference"
                  : "invitation_only",
            attendance: "unknown",
          },
        });
      }
      return {
        meeting: db()
          .prepare("SELECT * FROM scheduled_meetings WHERE id=?")
          .get(mid),
      };
    }
    if (action === "respond") {
      if (!["accepted", "declined"].includes(b.status))
        fail("Choose accept or decline.");
      const m = db()
        .prepare(
          "SELECT m.*,p.status participant_status FROM scheduled_meetings m JOIN meeting_participants p ON p.meeting_id=m.id WHERE m.id=? AND p.user_id=?",
        )
        .get(String(b.meeting_id), u.id) as any;
      if (!m) fail("Meeting not found.", 404);
      if (m.status !== "confirmed") fail("Meeting was cancelled.", 409);
      if (m.participant_status === b.status) return { ok: true };
      db()
        .prepare(
          "UPDATE meeting_participants SET status=?,ever_accepted=MAX(ever_accepted,?) WHERE meeting_id=? AND user_id=?",
        )
        .run(b.status, b.status === "accepted" ? 1 : 0, m.id, u.id);
      db()
        .prepare(
          "UPDATE scheduled_meetings SET version=version+1,updated_at=? WHERE id=?",
        )
        .run(timestamp(), m.id);
      const sourceKey = audit(u, "schedule." + b.status, m.id);
      const episode = ensureEpisode(
        u,
        "scheduled_meeting",
        m.id,
        m.title,
        "Meeting confirmed from selected club messages",
        m.owner,
      );
      recordEvidence(u, {
        episode,
        sourceKey,
        family: b.status === "accepted" ? "COMMIT" : "REVISE",
        type: "meeting." + b.status,
        objectType: "scheduled_meeting",
        object: m.id,
        context: { basis: "participant_response", attendance: "unknown" },
      });
      return { ok: true };
    }
    if (action === "cancel") {
      const m = db()
        .prepare("SELECT * FROM scheduled_meetings WHERE id=? AND owner=?")
        .get(String(b.meeting_id), u.id) as any;
      if (!m) fail("Meeting not found.", 404);
      if (m.status !== "cancelled") {
        db()
          .prepare(
            "UPDATE scheduled_meetings SET status='cancelled',version=version+1,updated_at=? WHERE id=?",
          )
          .run(timestamp(), m.id);
        const sourceKey = audit(u, "schedule.cancelled", m.id);
        const episode = ensureEpisode(
          u,
          "scheduled_meeting",
          m.id,
          m.title,
          "Meeting confirmed from selected club messages",
          m.owner,
        );
        db()
          .prepare(
            "UPDATE episodes SET status='cancelled',version=version+1 WHERE id=?",
          )
          .run(episode);
        recordEvidence(u, {
          episode,
          sourceKey,
          family: "OUTCOME",
          type: "meeting.cancelled",
          objectType: "scheduled_meeting",
          object: m.id,
          context: { reason: "organizer_cancelled", attendance: "unknown" },
        });
      }
      return { ok: true };
    }
    if (action === "preferences") {
      if (typeof b.auto_add !== "boolean")
        fail("Choose a calendar preference.");
      db()
        .prepare(
          "INSERT INTO calendar_preferences(user_id,auto_add) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET auto_add=excluded.auto_add",
        )
        .run(u.id, b.auto_add ? 1 : 0);
      return { ok: true };
    }
    if (action === "feed") {
      const token = randomBytes(32).toString("hex");
      db()
        .prepare(
          "INSERT INTO calendar_preferences(user_id,token_hash) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash",
        )
        .run(u.id, hash(token));
      return { token };
    }
    if (action === "revoke") {
      db()
        .prepare(
          "UPDATE calendar_preferences SET token_hash=NULL WHERE user_id=?",
        )
        .run(u.id);
      return { ok: true };
    }
    fail("Not found.", 404);
  });
}
export function calendarFeed(token: string) {
  scheduleInit();
  if (!/^[a-f0-9]{64}$/.test(token)) fail("Calendar link not found.", 404);
  const p = db()
    .prepare(
      "SELECT p.user_id FROM calendar_preferences p JOIN users u ON u.id=p.user_id WHERE p.token_hash=? AND u.role!='applicant'",
    )
    .get(hash(token)) as any;
  if (!p) fail("Calendar link not found.", 404);
  const meetings = db()
    .prepare(
      "SELECT m.*,p.status participant_status FROM scheduled_meetings m JOIN meeting_participants p ON p.meeting_id=m.id WHERE p.user_id=? AND p.ever_accepted=1 ORDER BY m.starts_at",
    )
    .all(p.user_id) as any[];
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  const stamp = (s: string) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club OS//Personal meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...meetings.flatMap((m) => [
      "BEGIN:VEVENT",
      "UID:" + m.id + "@clubos",
      "DTSTAMP:" + stamp(m.updated_at),
      "LAST-MODIFIED:" + stamp(m.updated_at),
      "SEQUENCE:" + m.version,
      "DTSTART:" + stamp(m.starts_at),
      "DTEND:" + stamp(m.ends_at),
      "SUMMARY:" + esc(m.title),
      "LOCATION:" + esc(m.location),
      "STATUS:" +
        (m.status === "cancelled" || m.participant_status === "declined"
          ? "CANCELLED"
          : "CONFIRMED"),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((line) => {
        const out: string[] = [];
        let part = "";
        for (const ch of line) {
          if (Buffer.byteLength(part + ch) > 75) {
            out.push(part);
            part = " " + ch;
          } else part += ch;
        }
        out.push(part);
        return out.join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}

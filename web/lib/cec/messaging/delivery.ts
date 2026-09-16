// Notification preferences, mentions, the inbox summary, and the data an
// external deliverer would need if one ever existed.
//
// ---------------------------------------------------------------------------
// THE WALL, RESTATED, BECAUSE THIS IS THE FILE WHERE IT GETS TESTED.
//
// A notification pipeline is how private text escapes. Not through the
// conversation view — through the log line, the email provider's storage, the
// push vendor's analytics, the "just a count, for the badge" feature that a
// month later is a responsiveness metric. So:
//
//   - Nothing here calls emit, recordEvidence, writeFactorValue or label.
//     tests/messaging.mjs reads this file and fails if any of them appears.
//   - No rows go to the audit table either. It is officer-readable in bulk, and
//     "who sent to whom, when" is the graph docs/11 §7 forbids under "no
//     friendship-strength numbers" and "no 'who is avoiding whom'".
//   - deliveryPlan() deliberately returns NO message body. A deliverer gets
//     routing metadata and nothing to read. "You have a new message" is enough
//     to make somebody open the app, and it is the difference between private
//     text living in one table under one access rule and private text living in
//     an SMTP provider's outbound log forever.
//   - Unread and mention counts exist for the badge on the reader's own screen.
//     They are computed per request, never stored as a per-person series, and
//     never returned for anyone but the caller. A stored time series of "unread
//     messages by person by week" is a behavioural feature with a badge painted
//     on it.
//
// NOTHING IS ACTUALLY SENT FROM HERE. There is no email or push provider
// configured in this product — README-CEC.md lists email delivery under "not
// connected" and the interface says "not configured" rather than pretending.
// deliveryPlan() computes recipients and stops. It does not queue, it does not
// write to `outbox` (that is the quant emitter and a message has no business
// in it), and it does not retry, because there is nothing to retry.
// ---------------------------------------------------------------------------
//
// MENTIONS RESOLVE INSIDE THE ROOM ONLY.
//
// The obvious implementation looks up `@name` against the users table. That
// turns every message box in the club into a membership oracle: type a name,
// watch whether it lights up, learn whether that person has an account. So the
// index is built from the conversation's own roster. An unresolved `@name`
// stays plain text and tells the writer nothing.

import { db, fail, text, timestamp, throttle, type User } from "../db";
import {
  messagingInit,
  requireMember,
  postMessage,
  memberRoster,
  messageRow,
  unreadFor,
  conversationsFor,
  type ConversationKind,
  type Message,
} from "./conversations";

/** Messages one person may send into one conversation per rate-limit window. */
export const SEND_LIMIT = 30;

export type PrefLevel = "all" | "mentions" | "none";
export type Prefs = {
  user_id: string;
  dm: PrefLevel;
  groups: PrefLevel;
  channels: PrefLevel;
  updated_at: string;
};

const LEVELS: PrefLevel[] = ["all", "mentions", "none"];
// Channels default to mentions-only. A club channel is a firehose and a member
// who is notified for every line in it turns notifications off entirely, which
// loses the DM that actually needed them.
const DEFAULTS = { dm: "all", groups: "all", channels: "mentions" } as const;

let ready = false;
export function deliveryInit() {
  if (ready) return;
  messagingInit();
  db().exec(`
CREATE TABLE IF NOT EXISTS notification_prefs(
  user_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  dm TEXT NOT NULL DEFAULT 'all',
  groups TEXT NOT NULL DEFAULT 'all',
  channels TEXT NOT NULL DEFAULT 'mentions',
  updated_at TEXT NOT NULL);
`);
  ready = true;
}

export function notificationPrefs(userId: string): Prefs {
  deliveryInit();
  const row = db()
    .prepare("SELECT * FROM notification_prefs WHERE user_id=?")
    .get(userId) as Prefs | undefined;
  return row || { user_id: userId, ...DEFAULTS, updated_at: "" };
}

export function setNotificationPrefs(
  u: User,
  patch: { dm?: string; groups?: string; channels?: string },
): Prefs {
  deliveryInit();
  const current = notificationPrefs(u.id);
  const pick = (v: unknown, fallback: PrefLevel): PrefLevel => {
    if (v === undefined) return fallback;
    if (typeof v !== "string" || !LEVELS.includes(v as PrefLevel))
      fail("Choose all, mentions or none.");
    return v as PrefLevel;
  };
  const next = {
    dm: pick(patch.dm, current.dm),
    groups: pick(patch.groups, current.groups),
    channels: pick(patch.channels, current.channels),
  };
  db()
    .prepare(
      `INSERT INTO notification_prefs(user_id,dm,groups,channels,updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET dm=excluded.dm,groups=excluded.groups,channels=excluded.channels,updated_at=excluded.updated_at`,
    )
    .run(u.id, next.dm, next.groups, next.channels, timestamp());
  return notificationPrefs(u.id);
}

// An @handle: leading @ that is not part of an email address or a longer word,
// then the handle itself. Punctuation and case are stripped before lookup, so
// "@Maya," and "@maya" are the same person.
const MENTION = /(?<![A-Za-z0-9._-])@([A-Za-z0-9][A-Za-z0-9._-]{0,63})/g;

function handleKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Resolve `@name` against this conversation's roster and nothing else.
 *
 * An ambiguous handle — two Mayas in the same group — resolves to nobody
 * rather than to a guess. Notifying the wrong Maya is worse than notifying
 * neither, because the writer believes they reached someone and did not.
 */
export function resolveMentions(
  conversationId: string,
  body: string,
  exclude?: string,
): string[] {
  const roster = memberRoster(conversationId);
  const index = new Map<string, string | null>();
  const add = (key: string, userId: string) => {
    if (!key) return;
    const seen = index.get(key);
    if (seen !== undefined && seen !== userId) index.set(key, null);
    else index.set(key, userId);
  };
  for (const m of roster) {
    add(handleKey(m.name), m.user_id);
    add(handleKey(m.name.split(/[\s,]+/)[0] || ""), m.user_id);
  }
  const found: string[] = [];
  for (const match of body.matchAll(MENTION)) {
    const hit = index.get(handleKey(match[1]));
    // A self-mention is not a notification. You know what you wrote.
    if (hit && hit !== exclude && !found.includes(hit)) found.push(hit);
  }
  return found;
}

/**
 * The write path the UI uses: rate limit, write, resolve mentions.
 *
 * Rate limiting is per (conversation, sender). A global per-sender cap would
 * mean one busy thread silences somebody in an unrelated DM, and a per-
 * conversation cap is what actually bounds the thing being prevented — one
 * person flooding one room.
 */
export function send(
  u: User,
  conversationId: string,
  body: string,
  replyTo?: string | null,
): { message: Message; mentions: string[] } {
  deliveryInit();
  throttle(`messaging:send:${text(conversationId, 64)}:${u.id}`, SEND_LIMIT);
  const message = postMessage(u, conversationId, body, replyTo);
  const mentions = resolveMentions(conversationId, message.body, u.id);
  const now = timestamp();
  const insert = db().prepare(
    "INSERT INTO message_mentions(message_id,conversation_id,user_id,created_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
  );
  for (const target of mentions)
    insert.run(message.id, conversationId, target, now);
  return { message, mentions };
}

export function mentionsOf(u: User, messageId: string): string[] {
  deliveryInit();
  const m = messageRow(messageId);
  if (!m) fail("Message not found.", 404);
  requireMember(u, m.conversation_id);
  return (
    db()
      .prepare(
        "SELECT user_id FROM message_mentions WHERE message_id=? ORDER BY user_id",
      )
      .all(messageId) as { user_id: string }[]
  ).map((r) => r.user_id);
}

function mentionUnread(
  conversationId: string,
  userId: string,
  lastReadAt: string | null,
): number {
  return (
    db()
      .prepare(
        `SELECT COUNT(*) n FROM message_mentions mm
           JOIN conversation_messages m ON m.id=mm.message_id
          WHERE mm.conversation_id=? AND mm.user_id=? AND m.author_id<>?
            AND m.deleted_at IS NULL AND (? IS NULL OR m.created_at > ?)`,
      )
      .get(conversationId, userId, userId, lastReadAt, lastReadAt) as {
      n: number;
    }
  ).n;
}

export type InboxEntry = {
  conversation_id: string;
  kind: ConversationKind;
  title: string;
  muted: boolean;
  unread: number;
  mentions: number;
  last_activity_at: string;
  preview: string;
  preview_author: string;
  preview_deleted: boolean;
};

export type Inbox = {
  entries: InboxEntry[];
  total_unread: number;
  total_mentions: number;
};

/**
 * The home screen. One call, every conversation this person is in, newest
 * activity first, with the counts that make the screen feel alive.
 *
 * `mentions` is deliberately separate from `unread`. They answer different
 * questions — "is anything happening" versus "is anything waiting on me" — and
 * collapsing them into one number is why people stop reading badges. A muted
 * conversation still reports both; muting suppresses delivery, not the truth
 * on the screen.
 */
export function inboxSummary(u: User): Inbox {
  deliveryInit();
  const latest = db().prepare(
    "SELECT * FROM conversation_messages WHERE conversation_id=? ORDER BY seq DESC LIMIT 1",
  );
  const entries: InboxEntry[] = [];
  for (const c of conversationsFor(u)) {
    if (c.archived_at) continue;
    const last = latest.get(c.id) as Message | undefined;
    const unread = unreadFor(c.id, u.id, c.last_read_at);
    const mentions = mentionUnread(c.id, u.id, c.last_read_at);
    const roster = memberRoster(c.id);
    // A DM has no title of its own; the other person is the title.
    const title =
      c.kind === "dm"
        ? roster
            .filter((m) => m.user_id !== u.id)
            .map((m) => m.name)
            .join(", ") || "Direct message"
        : c.title;
    const author = last
      ? roster.find((m) => m.user_id === last.author_id)
      : undefined;
    entries.push({
      conversation_id: c.id,
      kind: c.kind,
      title,
      muted: c.muted === 1,
      unread,
      mentions,
      last_activity_at: last ? last.created_at : c.created_at,
      preview: last
        ? last.deleted_at
          ? "Message deleted"
          : last.body.slice(0, 140)
        : "",
      preview_author: author ? author.name : "",
      preview_deleted: Boolean(last && last.deleted_at),
    });
  }
  entries.sort((a, b) =>
    a.last_activity_at < b.last_activity_at
      ? 1
      : a.last_activity_at > b.last_activity_at
        ? -1
        : 0,
  );
  return {
    entries,
    total_unread: entries.reduce((n, e) => n + e.unread, 0),
    total_mentions: entries.reduce((n, e) => n + e.mentions, 0),
  };
}

export type DeliveryTarget = {
  user_id: string;
  email: string;
  reason: "mention" | "message";
  preference: PrefLevel;
};

export type DeliveryPlan = {
  message_id: string;
  conversation_id: string;
  kind: ConversationKind;
  author_id: string;
  created_at: string;
  targets: DeliveryTarget[];
};

/**
 * Who an external deliverer would notify about this message, and why.
 *
 * NOTHING IS SENT. This function performs no I/O. It exists so that the day an
 * email or push provider is configured, the routing rules — preferences,
 * mutes, mention overrides — are already written down, tested, and in one
 * place, instead of being reinvented inside a provider integration where
 * nobody will review them.
 *
 * The plan carries no message body on purpose. See the file header.
 *
 * No caller-side authorization: this is a system function, not a user-facing
 * read, and it returns routing metadata rather than content. Do not expose it
 * through the API surface.
 */
export function deliveryPlan(messageId: string): DeliveryPlan | null {
  deliveryInit();
  const m = messageRow(messageId);
  if (!m || m.deleted_at) return null;
  const conversation = db()
    .prepare("SELECT id,kind FROM conversations WHERE id=?")
    .get(m.conversation_id) as
    | { id: string; kind: ConversationKind }
    | undefined;
  if (!conversation) return null;
  const mentioned = new Set(
    (
      db()
        .prepare("SELECT user_id FROM message_mentions WHERE message_id=?")
        .all(messageId) as { user_id: string }[]
    ).map((r) => r.user_id),
  );
  const field: Record<ConversationKind, keyof Prefs> = {
    dm: "dm",
    group: "groups",
    channel: "channels",
  };
  const targets: DeliveryTarget[] = [];
  for (const person of memberRoster(m.conversation_id)) {
    if (person.user_id === m.author_id) continue;
    // A mute is a decision the member made about this room. It outranks a
    // mention: being named is not a licence to get past someone's off switch.
    if (person.muted === 1) continue;
    const level = notificationPrefs(person.user_id)[
      field[conversation.kind]
    ] as PrefLevel;
    if (level === "none") continue;
    const isMention = mentioned.has(person.user_id);
    if (level === "mentions" && !isMention) continue;
    targets.push({
      user_id: person.user_id,
      email: person.email,
      reason: isMention ? "mention" : "message",
      preference: level,
    });
  }
  return {
    message_id: m.id,
    conversation_id: m.conversation_id,
    kind: conversation.kind,
    author_id: m.author_id,
    created_at: m.created_at,
    targets,
  };
}

// Direct messages, group threads and channels.
//
// The existing `messages` table (db.ts, and the `message` action in service.ts)
// is three hardcoded club channels with a flat list of rows. It stays where it
// is and keeps working. This module is the layer above it: conversations that
// have members, threading, read state and — for the first time in this product
// — content that is private to the people in the room.
//
// ---------------------------------------------------------------------------
// THE WALL. PRIVATE MESSAGES DO NOT FEED THE MODEL. NOT THE TEXT, NOT THE
// METADATA, NOT A COUNT DERIVED FROM EITHER.
//
// Nothing in this file or in delivery.ts calls emit, recordEvidence,
// writeFactorValue or label. That is not a policy note that a future edit can
// quietly step over — tests/messaging.mjs reads these two source files and
// fails the build if any of those four names appears with a call paren. The
// wall is a test, not a comment.
//
// Why it has to be structural:
//
// A DM feature is the richest behavioural signal a club product can have, and
// every layer downstream is already built and hungry. evidence.ts has a
// COORDINATE family and a COMMUNICATE family. factors.ts would happily take a
// responsiveness number. The quant store would ingest a reply-latency feature
// without blinking. Every one of those integrations is three lines long and
// each one is individually defensible in a standup. Together they are a
// surveillance product, and the person being measured never consented to the
// measurement because they were talking to a friend, not filling in a form.
//
// docs/11 §7 is a standing engineering rule and it forbids, by name: "no
// friendship-strength numbers shown to anyone" and "no 'who is avoiding whom'".
// Both of those are computable from message METADATA alone. Who messages whom,
// how fast the reply comes, who stopped replying — none of that needs the text.
// So excluding the body is not enough; the edges themselves stay out.
//
// README-CEC.md commits in writing that this product does not do
// "private-message mining". That sentence was cheap to write while there were
// no private messages. This file is where it either becomes true or becomes a
// lie, and it is much harder to remove a failing test than to remove a promise
// from a README.
//
// The mirror test from docs/11 §7 settles the remaining cases: if a signal
// cannot be shown to the student it is about, in plain language, with a working
// off switch, it does not get computed. "You replied to Maya 40% slower this
// month" fails that test in every direction.
//
// This also means no rows go into the audit table from here. The audit log is
// officer-readable (service.ts exposes it to officers wholesale), so an
// append-only trail of "message.sent, actor X, conversation Y" is a complete
// social graph with an integrity story attached. Message-level moderation
// belongs to the people in the conversation, not to a club-wide log.
// ---------------------------------------------------------------------------
//
// AND NO OFFICER BYPASS. `officer()` gates club powers — spending money,
// running recruitment, closing an event. It is not a warrant. requireMember()
// below has no officer branch and must never grow one; an officer reads a
// conversation by being in it, and their membership row is visible to everyone
// else in the room, which is the whole point.

import {
  db,
  fail,
  id,
  text,
  timestamp,
  member,
  officer,
  throttle,
  type User,
} from "../db";

export type ConversationKind = "dm" | "group" | "channel";

export type Conversation = {
  id: string;
  kind: ConversationKind;
  title: string;
  created_by: string;
  created_at: string;
  archived_at: string | null;
  dedupe_key: string | null;
};

export type Membership = {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
  muted: number;
  role: string;
};

export type Message = {
  seq: number;
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export const BODY_MAX = 4000;
export const GROUP_MAX = 50;
/** New conversations a single person can open in a rate-limit window. */
export const OPEN_LIMIT = 30;

let ready = false;
export function messagingInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS conversations(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  archived_at TEXT,
  -- Deterministic identity for conversations that must not be duplicated:
  -- 'dm:<sorted user id pair>' and 'channel:<slug>'. NULL for groups, which
  -- are allowed to exist many times over with the same title and members.
  dedupe_key TEXT);
CREATE TABLE IF NOT EXISTS conversation_members(
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  last_read_at TEXT,
  muted INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY(conversation_id,user_id));
CREATE TABLE IF NOT EXISTS conversation_messages(
  -- seq gives a total order that survives two messages landing in the same
  -- millisecond. created_at alone does not, and read watermarks need one.
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  reply_to TEXT,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT);
CREATE INDEX IF NOT EXISTS conversation_message_recent ON conversation_messages(conversation_id,seq);
CREATE INDEX IF NOT EXISTS conversation_member_user ON conversation_members(user_id);
-- Populated by delivery.ts at write time; declared here because deleteMessage
-- below has to clear it, and a table created by whichever module happened to
-- load first is a load-order bug waiting for a quiet Sunday.
CREATE TABLE IF NOT EXISTS message_mentions(
  message_id TEXT NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(message_id,user_id));
CREATE INDEX IF NOT EXISTS mention_inbox ON message_mentions(user_id,conversation_id);
`);
  // Additive migration, the interviews.ts idiom: a database created before
  // dedupe_key existed has no way to enforce DM idempotency, and the unique
  // index below would fail to build against it.
  const cols = db()
    .prepare("PRAGMA table_info(conversations)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "dedupe_key"))
    db().exec("ALTER TABLE conversations ADD COLUMN dedupe_key TEXT");
  // Partial, so the many NULLs that groups carry do not collide.
  db().exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS conversation_dedupe ON conversations(dedupe_key) WHERE dedupe_key IS NOT NULL",
  );
  ready = true;
}

/**
 * The pair key. Sorted, so (a,b) and (b,a) are the same string and the unique
 * index — not application code remembering to look first — is what makes a
 * second DM between two people impossible.
 */
export function dmKey(a: string, b: string): string {
  return "dm:" + [a, b].sort().join("|");
}

function byDedupe(key: string): Conversation | null {
  return (db()
    .prepare("SELECT * FROM conversations WHERE dedupe_key=?")
    .get(key) as Conversation) || null;
}

function conversationRow(conversationId: string): Conversation | null {
  return (db()
    .prepare("SELECT * FROM conversations WHERE id=?")
    .get(conversationId) as Conversation) || null;
}

function activeMembership(
  conversationId: string,
  userId: string,
): Membership | null {
  return (db()
    .prepare(
      "SELECT * FROM conversation_members WHERE conversation_id=? AND user_id=? AND left_at IS NULL",
    )
    .get(conversationId, userId) as Membership) || null;
}

/**
 * The one authorization gate. Every read and write in this module goes through
 * it and there is no second path.
 *
 * It answers "not found" for a conversation that exists but is not yours, and
 * for one that does not exist at all. A 403 would be more informative and that
 * is exactly the problem: distinguishing the two confirms that a particular
 * conversation id is real, which for a DM is the metadata we refuse to hand
 * out. Probing ids should be uniformly uninformative.
 */
export function requireMember(
  u: User,
  conversationId: string,
): { conversation: Conversation; membership: Membership } {
  messagingInit();
  const conversation = conversationRow(conversationId);
  const membership = conversation
    ? activeMembership(conversationId, u.id)
    : null;
  if (!conversation || !membership) fail("Conversation not found.", 404);
  return { conversation, membership };
}

function joinRow(conversationId: string, userId: string, role: string) {
  const now = timestamp();
  // A new joiner starts with a clean unread count rather than the entire
  // backlog. They can still scroll it; they are just not told they are 400
  // messages behind on a channel they joined a second ago.
  const watermark = latestCreatedAt(conversationId);
  db()
    .prepare(
      `INSERT INTO conversation_members(conversation_id,user_id,joined_at,left_at,last_read_at,muted,role)
       VALUES (?,?,?,NULL,?,0,?)
       ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL,joined_at=excluded.joined_at`,
    )
    .run(conversationId, userId, now, watermark, role);
}

function latestCreatedAt(conversationId: string): string | null {
  const row = db()
    .prepare(
      "SELECT created_at FROM conversation_messages WHERE conversation_id=? ORDER BY seq DESC LIMIT 1",
    )
    .get(conversationId) as { created_at: string } | undefined;
  return row ? row.created_at : null;
}

/**
 * Strictly increasing created_at within a conversation.
 *
 * Unread is "created after my watermark". If two messages can share a
 * millisecond, that comparison is ambiguous and a message can be silently
 * counted as already read. Bumping by a millisecond costs nothing and makes
 * the watermark exact.
 */
function nextCreatedAt(conversationId: string): string {
  const now = timestamp();
  const last = latestCreatedAt(conversationId);
  if (last && last >= now) return new Date(Date.parse(last) + 1).toISOString();
  return now;
}

function eligible(userId: string): { id: string; name: string; role: string } {
  const row = db()
    .prepare("SELECT id,name,role FROM users WHERE id=?")
    .get(userId) as { id: string; name: string; role: string } | undefined;
  // Applicants are not in the club yet. A DM channel into the membership is
  // not part of what an application buys.
  if (!row || row.role === "applicant") fail("Member not found.", 404);
  return row;
}

/**
 * Open the DM between two people. Idempotent: ask twice, get the same
 * conversation. The unique index is the enforcement; the pre-read is only an
 * optimisation, and the catch below handles the race where two requests both
 * miss it.
 */
export function openDirect(u: User, otherId: string): Conversation {
  messagingInit();
  member(u);
  const other = text(otherId, 64);
  if (other === u.id) fail("You cannot open a direct message with yourself.");
  eligible(other);
  const key = dmKey(u.id, other);
  const found = byDedupe(key);
  if (found) return found;
  throttle(`messaging:open:${u.id}`, OPEN_LIMIT);
  const cid = id();
  try {
    db()
      .prepare(
        "INSERT INTO conversations(id,kind,title,created_by,created_at,dedupe_key) VALUES (?,'dm','',?,?,?)",
      )
      .run(cid, u.id, timestamp(), key);
  } catch {
    const raced = byDedupe(key);
    if (raced) return raced;
    throw new Error("Could not open the conversation.");
  }
  joinRow(cid, u.id, "member");
  joinRow(cid, other, "member");
  return conversationRow(cid)!;
}

/** A named thread with an explicit member list. Groups are never deduplicated. */
export function createGroup(
  u: User,
  title: string,
  memberIds: string[],
): Conversation {
  messagingInit();
  member(u);
  const name = text(title, 160);
  const wanted = Array.from(
    new Set([u.id, ...(Array.isArray(memberIds) ? memberIds : [])]),
  ).map((v) => text(v, 64));
  if (wanted.length < 2) fail("A group needs at least one other person.");
  if (wanted.length > GROUP_MAX)
    fail(`A group holds at most ${GROUP_MAX} people.`);
  for (const m of wanted) eligible(m);
  throttle(`messaging:open:${u.id}`, OPEN_LIMIT);
  const cid = id();
  db()
    .prepare(
      "INSERT INTO conversations(id,kind,title,created_by,created_at,dedupe_key) VALUES (?,'group',?,?,?,NULL)",
    )
    .run(cid, name, u.id, timestamp());
  for (const m of wanted) joinRow(cid, m, m === u.id ? "owner" : "member");
  return conversationRow(cid)!;
}

/**
 * Channels, the part that replaces the hardcoded ["general","events",
 * "builders"] list. A channel is a conversation with a stable slug, so it is
 * idempotent the same way a DM is, and it gets threading, read state and
 * mutes that the flat `messages` table never had.
 *
 * Officers create them. Any member joins one. Reading still requires
 * membership — an officer who wants to read a channel joins it like everybody
 * else, and that leaves a row the other members can see.
 */
export function ensureChannel(
  u: User,
  slug: string,
  title?: string,
): Conversation {
  messagingInit();
  const key =
    "channel:" +
    text(slug, 60)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  if (key === "channel:") fail("Give the channel a name.");
  const found = byDedupe(key);
  if (found) return found;
  officer(u);
  const cid = id();
  db()
    .prepare(
      "INSERT INTO conversations(id,kind,title,created_by,created_at,dedupe_key) VALUES (?,'channel',?,?,?,?)",
    )
    .run(cid, text(title || slug, 160), u.id, timestamp(), key);
  joinRow(cid, u.id, "owner");
  return conversationRow(cid)!;
}

export function joinChannel(u: User, conversationId: string): Membership {
  messagingInit();
  member(u);
  const c = conversationRow(conversationId);
  // Same uninformative answer as requireMember: a DM id probed here must not
  // come back as "that exists, you just cannot join it".
  if (!c || c.kind !== "channel") fail("Conversation not found.", 404);
  if (c.archived_at) fail("This channel is archived.");
  joinRow(conversationId, u.id, "member");
  return activeMembership(conversationId, u.id)!;
}

/**
 * Add people to a group. Any current member may; DMs refuse outright.
 *
 * A DM that can gain a third member is not a DM. The two people in it agreed
 * to talk to each other, and silently widening the room hands a backlog to
 * someone who was never party to it.
 */
export function addMembers(
  u: User,
  conversationId: string,
  memberIds: string[],
): number {
  const { conversation } = requireMember(u, conversationId);
  if (conversation.kind === "dm")
    fail("A direct message cannot take a third person. Start a group.");
  if (conversation.archived_at) fail("This conversation is archived.");
  const ids = Array.from(new Set(memberIds.map((v) => text(v, 64))));
  const current = (
    db()
      .prepare(
        "SELECT COUNT(*) n FROM conversation_members WHERE conversation_id=? AND left_at IS NULL",
      )
      .get(conversationId) as { n: number }
  ).n;
  if (current + ids.length > GROUP_MAX)
    fail(`A group holds at most ${GROUP_MAX} people.`);
  let added = 0;
  for (const m of ids) {
    eligible(m);
    if (activeMembership(conversationId, m)) continue;
    joinRow(conversationId, m, "member");
    added++;
  }
  return added;
}

/**
 * Leave a group or channel. A DM cannot be left, because leaving would either
 * destroy the other person's copy of the thread or leave them talking into a
 * room with nobody in it. Mute it instead.
 */
export function leaveConversation(u: User, conversationId: string): void {
  const { conversation } = requireMember(u, conversationId);
  if (conversation.kind === "dm")
    fail("A direct message cannot be left. Mute it instead.");
  db()
    .prepare(
      "UPDATE conversation_members SET left_at=? WHERE conversation_id=? AND user_id=?",
    )
    .run(timestamp(), conversationId, u.id);
}

export function setMuted(
  u: User,
  conversationId: string,
  muted: boolean,
): void {
  requireMember(u, conversationId);
  db()
    .prepare(
      "UPDATE conversation_members SET muted=? WHERE conversation_id=? AND user_id=?",
    )
    .run(muted ? 1 : 0, conversationId, u.id);
}

/** Archive a group or channel. Owner only, and never a DM: see leaveConversation. */
export function archiveConversation(u: User, conversationId: string): void {
  const { conversation, membership } = requireMember(u, conversationId);
  if (conversation.kind === "dm")
    fail("A direct message cannot be archived. Mute it instead.");
  if (membership.role !== "owner")
    fail("Only the owner can archive this conversation.", 403);
  db()
    .prepare("UPDATE conversations SET archived_at=? WHERE id=?")
    .run(timestamp(), conversationId);
}

/**
 * Write a message. Callers that want rate limiting and mention resolution use
 * send() in delivery.ts, which wraps this.
 *
 * Threading is one level deep on purpose. A reply to a reply attaches to the
 * same root, which is what Slack does and what every unread count downstream
 * can actually describe. An arbitrary tree reads badly and makes "how many
 * unread in this thread" a question with several defensible answers.
 */
export function postMessage(
  u: User,
  conversationId: string,
  body: string,
  replyTo?: string | null,
): Message {
  const { conversation } = requireMember(u, conversationId);
  if (conversation.archived_at) fail("This conversation is archived.");
  const clean = text(body, BODY_MAX);
  let root: string | null = null;
  if (replyTo) {
    const parent = db()
      .prepare(
        "SELECT id,conversation_id,reply_to FROM conversation_messages WHERE id=?",
      )
      .get(text(replyTo, 64)) as
      | { id: string; conversation_id: string; reply_to: string | null }
      | undefined;
    if (!parent || parent.conversation_id !== conversationId)
      fail("Message not found.", 404);
    root = parent.reply_to || parent.id;
  }
  const key = id();
  db()
    .prepare(
      "INSERT INTO conversation_messages(id,conversation_id,author_id,body,reply_to,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      key,
      conversationId,
      u.id,
      clean,
      root,
      nextCreatedAt(conversationId),
    );
  return messageRow(key)!;
}

export function messageRow(messageId: string): Message | null {
  return (db()
    .prepare("SELECT * FROM conversation_messages WHERE id=?")
    .get(messageId) as Message) || null;
}

function requireMessage(u: User, messageId: string) {
  messagingInit();
  const message = messageRow(text(messageId, 64));
  const membership = message
    ? activeMembership(message.conversation_id, u.id)
    : null;
  if (!message || !membership) fail("Message not found.", 404);
  return {
    message,
    membership,
    conversation: conversationRow(message.conversation_id)!,
  };
}

export function editMessage(
  u: User,
  messageId: string,
  body: string,
): Message {
  const { message } = requireMessage(u, messageId);
  if (message.author_id !== u.id)
    fail("You can only edit your own messages.", 403);
  if (message.deleted_at) fail("That message was deleted.", 404);
  db()
    .prepare("UPDATE conversation_messages SET body=?,edited_at=? WHERE id=?")
    .run(text(body, BODY_MAX), timestamp(), messageId);
  return messageRow(messageId)!;
}

/**
 * Soft delete: the body is cleared, the row stays.
 *
 * Both halves matter. Clearing the body means a deleted message is not
 * recoverable from the row — "deleted" with the text still sitting in the
 * column is the oldest lie in messaging software, and here it would also be a
 * standing pile of private text nobody expects to still exist. Keeping the row
 * means replies that point at it still resolve and the thread does not develop
 * a hole; the fact that somebody said something at that position survives,
 * which is what the other participants already saw anyway.
 *
 * Mentions of the deleted message go with it — they were derived from text
 * that no longer exists.
 */
export function deleteMessage(u: User, messageId: string): Message {
  const { message, membership, conversation } = requireMessage(u, messageId);
  const moderator = conversation.kind !== "dm" && membership.role === "owner";
  if (message.author_id !== u.id && !moderator)
    fail("You can only delete your own messages.", 403);
  if (message.deleted_at) return message;
  db()
    .prepare(
      "UPDATE conversation_messages SET body='',deleted_at=? WHERE id=?",
    )
    .run(timestamp(), messageId);
  db()
    .prepare("DELETE FROM message_mentions WHERE message_id=?")
    .run(messageId);
  return messageRow(messageId)!;
}

/** Oldest first, capped. Deleted rows come back with an empty body. */
export function messagesIn(
  u: User,
  conversationId: string,
  limit = 200,
): Message[] {
  requireMember(u, conversationId);
  const n = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const rows = db()
    .prepare(
      "SELECT * FROM conversation_messages WHERE conversation_id=? ORDER BY seq DESC LIMIT ?",
    )
    .all(conversationId, n) as Message[];
  return rows.reverse();
}

/** A root message and its replies, in order. */
export function thread(
  u: User,
  conversationId: string,
  rootId: string,
): Message[] {
  requireMember(u, conversationId);
  return db()
    .prepare(
      "SELECT * FROM conversation_messages WHERE conversation_id=? AND (id=? OR reply_to=?) ORDER BY seq",
    )
    .all(conversationId, rootId, rootId) as Message[];
}

/**
 * Everyone currently in the conversation. No authorization of its own — the
 * caller must already have passed requireMember. delivery.ts uses it to resolve
 * mentions and to build a notification recipient list.
 */
export function memberRoster(
  conversationId: string,
): { user_id: string; name: string; email: string; muted: number; role: string }[] {
  messagingInit();
  return db()
    .prepare(
      `SELECT m.user_id,u.name,u.email,m.muted,m.role
         FROM conversation_members m JOIN users u ON u.id=m.user_id
        WHERE m.conversation_id=? AND m.left_at IS NULL
        ORDER BY m.joined_at`,
    )
    .all(conversationId) as {
    user_id: string;
    name: string;
    email: string;
    muted: number;
    role: string;
  }[];
}

export function participants(u: User, conversationId: string) {
  requireMember(u, conversationId);
  return memberRoster(conversationId).map((m) => ({
    user_id: m.user_id,
    name: m.name,
    role: m.role,
  }));
}

/**
 * Unread for one conversation, from the member's last_read_at watermark.
 *
 * Your own messages never count, and deleted ones do not either — a badge that
 * only clears by opening a message that no longer exists is a bug the user
 * cannot resolve.
 */
export function unreadCount(u: User, conversationId: string): number {
  const { membership } = requireMember(u, conversationId);
  return unreadFor(conversationId, u.id, membership.last_read_at);
}

export function unreadFor(
  conversationId: string,
  userId: string,
  lastReadAt: string | null,
): number {
  return (
    db()
      .prepare(
        `SELECT COUNT(*) n FROM conversation_messages
          WHERE conversation_id=? AND author_id<>? AND deleted_at IS NULL
            AND (? IS NULL OR created_at > ?)`,
      )
      .get(conversationId, userId, lastReadAt, lastReadAt) as { n: number }
  ).n;
}

/**
 * Move the watermark to the newest message that exists right now, not to the
 * wall clock. nextCreatedAt() guarantees the next message is strictly later
 * than this, so nothing posted after a read can land inside it.
 */
export function markRead(u: User, conversationId: string): string {
  requireMember(u, conversationId);
  const at = latestCreatedAt(conversationId) || timestamp();
  db()
    .prepare(
      "UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?",
    )
    .run(at, conversationId, u.id);
  return at;
}

export type ConversationRow = Conversation & {
  last_read_at: string | null;
  muted: number;
  role: string;
  joined_at: string;
};

/** Every conversation this person is currently in. Nobody else's, ever. */
export function conversationsFor(u: User): ConversationRow[] {
  messagingInit();
  return db()
    .prepare(
      `SELECT c.*,m.last_read_at,m.muted,m.role,m.joined_at
         FROM conversations c JOIN conversation_members m ON m.conversation_id=c.id
        WHERE m.user_id=? AND m.left_at IS NULL
        ORDER BY c.created_at DESC`,
    )
    .all(u.id) as ConversationRow[];
}

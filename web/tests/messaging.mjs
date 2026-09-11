// The communication layer, against a real database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/messaging.mjs
//
// The load-bearing test in this file is not the DM idempotency one. It is the
// source-file scan near the bottom, which reads lib/cec/messaging/*.ts and
// fails if either file has learned to call emit, recordEvidence,
// writeFactorValue, label or audit. README-CEC.md promises no private-message
// mining and docs/11 §7 forbids friendship-strength numbers and "who is
// avoiding whom"; a promise that is only a comment gets deleted by whoever is
// in a hurry, so it is a build failure instead.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-messaging-"));
process.env.CEC_DATABASE = join(dir, "messaging.sqlite");

const { db } = await import("../lib/cec/db.ts");
const {
  messagingInit,
  openDirect,
  createGroup,
  ensureChannel,
  joinChannel,
  addMembers,
  leaveConversation,
  setMuted,
  archiveConversation,
  postMessage,
  editMessage,
  deleteMessage,
  messagesIn,
  thread,
  participants,
  unreadCount,
  markRead,
  conversationsFor,
  dmKey,
  GROUP_MAX,
} = await import("../lib/cec/messaging/conversations.ts");
const {
  deliveryInit,
  send,
  resolveMentions,
  mentionsOf,
  inboxSummary,
  notificationPrefs,
  setNotificationPrefs,
  deliveryPlan,
  SEND_LIMIT,
} = await import("../lib/cec/messaging/delivery.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
/** Assert a call refuses, with the status it should refuse with. */
const refuses = (f, status, m) => {
  let thrown = null;
  try {
    f();
  } catch (e) {
    thrown = e;
  }
  ok(thrown !== null && thrown.status === status, m);
  return thrown;
};

messagingInit();
deliveryInit();

// --- fixtures ---------------------------------------------------------------
const user = (name, role) => {
  const id = randomUUID();
  db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,interests,shared) VALUES (?,?,?,?,?,'',0)",
    )
    .run(id, name, `${id}@example.test`, "x:unusable", role);
  return { id, name, email: `${id}@example.test`, role, interests: "", shared: 0 };
};

const alice = user("Alice Nguyen", "member");
const bob = user("Bob Okafor", "member");
const chen = user("Chen Wu", "member");
const pres = user("Priya Rao", "officer"); // an officer, not an auditor
const hopeful = user("Hopeful Applicant", "applicant");

// --- DM identity ------------------------------------------------------------
const dm = openDirect(alice, bob.id);
const again = openDirect(alice, bob.id);
const reversed = openDirect(bob, alice.id);
ok(dm.id === again.id, "asking twice for the same DM returns the same conversation");
ok(
  reversed.id === dm.id,
  "the other party opening it from their side lands in the same conversation",
);
ok(
  dmKey(alice.id, bob.id) === dmKey(bob.id, alice.id),
  "the pair key is order-independent",
);
ok(
  db().prepare("SELECT COUNT(*) n FROM conversations WHERE kind='dm'").get().n === 1,
  "and only one DM row exists for the pair",
);
ok(
  db()
    .prepare("SELECT COUNT(*) n FROM conversation_members WHERE conversation_id=?")
    .get(dm.id).n === 2,
  "both people are members of it",
);
refuses(
  () => openDirect(alice, alice.id),
  400,
  "a DM with yourself is refused",
);
refuses(
  () => openDirect(hopeful, alice.id),
  403,
  "an applicant cannot open a DM into the membership",
);
refuses(
  () => openDirect(alice, hopeful.id),
  404,
  "and nobody can open one with an applicant",
);
refuses(
  () => openDirect(alice, randomUUID()),
  404,
  "a DM with a user id that does not exist is refused",
);

// The unique index, not the pre-read, is what makes this true. Prove it by
// trying to write the duplicate directly.
let indexHeld = false;
try {
  db()
    .prepare(
      "INSERT INTO conversations(id,kind,title,created_by,created_at,dedupe_key) VALUES (?,'dm','',?,?,?)",
    )
    .run(randomUUID(), alice.id, new Date().toISOString(), dmKey(alice.id, bob.id));
} catch {
  indexHeld = true;
}
ok(indexHeld, "a second DM row for the same pair is rejected by the database itself");

// --- officers are not auditors ----------------------------------------------
refuses(
  () => messagesIn(pres, dm.id),
  404,
  "an officer cannot read two members' DM",
);
refuses(
  () => postMessage(pres, dm.id, "checking in"),
  404,
  "nor write into it",
);
refuses(
  () => unreadCount(pres, dm.id),
  404,
  "nor read its unread count",
);
refuses(
  () => participants(pres, dm.id),
  404,
  "nor even enumerate who is in it",
);
ok(
  conversationsFor(pres).length === 0,
  "and it does not appear in an officer's conversation list",
);
const officerRefusal = refuses(
  () => messagesIn(pres, randomUUID()),
  404,
  "a conversation id that does not exist refuses the same way",
);
ok(
  officerRefusal.message === "Conversation not found.",
  "with an identical message, so probing ids cannot confirm a DM exists",
);
refuses(
  () => messagesIn(chen, dm.id),
  404,
  "a non-member member is refused the same conversation",
);

// --- sending, unread, read state --------------------------------------------
send(bob, dm.id, "are you coming to the build night");
send(bob, dm.id, "we moved it to 7");
send(bob, dm.id, "bring the projector adapter");
ok(unreadCount(alice, dm.id) === 3, "unread counts the other person's messages");
ok(unreadCount(bob, dm.id) === 0, "your own messages are never unread to you");
markRead(alice, dm.id);
ok(unreadCount(alice, dm.id) === 0, "reading clears the count");
send(bob, dm.id, "actually 7.30");
ok(unreadCount(alice, dm.id) === 1, "a message after the read is unread again");
ok(
  messagesIn(alice, dm.id).map((m) => m.body)[0] ===
    "are you coming to the build night",
  "history comes back oldest first",
);
ok(
  messagesIn(alice, dm.id).every((m, i, all) => i === 0 || all[i - 1].seq < m.seq),
  "and in a total order that two messages in the same millisecond cannot break",
);

// --- groups: threading, membership, leaving ---------------------------------
const team = createGroup(alice, "Launch team", [bob.id, chen.id]);
ok(team.kind === "group", "a group is created with its members");
ok(participants(alice, team.id).length === 3, "creator included");
ok(
  participants(alice, team.id).find((p) => p.user_id === alice.id).role === "owner",
  "the creator owns it",
);
refuses(
  () => createGroup(alice, "Solo", []),
  400,
  "a group of one is refused",
);
refuses(
  () => addMembers(alice, dm.id, [chen.id]),
  400,
  "a DM cannot gain a third person",
);
refuses(
  () => leaveConversation(alice, dm.id),
  400,
  "and a DM cannot be left — mute it instead",
);

const root = send(alice, team.id, "who owns the venue booking").message;
const reply = send(bob, team.id, "me, deposit is paid", root.id).message;
const nested = send(chen, team.id, "receipt is in the drive", reply.id).message;
ok(reply.reply_to === root.id, "a reply points at the message it answers");
ok(
  nested.reply_to === root.id,
  "a reply to a reply flattens to the thread root rather than nesting",
);
ok(
  thread(alice, team.id, root.id).length === 3,
  "the thread reads back as root plus replies",
);
const loose = send(alice, dm.id, "unrelated").message;
refuses(
  () => postMessage(alice, team.id, "wrong room", loose.id),
  404,
  "a reply cannot cross into another conversation",
);

// --- soft delete -------------------------------------------------------------
const doomed = send(alice, team.id, "my phone number is 607-555-0148").message;
const gone = deleteMessage(alice, doomed.id);
ok(gone.deleted_at !== null, "a deleted message is marked deleted");
ok(gone.body === "", "and its body is cleared, not merely hidden");
const raw = db()
  .prepare("SELECT body FROM conversation_messages WHERE id=?")
  .get(doomed.id);
ok(
  raw && raw.body === "" && !JSON.stringify(raw).includes("607-555-0148"),
  "the row itself no longer holds the text",
);
ok(
  db().prepare("SELECT COUNT(*) n FROM conversation_messages WHERE id=?").get(doomed.id)
    .n === 1,
  "but the row survives, so replies and thread positions still resolve",
);
refuses(
  () => editMessage(alice, doomed.id, "put it back"),
  404,
  "a deleted message cannot be edited back into existence",
);
refuses(
  () => deleteMessage(bob, root.id),
  403,
  "you cannot delete someone else's message",
);
ok(
  deleteMessage(alice, doomed.id).id === doomed.id,
  "deleting twice is a no-op rather than an error",
);
const edited = editMessage(alice, root.id, "who owns the venue booking?");
ok(edited.edited_at !== null, "an edit is recorded as an edit");

// --- mentions ----------------------------------------------------------------
const mentioned = send(alice, team.id, "@bob can you confirm with @chen").message;
const hits = mentionsOf(alice, mentioned.id);
ok(hits.length === 2, "mentions resolve to members of the conversation");
ok(
  hits.includes(bob.id) && hits.includes(chen.id),
  "and to the right people",
);
const outsider = send(alice, team.id, "@priya should sign off too").message;
ok(
  mentionsOf(alice, outsider.id).length === 0,
  "an @name for someone outside the conversation resolves to nobody",
);
ok(
  resolveMentions(team.id, "@priya").length === 0,
  "so the message box cannot be used to probe who has an account",
);
const selfish = send(alice, team.id, "@alice reminder to myself").message;
ok(
  mentionsOf(alice, selfish.id).length === 0,
  "you cannot mention yourself into a notification",
);
ok(
  resolveMentions(team.id, "mail me at bob@example.test").length === 0,
  "an email address in the body is not a mention",
);

const maya1 = user("Maya Chen", "member");
const maya2 = user("Maya Rodriguez", "member");
const twoMayas = createGroup(alice, "Both Mayas", [maya1.id, maya2.id]);
ok(
  resolveMentions(twoMayas.id, "@maya which room").length === 0,
  "an ambiguous first name resolves to nobody rather than to a guess",
);
ok(
  resolveMentions(twoMayas.id, "@mayachen which room")[0] === maya1.id,
  "the unambiguous full handle still resolves",
);

// mentions are surfaced separately from general unread
const inboxBob = inboxSummary(bob);
const teamEntry = inboxBob.entries.find((e) => e.conversation_id === team.id);
ok(teamEntry.mentions === 1, "a mention is counted separately from unread");
ok(
  teamEntry.unread > teamEntry.mentions,
  "general unread is the larger, different number",
);
ok(
  inboxBob.entries[0].conversation_id === team.id,
  "the inbox is ordered by most recent activity",
);
ok(
  inboxBob.total_unread > 0 && inboxBob.total_mentions === 1,
  "and carries totals for the home screen badge",
);
const dmEntry = inboxSummary(alice).entries.find((e) => e.conversation_id === dm.id);
ok(
  dmEntry.title === bob.name,
  "a DM is titled with the other person, since it has no title of its own",
);
ok(dmEntry.preview.length > 0, "the inbox carries a preview of the latest message");

// --- channels ----------------------------------------------------------------
const general = ensureChannel(pres, "general", "General");
ok(
  ensureChannel(pres, "General", "General").id === general.id,
  "a channel slug is idempotent the same way a DM pair is",
);
refuses(
  () => ensureChannel(alice, "secret-plans", "Secret plans"),
  403,
  "a member cannot create a channel",
);
refuses(
  () => messagesIn(alice, general.id),
  404,
  "a member who has not joined a channel cannot read it",
);
joinChannel(alice, general.id);
send(pres, general.id, "welcome to the new workspace");
ok(messagesIn(alice, general.id).length === 1, "joining grants the read");
ok(
  participants(alice, general.id).some((p) => p.user_id === alice.id),
  "and membership is visible to everyone else in the channel",
);
refuses(
  () => joinChannel(alice, dm.id),
  404,
  "joinChannel cannot be used to walk into a DM",
);

// --- leaving, muting, archiving ----------------------------------------------
leaveConversation(chen, team.id);
refuses(
  () => messagesIn(chen, team.id),
  404,
  "leaving a group ends the read access",
);
ok(
  !conversationsFor(chen).some((c) => c.id === team.id),
  "and removes it from the list",
);
setMuted(alice, dm.id, true);
ok(
  conversationsFor(alice).find((c) => c.id === dm.id).muted === 1,
  "a conversation can be muted",
);
ok(
  inboxSummary(alice).entries.find((e) => e.conversation_id === dm.id).unread === 1,
  "muting suppresses delivery, not the truth on the screen",
);
archiveConversation(alice, team.id);
refuses(
  () => postMessage(alice, team.id, "one more thing"),
  400,
  "an archived conversation takes no new messages",
);
joinChannel(bob, general.id);
refuses(
  () => archiveConversation(bob, general.id),
  403,
  "a member of a channel is still not its owner, and only an owner archives",
);

// --- notification preferences and the delivery plan --------------------------
const quiet = createGroup(bob, "Quiet room", [alice.id, chen.id]);
ok(notificationPrefs(alice.id).dm === "all", "DMs notify by default");
ok(
  notificationPrefs(alice.id).channels === "mentions",
  "channels default to mentions only, so the firehose does not train people to ignore badges",
);
setNotificationPrefs(chen, { groups: "none" });
setNotificationPrefs(alice, { groups: "mentions" });
refuses(
  () => setNotificationPrefs(alice, { groups: "sometimes" }),
  400,
  "an unknown preference level is refused",
);
const planned = send(bob, quiet.id, "zebrafish tanks arrive thursday").message;
const plan = deliveryPlan(planned.id);
ok(
  !plan.targets.some((t) => t.user_id === bob.id),
  "the author is never a delivery target",
);
ok(
  !plan.targets.some((t) => t.user_id === chen.id),
  "a member who turned group notifications off is not a target",
);
ok(
  !plan.targets.some((t) => t.user_id === alice.id),
  "nor is a mentions-only member who was not mentioned",
);
const namedIn = send(bob, quiet.id, "@alice the tanks arrive thursday").message;
const plan2 = deliveryPlan(namedIn.id);
ok(
  plan2.targets.some((t) => t.user_id === alice.id && t.reason === "mention"),
  "a mentions-only member is a target when they are mentioned, and the reason says why",
);
setMuted(alice, quiet.id, true);
const namedAgain = send(bob, quiet.id, "@alice sorry, one more").message;
ok(
  !deliveryPlan(namedAgain.id).targets.some((t) => t.user_id === alice.id),
  "a mute outranks a mention: being named is not a licence past someone's off switch",
);
ok(
  !JSON.stringify(plan).includes("zebrafish"),
  "the delivery plan carries no message body, so nothing private reaches a provider's logs",
);
ok(
  deliveryPlan(deleteMessage(bob, planned.id).id) === null,
  "a deleted message has no delivery plan",
);
ok(
  db().prepare("SELECT COUNT(*) n FROM outbox").get().n === 0,
  "and nothing about any of this was queued for sending — no provider is configured",
);

// --- rate limiting -----------------------------------------------------------
const flood = createGroup(alice, "Flood test", [bob.id]);
for (let i = 0; i < SEND_LIMIT; i++) send(alice, flood.id, `burst ${i}`);
refuses(
  () => send(alice, flood.id, "one too many"),
  429,
  "sending past the per-conversation limit is refused",
);
ok(
  send(bob, flood.id, "not my limit").message.id.length === 36,
  "the limit is per sender, not a room-wide gag",
);
ok(
  send(alice, quiet.id, "different room").message.id.length === 36,
  "and per conversation, so one busy thread does not silence an unrelated DM",
);

// --- THE WALL ---------------------------------------------------------------
// Private messages do not enter the evidence, signal, factor or quant layers.
// Not the content, not the metadata, not a derived count. This is the test that
// keeps that true after everyone who wrote it has graduated.
const sources = {
  "conversations.ts": readFileSync(
    fileURLToPath(new URL("../lib/cec/messaging/conversations.ts", import.meta.url)),
    "utf8",
  ),
  "delivery.ts": readFileSync(
    fileURLToPath(new URL("../lib/cec/messaging/delivery.ts", import.meta.url)),
    "utf8",
  ),
};
ok(
  Object.values(sources).every((s) => s.length > 2000),
  "the wall test is reading the real source files",
);
// Each of these is one line to add and individually defensible in a standup.
// Together they are a surveillance product built out of private conversations.
for (const banned of [
  "emit(",
  "recordEvidence(",
  "writeFactorValue(",
  "label(",
  // Also refused: the audit table is officer-readable in bulk, so a trail of
  // "message.sent, actor X, conversation Y" is a complete social graph with an
  // integrity story stapled to it.
  "audit(",
]) {
  for (const [file, source] of Object.entries(sources))
    ok(
      !source.includes(banned),
      `${file} contains no call to ${banned.slice(0, -1)}`,
    );
}
for (const [file, source] of Object.entries(sources)) {
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  ok(imports.length > 0, `${file} imports something, so the check is live`);
  ok(
    imports.every((p) => ["../db", "./conversations"].includes(p)),
    `${file} imports only the database primitives, never the evidence, signal, factor or quant modules`,
  );
  ok(
    !/INSERT\s+INTO\s+outbox/i.test(source),
    `${file} never writes to the quant outbox`,
  );
}
// The tables this feature owns must not have grown a behavioural column.
const messageColumns = db()
  .prepare("PRAGMA table_info(conversation_messages)")
  .all()
  .map((c) => c.name);
ok(
  !messageColumns.some((c) => /score|signal|factor|sentiment|rating|weight/i.test(c)),
  "no column in conversation_messages scores anybody",
);
ok(
  db().prepare("SELECT COUNT(*) n FROM audit").get().n === 0,
  "the whole run above wrote nothing to the officer-readable audit log",
);
ok(
  GROUP_MAX === 50 && SEND_LIMIT === 30,
  "the bounds this module enforces are the ones it documents",
);

console.log(`${checks} messaging assertions passed.`);

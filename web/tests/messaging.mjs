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

const { db, tx } = await import("../lib/cec/db.ts");
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
const refuses = async (f, status, m) => {
  let thrown = null;
  try {
    await tx(f);
  } catch (e) {
    thrown = e;
  }
  if (thrown && thrown.status !== status) console.error("Unexpected refusal", m, thrown.code, thrown.message);
  ok(thrown !== null && thrown.status === status, m);
  return thrown;
};

(await messagingInit());
(await deliveryInit());

// --- fixtures ---------------------------------------------------------------
const user = async (name, role) => {
  const id = randomUUID();
  (await db()
    .prepare(
      "INSERT INTO users(id,name,email,password,role,interests,shared) VALUES (?,?,?,?,?,'',0)",
    )
    .run(id, name, `${id}@example.test`, "x:unusable", role));
  return { id, name, email: `${id}@example.test`, role, interests: "", shared: 0 };
};

const alice = (await user("Alice Nguyen", "member"));
const bob = (await user("Bob Okafor", "member"));
const chen = (await user("Chen Wu", "member"));
const pres = (await user("Priya Rao", "officer")); // an officer, not an auditor
const hopeful = (await user("Hopeful Applicant", "applicant"));

// --- DM identity ------------------------------------------------------------
const dm = (await openDirect(alice, bob.id));
const again = (await openDirect(alice, bob.id));
const reversed = (await openDirect(bob, alice.id));
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
  (await db().prepare("SELECT COUNT(*) n FROM conversations WHERE kind='dm'").get()).n === 1,
  "and only one DM row exists for the pair",
);
ok(
  (await db()
    .prepare("SELECT COUNT(*) n FROM conversation_members WHERE conversation_id=?")
    .get(dm.id)).n === 2,
  "both people are members of it",
);
(await refuses(
  async () => (await openDirect(alice, alice.id)),
  400,
  "a DM with yourself is refused",
));
(await refuses(
  async () => (await openDirect(hopeful, alice.id)),
  403,
  "an applicant cannot open a DM into the membership",
));
(await refuses(
  async () => (await openDirect(alice, hopeful.id)),
  404,
  "and nobody can open one with an applicant",
));
(await refuses(
  async () => (await openDirect(alice, randomUUID())),
  404,
  "a DM with a user id that does not exist is refused",
));

// The unique index, not the pre-read, is what makes this true. Prove it by
// trying to write the duplicate directly.
let indexHeld = false;
try {
  await tx(async () => { (await db()
    .prepare(
      "INSERT INTO conversations(id,kind,title,created_by,created_at,dedupe_key) VALUES (?,'dm','',?,?,?)",
    )
    .run(randomUUID(), alice.id, new Date().toISOString(), dmKey(alice.id, bob.id))); });
} catch {
  indexHeld = true;
}
ok(indexHeld, "a second DM row for the same pair is rejected by the database itself");

// --- officers are not auditors ----------------------------------------------
(await refuses(
  async () => (await messagesIn(pres, dm.id)),
  404,
  "an officer cannot read two members' DM",
));
(await refuses(
  async () => (await postMessage(pres, dm.id, "checking in")),
  404,
  "nor write into it",
));
(await refuses(
  async () => (await unreadCount(pres, dm.id)),
  404,
  "nor read its unread count",
));
(await refuses(
  async () => (await participants(pres, dm.id)),
  404,
  "nor even enumerate who is in it",
));
ok(
  (await conversationsFor(pres)).length === 0,
  "and it does not appear in an officer's conversation list",
);
const officerRefusal = (await refuses(
  async () => (await messagesIn(pres, randomUUID())),
  404,
  "a conversation id that does not exist refuses the same way",
));
ok(
  officerRefusal.message === "Conversation not found.",
  "with an identical message, so probing ids cannot confirm a DM exists",
);
(await refuses(
  async () => (await messagesIn(chen, dm.id)),
  404,
  "a non-member member is refused the same conversation",
));

// --- sending, unread, read state --------------------------------------------
(await send(bob, dm.id, "are you coming to the build night"));
(await send(bob, dm.id, "we moved it to 7"));
(await send(bob, dm.id, "bring the projector adapter"));
ok((await unreadCount(alice, dm.id)) === 3, "unread counts the other person's messages");
ok((await unreadCount(bob, dm.id)) === 0, "your own messages are never unread to you");
(await markRead(alice, dm.id));
ok((await unreadCount(alice, dm.id)) === 0, "reading clears the count");
(await send(bob, dm.id, "actually 7.30"));
ok((await unreadCount(alice, dm.id)) === 1, "a message after the read is unread again");
ok(
  (await messagesIn(alice, dm.id)).map((m) => m.body)[0] ===
    "are you coming to the build night",
  "history comes back oldest first",
);
ok(
  (await messagesIn(alice, dm.id)).every((m, i, all) => i === 0 || all[i - 1].seq < m.seq),
  "and in a total order that two messages in the same millisecond cannot break",
);

// --- groups: threading, membership, leaving ---------------------------------
const team = (await createGroup(alice, "Launch team", [bob.id, chen.id]));
ok(team.kind === "group", "a group is created with its members");
ok((await participants(alice, team.id)).length === 3, "creator included");
ok(
  (await participants(alice, team.id)).find((p) => p.user_id === alice.id).role === "owner",
  "the creator owns it",
);
(await refuses(
  async () => (await createGroup(alice, "Solo", [])),
  400,
  "a group of one is refused",
));
(await refuses(
  async () => (await addMembers(alice, dm.id, [chen.id])),
  400,
  "a DM cannot gain a third person",
));
(await refuses(
  async () => (await leaveConversation(alice, dm.id)),
  400,
  "and a DM cannot be left — mute it instead",
));

const root = (await send(alice, team.id, "who owns the venue booking")).message;
const reply = (await send(bob, team.id, "me, deposit is paid", root.id)).message;
const nested = (await send(chen, team.id, "receipt is in the drive", reply.id)).message;
ok(reply.reply_to === root.id, "a reply points at the message it answers");
ok(
  nested.reply_to === root.id,
  "a reply to a reply flattens to the thread root rather than nesting",
);
ok(
  (await thread(alice, team.id, root.id)).length === 3,
  "the thread reads back as root plus replies",
);
const loose = (await send(alice, dm.id, "unrelated")).message;
(await refuses(
  async () => (await postMessage(alice, team.id, "wrong room", loose.id)),
  404,
  "a reply cannot cross into another conversation",
));

// --- soft delete -------------------------------------------------------------
const doomed = (await send(alice, team.id, "my phone number is 607-555-0148")).message;
const gone = (await deleteMessage(alice, doomed.id));
ok(gone.deleted_at !== null, "a deleted message is marked deleted");
ok(gone.body === "", "and its body is cleared, not merely hidden");
const raw = (await db()
  .prepare("SELECT body FROM conversation_messages WHERE id=?")
  .get(doomed.id));
ok(
  raw && raw.body === "" && !JSON.stringify(raw).includes("607-555-0148"),
  "the row itself no longer holds the text",
);
ok(
  (await db().prepare("SELECT COUNT(*) n FROM conversation_messages WHERE id=?").get(doomed.id))
    .n === 1,
  "but the row survives, so replies and thread positions still resolve",
);
(await refuses(
  async () => (await editMessage(alice, doomed.id, "put it back")),
  404,
  "a deleted message cannot be edited back into existence",
));
(await refuses(
  async () => (await deleteMessage(bob, root.id)),
  403,
  "you cannot delete someone else's message",
));
ok(
  (await deleteMessage(alice, doomed.id)).id === doomed.id,
  "deleting twice is a no-op rather than an error",
);
const edited = (await editMessage(alice, root.id, "who owns the venue booking?"));
ok(edited.edited_at !== null, "an edit is recorded as an edit");

// --- mentions ----------------------------------------------------------------
const mentioned = (await send(alice, team.id, "@bob can you confirm with @chen")).message;
const hits = (await mentionsOf(alice, mentioned.id));
ok(hits.length === 2, "mentions resolve to members of the conversation");
ok(
  hits.includes(bob.id) && hits.includes(chen.id),
  "and to the right people",
);
const outsider = (await send(alice, team.id, "@priya should sign off too")).message;
ok(
  (await mentionsOf(alice, outsider.id)).length === 0,
  "an @name for someone outside the conversation resolves to nobody",
);
ok(
  (await resolveMentions(team.id, "@priya")).length === 0,
  "so the message box cannot be used to probe who has an account",
);
const selfish = (await send(alice, team.id, "@alice reminder to myself")).message;
ok(
  (await mentionsOf(alice, selfish.id)).length === 0,
  "you cannot mention yourself into a notification",
);
ok(
  (await resolveMentions(team.id, "mail me at bob@example.test")).length === 0,
  "an email address in the body is not a mention",
);

const maya1 = (await user("Maya Chen", "member"));
const maya2 = (await user("Maya Rodriguez", "member"));
const twoMayas = (await createGroup(alice, "Both Mayas", [maya1.id, maya2.id]));
ok(
  (await resolveMentions(twoMayas.id, "@maya which room")).length === 0,
  "an ambiguous first name resolves to nobody rather than to a guess",
);
ok(
  (await resolveMentions(twoMayas.id, "@mayachen which room"))[0] === maya1.id,
  "the unambiguous full handle still resolves",
);

// mentions are surfaced separately from general unread
const inboxBob = (await inboxSummary(bob));
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
const dmEntry = (await inboxSummary(alice)).entries.find((e) => e.conversation_id === dm.id);
ok(
  dmEntry.title === bob.name,
  "a DM is titled with the other person, since it has no title of its own",
);
ok(dmEntry.preview.length > 0, "the inbox carries a preview of the latest message");

// --- channels ----------------------------------------------------------------
const general = (await ensureChannel(pres, "general", "General"));
ok(
  (await ensureChannel(pres, "General", "General")).id === general.id,
  "a channel slug is idempotent the same way a DM pair is",
);
(await refuses(
  async () => (await ensureChannel(alice, "secret-plans", "Secret plans")),
  403,
  "a member cannot create a channel",
));
(await refuses(
  async () => (await messagesIn(alice, general.id)),
  404,
  "a member who has not joined a channel cannot read it",
));
(await joinChannel(alice, general.id));
(await send(pres, general.id, "welcome to the new workspace"));
ok((await messagesIn(alice, general.id)).length === 1, "joining grants the read");
ok(
  (await participants(alice, general.id)).some((p) => p.user_id === alice.id),
  "and membership is visible to everyone else in the channel",
);
(await refuses(
  async () => (await joinChannel(alice, dm.id)),
  404,
  "joinChannel cannot be used to walk into a DM",
));

// --- leaving, muting, archiving ----------------------------------------------
(await leaveConversation(chen, team.id));
(await refuses(
  async () => (await messagesIn(chen, team.id)),
  404,
  "leaving a group ends the read access",
));
ok(
  !(await conversationsFor(chen)).some((c) => c.id === team.id),
  "and removes it from the list",
);
(await setMuted(alice, dm.id, true));
ok(
  (await conversationsFor(alice)).find((c) => c.id === dm.id).muted === 1,
  "a conversation can be muted",
);
ok(
  (await inboxSummary(alice)).entries.find((e) => e.conversation_id === dm.id).unread === 1,
  "muting suppresses delivery, not the truth on the screen",
);
(await archiveConversation(alice, team.id));
(await refuses(
  async () => (await postMessage(alice, team.id, "one more thing")),
  400,
  "an archived conversation takes no new messages",
));
(await joinChannel(bob, general.id));
(await refuses(
  async () => (await archiveConversation(bob, general.id)),
  403,
  "a member of a channel is still not its owner, and only an owner archives",
));

// --- notification preferences and the delivery plan --------------------------
const quiet = (await createGroup(bob, "Quiet room", [alice.id, chen.id]));
ok((await notificationPrefs(alice.id)).dm === "all", "DMs notify by default");
ok(
  (await notificationPrefs(alice.id)).channels === "mentions",
  "channels default to mentions only, so the firehose does not train people to ignore badges",
);
(await setNotificationPrefs(chen, { groups: "none" }));
(await setNotificationPrefs(alice, { groups: "mentions" }));
(await refuses(
  async () => (await setNotificationPrefs(alice, { groups: "sometimes" })),
  400,
  "an unknown preference level is refused",
));
const planned = (await send(bob, quiet.id, "zebrafish tanks arrive thursday")).message;
const plan = (await deliveryPlan(planned.id));
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
const namedIn = (await send(bob, quiet.id, "@alice the tanks arrive thursday")).message;
const plan2 = (await deliveryPlan(namedIn.id));
ok(
  plan2.targets.some((t) => t.user_id === alice.id && t.reason === "mention"),
  "a mentions-only member is a target when they are mentioned, and the reason says why",
);
(await setMuted(alice, quiet.id, true));
const namedAgain = (await send(bob, quiet.id, "@alice sorry, one more")).message;
ok(
  !(await deliveryPlan(namedAgain.id)).targets.some((t) => t.user_id === alice.id),
  "a mute outranks a mention: being named is not a licence past someone's off switch",
);
ok(
  !JSON.stringify(plan).includes("zebrafish"),
  "the delivery plan carries no message body, so nothing private reaches a provider's logs",
);
ok(
  (await deliveryPlan((await deleteMessage(bob, planned.id)).id)) === null,
  "a deleted message has no delivery plan",
);
ok(
  (await db().prepare("SELECT COUNT(*) n FROM outbox").get()).n === 0,
  "and nothing about any of this was queued for sending — no provider is configured",
);

// --- rate limiting -----------------------------------------------------------
const flood = (await createGroup(alice, "Flood test", [bob.id]));
for (let i = 0; i < SEND_LIMIT; i++) (await send(alice, flood.id, `burst ${i}`));
(await refuses(
  async () => (await send(alice, flood.id, "one too many")),
  429,
  "sending past the per-conversation limit is refused",
));
ok(
  (await send(bob, flood.id, "not my limit")).message.id.length === 36,
  "the limit is per sender, not a room-wide gag",
);
ok(
  (await send(alice, quiet.id, "different room")).message.id.length === 36,
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
  // The HTTP surface is part of the module and is the easiest place for a
  // later contributor to "just log who messaged whom". It is walled too.
  "service.ts": readFileSync(
    fileURLToPath(new URL("../lib/cec/messaging/service.ts", import.meta.url)),
    "utf8",
  ),
};
ok(
  Object.values(sources).every((s) => s.length > 1500),
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
    // The allowlist is every module INSIDE the wall, plus the raw database
    // primitives. Widening it is how the wall gets breached, so anything added
    // here must itself be walled and grepped above.
    imports.every((p) =>
      ["../db", "./conversations", "./delivery"].includes(p),
    ),
    `${file} imports only the database primitives and other walled messaging modules, never the evidence, signal, factor or quant modules`,
  );
  ok(
    !/INSERT\s+INTO\s+outbox/i.test(source),
    `${file} never writes to the quant outbox`,
  );
}
// The tables this feature owns must not have grown a behavioural column.
const messageColumns = (await db()
  .prepare("PRAGMA table_info(conversation_messages)")
  .all())
  .map((c) => c.name);
ok(
  !messageColumns.some((c) => /score|signal|factor|sentiment|rating|weight/i.test(c)),
  "no column in conversation_messages scores anybody",
);
ok(
  (await db().prepare("SELECT COUNT(*) n FROM audit").get()).n === 0,
  "the whole run above wrote nothing to the officer-readable audit log",
);
ok(
  GROUP_MAX === 50 && SEND_LIMIT === 30,
  "the bounds this module enforces are the ones it documents",
);

console.log(`${checks} messaging assertions passed.`);

// Cursor paging must retain quiet-channel history and never cross private boundaries.
const {messaging, messagingState} = await import('../lib/cec/messaging/service.ts');
const {upNext} = await import('../lib/cec/upnext.ts');
const history = await createGroup(pres, 'Paged regression', [chen.id]);
for(let i=0;i<105;i++) await postMessage(pres,history.id,'history '+i);
const page1=(await messaging(chen,'messages',{conversation_id:history.id,limit:50})).messages;
const page2=(await messaging(chen,'messages',{conversation_id:history.id,limit:50,before:page1[0].seq})).messages;
const page3=(await messaging(chen,'messages',{conversation_id:history.id,limit:50,before:page2[0].seq})).messages;
assert.equal(new Set([...page1,...page2,...page3].map(m=>m.id)).size,105);
assert.equal(page3[0].body,'history 0');
await refuses(()=>messaging(bob,'messages',{conversation_id:history.id,before:page1[0].seq}),404,'cursor cannot bypass membership');
await db().prepare('UPDATE conversation_members SET last_read_at=NULL WHERE conversation_id=? AND user_id=?').run(history.id,chen.id);
assert((await messagingState(chen)).inbox.entries.some(e=>e.conversation_id===history.id && e.unread===105));
await upNext(chen);
await markRead(chen,history.id);
assert.equal((await messagingState(chen)).inbox.entries.find(e=>e.conversation_id===history.id).unread,0);
await upNext(chen);
const quietId=randomUUID();
await db().prepare('INSERT INTO messages(id,user_id,channel,body,created_at) VALUES(?,?,?,?,?)').run(quietId,alice.id,'builders','Quiet channel history','2026-01-01T00:00:00Z');
for(let i=0;i<105;i++)await db().prepare('INSERT INTO messages(id,user_id,channel,body,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),bob.id,'general','busy '+i,'2026-02-01T00:00:00Z');
assert.equal((await messaging(alice,'legacy',{channel:'builders'})).messages[0].id,quietId);
const legacy1=(await messaging(alice,'legacy',{channel:'general'})).messages;
const legacy2=(await messaging(alice,'legacy',{channel:'general',before:legacy1.at(-1).id})).messages;
assert.equal(new Set([...legacy1,...legacy2].map(m=>m.id)).size,100);
await refuses(()=>messaging(hopeful,'legacy',{channel:'general'}),403,'applicant cannot read channel history');
console.log('Populated inbox, null/read cutoffs, Up next, private cursor boundaries and quiet legacy history: PASS');
const forward1=(await messaging(chen,'messages',{conversation_id:history.id,limit:50,after:page3.at(-1).seq})).messages;
const forward2=(await messaging(chen,'messages',{conversation_id:history.id,limit:50,after:forward1.at(-1).seq})).messages;
assert.equal(forward1.length,50);assert.equal(forward2.length,50);
assert.equal(new Set([...page3,...forward1,...forward2].map(m=>m.id)).size,105);
console.log('Forward cursor catches up without dropping messages: PASS');

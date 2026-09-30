// The HTTP surface for messaging.
//
// Thin by design. Every authorization decision already lives in
// `conversations.ts` — `requireMember()` is the single gate, it has no officer
// branch, and it answers identically for "does not exist" and "not yours" so a
// 403 cannot be used to confirm that a particular DM exists. This file must not
// re-implement or soften any of that; it routes and validates shapes.
//
// THE WALL HOLDS HERE TOO. Nothing in this file may call `emit`,
// `recordEvidence`, `writeFactorValue` or `audit`. Private conversation is not
// behavioural evidence, and the audit trail is handed to officers wholesale —
// an append-only log of "who messaged whom, when" is a complete social graph
// with an integrity story stapled to it, which is exactly what docs/11 §7
// forbids. The test suite greps the messaging sources for those calls.

import { db, member, text, fail, type User } from "../db";
import {
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
  markRead,
} from "./conversations";
import { send, deliveryInit, inboxSummary, notificationPrefs, setNotificationPrefs } from "./delivery";

/** A member's inbox: unread counts, latest previews, mentions. */
export async function messagingState(u: User) {
  (await member(u));
  (await messagingInit());
  (await deliveryInit());
  return {
    inbox: (await inboxSummary(u)),
    people: await db().prepare("SELECT id,name FROM users WHERE role IN ('member','officer') AND id<>? ORDER BY name").all(u.id),
    channels: await db().prepare("SELECT id,title FROM conversations WHERE kind='channel' AND archived_at IS NULL ORDER BY title").all(),
    canCreateChannel: u.role === "officer",
    preferences: (await notificationPrefs(u.id)),
    note: "Direct messages are private to their participants. Officers have no read access, and nothing here feeds the record, the signals or the quant layer.",
  };
}

export async function messaging(u: User, action: string, b: any): Promise<any> {
  (await member(u));
  (await messagingInit());
  (await deliveryInit());

  if (action === "legacy") {
    const channel = text(b?.channel, 40);
    if (!["general", "events", "builders"].includes(channel)) fail("Unknown channel.");
    const cursor = b?.before ? await db().prepare("SELECT created_at,id FROM messages WHERE id=? AND channel=?").get(text(b.before,64),channel) as any : null;
    if (b?.before && !cursor) fail("Invalid history cursor.");
    return {messages: await db().prepare(`SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.user_id WHERE m.channel=? ${cursor ? "AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))" : ""} ORDER BY m.created_at DESC,m.id DESC LIMIT 50`).all(...(cursor ? [channel,cursor.created_at,cursor.created_at,cursor.id] : [channel]))};
  }
  if (action === "direct") return (await openDirect(u, text(b?.user_id, 64)));
  if (action === "group")
    return (await createGroup(u, text(b?.title, 120), (b?.members ?? []).map(String)));
  if (action === "channel") {
    const channel = await ensureChannel(u, text(b?.slug, 40));
    await joinChannel(u, channel.id);
    return channel;
  }
  if (action === "join") return (await joinChannel(u, text(b?.conversation_id, 64)));
  if (action === "members/add")
    return (await addMembers(u, text(b?.conversation_id, 64), (b?.members ?? []).map(String)));
  if (action === "leave") {
    (await leaveConversation(u, text(b?.conversation_id, 64)));
    return { ok: true };
  }
  if (action === "mute") {
    (await setMuted(u, text(b?.conversation_id, 64), b?.muted === true));
    return { ok: true };
  }
  if (action === "archive") {
    (await archiveConversation(u, text(b?.conversation_id, 64)));
    return { ok: true };
  }
  if (action === "send")
    return (await send(u, text(b?.conversation_id, 64), text(b?.body, 4000), b?.reply_to ? String(b.reply_to) : null)).message;
  if (action === "edit")
    return (await editMessage(u, text(b?.message_id, 64), text(b?.body, 4000)));
  if (action === "delete") return (await deleteMessage(u, text(b?.message_id, 64)));
  if (action === "messages")
    return {
      messages: (await messagesIn(
        u,
        text(b?.conversation_id, 64),
        Math.min(Math.max(Number(b?.limit) || 50, 1), 200),
        b?.before ? Number(b.before) : undefined,
        b?.after ? Number(b.after) : undefined,
      )),
    };
  if (action === "thread")
    return {
      messages: (await thread(u, text(b?.conversation_id, 64), text(b?.message_id, 64))),
    };
  if (action === "participants")
    return { participants: (await participants(u, text(b?.conversation_id, 64))) };
  if (action === "read") return { last_read_at: (await markRead(u, text(b?.conversation_id, 64))) };
  if (action === "preferences")
    return (await setNotificationPrefs(u, {
      dm: b?.dm,
      groups: b?.groups,
      channels: b?.channels,
    }));
  fail("Unknown messaging action.", 404);
}

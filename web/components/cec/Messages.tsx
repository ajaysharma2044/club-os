"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Messages — DMs, groups and channels.
//
// The backend this drives is walled off from every analytical layer: a test
// reads the messaging sources and fails if they contain a call to `emit`,
// `recordEvidence`, `writeFactorValue` or `audit`. Private conversation is not
// behavioural evidence, and the audit trail is excluded too, because "who
// messaged whom, when" is a complete social graph with an integrity story
// stapled to it.
//
// That constraint shapes this screen more than it might look:
//
//   - No read receipts. Not per-person, not at all. docs/22 section 6.2 cites
//     the CHI 2022 work on pressure-to-reply and deliberate non-opening.
//   - No presence, no "last seen", no typing indicator. Presence creates an
//     expectation of immediate reply and an anxiety of constant visibility,
//     and it reveals a pattern about a person continuously with no moment of
//     disclosure — which fails the spirit of the mirror test.
//   - TWO-TIER UNREAD (docs/22 Pattern 1): a NUMBER only for a mention, which
//     is addressed to you. Ambient activity gets a dot and never a count. The
//     moment ambient traffic earns a number, the badge becomes noise and
//     people stop reading it — which is exactly how Slack and Canvas
//     notifications died.

type Entry = {
  conversation_id: string;
  kind: "dm" | "group" | "channel";
  title: string;
  muted: boolean;
  unread: number;
  mentions: number;
  last_activity_at: string;
  preview: string;
  preview_author: string;
  preview_deleted: boolean;
};
type Msg = {
  id: string;
  author_id: string;
  body: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};
type State = {
  inbox: { entries: Entry[]; total_unread: number; total_mentions: number };
  note: string;
};

const post = async (path: string, body: unknown) => {
  const r = await fetch(`/api/cec/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "That did not work.");
  return j;
};

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "now";
  if (mins < 60) return `${Math.floor(mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export default function Messages() {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const foot = useRef<HTMLDivElement>(null);

  const loadInbox = useCallback(async () => {
    try {
      const r = await fetch("/api/cec/messaging/state");
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      setState(j);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const openConversation = useCallback(
    async (id: string) => {
      setOpen(id);
      setReplyTo(null);
      try {
        const [m, p] = await Promise.all([
          post("messaging/messages", { conversation_id: id, limit: 100 }),
          post("messaging/participants", { conversation_id: id }),
        ]);
        setMessages(m.messages);
        setNames(
          Object.fromEntries(
            (p.participants || []).map((x: any) => [x.user_id, x.name]),
          ),
        );
        await post("messaging/read", { conversation_id: id });
        await loadInbox();
        requestAnimationFrame(() =>
          foot.current?.scrollIntoView({ block: "end" }),
        );
      } catch (e: any) {
        setError(e.message);
      }
    },
    [loadInbox],
  );

  const send = async () => {
    const body = draft.trim();
    if (!body || !open) return;
    setSending(true);
    setError("");
    // Optimistic: the message appears immediately and reconciles behind.
    const temp: Msg = {
      id: `pending-${Date.now()}`,
      author_id: "__me__",
      body,
      reply_to: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
    };
    setMessages((m) => [...m, temp]);
    setDraft("");
    setReplyTo(null);
    requestAnimationFrame(() => foot.current?.scrollIntoView({ block: "end" }));
    try {
      await post("messaging/send", {
        conversation_id: open,
        body,
        reply_to: temp.reply_to,
      });
      const m = await post("messaging/messages", {
        conversation_id: open,
        limit: 100,
      });
      setMessages(m.messages);
      await loadInbox();
    } catch (e: any) {
      // Roll back inline, and give the text back rather than losing it.
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      setDraft(body);
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  if (error && !state) return <div className="inline-alert">{error}</div>;
  if (!state) return <div className="empty">Loading your messages…</div>;

  const entries = state.inbox.entries;
  const current = entries.find((e) => e.conversation_id === open);

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="text-title-2">Messages</h2>
          <p className="text-caption">{state.note}</p>
        </div>
        {state.inbox.total_mentions > 0 && (
          <span className="num" title="Mentions of you">
            @{state.inbox.total_mentions}
          </span>
        )}
      </header>

      <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "flex-start" }}>
        {/* ---- the list ---- */}
        <div style={{ flex: "0 0 240px", maxWidth: 240 }}>
          {!entries.length && (
            <div className="empty">
              No conversations yet. They appear here when someone messages you or you
              join a channel.
            </div>
          )}
          {entries.map((e) => {
            const active = e.conversation_id === open;
            return (
              <button
                key={e.conversation_id}
                type="button"
                onClick={() => openConversation(e.conversation_id)}
                className="ghost"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  marginBottom: 4,
                  borderRadius: 8,
                  transition: "background 120ms ease",
                  background: active ? "var(--porcelain)" : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    className="text-body"
                    style={{ fontWeight: e.unread ? 600 : 400, flex: 1 }}
                  >
                    {e.kind === "channel" ? "#" : ""}
                    {e.title}
                  </span>
                  {/* A NUMBER only for a mention. Ambient gets a dot. */}
                  {e.mentions > 0 ? (
                    <span className="num" style={{ fontSize: 12 }}>
                      @{e.mentions}
                    </span>
                  ) : e.unread > 0 && !e.muted ? (
                    <span
                      aria-label="New activity"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        background: "var(--signal, var(--electric))",
                      }}
                    />
                  ) : null}
                </div>
                <div className="text-caption" style={{ opacity: 0.75 }}>
                  {e.preview_deleted ? (
                    <em>message deleted</em>
                  ) : (
                    `${e.preview_author ? e.preview_author + ": " : ""}${e.preview}`.slice(0, 48)
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ---- the conversation ---- */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!current && (
            <div className="empty">Pick a conversation to read it.</div>
          )}
          {current && (
            <>
              <div className="page-title" style={{ marginBottom: 8 }}>
                <h3 className="text-title-3">
                  {current.kind === "channel" ? "#" : ""}
                  {current.title}
                </h3>
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    await post("messaging/mute", {
                      conversation_id: current.conversation_id,
                      muted: !current.muted,
                    });
                    loadInbox();
                  }}
                >
                  {current.muted ? "Unmute" : "Mute"}
                </button>
              </div>

              <div
                style={{
                  maxHeight: 420,
                  overflowY: "auto",
                  border: "1px solid var(--line, var(--tiara))",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                {!messages.length && (
                  <p className="text-caption">Nothing here yet. Say something.</p>
                )}
                {messages.map((m) => {
                  const parent = m.reply_to
                    ? messages.find((x) => x.id === m.reply_to)
                    : null;
                  const pending = m.id.startsWith("pending-");
                  return (
                    <div
                      key={m.id}
                      style={{ marginBottom: 10, opacity: pending ? 0.6 : 1 }}
                    >
                      {parent && (
                        <div
                          className="text-caption"
                          style={{
                            borderLeft: "2px solid var(--tiara)",
                            paddingLeft: 6,
                            opacity: 0.7,
                          }}
                        >
                          {names[parent.author_id] || "…"}: {parent.body.slice(0, 60)}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <strong className="text-body">
                          {m.author_id === "__me__"
                            ? "You"
                            : names[m.author_id] || "Member"}
                        </strong>
                        <span className="text-micro" style={{ opacity: 0.6 }}>
                          {when(m.created_at)}
                          {m.edited_at ? " · edited" : ""}
                        </span>
                        {!pending && !m.deleted_at && (
                          <button
                            type="button"
                            className="ghost"
                            style={{ fontSize: 11, padding: "0 4px" }}
                            onClick={() => setReplyTo(m)}
                          >
                            Reply
                          </button>
                        )}
                      </div>
                      <p className="text-body" style={{ margin: 0 }}>
                        {m.deleted_at ? (
                          <em style={{ opacity: 0.6 }}>message deleted</em>
                        ) : (
                          m.body
                        )}
                      </p>
                    </div>
                  );
                })}
                <div ref={foot} />
              </div>

              {replyTo && (
                <p className="text-caption" style={{ marginTop: 6 }}>
                  Replying to {names[replyTo.author_id] || "member"}:{" "}
                  {replyTo.body.slice(0, 40)}…{" "}
                  <button type="button" className="ghost" onClick={() => setReplyTo(null)}>
                    Cancel
                  </button>
                </p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input
                  style={{ flex: 1 }}
                  value={draft}
                  maxLength={4000}
                  placeholder={`Message ${current.title}`}
                  aria-label="Write a message"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button type="button" onClick={send} disabled={sending || !draft.trim()}>
                  Send
                </button>
              </div>
              {error && (
                <p
                  className="text-caption"
                  style={{ color: "var(--fire, var(--crimson))", marginTop: 6 }}
                >
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

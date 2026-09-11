"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  channels,
  channelClub,
  channelLabel,
  clubColor,
  groupInitials,
  groupTitle,
  lastMessage,
  previewText,
  resolveChannelId,
  type ChatMessage,
  type Channel,
} from "@/lib/chat";
import { AddToCalendar } from "@/components/AddToCalendar";
import { workByTitle } from "@/lib/calendar";
import { me } from "@/lib/data";

function cloneChannels(): Channel[] {
  return structuredClone(channels);
}

const cardKind: Record<string, string> = {
  rsvp: "RSVP",
  pay: "Pay",
  task: "Task",
  decision: "Decision",
};

export function ChatApp() {
  const router = useRouter();
  const params = useSearchParams();
  const start = resolveChannelId(params.get("c"));
  const [data, setData] = useState(cloneChannels);
  const [activeId, setActiveId] = useState(start);
  const [draft, setDraft] = useState("");
  const [rsvp, setRsvp] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const active = data.find((c) => c.id === activeId) ?? data[0];
  const [topicId, setTopicId] = useState(active.topics[0]?.id ?? "");
  const topic = active.topics.find((t) => t.id === topicId) ?? active.topics[0];
  const messages = active.messages[topic?.id ?? ""] ?? [];
  const club = channelClub(active);
  const color = clubColor(active.club);

  useEffect(() => {
    const next = resolveChannelId(params.get("c"));
    if (next === activeId) return;
    const channel = channels.find((c) => c.id === next);
    if (!channel) return;
    setActiveId(next);
    setTopicId(channel.topics[0]?.id ?? "");
    setData((prev) =>
      prev.map((c) => (c.id === next ? { ...c, unread: 0 } : c))
    );
  }, [params, activeId]);

  const groups = useMemo(() => {
    const clubGroups = data.filter((c) => c.kind === "channel");
    const dms = data.filter((c) => c.kind === "dm");
    return [...clubGroups, ...dms];
  }, [data]);

  function openGroup(id: string) {
    const next = data.find((c) => c.id === id);
    if (!next) return;
    setActiveId(id);
    setTopicId(next.topics[0]?.id ?? "");
    setData((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
    router.replace(`/chat?c=${id}`, { scroll: false });
  }

  function send() {
    const text = draft.trim();
    if (!text || !topic) return;
    const msg: ChatMessage = {
      id: `local-${Date.now()}`,
      who: me.name,
      initials: me.initials,
      time: "Now",
      text,
      mine: true,
    };
    setData((prev) =>
      prev.map((c) => {
        if (c.id !== active.id) return c;
        const list = c.messages[topic.id] ?? [];
        return {
          ...c,
          messages: { ...c.messages, [topic.id]: [...list, msg] },
        };
      })
    );
    setDraft("");
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
  }

  return (
    <div className="chat-app">
      <nav className="chat-list" aria-label="Your groups">
        <div className="chat-list-head">
          <h1>Inbox</h1>
        </div>
        <div className="chat-groups">
          {groups.map((ch) => {
            const aboutId = ch.id === active.id ? topic?.id : ch.topics[0]?.id;
            const latest = lastMessage(ch, aboutId);
            const face = groupInitials(ch);
            const title = groupTitle(ch);
            const about =
              ch.kind === "dm"
                ? null
                : ch.topics.find((t) => t.id === aboutId)?.name;
            const faceColor = ch.kind === "dm" ? "var(--oxford)" : clubColor(ch.club);
            return (
              <button
                key={ch.id}
                type="button"
                className="chat-group-row"
                aria-current={ch.id === active.id ? true : undefined}
                onClick={() => openGroup(ch.id)}
              >
                <span
                  className="chat-face"
                  style={{ background: faceColor }}
                  aria-hidden
                >
                  {face}
                </span>
                <span className="chat-group-copy">
                  <span className="chat-group-top">
                    <span className="chat-group-title">{title}</span>
                    <time>{latest?.time ?? ""}</time>
                  </span>
                  <span className="chat-group-preview">
                    {about ? `${about} · ` : ""}
                    {previewText(latest)}
                  </span>
                </span>
                {ch.unread > 0 && (
                  <span className="chat-new" aria-label={`${ch.unread} new`}>
                    <span
                      className="chat-new-dot"
                      style={{ background: clubColor(ch.club) }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <section className="chat-room" aria-label={`${groupTitle(active)} messages`}>
        <header className="chat-room-head">
          <span
            className="chat-face lg"
            style={{ background: color }}
            aria-hidden
          >
            {groupInitials(active)}
          </span>
          <div className="chat-room-who">
            <h2>{groupTitle(active)}</h2>
            <p>
              {active.fromRoster}
              {club && (
                <>
                  {" · "}
                  <Link href={`/clubs/${club.slug}`}>{club.short}</Link>
                </>
              )}
            </p>
          </div>
        </header>

        {active.kind === "channel" && topic && (
          <div className="chat-about" aria-label="What this is about">
            <span className="chat-about-label">Talking about</span>
            {active.topics.map((t, i) => (
              <span key={t.id}>
                {i > 0 && <span className="chat-about-dot">·</span>}
                <button
                  type="button"
                  className="chat-about-item"
                  aria-current={t.id === topic.id ? true : undefined}
                  onClick={() => setTopicId(t.id)}
                >
                  {t.name}
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="chat-log-live">
          {messages.length === 0 && (
            <div className="chat-empty">Nothing here yet. Add the first note.</div>
          )}
          {messages.map((msg) => (
            <article key={msg.id} className={msg.mine ? "msg mine" : "msg"}>
              {!msg.mine && (
                <span className="chat-face sm" style={{ background: color }} aria-hidden>
                  {msg.initials}
                </span>
              )}
              <div className="msg-stack">
                <div className="msg-meta">
                  <strong>{msg.mine ? "You" : msg.who}</strong>
                  <time>{msg.time}</time>
                </div>
                {msg.text && <div className="msg-bubble">{msg.text}</div>}
                {msg.card && (
                  <div className={`msg-card kind-${msg.card.kind}`}>
                    <span className="msg-card-kind">
                      {cardKind[msg.card.kind] ?? msg.card.kind}
                    </span>
                    <strong>{msg.card.title}</strong>
                    <p>{msg.card.detail}</p>
                    <div className="cal-event-actions">
                      {msg.card.kind === "rsvp" ? (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() =>
                            setRsvp((s) => ({
                              ...s,
                              [msg.id]: s[msg.id] === "Going" ? "" : "Going",
                            }))
                          }
                        >
                          {rsvp[msg.id] === "Going" ? "You’re going" : "I’m in"}
                        </button>
                      ) : (
                        <Link href={msg.card.href ?? "/"} className="btn primary">
                          {msg.card.action ?? "Open"}
                        </Link>
                      )}
                      {(msg.card.kind === "rsvp" || msg.card.kind === "task") &&
                        (() => {
                          const work = workByTitle(active.club, msg.card.title);
                          return work ? <AddToCalendar compact work={work} /> : null;
                        })()}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
          <div ref={endRef} />
        </div>

        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={
              active.kind === "dm"
                ? `Message ${active.name}`
                : `Add to ${topic?.name ?? channelLabel(active)}`
            }
            placeholder={
              active.kind === "dm"
                ? `Message ${active.name}`
                : `Add to ${topic?.name ?? "this"}`
            }
          />
          <button className="btn primary" type="submit">
            Send
          </button>
        </form>
      </section>
    </div>
  );
}

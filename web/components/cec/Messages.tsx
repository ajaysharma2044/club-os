"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./FormPrimitives";
import { LegacyConversation } from "./LegacyConversation";

type Entry = { conversation_id: string; title: string; kind: string; muted: boolean; unread: number; mentions: number; preview: string };
type Message = { id: string; seq: number; author_id: string; body: string; created_at: string; deleted_at: string | null; reply_to: string | null };
type State = { inbox: {entries: Entry[]}; people: {id: string; name: string}[]; channels: {id: string; title: string}[]; canCreateChannel: boolean; note: string };
export async function messagingPost(path: string, body: unknown) {
  const r = await fetch(`/api/cec/messaging/${path}`, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Unable to complete this request.");
  return j;
}

export default function Messages() {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const sendLocks = useRef(new Set<string>());
  const [pendingSends, setPendingSends] = useState<Set<string>>(new Set());
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const loading = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const r = await fetch("/api/cec/messaging/state", {cache: "no-store"});
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Unable to load Inbox.");
      if (alive.current) { setState(j); setError(""); }
    } catch (e: any) { if (alive.current) setError(e.message); }
    finally { loading.current = false; }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const sync = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = setInterval(sync, 15000);
    window.addEventListener("focus", sync);
    return () => { alive.current = false; clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [refresh]);
  const current = state?.inbox.entries.find(e => e.conversation_id === open);
  return <section className="panel messaging">
    <header className="panel-head"><h2>Inbox</h2><div className="actions">
      <button onClick={() => setCreating(true)} disabled={!state}>New conversation</button>
      <button className="ghost" onClick={refresh}>Refresh inbox</button>
      <button className="ghost" onClick={() => setLegacy(!legacy)}>{legacy ? "Private conversations" : "Earlier club channels"}</button>
    </div></header>
    {error && <p role="alert" className="inline-alert">{error}</p>}
    {!state && !error && <p>Loading your inbox…</p>}
    {state && <p className="source-note">{state.note}</p>}
    {legacy ? <LegacyConversation /> : state && <div className={`message-layout ${open ? "has-conversation" : ""}`}>
      <nav className="message-list" aria-label="Conversations">
        {!state.inbox.entries.length && <p>No conversations yet. Start a conversation or join a club channel.</p>}
        {state.inbox.entries.map(e => <button key={e.conversation_id} className="ghost" aria-current={open === e.conversation_id ? "true" : undefined} onClick={() => setOpen(e.conversation_id)}>
          <strong>{e.kind === "channel" ? "# " : ""}{e.title}</strong>
          {e.mentions > 0 ? <span aria-label={`${e.mentions} mentions`}> @{e.mentions}</span> : e.unread > 0 && !e.muted ? <span aria-label="New activity"> ●</span> : null}
          <small>{e.preview.slice(0, 80)}</small>
        </button>)}
      </nav>
      <div className="message-detail">
        {open && <button className="ghost" onClick={() => setOpen(null)}>Back to conversations</button>}
        {current ? <Conversation key={current.conversation_id} entry={current} draft={drafts[current.conversation_id] || ""}
          setDraft={value => setDrafts(d => ({...d, [current.conversation_id]: value}))}
          busy={pendingSends.has(current.conversation_id)} sendLocks={sendLocks.current}
          markSending={value => setPendingSends(p => {const next = new Set(p); if(value) next.add(current.conversation_id); else next.delete(current.conversation_id); return next;})}
          sendError={sendErrors[current.conversation_id] || ""} setSendError={value => setSendErrors(e => ({...e, [current.conversation_id]: value}))}
          clearSentDraft={value => setDrafts(d => d[current.conversation_id] === value ? {...d, [current.conversation_id]: ""} : d)} refreshInbox={refresh} />
          : <p>{open ? "This conversation is unavailable. Refresh your inbox or choose another." : "Choose a conversation to read it."}</p>}
      </div>
    </div>}
    {creating && state && <NewConversation state={state} close={() => setCreating(false)} created={async id => {setCreating(false); setLegacy(false); setOpen(id); await refresh();}} />}
  </section>;
}

function NewConversation({state, close, created}: {state: State; close: () => void; created: (id: string) => Promise<void>}) {
  const [kind, setKind] = useState("direct"), [title, setTitle] = useState("");
  const [members, setMembers] = useState<string[]>([]), [channel, setChannel] = useState(state.channels[0]?.id || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  return <Modal title="New conversation" close={() => {if (!pending.current) close();}}>
    <form className="form-grid message-creation" onSubmit={async e => {
      e.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError("");
      try {
        const result = await messagingPost(kind, kind === "direct" ? {user_id: members[0]} : kind === "group" ? {title, members} : kind === "channel" ? {slug: title} : {conversation_id: channel});
        await created(kind === "join" ? channel : result.id);
      } catch (e: any) {setError(e.message);} finally {pending.current = false; setBusy(false);}
    }}>
      <label className="field">Conversation type<select value={kind} disabled={busy} onChange={e => {setKind(e.target.value); setMembers([]);}}><option value="direct">Direct message</option><option value="group">Group</option><option value="join">Join a channel</option>{state.canCreateChannel && <option value="channel">Create a channel</option>}</select></label>
      {(kind === "channel" || kind === "group") && <label className="field">Name<input required maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>}
      {kind === "direct" && <label className="field">Member<select required disabled={busy} value={members[0] || ""} onChange={e => setMembers([e.target.value])}><option value="">Choose a member</option>{state.people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {kind === "group" && <fieldset><legend>Members</legend>{state.people.map(p => <label className="check" key={p.id}><input type="checkbox" disabled={busy} checked={members.includes(p.id)} onChange={e => setMembers(m => e.target.checked ? [...m, p.id] : m.filter(id => id !== p.id))} />{p.name}</label>)}</fieldset>}
      {kind === "join" && <label className="field">Channel<select required value={channel} disabled={busy} onChange={e => setChannel(e.target.value)}><option value="">Choose a channel</option>{state.channels.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>{!state.channels.length && <small>No channels yet. An officer can create one.</small>}</label>}
      {error && <p role="alert">{error}</p>}<button disabled={busy || (kind === "group" && !members.length)}>{busy ? "Opening…" : "Open conversation"}</button>
    </form>
  </Modal>;
}

function Conversation({entry, draft, setDraft, clearSentDraft, refreshInbox, busy, sendLocks, markSending, sendError, setSendError}: {busy: boolean; sendLocks: Set<string>; markSending: (v: boolean) => void; sendError: string; setSendError: (v: string) => void; entry: Entry; draft: string; setDraft: (v: string) => void; clearSentDraft: (v: string) => void; refreshInbox: () => Promise<void>}) {
  const [messages, setMessages] = useState<Message[]>([]), [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState(""), [loaded, setLoaded] = useState(false), [older, setOlder] = useState(false);
  const [reply, setReply] = useState<Message | null>(null);
  const [reading, setReading] = useState(false);
  const [pagePending, setPagePending] = useState(false);
  const queuedBefore = useRef<number | undefined>(undefined);
  const newest = useRef(0);
  const alive = useRef(true), fetching = useRef(false);
  const load = useCallback(async (before?: number) => {
    if (fetching.current) {
      if (before) {queuedBefore.current = before; setPagePending(true);}
      return;
    }
    fetching.current = true; setReading(true);
    if (before) setPagePending(true);
    try {
      const [result, people] = await Promise.all([messagingPost("messages", {conversation_id: entry.conversation_id, limit: 50, before, after: before ? undefined : newest.current || undefined}), loaded ? Promise.resolve(null) : messagingPost("participants", {conversation_id: entry.conversation_id})]);
      if (!alive.current) return;
      newest.current = Math.max(newest.current, ...result.messages.map((m: Message) => m.seq));
      setMessages(previous => [...new Map([...previous, ...result.messages].map((m: Message) => [m.id, m])).values()].sort((a,b) => a.seq - b.seq));
      if (people) setNames(Object.fromEntries(people.participants.map((p: any) => [p.user_id, p.name])));
      if (before || !loaded) setOlder(result.messages.length === 50);
      setLoaded(true); setError("");
      if (!before && (!loaded || result.messages.length)) {
        void messagingPost("read", {conversation_id: entry.conversation_id}).then(refreshInbox).catch((e: Error) => {if (alive.current) setError(e.message);});
      }
    } catch (e: any) {if (alive.current) setError(e.message);} finally {
      fetching.current = false;
      const queued = queuedBefore.current; queuedBefore.current = undefined;
      if (alive.current) {
        setReading(false);
        if (queued) void load(queued); else setPagePending(false);
      }
    }
  }, [entry.conversation_id, loaded, refreshInbox]);
  useEffect(() => {
    alive.current = true; void load();
    const sync = () => {if (document.visibilityState === "visible") void load();};
    const timer = setInterval(sync, 10000); window.addEventListener("focus", sync);
    return () => {alive.current = false; clearInterval(timer); window.removeEventListener("focus", sync);};
  }, [load]);
  async function send() {
    if (sendLocks.has(entry.conversation_id) || !draft.trim()) return;
    const original = draft; sendLocks.add(entry.conversation_id); markSending(true); setSendError(""); setError("");
    try {
      const sent = await messagingPost("send", {conversation_id: entry.conversation_id, body: original.trim(), reply_to: reply?.id});
      clearSentDraft(original);
      if (alive.current) {setReply(null); setMessages(m => [...new Map([...m, sent].map(x => [x.id,x])).values()].sort((a,b) => a.seq-b.seq));}
      // Read refresh failures never turn a confirmed send into a failed send.
      await refreshInbox();
    } catch (e: any) {setSendError(e.message);} finally {sendLocks.delete(entry.conversation_id); markSending(false);}
  }
  return <>
    <header className="panel-head"><h3>{entry.title}</h3><div className="actions"><button className="ghost" disabled={reading} onClick={() => load()}>Refresh conversation</button><button className="ghost" onClick={async () => {try {await messagingPost("mute", {conversation_id: entry.conversation_id, muted: !entry.muted}); await refreshInbox();} catch (e: any) {setError(e.message);}}}>{entry.muted ? "Unmute" : "Mute"}</button></div></header>
    {(error || sendError) && <p role="alert" className="inline-alert">{error || sendError}</p>}
    {!loaded ? <p>Loading conversation…</p> : <>
      {older && <button className="ghost" disabled={pagePending} onClick={() => load(messages[0]?.seq)}>Load older messages</button>}
      <div className="message-history" aria-label="Message history">
        {!messages.length && <p>No messages yet.</p>}
        {messages.map(m => <article key={m.id}><strong>{names[m.author_id] || "Member"}</strong> <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString("en-US", {timeZone: "America/New_York"})} ET</time>
          {m.reply_to && <small>Reply to {messages.find(p => p.id === m.reply_to)?.body.slice(0,80) || "an earlier message"}</small>}
          <p>{m.deleted_at ? "Message deleted" : m.body}</p>{!m.deleted_at && <button className="ghost" onClick={() => setReply(m)}>Reply</button>}</article>)}
      </div>
      {reply && <p>Replying to: {reply.body.slice(0,80)} <button onClick={() => setReply(null)}>Cancel reply</button></p>}
      <form className="message-composer" onSubmit={e => {e.preventDefault(); void send();}}><label className="field">Write a message<textarea value={draft} disabled={busy} maxLength={4000} onChange={e => setDraft(e.target.value)} /></label><button disabled={busy || !draft.trim()}>{busy ? "Sending…" : "Send"}</button></form>
    </>}
  </>;
}

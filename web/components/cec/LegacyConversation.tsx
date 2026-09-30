"use client";
import { useEffect, useRef, useState } from "react";
import ChatScheduler from "./ChatScheduler";
import { useCEC } from "./Connection";

export function LegacyConversation() {
  const [channel, setChannel] = useState("general");
  return <section><h3>Earlier club channels</h3><p>Existing club-wide history. Use Inbox for direct messages and new groups.</p><label className="field">Channel<select value={channel} onChange={e => setChannel(e.target.value)}>{["general","events","builders"].map(c => <option key={c}>{c}</option>)}</select></label><LegacyThread key={channel} channel={channel} /></section>;
}
function LegacyThread({channel}: {channel: string}) {
  const {data} = useCEC();
  const [messages, setMessages] = useState<any[]>([]), [older, setOlder] = useState(false), [error, setError] = useState("");
  const [draft, setDraft] = useState(""), [busy, setBusy] = useState(false);
  const alive = useRef(true), pending = useRef(false), loading = useRef(false);
  async function load(before?: string) {
    if (loading.current) return; loading.current = true;
    try {
      const r = await fetch("/api/cec/messaging/legacy", {method: "POST", headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,before})});
      const j = await r.json(); if (!r.ok) throw Error(j.error);
      if (alive.current) {setMessages(m => before ? [...m,...j.messages] : j.messages); setOlder(j.messages.length === 50); setError("");}
    } catch(e: any) {if (alive.current) setError(e.message);} finally {loading.current = false;}
  }
  useEffect(() => {alive.current = true; void load(); return () => {alive.current = false;};}, []);
  return <><button onClick={() => load()}>Refresh channel</button>{error && <p role="alert">{error}</p>}{older && <button onClick={() => load(messages.at(-1)?.id)}>Load older channel messages</button>}
    <ChatScheduler messages={messages} people={data?.people || []} userId={data?.user?.id || ""} />
    <div className="message-history">{[...messages].reverse().map(m => <article key={m.id}><strong>{m.name}</strong><p>{m.body}</p></article>)}</div>
    <form className="form-grid" onSubmit={async e => {e.preventDefault(); if(pending.current || !draft.trim()) return; pending.current = true; setBusy(true); try {const r=await fetch("/api/cec/message",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,body:draft})}); const j=await r.json(); if(!r.ok)throw Error(j.error);setDraft("");await load();}catch(e:any){setError(e.message);}finally{pending.current=false;setBusy(false);}}}><label className="field">Message #{channel}<textarea required disabled={busy} maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} /></label><button disabled={busy}>Send message</button></form>
  </>;
}

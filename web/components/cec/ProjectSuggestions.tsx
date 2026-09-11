"use client";
import { useState, useEffect, useRef } from "react";
async function post(action: string, body: unknown) {
  const r = await fetch("/api/cec/recommendations/" + action, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
function Suggestion({ r }: { r: any }) {
  const root = useRef<HTMLDivElement>(null),
    sent = useRef(false);
  const [viewed, setViewed] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5) &&
          !sent.current &&
          document.visibilityState === "visible"
        ) {
          sent.current = true;
          post("exposure", { id: r.id, value: "visible" })
            .then(() => setViewed(true))
            .catch((e) => {
              sent.current = false;
              setMessage(e.message);
            });
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [r.id]);
  async function feedback(kind: string, value: string) {
    try {
      await post(kind, { id: r.id, value });
      setMessage(
        kind === "outcome"
          ? "Saved as a self-reported outcome."
          : "Feedback saved.",
      );
    } catch (e: any) {
      setMessage(e.message);
    }
  }
  return (
    <div className="card" ref={root}>
      <h3>{r.title}</h3>
      <p>{r.description}</p>
      <p className="muted">{r.reason}</p>
      {r.url && (
        <a href={r.url} target="_blank" rel="noreferrer" className="link">
          Project ↗
        </a>
      )}
      <div className="actions">
        <button disabled={!viewed} onClick={() => feedback("action", "saved")}>
          Save
        </button>
        <button
          disabled={!viewed}
          onClick={() => feedback("action", "not_interested")}
        >
          Not interested
        </button>
        <label>
          Report an outcome{" "}
          <select
            disabled={!viewed}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void feedback("outcome", e.target.value);
            }}
          >
            <option value="">Choose…</option>
            <option value="contacted">Contacted</option>
            <option value="collaborating">Collaborating</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
export default function ProjectSuggestions() {
  const [rows, setRows] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function generate() {
    setBusy(true);
    try {
      const j = await post("generate", {});
      setRows(j.recommendations);
      setMessage(
        j.explanation ||
          (!j.recommendations.length
            ? "No shared projects match your interests yet."
            : ""),
      );
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Find your next collaboration</h2>
          <p>
            Matches use your declared interests and shared project descriptions.
            When you request suggestions, views and feedback are recorded to
            improve matching. Outcomes are self-reported.
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={generate}>
          {busy ? "Finding…" : "Find projects"}
        </button>
      </div>
      <p role="status">{message}</p>
      {rows.map((r) => (
        <Suggestion key={r.id} r={r} />
      ))}
    </section>
  );
}

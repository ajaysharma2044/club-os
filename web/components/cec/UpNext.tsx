"use client";
import { useCallback, useEffect, useState } from "react";

// "Up next" — what needs you, in time order.
//
// Replaces four static count tiles. docs/22 §2 names the mechanism of Canvas's
// flatness: state lives outside the interface. Counts tell you the state of the
// world; they never tell you what is waiting on you, and they never move.
//
// Three mechanics from docs/22 §6.1 are implemented here and are the difference
// between this and a list:
//
//   Optimistic write (#1)  — RSVP renders in under 100ms and reconciles behind.
//                            A failure ROLLS BACK INLINE with a retry, never a
//                            toast that disappears before it is read.
//   Changed-field diff (#6) — a moved room or time shows the old value struck
//                            through. This is the direct fix for docs/12 §1,
//                            where a room changed, the listing never did, and
//                            people walked to the wrong building.
//   Live counts (#4)       — "14 going" ticks in place, tabular numerals so
//                            nothing jitters.
//
// And what is deliberately absent (docs/22 §6.2): no streaks, no leaderboard,
// no global presence, no confetti, no infinite scroll, and no number on
// anything that is merely ambient rather than addressed to this person.

type Change = { field: "location" | "starts_at"; from: string; to: string };
type Action = { kind: string; label: string; target: string; primary?: boolean };
type Row = {
  id: string;
  kind: string;
  title: string;
  at: string | null;
  place: string | null;
  state: string;
  count: { going: number; capacity: number | null } | null;
  changes: Change[];
  actions: Action[];
  needsAnswer: boolean;
};
type Data = {
  rows: Row[];
  laterCount: number;
  directed: { mentions: number; messages: number };
  ambient: boolean;
  note: string;
};

const DAY_MS = 86400e3;

/** "Tonight" / "Thursday" / "Sun 12 Oct" — the grouping a person thinks in. */
const timeZone = "America/New_York";
function bucket(at: string | null, now: Date): string {
  if (!at) return "No date yet";
  const d = new Date(at);
  const day = (value: Date) => Date.parse(value.toLocaleDateString("en-CA", { timeZone }) + "T00:00:00Z");
  const days = Math.round((day(d) - day(now)) / DAY_MS);
  if (days < 0) return "Overdue";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return d.toLocaleDateString(undefined, { timeZone, weekday: "long" });
  return d.toLocaleDateString(undefined, { timeZone, weekday: "short", day: "numeric", month: "short" });
}
const clock = (at: string | null) => at ? new Date(at).toLocaleTimeString(undefined, { timeZone, hour: "numeric", minute: "2-digit" }) + " ET" : "";

export default function UpNext() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  // Per-row optimistic state, and per-row failure so a rollback is visible
  // exactly where the action was taken.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, Action | null>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/cec/upnext");
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      setData(j);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    window.addEventListener("cec:changed", load);
    return () => {
      window.removeEventListener("focus", load);
      window.removeEventListener("cec:changed", load);
    };
  }, [load]);

  const act = async (row: Row, a: Action) => {
    // Optimistic: render the new state immediately. docs/22 §6.1 #1.
    setPending((p) => ({ ...p, [row.id]: a.kind }));
    setFailed((f) => ({ ...f, [row.id]: null }));
    setData((d) =>
      d
        ? {
            ...d,
            rows: d.rows.map((r) =>
              r.id !== row.id
                ? r
                : {
                    ...r,
                    state: a.kind === "rsvp.yes" ? "yes" : a.kind === "rsvp.no" ? "no" : r.state,
                    needsAnswer: false,
                    count:
                      r.count && a.kind === "rsvp.yes"
                        ? { ...r.count, going: r.count.going + 1 }
                        : r.count,
                  },
            ),
          }
        : d,
    );
    try {
      const body =
        a.kind === "task.accept" || a.kind === "task.decline"
          ? { id: a.target, status: a.kind === "task.accept" ? "accepted" : "cancelled" }
          : a.kind.startsWith("rsvp.")
          ? { event_id: a.target, status: a.kind === "rsvp.yes" ? "yes" : "no" }
          : { id: a.target };
      const path = a.kind.startsWith("task.") ? "task.status" : a.kind.startsWith("rsvp.") ? "rsvp" : a.kind.replace(".", "/");
      const r = await fetch(`/api/cec/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error((await r.json()).error || "That did not save.");
      await load();
    } catch {
      // Roll back INLINE, with the retry attached to the row. A toast would be
      // gone before anyone standing in a corridor had read it.
      setFailed((f) => ({ ...f, [row.id]: a }));
      await load();
    } finally {
      setPending((p) => {
        const { [row.id]: _drop, ...rest } = p;
        return rest;
      });
    }
  };

  if (error) return <div className="inline-alert" role="alert">{error} <button type="button" onClick={load}>Try again</button></div>;
  if (!data) return <div className="empty">Loading what needs you…</div>;

  const now = new Date();
  const groups: { label: string; rows: Row[] }[] = [];
  for (const row of data.rows) {
    const label = bucket(row.at, now);
    const g = groups.find((x) => x.label === label);
    if (g) g.rows.push(row);
    else groups.push({ label, rows: [row] });
  }

  return (
    <section className="panel" style={{ display: "block" }}>
      <header className="panel-head">
        <div>
          <h2 className="text-title-2">Up next</h2>
          <p className="text-caption">{data.note}</p>
        </div>
        {/* Two-tier unread: a NUMBER only for things addressed to you. Ambient
            activity gets a dot and never a count (docs/22 Pattern 1). */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {data.directed.mentions > 0 && (
            <span className="num" title="Mentions of you">
              @{data.directed.mentions}
            </span>
          )}
          {data.ambient && data.directed.mentions === 0 && (
            <span
              aria-label="New activity"
              title="New activity"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "var(--signal, var(--electric))",
                display: "inline-block",
              }}
            />
          )}
        </div>
      </header>

      {!data.rows.length && (
        <div className="empty">
          Nothing needs you in the next week. This fills in as events are published and
          work is assigned — there is nothing to check.
        </div>
      )}

      {groups.map((g) => (
        <div key={g.label} style={{ marginTop: 18 }}>
          <p className="text-caption">
            {g.label}
          </p>
          {g.rows.map((row) => {
            const busy = !!pending[row.id];
            const retry = failed[row.id];
            const moved = row.changes.length > 0;
            return (
              <article
                key={row.id}
                className="card"
                style={{
                  marginTop: 8,
                  padding: 16,
                  transition: "border-color 180ms ease, opacity 120ms ease",
                  opacity: busy ? 0.7 : 1,
                  borderLeft: moved
                    ? "3px solid var(--fire, var(--crimson))"
                    : row.needsAnswer
                      ? "3px solid var(--signal, var(--electric))"
                      : undefined,
                }}
              >
                <div className="upnext-row">
                  <span
                    className="num"
                    style={{ fontVariantNumeric: "tabular-nums", minWidth: 62 }}
                  >
                    {row.kind === "task" && row.at ? new Date(row.at).toLocaleDateString(undefined, { timeZone, month: "short", day: "numeric" }) : clock(row.at)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <h3 className="text-title-3" style={{ margin: 0 }}>
                      {row.title}
                    </h3>
                    {row.kind === "task" && <p className="text-caption">{({assigned: "Awaiting your acceptance", accepted: "In progress", changes_requested: "Changes requested — review your feedback", submitted: "Waiting for officer review"} as Record<string, string>)[row.state]}</p>}

                    {/* THE CHANGED-FIELD DIFF. The old value stays visible,
                        struck through, so nobody walks to the old room. */}
                    <p className="text-caption" style={{ margin: "2px 0 0" }}>
                      {row.changes.find((c) => c.field === "location") ? (
                        <>
                          <s style={{ opacity: 0.6 }}>
                            {row.changes.find((c) => c.field === "location")!.from}
                          </s>{" "}
                          <strong>→ {row.place}</strong>{" "}
                          <span style={{ color: "var(--fire, var(--crimson))" }}>moved</span>
                        </>
                      ) : (
                        row.place
                      )}
                      {row.changes.find((c) => c.field === "starts_at") && (
                        <>
                          {" · "}
                          <s style={{ opacity: 0.6 }}>
                            {clock(row.changes.find((c) => c.field === "starts_at")!.from)}
                          </s>{" "}
                          <strong>→ {clock(row.at)}</strong>{" "}
                          <span style={{ color: "var(--fire, var(--crimson))" }}>
                            time changed
                          </span>
                        </>
                      )}
                      {row.count && (
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {row.place || moved ? " · " : ""}
                          {row.count.going} going
                          {row.count.capacity ? ` of ${row.count.capacity}` : ""}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Work submission opens the workspace to capture evidence;
                      lightweight RSVP and assignment responses remain inline. */}
                  <div className="upnext-actions">
                    {row.actions.map((a) => a.kind === "task.view" ? (
                      <a className="button" key={a.kind} href={`/clubs/cec/workspace#task-${encodeURIComponent(a.target)}`}>
                        {a.label}
                      </a>
                    ) : (
                      <button
                        key={a.kind}
                        type="button"
                        className={a.primary ? undefined : "ghost"}
                        disabled={busy}
                        onClick={() => act(row, a)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {retry && (
                  <p
                    className="text-caption"
                    style={{ marginTop: 6, color: "var(--fire, var(--crimson))" }}
                  >
                    That did not save.{" "}
                    <button type="button" className="ghost" onClick={() => act(row, retry)}>
                      Try again
                    </button>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ))}

      {/* Beyond the horizon is a COUNT, never a list. A home screen that grows
          without bound is a feed, and docs/22 §6.2 refuses that. */}
      {data.laterCount > 0 && (
        <p className="text-caption" style={{ marginTop: 14 }}>
          {data.laterCount} event{data.laterCount === 1 ? "" : "s"} further out you have not
          answered.
        </p>
      )}
    </section>
  );
}

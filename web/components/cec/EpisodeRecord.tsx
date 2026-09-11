"use client";
import { useEffect, useState, FormEvent } from "react";
export default function EpisodeRecord({
  userId,
  officer,
}: {
  userId: string;
  officer: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [episode, setEpisode] = useState(""),
    [scope, setScope] = useState("mine"),
    [correction, setCorrection] = useState<any>(null),
    [outcome, setOutcome] = useState(false);
  async function load() {
    const r = await fetch("/api/cec/evidence");
    const j = await r.json();
    if (!r.ok) throw Error(j.error);
    setData(j);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    action: string,
    extra: any = {},
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cec/evidence/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(form)),
          ...extra,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      await load();
      form.reset();
      setCorrection(null);
      setOutcome(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const selected = data?.episodes.find((e: any) => e.id === episode);
  const events =
    (scope === "mine" ? data?.personal_timeline : data?.events)
      ?.filter((e: any) => !episode || e.episode_id === episode)
      .slice()
      .reverse() || [];
  return (
    <section className="adaptive panel">
      <h2>Your work, with the evidence</h2>
      <p>
        Tasks, event registrations and confirmed meetings create a visible club
        record. An episode connects related work to its history. These records
        are internal to the club; public profile sharing does not publish them.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data ? (
        <p>Loading the record…</p>
      ) : (
        <>
          <div className="metrics">
            <div>
              <b>
                {data.features.approved} /{" "}
                {data.features.accepted - data.features.cancelled}
              </b>
              <span>Approved / accepted non-cancelled tasks</span>
            </div>
            <div>
              <b>{data.features.unresolved}</b>
              <span>Unresolved commitments</span>
            </div>
            <div>
              <b>{data.features.cancelled}</b>
              <span>Cancelled commitments</span>
            </div>
          </div>
          <p className="source-note">
            Open tasks are unresolved. {data.features.disputed_excluded}{" "}
            disputed tasks excluded. This is a count of recorded work, not a
            personal rating.
          </p>
          <details>
            <summary>Feature snapshots</summary>
            <p>
              Save the work counts and their source IDs as they are known now.
              Snapshots are included in your record export.
            </p>
            <form onSubmit={(e) => submit(e, "snapshot")}>
              <button className="button secondary" disabled={busy}>
                Save current snapshot
              </button>
            </form>
            {data.snapshots?.map((s: any) => (
              <p key={s.id}>
                {new Date(s.as_of).toLocaleString()} · {s.features.approved}{" "}
                approved / {s.features.accepted - s.features.cancelled} accepted
                non-cancelled tasks · {s.policy}
              </p>
            ))}
          </details>
          <div className="actions">
            <label>
              Timeline
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="mine">My activity</option>
                <option value="club">Club episode activity</option>
              </select>
            </label>
            <label>
              Episode
              <select
                value={episode}
                onChange={(e) => {
                  setEpisode(e.target.value);
                  setOutcome(false);
                }}
              >
                <option value="">All episodes</option>
                {data.episodes.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {e.status}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selected && (
            <p>
              <strong>{selected.title}</strong> · {selected.status}
              <br />
              {selected.goal}
            </p>
          )}
          {selected && (officer || selected.owner === userId) && (
            <button
              className="button secondary"
              onClick={() => setOutcome(!outcome)}
            >
              Record what happened
            </button>
          )}
          {outcome && selected && (
            <form
              onSubmit={(e) =>
                submit(e, "outcome", {
                  episode_id: selected.id,
                  version: selected.version,
                })
              }
            >
              <label>
                Result
                <select name="status">
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="unsuccessful">Unsuccessful</option>
                </select>
              </label>
              <label>
                What happened?
                <textarea name="summary" required maxLength={2000} />
              </label>
              <div className="actions">
                <label>
                  Optional measured value
                  <input name="metric" type="number" step="any" />
                </label>
                <label>
                  Unit (required with a value)
                  <input
                    name="unit"
                    maxLength={80}
                    placeholder="attendees, USD, deliverables…"
                  />
                </label>
              </div>
              <p>
                This is a reported result. It does not mark tasks approved or
                establish independent verification.
              </p>
              <button className="button" disabled={busy}>
                Save outcome
              </button>
            </form>
          )}
          <details>
            <summary>
              Club blockers: {data.operations.open_blockers} open ·{" "}
              {data.operations.resolved_blockers} resolved
            </summary>
            <p>
              Median resolution time among resolved blockers:{" "}
              {data.operations.median_resolution_hours === null
                ? "No completed observations"
                : data.operations.median_resolution_hours.toFixed(1) + " hours"}
              . Open blockers remain unresolved.
            </p>
            {data.blockers
              .filter((b: any) => !episode || b.episode_id === episode)
              .map((b: any) => (
                <div className="row" key={b.id}>
                  <div>
                    <strong>{b.category.replaceAll("_", " ")}</strong>
                    <p>{b.note}</p>
                    <small>
                      {b.resolved_at
                        ? "Resolved: " + b.resolution
                        : "Open since " +
                          new Date(b.created_at).toLocaleString()}
                    </small>
                    {!b.resolved_at && (
                      <form
                        onSubmit={(e) =>
                          submit(e, "resolve", { blocker_id: b.id })
                        }
                      >
                        <label>
                          Resolution
                          <textarea
                            name="resolution"
                            required
                            maxLength={1000}
                          />
                        </label>
                        <button className="button secondary" disabled={busy}>
                          Record resolution
                        </button>
                        <small>
                          The task owner or an officer can resolve this.
                        </small>
                      </form>
                    )}
                  </div>
                </div>
              ))}
          </details>
          {!events.length && (
            <p>
              No activity in this view yet. New task and meeting actions will
              appear here.
            </p>
          )}
          {events.map((e: any) => (
            <article className="row" key={e.id}>
              <div className="detail">
                <strong>{e.event_type.replaceAll(".", " · ")}</strong>
                <small>
                  {e.actor_name}
                  {e.subject_id !== e.actor_id
                    ? " → " + e.subject_name
                    : ""} · {new Date(e.occurred_at).toLocaleString()}
                </small>
                <p>
                  {e.context.title ||
                    e.context.summary ||
                    e.context.statement ||
                    e.context.note ||
                    e.context.resolution ||
                    e.context.meaning ||
                    e.context.basis ||
                    ""}
                </p>
                <span className="tag">
                  {e.evidence_level.replaceAll("_", " ")}
                </span>
                {data.events.some((c: any) => c.context.corrects === e.id) && (
                  <span className="tag">Correction attached</span>
                )}
                <details>
                  <summary>Source and context</summary>
                  <p>
                    Source: {e.source} · {e.source_ref}
                    <br />
                    Observed: {new Date(e.observed_at).toLocaleString()}
                    <br />
                    Policy: {e.policy}
                  </p>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(e.context, null, 2)}
                  </pre>
                </details>
                {e.event_type !== "evidence.correction" &&
                  (officer ||
                    e.actor_id === userId ||
                    e.subject_id === userId) && (
                    <button
                      className="button secondary small"
                      onClick={() =>
                        setCorrection(correction?.id === e.id ? null : e)
                      }
                    >
                      Add correction
                    </button>
                  )}
                {correction?.id === e.id && (
                  <form
                    onSubmit={(ev) => submit(ev, "correct", { event_id: e.id })}
                  >
                    <label>
                      What needs correcting?
                      <textarea name="statement" required maxLength={2000} />
                    </label>
                    <p>
                      The correction stays beside the original source record.
                    </p>
                    <button className="button" disabled={busy}>
                      Save correction
                    </button>
                  </form>
                )}
              </div>
              <span className="tag">{e.action_family}</span>
            </article>
          ))}
        </>
      )}
    </section>
  );
}

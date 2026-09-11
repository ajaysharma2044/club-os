"use client";
import { useEffect, useState, FormEvent } from "react";
async function api(path: string, b?: unknown) {
  const r = await fetch("/api/cec/schedule/" + path, {
    method: b === undefined ? "GET" : "POST",
    headers: b === undefined ? {} : { "Content-Type": "application/json" },
    ...(b === undefined ? {} : { body: JSON.stringify(b) }),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error);
  return j;
}
function nyISO(date: string, time: string) {
  const target = date + "T" + time;
  const base = Date.parse(target + ":00Z");
  if (!Number.isFinite(base)) throw Error("Choose a date and time.");
  const local = (ms: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(ms))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
  // Check the possible Eastern offsets explicitly; reject nonexistent or ambiguous DST wall times.
  const candidates = [base + 4 * 3600000, base + 5 * 3600000].filter(
    (ms) => local(ms) === target,
  );
  if (candidates.length !== 1)
    throw Error(
      "This Eastern time is ambiguous or does not exist because of daylight saving. Choose another time.",
    );
  return new Date(candidates[0]).toISOString();
}
function Proposal({
  proposal,
  people,
  onDone,
  onDismiss,
}: {
  proposal: any;
  people: any[];
  onDone: () => void;
  onDismiss: () => void;
}) {
  const d = proposal.draft,
    [title, setTitle] = useState(d.title),
    [day, setDay] = useState(d.date),
    [time, setTime] = useState(d.time),
    [duration, setDuration] = useState("60"),
    [location, setLocation] = useState(d.location),
    [participants, setParticipants] = useState<string[]>([]),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const start = nyISO(day, time);
      await api("confirm", {
        proposal_id: proposal.id,
        title,
        starts_at: start,
        ends_at: new Date(
          Date.parse(start) + Number(duration) * 60000,
        ).toISOString(),
        location,
        participants,
        confirmed: confirm,
      });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel adaptive">
      <h3>Review the meeting</h3>
      <p>{d.notice}</p>
      <details>
        <summary>Time expressions found in the selected messages</summary>
        {d.candidates.map((c: any, i: number) => (
          <p key={i}>
            {c.text} → {c.date} {c.time || "(time needs confirmation)"}
          </p>
        ))}
      </details>
      <form onSubmit={save}>
        <label>
          Title
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="actions">
          <label>
            Date in Eastern Time
            <input
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </label>
          <label>
            Time in Eastern Time
            <input
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label>
            Duration
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              {[15, 30, 45, 60, 90, 120].map((n) => (
                <option key={n} value={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Location
          <input
            required
            maxLength={240}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Invite selected members (you are included)</legend>
          {people.map((p) => (
            <label key={p.id} className="adaptive-choice">
              <input
                type="checkbox"
                checked={participants.includes(p.id)}
                onChange={(e) =>
                  setParticipants(
                    e.target.checked
                      ? [...participants, p.id]
                      : participants.filter((x) => x !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <label className="adaptive-choice">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
          />
          I confirm these meeting details and the selected invitees. This does
          not reserve the room.
        </label>
        <button className="button" disabled={busy || !confirm}>
          Create meeting
        </button>{" "}
        <button
          className="button secondary"
          type="button"
          disabled={busy}
          onClick={onDismiss}
        >
          Dismiss suggestion
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export default function ChatScheduler({
  messages = [],
  people = [],
  userId,
}: {
  messages?: any[];
  people?: any[];
  userId: string;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [proposal, setProposal] = useState<any>(null),
    [feed, setFeed] = useState("");
  const recent = [...messages]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-12);
  async function load() {
    setData(await api("state"));
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const suggested = recent.some((m) =>
    /\b(meet|meeting|works|thursday|tuesday|tomorrow)\b/i.test(m.body),
  );
  async function propose() {
    setBusy(true);
    setError("");
    try {
      setProposal(
        await api("propose", {
          message_ids: selected.length ? selected : recent.map((m) => m.id),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(path: string, b: any) {
    setBusy(true);
    setError("");
    try {
      await api(path, b);
      await load();
      return true;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="adaptive">
      <div className="panel">
        <h3>Conversation → meeting</h3>
        {recent.length > 0 ? (
          <>
            <p>
              {suggested
                ? "This conversation may contain meeting plans. Review a suggestion from the messages you select."
                : "Select messages to turn a plan into a meeting."}
            </p>
            <details>
              <summary>
                Choose source messages (latest 12 in this channel)
              </summary>
              {recent.map((m) => (
                <label className="adaptive-choice" key={m.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, m.id]
                          : selected.filter((x) => x !== m.id),
                      )
                    }
                  />
                  <span>
                    {m.name}: {m.body}
                  </span>
                </label>
              ))}
            </details>
            <button
              className="button secondary"
              disabled={busy}
              onClick={propose}
            >
              Review meeting suggestion
            </button>
          </>
        ) : (
          <p>Create a suggestion from messages in Workspace → Inbox.</p>
        )}
        {data?.proposals
          ?.filter((p: any) => p.id !== proposal?.id)
          .map((p: any) => (
            <p key={p.id}>
              <button
                className="button secondary small"
                onClick={() => setProposal(p)}
              >
                Resume meeting suggestion
              </button>
            </p>
          ))}
      </div>
      {proposal && (
        <Proposal
          key={proposal.id}
          proposal={proposal}
          people={people.filter((p) => p.id !== userId)}
          onDone={() => {
            setProposal(null);
            setSelected([]);
            void load().catch((e) => setError(e.message));
          }}
          onDismiss={() => {
            void act("dismiss", { proposal_id: proposal.id }).then((ok) => {
              if (ok) setProposal(null);
            });
          }}
        />
      )}
      <section className="panel">
        <h3>Your meetings and invitations</h3>
        {data?.meetings?.map((m: any) => (
          <div className="row" key={m.id}>
            <div>
              <strong>{m.title}</strong>
              <p>
                {new Date(m.starts_at).toLocaleString([], {
                  timeZone: "America/New_York",
                })}{" "}
                ET · {m.location}
              </p>
              <small>
                {m.status === "cancelled"
                  ? "Cancelled"
                  : m.participant_status === "accepted"
                    ? "In your subscription feed"
                    : m.participant_status === "pending"
                      ? "Invitation awaiting your response"
                      : "Declined"}
              </small>
            </div>
            <div className="actions">
              {m.status !== "cancelled" && (
                <>
                  {m.participant_status !== "accepted" && (
                    <button
                      className="button small"
                      disabled={busy}
                      onClick={() =>
                        act("respond", { meeting_id: m.id, status: "accepted" })
                      }
                    >
                      Accept
                    </button>
                  )}
                  {m.owner !== userId &&
                    m.participant_status !== "declined" && (
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          act("respond", {
                            meeting_id: m.id,
                            status: "declined",
                          })
                        }
                      >
                        Decline
                      </button>
                    )}
                  {m.owner === userId && (
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => act("cancel", { meeting_id: m.id })}
                    >
                      Cancel meeting
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {!data?.meetings?.length && <p>No meetings yet.</p>}
      </section>
      <section className="panel">
        <h3>Personal calendar subscription</h3>
        <p>
          Subscribe once to a private feed. Accepted meetings and cancellations
          update when your calendar app refreshes. This is a separate, read-only
          calendar; direct Google Calendar writes are not connected.
        </p>
        <label className="adaptive-choice">
          <input
            type="checkbox"
            checked={!!data?.preferences.auto_add}
            onChange={(e) => act("preferences", { auto_add: e.target.checked })}
          />
          Automatically accept future CEC meeting invitations into my feed.
          Otherwise I will accept each invitation here.
        </label>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            try {
              const j = await api("feed", {});
              setFeed(
                window.location.origin +
                  "/api/cec/calendar/feed?token=" +
                  j.token,
              );
              await load();
            } catch (e: any) {
              setError(e.message);
            }
          }}
        >
          {data?.preferences.has_feed
            ? "Rotate private subscription link"
            : "Generate private subscription link"}
        </button>
        {data?.preferences.has_feed && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => {
              void act("revoke", {});
              setFeed("");
            }}
          >
            Revoke link
          </button>
        )}
        {feed && (
          <>
            <label>
              Private link — anyone with it can read your meeting calendar
              <input readOnly value={feed} onFocus={(e) => e.target.select()} />
            </label>
            <p>
              Google Calendar on desktop: Other calendars → From URL. Apple
              Calendar: File → New Calendar Subscription. The deployed feed must
              be reachable over HTTPS; Google cannot fetch a localhost URL.
            </p>
            <p>
              Rotating or revoking a link stops future reads through the old
              link. It cannot erase copies already imported into a calendar.
            </p>
          </>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

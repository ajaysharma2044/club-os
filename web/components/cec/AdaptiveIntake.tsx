"use client";
import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
async function api(path: string, body?: unknown) {
  const r = await fetch("/api/cec/adaptive/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j;
}
const label = (s: string) => s.replaceAll("_", " ");
function Question({
  question,
  sessionId,
  onUpdate,
}: {
  question: any;
  sessionId: string;
  onUpdate: (v: any) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    sent = useRef(false);
  const [viewed, setViewed] = useState(question.exposed),
    [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const el = element.current;
    if (!el) return;
    let visible = false;
    const expose = () => {
      if (visible && document.visibilityState === "visible" && !sent.current) {
        sent.current = true;
        api("exposure", {
          session_id: sessionId,
          decision_id: question.decision_id,
        })
          .then(() => setViewed(true))
          .catch((e) => {
            sent.current = false;
            setError(e.message);
          });
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some(
          (e) => e.isIntersecting && e.intersectionRatio >= 0.5,
        );
        expose();
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    document.addEventListener("visibilitychange", expose);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", expose);
    };
  }, [question.decision_id, sessionId]);
  async function answer(skip = false) {
    setBusy(true);
    setError("");
    try {
      onUpdate(
        await api(skip ? "skip" : "answer", {
          session_id: sessionId,
          decision_id: question.decision_id,
          value,
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div ref={element} className="panel adaptive-question">
      <div className="eyebrow">One useful update</div>
      <h2>{question.prompt}</h2>
      <p className="muted">{question.reason}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void answer();
        }}
      >
        <fieldset disabled={busy}>
          <legend className="sr-only">Choose an answer</legend>
          {question.options.map((o: any) => (
            <label className="adaptive-choice" key={o.value}>
              <input
                type="radio"
                name="answer"
                value={o.value}
                checked={value === o.value}
                onChange={() => setValue(o.value)}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button className="button" disabled={!viewed || !value || busy}>
            Save and continue
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={!viewed || busy}
            onClick={() => answer(true)}
          >
            Skip
          </button>
        </div>
      </form>
      <details>
        <summary>Why this question?</summary>
        <p>
          This baseline prioritizes missing or stale information that is
          relevant to this check-in, while allowing for answering time.
        </p>
        <p>
          Utility {question.utility.toFixed(2)} · information-gap estimate{" "}
          {(question.entropy_bits * question.gap).toFixed(2)} bits · estimated
          time {question.seconds}s.
        </p>
        <p>
          These are question-selection assumptions, not a score for you or a
          prediction of your ability.
        </p>
      </details>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function AdaptiveIntake() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(""),
    [source, setSource] = useState(""),
    [stage, setStage] = useState(""),
    [topics, setTopics] = useState<string[]>([]),
    [purpose, setPurpose] = useState("startup_hours"),
    [fromText, setFromText] = useState(false),
    [confirm, setConfirm] = useState(false),
    [notice, setNotice] = useState(""),
    [erase, setErase] = useState(false);
  useEffect(() => {
    api("me")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function preview() {
    setBusy(true);
    setError("");
    try {
      const j = await api("preview", { text: bio });
      setStage(j.stage);
      setTopics(j.topics);
      setFromText(true);
      setConfirm(false);
      setNotice(j.notice);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setData(
        await api("start", {
          purpose,
          stage,
          topics,
          from_text: fromText,
          source_url: source,
          confirmed: confirm,
        }),
      );
      setBio("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function sharing(shared: boolean) {
    try {
      setData(await api("sharing", { shared }));
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function clear() {
    setBusy(true);
    try {
      setData(await api("clear", {}));
      setErase(false);
      setStage("");
      setTopics([]);
      setSource("");
      setFromText(false);
      setConfirm(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const profile = data?.profile;
  return (
    <div className="adaptive">
      <p>
        Keep your project and support needs current with up to three optional
        questions each week. Your answers help CEC understand what would be
        useful to you. Skipping does not count against you.
      </p>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <p>Loading your check-in…</p>}
      {data && !data.session && (
        <section className="panel">
          <h2>This week’s context</h2>
          <p>
            Optionally paste a short description of your own work from LinkedIn,
            a portfolio, or your notes. Review the suggested context below. The
            text is processed for suggestions and is not saved; no external
            profile is fetched.
          </p>
          <label>
            Background to review
            <textarea
              maxLength={4000}
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setFromText(false);
                setConfirm(false);
              }}
            />
          </label>
          <button
            className="button secondary"
            disabled={!bio.trim() || busy}
            onClick={preview}
          >
            Suggest context from my text
          </button>
          {notice && <p role="status">{notice}</p>}
          <form onSubmit={start}>
            <label>
              What is this update for?
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="startup_hours">Startup Hours</option>
                <option value="coffee_chat">A coffee chat</option>
                <option value="recruitment">
                  Exploring a club contribution
                </option>
              </select>
            </label>
            <label>
              Project stage
              <select
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setConfirm(false);
                }}
              >
                <option value="">Keep existing / leave unknown</option>
                <option value="exploring">Exploring</option>
                <option value="idea">Idea</option>
                <option value="building">Building</option>
                <option value="launched">Launched</option>
              </select>
            </label>
            <fieldset>
              <legend>Topics you want to share (optional)</legend>
              {["software", "hardware", "design", "business"].map((t) => (
                <label className="adaptive-choice" key={t}>
                  <input
                    type="checkbox"
                    checked={topics.includes(t)}
                    onChange={(e) => {
                      setTopics(
                        e.target.checked
                          ? [...topics, t]
                          : topics.filter((v) => v !== t),
                      );
                      setConfirm(false);
                    }}
                  />
                  {t}
                </label>
              ))}
            </fieldset>
            <label>
              Source link (optional; saved as a reference)
              <input
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://www.linkedin.com/in/your-profile"
              />
            </label>
            <label className="adaptive-choice">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
              I confirm the context above for this check-in, or choose to leave
              it unknown.
            </label>
            <button className="button" disabled={!confirm || busy}>
              Start this week’s update
            </button>
          </form>
        </section>
      )}
      {data?.question && (
        <Question
          key={data.question.decision_id}
          question={data.question}
          sessionId={data.session.id}
          onUpdate={setData}
        />
      )}
      {data?.session && !data.question && (
        <div className="notice success">
          <strong>This week’s update is complete.</strong> Your next check-in
          becomes available next week. Weeks begin Monday at 00:00 UTC.
        </div>
      )}
      {profile && (
        <section className="panel">
          <h2>Your confirmed context</h2>
          <p>
            {profile.covered_fields} of {profile.total_fields} core fields
            provided · {Math.round(profile.freshness * 100)}% freshness across
            provided fields.
          </p>
          <p className="muted">
            Freshness measures the age of an answer, not whether it is true.
            Information is self-reported and has not been independently
            verified.
          </p>
          {Object.values(profile.facts).map((f: any) => (
            <div className="row" key={f.field}>
              <div>
                <strong>
                  {label(f.field)}: {label(f.value)}
                </strong>
                <p className="muted">
                  Confirmed {new Date(f.observed_at).toLocaleDateString()} ·{" "}
                  {label(f.source_type)}
                </p>
                {f.source_url && (
                  <a
                    href={f.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="link"
                  >
                    Your source reference ↗
                  </a>
                )}
              </div>
              <button
                className="button secondary small"
                onClick={async () => {
                  try {
                    setData(await api("forget", { field: f.field }));
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                Remove this field
              </button>
            </div>
          ))}
          <label className="adaptive-choice">
            <input
              type="checkbox"
              checked={data.shared}
              onChange={(e) => sharing(e.target.checked)}
            />
            Share my confirmed context with CEC officers for club planning and
            support. This does not publish it in the builder directory.
          </label>
          <details>
            <summary>Update history</summary>
            {data.history.map((h: any, i: number) => (
              <p key={i}>
                {new Date(h.observed_at).toLocaleDateString()} ·{" "}
                {label(h.field)} → {label(h.value)}
              </p>
            ))}
          </details>
          <p>
            <button className="button secondary" onClick={() => setErase(true)}>
              Delete my adaptive profile and history
            </button>
          </p>
          {erase && (
            <div className="notice">
              <p>
                Delete your adaptive answers, source references, and check-in
                history? Your account and other club records stay available.
              </p>
              <button className="button" disabled={busy} onClick={clear}>
                Delete adaptive profile
              </button>{" "}
              <button
                className="button secondary"
                onClick={() => setErase(false)}
              >
                Keep it
              </button>
            </div>
          )}
          <Link href="/cec/people" className="link">
            Back to people →
          </Link>
        </section>
      )}
    </div>
  );
}
export function SharedAdaptiveProfiles() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [sort, setSort] = useState("recent"),
    [need, setNeed] = useState("all");
  useEffect(() => {
    api("profiles")
      .then((j) => setRows(j.profiles))
      .catch((e) => setError(e.message));
  }, []);
  const date = (p: any) =>
    Math.max(
      0,
      ...Object.values(p.facts).map((f: any) => Date.parse(f.observed_at)),
    );
  const sorted = rows
    .filter((p) => need === "all" || p.facts.need?.value === need)
    .sort((a, b) =>
      sort === "stage"
        ? String(a.facts.stage?.value || "unknown").localeCompare(
            String(b.facts.stage?.value || "unknown"),
          )
        : date(b) - date(a),
    );
  return (
    <section className="panel adaptive">
      <h2>Shared weekly context</h2>
      <p>
        Only people who chose officer sharing appear here. Group by declared
        needs and stage; coverage measures provided fields, not talent.
      </p>
      <div className="actions">
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recently confirmed</option>
            <option value="stage">Project stage</option>
          </select>
        </label>
        <label>
          Support needed
          <select value={need} onChange={(e) => setNeed(e.target.value)}>
            <option value="all">All shared profiles</option>
            {["build", "feedback", "team", "funding", "explore"].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {sorted.map((p) => (
        <div className="row" key={p.id}>
          <div>
            <h3>{p.name}</h3>
            <p>
              Stage: {p.facts.stage?.value || "unknown"} · Need:{" "}
              {p.facts.need?.value || "unknown"}
            </p>
            <p>
              {p.covered_fields}/{p.total_fields} fields ·{" "}
              {Math.round(p.freshness * 100)}% freshness · self-reported
            </p>
          </div>
        </div>
      ))}
      {!sorted.length && <p>No matching shared profiles yet.</p>}
    </section>
  );
}

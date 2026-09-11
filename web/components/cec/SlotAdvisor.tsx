"use client";
import { useEffect, useState } from "react";

// "When should we hold this?" — the officer-facing end of the context engine.
//
// The design rule for this screen, which is the whole reason it looks the way
// it does: THE REASONS ARE THE PRODUCT, not the ranking. An officer who is told
// to move an event to Saturday and cannot see why will either ignore the advice
// or follow it blindly, and both are bad outcomes. So every slot shows what was
// counted for and against it, and the interval is always visible.
//
// The gaps panel is not an error state. A recommendation built without a course
// roster is a genuinely weaker recommendation, and saying so on the same screen
// is the difference between a tool and an oracle.

type Driver = { label: string; contribution?: number; differentiating?: boolean };
type Prediction = {
  value: number | null;
  interval: [number, number] | null;
  reading?: string;
};
type Slot = {
  at: string;
  label: string;
  attendance: Prediction;
  totalMultiplier: number;
  positives: Driver[];
  negatives: Driver[];
  regime: string;
  competing: number;
  competingSample: { title: string; startsAt: string }[];
  reading: string;
};
type Advice = {
  ranked: Slot[];
  recommended: Slot | null;
  runnerUp: Slot | null;
  decisive: boolean;
  explanation: string;
  limitations: string[];
  readiness: {
    term: string | null;
    roster: { term: string; courses: number; sections: number } | null;
    campusEvents: number;
    missing: { input: string; consequence: string; fix: string }[];
    ready: boolean;
  };
};

/** Default candidates: the three times a club actually argues about. */
function defaultSlots(): string[] {
  const base = new Date();
  base.setDate(base.getDate() + 7);
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  };
  return [at(0, 19), at(1, 11), at(4, 10)];
}

export default function SlotAdvisor() {
  const [slots, setSlots] = useState<string[]>(defaultSlots);
  const [rsvps, setRsvps] = useState("60");
  const [food, setFood] = useState(false);
  const [outdoors, setOutdoors] = useState(false);
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [readiness, setReadiness] = useState<Advice["readiness"] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/cec/planning/readiness")
      .then(async (r) => {
        const j = await r.json();
        if (r.ok) setReadiness(j);
      })
      .catch(() => {});
  }, []);

  const ask = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cec/planning/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots: slots.filter(Boolean).map((s) => new Date(s).toISOString()),
          rsvps: Number(rsvps) || undefined,
          food,
          outdoors,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      setAdvice(j);
      setReadiness(j.readiness);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const gaps = readiness?.missing ?? [];

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="text-title-2">When should we hold this?</h2>
          <p className="text-caption">
            Compares candidate times against the campus calendar, what is being
            taught that hour, where the term sits, and the forecast. The reasons
            matter more than the ranking.
          </p>
        </div>
      </header>

      {/* Gaps are shown BEFORE any recommendation, not buried under it. */}
      {gaps.length > 0 && (
        <div className="inline-alert" style={{ marginTop: 12 }}>
          <strong>This advice is thinner than it could be.</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {gaps.map((m) => (
              <li key={m.input} className="text-caption">
                <strong>{m.input}</strong> — {m.consequence}{" "}
                <span style={{ opacity: 0.8 }}>{m.fix}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        {slots.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              type="datetime-local"
              value={s}
              aria-label={`Candidate time ${i + 1}`}
              onChange={(e) => {
                const next = [...slots];
                next[i] = e.target.value;
                setSlots(next);
              }}
            />
            {slots.length > 2 && (
              <button
                type="button"
                className="ghost"
                onClick={() => setSlots(slots.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {slots.length < 8 && (
            <button type="button" className="ghost" onClick={() => setSlots([...slots, ""])}>
              Add a time
            </button>
          )}
          <label className="text-caption">
            Expected RSVPs{" "}
            <input
              style={{ width: 70 }}
              value={rsvps}
              inputMode="numeric"
              onChange={(e) => setRsvps(e.target.value)}
            />
          </label>
          <label className="text-caption">
            <input type="checkbox" checked={food} onChange={(e) => setFood(e.target.checked)} />{" "}
            Food
          </label>
          <label className="text-caption">
            <input
              type="checkbox"
              checked={outdoors}
              onChange={(e) => setOutdoors(e.target.checked)}
            />{" "}
            Outdoors
          </label>
          <button type="button" onClick={ask} disabled={busy}>
            {busy ? "Checking…" : "Compare these times"}
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {advice && (
        <div style={{ marginTop: 16 }}>
          <p className="text-body">
            <strong>{advice.explanation}</strong>
          </p>
          {/* A close call must look like a close call. */}
          {!advice.decisive && advice.runnerUp && (
            <p className="text-caption">
              This is close. {advice.runnerUp.label} is within the margin, so pick on
              whatever the model cannot see — who is actually free, and what the room costs.
            </p>
          )}

          {advice.ranked.map((s, i) => (
            <article
              key={s.at}
              className="card"
              style={{
                marginTop: 10,
                borderLeft:
                  i === 0 ? "3px solid var(--signal, var(--electric))" : undefined,
              }}
            >
              <div className="page-title" style={{ marginBottom: 4 }}>
                <h3 className="text-title-3">{s.label}</h3>
                {s.attendance.value !== null && (
                  <span className="num" style={{ fontSize: 20 }}>
                    {s.attendance.value}
                    {s.attendance.interval && (
                      <span className="text-caption" style={{ marginLeft: 6 }}>
                        {s.attendance.interval[0]}–{s.attendance.interval[1]}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <p className="text-body">{s.reading}</p>

              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 8 }}>
                {s.positives.length > 0 && (
                  <div>
                    <p className="text-micro" style={{ textTransform: "uppercase" }}>
                      In favour
                    </p>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                      {s.positives.map((d, k) => (
                        <li key={k} className="text-caption">
                          {d.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.negatives.length > 0 && (
                  <div>
                    <p className="text-micro" style={{ textTransform: "uppercase" }}>
                      Against
                    </p>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                      {s.negatives.map((d, k) => (
                        <li key={k} className="text-caption">
                          {d.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {s.competingSample.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary className="text-caption">
                    {s.competing} competing campus event
                    {s.competing === 1 ? "" : "s"}
                  </summary>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {s.competingSample.map((e, k) => (
                      <li key={k} className="text-caption">
                        {e.title}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          ))}

          {advice.limitations.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="text-caption">
                What this does not know ({advice.limitations.length})
              </summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {advice.limitations.map((l, i) => (
                  <li key={i} className="text-caption">
                    {l}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

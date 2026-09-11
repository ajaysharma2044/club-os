"use client";
import { useEffect, useState } from "react";

// A person's own behavioural signals. Nobody else sees this page about them,
// and no number ever appears beside anyone's name elsewhere — that is the
// mirror test from docs/11, made literal.
//
// Every reading leads with how much evidence there is, because with a handful
// of observations the honest answer is "not enough to say", and the interface
// should say it rather than render a confident-looking bar.

type Signal = {
  key: string;
  label: string;
  family: string;
  kind: "rate" | "latency";
  opportunity_adjusted: boolean;
  n: number;
  posterior: { mean: number; lo: number; hi: number; width: number } | null;
  median: number | null;
  peer_z: number | null;
  momentum: number | null;
  reading: string;
};

const FAMILY_ORDER = [
  "execution",
  "ownership",
  "adaptation",
  "collaboration",
  "learning",
  "reliability",
];

export default function MySignals() {
  const [data, setData] = useState<{ signals: Signal[]; note: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cec/behavior/self")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error);
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="inline-alert">{error}</div>;
  if (!data) return <div className="empty">Loading your record…</div>;

  const withData = data.signals.filter((s) => s.n > 0);
  const waiting = data.signals.filter((s) => s.n === 0);

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="text-title-2">What your work shows</h2>
          <p className="text-caption">{data.note}</p>
        </div>
      </header>

      {!withData.length && (
        <div className="empty">
          Nothing to show yet. These fill in as you accept work, run events and
          finish things — there is nothing extra to fill out.
        </div>
      )}

      {FAMILY_ORDER.filter((f) => withData.some((s) => s.family === f)).map(
        (family) => (
          <div key={family} style={{ marginTop: 20 }}>
            <p className="text-micro" style={{ textTransform: "uppercase" }}>
              {family}
            </p>
            {withData
              .filter((s) => s.family === family)
              .map((s) => {
                const thin = s.n < 5;
                return (
                  <article
                    key={s.key}
                    className="card"
                    style={{ marginTop: 8, cursor: "pointer" }}
                    onClick={() => setOpen(open === s.key ? null : s.key)}
                  >
                    <div className="page-title" style={{ marginBottom: 4 }}>
                      <h3 className="text-title-3">{s.label}</h3>
                      {s.kind === "rate" && s.posterior && !thin && (
                        <span className="num" style={{ fontSize: 20 }}>
                          {Math.round(s.posterior.mean * 100)}%
                        </span>
                      )}
                      {s.kind === "latency" && s.median !== null && (
                        <span className="num" style={{ fontSize: 20 }}>
                          {s.median.toFixed(1)}h
                        </span>
                      )}
                    </div>

                    <p className="text-body">{s.reading}</p>

                    {/* The interval is the point. A wide band means we do not
                        know yet, and it should look like it. */}
                    {s.kind === "rate" && s.posterior && (
                      <div
                        aria-hidden
                        style={{
                          position: "relative",
                          height: 6,
                          borderRadius: 3,
                          background: "var(--porcelain)",
                          marginTop: 8,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: `${s.posterior.lo * 100}%`,
                            width: `${(s.posterior.hi - s.posterior.lo) * 100}%`,
                            top: 0,
                            bottom: 0,
                            borderRadius: 3,
                            background: thin
                              ? "var(--tiara)"
                              : "var(--signal, var(--electric))",
                            opacity: thin ? 0.6 : 1,
                          }}
                        />
                      </div>
                    )}

                    {open === s.key && (
                      <div style={{ marginTop: 10 }}>
                        <p className="text-caption">
                          Based on {s.n} observation{s.n === 1 ? "" : "s"}.
                          {s.opportunity_adjusted
                            ? " Counted against what you were actually offered, so nothing you were never asked to do can count against you."
                            : ""}
                        </p>
                        {s.peer_z !== null && Math.abs(s.peer_z) > 1 && (
                          <p className="text-caption">
                            {s.peer_z > 0 ? "Above" : "Below"} the usual range
                            for this club.
                          </p>
                        )}
                        {s.momentum !== null &&
                          Math.abs(s.momentum) > 0.15 && (
                            <p className="text-caption">
                              Recently {s.momentum > 0 ? "higher" : "lower"}{" "}
                              than your longer-run pattern.
                            </p>
                          )}
                      </div>
                    )}
                  </article>
                );
              })}
          </div>
        ),
      )}

      {waiting.length > 0 && (
        <p className="text-caption" style={{ marginTop: 20 }}>
          {waiting.length} more fill in once there is something to measure:{" "}
          {waiting.map((s) => s.label.toLowerCase()).join(", ")}.
        </p>
      )}
    </section>
  );
}

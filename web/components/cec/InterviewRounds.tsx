"use client";
import { useEffect, useState } from "react";

// Officer-facing interview scheduling. The screen exists to answer one
// question — can we actually run this round, and if not what do I change —
// so the capacity sentence is the headline and everything else is secondary.

type Feasibility = {
  demand: number;
  schedulable: number;
  short: number;
  panelSize: number;
  stranded: string[];
  noOverlap: string[];
  explanation: string;
  exact: boolean;
};
type Round = {
  id: string;
  name: string;
  stage: string;
  panel_size: number;
  candidates: number;
  assigned: number;
  feasibility: Feasibility | null;
};

export default function InterviewRounds() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<Record<string, any>>({});

  async function load() {
    const r = await fetch("/api/cec/interviews/state");
    const j = await r.json();
    if (!r.ok) throw Error(j.error);
    setRounds(j.rounds || []);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  async function post(path: string, body: any) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cec/interviews/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      return j;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function quickstart(stage: string, panelSize: number) {
    const j = await post("round/quickstart", {
      stage,
      panel_size: panelSize,
      from_application_stage: "submitted",
      default_cap: 3,
    });
    if (!j) return;
    setNote(
      `Seeded ${j.seeded.candidates} candidates, ${j.seeded.panelists} interviewers and ${j.seeded.availability_slots} open slots. ${j.needs}`,
    );
    await load().catch(() => {});
  }

  async function preview(id: string) {
    const j = await post("solve", { round_id: id });
    if (j) setPlan((p) => ({ ...p, [id]: j }));
  }
  async function commit(id: string) {
    const j = await post("solve", { round_id: id, commit: true });
    if (!j) return;
    setPlan((p) => ({ ...p, [id]: j }));
    setNote(`Scheduled ${j.placed} interviews.`);
    await load().catch(() => {});
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="text-title-2">Interview rounds</h2>
          <p className="text-caption">
            Candidates come from open applications, interviewers from the
            officer list, and availability from the slots you already post.
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() => quickstart("first", 1)}
          >
            Start first round
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => quickstart("second", 4)}
          >
            Start second round
          </button>
        </div>
      </header>

      {error && <div className="inline-alert">{error}</div>}
      {note && <p className="text-caption">{note}</p>}

      {!rounds.length && (
        <div className="empty">
          No rounds yet. Starting one pulls in everyone who has applied and
          tells you straight away whether you have the capacity to interview
          them.
        </div>
      )}

      {rounds.map((r) => {
        const f = r.feasibility;
        const p = plan[r.id];
        return (
          <article key={r.id} className="card" style={{ marginTop: 16 }}>
            <header className="page-title" style={{ marginBottom: 8 }}>
              <div>
                <p className="text-micro">
                  {r.stage} round · panel of {r.panel_size}
                </p>
                <h3 className="text-title-3">{r.name}</h3>
              </div>
              <div className="page-actions">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => preview(r.id)}
                >
                  Preview schedule
                </button>
                <button
                  className="btn primary"
                  disabled={busy || !f || f.schedulable === 0}
                  onClick={() => commit(r.id)}
                >
                  Schedule
                </button>
              </div>
            </header>

            {f && (
              <>
                {/* The one number that matters, stated as a sentence. */}
                <p className="text-hero" style={{ fontSize: 32, margin: "4px 0" }}>
                  {f.schedulable} of {f.demand}
                </p>
                <p className="text-body">{f.explanation}</p>
                {!f.exact && (
                  <p className="text-caption">
                    Panels of {f.panelSize} need everyone free at the same time,
                    so treat this as an upper bound until you schedule.
                  </p>
                )}
                {f.noOverlap.length > 0 && (
                  <p className="text-caption">
                    {f.noOverlap.length} candidate
                    {f.noOverlap.length === 1 ? "" : "s"} gave no times that
                    overlap any interviewer. Ask them for more.
                  </p>
                )}
              </>
            )}

            {p && (
              <div style={{ marginTop: 12 }}>
                <p className="text-label">
                  {p.placed} scheduled
                  {p.unplaced?.length ? `, ${p.unplaced.length} unplaced` : ""}
                  {p.committed ? " · saved" : " · preview only"}
                </p>
                {p.load && (
                  <ul className="text-caption">
                    {Object.entries(p.load as Record<string, number>)
                      .filter(([, n]) => n > 0)
                      .map(([who, n]) => (
                        <li key={who}>
                          {who.slice(0, 8)} · {n} interview{n === 1 ? "" : "s"}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

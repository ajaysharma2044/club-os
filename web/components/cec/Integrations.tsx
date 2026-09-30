"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Integrations — what is connected, what is not, and exactly who has to do what.
//
// THE RULE THIS SCREEN EXISTS TO KEEP: it never fabricates connected status.
// Not a hopeful badge, not a "Connect" button that throws when pressed. The
// backend distinguishes not_configured / configured_not_connected / connected /
// expired / unreadable, and this renders that distinction rather than
// flattening it to a green dot.
//
// So instead of a Connect button, each integration opens a CHECKLIST of the
// steps a human must perform, with the ones we can verify marked done — a step
// is done only when the value it produces is actually present in the
// environment. Everything else says it cannot be checked from here, because
// this server cannot see whether somebody configured a Google consent screen
// and pretending it can is the same class of lie as a fake connected badge.
//
// Scopes are shown with the justification for each, and refused scopes are
// shown too. A club officer handing over access is entitled to see that we
// asked for busy-intervals rather than calendar contents, and that reading
// anyone's DMs is on a list we refuse.

type Status = {
  id: string;
  name: string;
  category: string;
  auth: string;
  state: string;
  configured: boolean;
  connected: boolean;
  missingEnv: string[];
  presentEnv: string[];
  summary: string;
  nextStep: string;
  blockers: string[];
  humanSteps: number;
};
type Summary = {
  total: number;
  connected: number;
  configuredNotConnected: number;
  notConfigured: number;
  statement: string;
};
type Step = {
  by: string;
  what: string;
  where: string;
  produces?: string;
  caveat?: string;
  done: boolean;
  verifiable: boolean;
};
type Setup = {
  id: string;
  name: string;
  enables: string[];
  steps: Step[];
  env: { name: string; required: boolean; secret: boolean; what: string; present: boolean }[];
  scopes: { scope: string; why: string }[];
  forbiddenScopes: { scope: string; why: string }[];
  dataFlow: { outbound: string; inbound: string; neverMoves: string };
  blockers: string[];
  note: string;
};

const STATE_LABEL: Record<string, string> = {
  not_configured: "Not configured",
  configured_not_connected: "Configured, not connected",
  connected: "Connected",
  expired: "Expired",
  unreadable: "Unreadable",
};

const WHO: Record<string, string> = {
  founder: "you",
  club_officers: "a club officer",
  university: "the university",
  provider: "the provider",
};

const post = async (path: string, body: unknown) => {
  const r = await fetch(`/api/cec/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "That did not work.");
  return j;
};

export default function Integrations() {
  const [data, setData] = useState<{ summary: Summary; integrations: Status[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await post("integrations/status", {}));
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setupSequence = useRef(0);
  const [setupError, setSetupError] = useState("");
  const openSetup = async (id: string, retry = false) => {
    const request = ++setupSequence.current;
    setSetupError("");
    if (open === id && !retry) {
      setOpen(null);
      setSetup(null);
      return;
    }
    setOpen(id);
    setSetup(null);
    try {
      const result = await post("integrations/setup", { id });
      if (request === setupSequence.current) setSetup(result);
    } catch (e: any) {
      if (request === setupSequence.current) setSetupError(e.message);
    }
  };

  if (error && !data) return <div className="inline-alert" role="alert">{error}<button onClick={load}>Retry</button></div>;
  if (!data) return <div className="empty">Checking what is connected…</div>;

  const byCategory = data.integrations.reduce<Record<string, Status[]>>((acc, i) => {
    (acc[i.category] ||= []).push(i);
    return acc;
  }, {});

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="text-title-2">Integrations</h2>
          <p className="text-caption">{data.summary.statement}</p>
        </div>
        <span className="num">
          {data.summary.connected}/{data.summary.total}
        </span>
      </header>

      {Object.entries(byCategory).map(([category, items]) => (
        <div key={category} style={{ marginTop: 18 }}>
          <p className="text-micro" style={{ textTransform: "uppercase" }}>
            {category.replace(/_/g, " ")}
          </p>
          {items.map((i) => {
            const expanded = open === i.id;
            return (
              <article
                key={i.id}
                className="card"
                style={{
                  marginTop: 8,
                  transition: "border-color 180ms ease",
                  borderLeft: i.connected
                    ? "3px solid var(--shamrock, var(--signal))"
                    : i.configured
                      ? "3px solid var(--club-amber, var(--fire))"
                      : undefined,
                }}
              >
                <div className="page-title" style={{ marginBottom: 4 }}>
                  <h3 className="text-title-3">{i.name}</h3>
                  <span className="text-caption">{STATE_LABEL[i.state] || i.state}</span>
                </div>

                <p className="text-body">{i.summary}</p>
                <p className="text-caption">
                  <strong>Next:</strong> {i.nextStep}
                </p>

                {i.blockers.length > 0 && (
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {i.blockers.map((b, k) => (
                      <li key={k} className="text-caption" style={{ color: "var(--fire, var(--crimson))" }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="ghost"
                  style={{ marginTop: 8 }}
                  onClick={() => openSetup(i.id)}
                >
                  {expanded ? "Hide setup" : `Setup — ${i.humanSteps} human step${i.humanSteps === 1 ? "" : "s"}`}
                </button>

                {expanded && setupError && <div role="alert">{setupError} <button onClick={() => openSetup(i.id, true)}>Retry setup</button></div>}
                {expanded && !setup && !setupError && <p className="text-caption">Loading…</p>}
                {expanded && setup && (
                  <div style={{ marginTop: 10 }}>
                    <p className="text-caption">
                      <strong>Enables:</strong> {setup.enables.join("; ")}
                    </p>

                    <p className="text-micro" style={{ textTransform: "uppercase", marginTop: 10 }}>
                      Steps
                    </p>
                    <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {setup.steps.map((s, k) => (
                        <li key={k} className="text-caption" style={{ marginBottom: 4 }}>
                          <span style={{ opacity: s.done ? 0.55 : 1 }}>
                            {s.done && "✓ "}
                            <strong>{WHO[s.by] || s.by}:</strong> {s.what} <em>({s.where})</em>
                          </span>
                          {s.caveat && (
                            <span style={{ color: "var(--fire, var(--crimson))" }}> — {s.caveat}</span>
                          )}
                          {!s.verifiable && (
                            <span style={{ opacity: 0.6 }}> · cannot be checked from here</span>
                          )}
                        </li>
                      ))}
                    </ol>

                    <p className="text-micro" style={{ textTransform: "uppercase", marginTop: 10 }}>
                      Environment
                    </p>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {setup.env.map((e) => (
                        <li key={e.name} className="text-caption">
                          <code>{e.name}</code> {e.present ? "· set" : "· missing"}
                          {e.secret && " · secret"} — {e.what}
                        </li>
                      ))}
                    </ul>

                    {setup.scopes.length > 0 && (
                      <>
                        <p className="text-micro" style={{ textTransform: "uppercase", marginTop: 10 }}>
                          Access requested, and why
                        </p>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                          {setup.scopes.map((s) => (
                            <li key={s.scope} className="text-caption">
                              <code>{s.scope}</code> — {s.why}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {/* Refused scopes are shown deliberately. A club handing over
                        access is entitled to see what we will not ask for. */}
                    {setup.forbiddenScopes.length > 0 && (
                      <>
                        <p className="text-micro" style={{ textTransform: "uppercase", marginTop: 10 }}>
                          Refused
                        </p>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                          {setup.forbiddenScopes.map((s) => (
                            <li key={s.scope} className="text-caption">
                              <code>{s.scope}</code> — {s.why}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    <p className="text-caption" style={{ marginTop: 10 }}>
                      <strong>Out:</strong> {setup.dataFlow.outbound}
                      <br />
                      <strong>In:</strong> {setup.dataFlow.inbound}
                      <br />
                      <strong>Never leaves:</strong> {setup.dataFlow.neverMoves}
                    </p>

                    <p className="text-caption" style={{ marginTop: 8, opacity: 0.8 }}>
                      {setup.note}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ))}
    </section>
  );
}

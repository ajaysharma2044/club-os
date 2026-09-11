"use client";

import { useState } from "react";
import { hueVar, ledger, money, type Club } from "@/lib/data";

export function MoneyView({ club }: { club: Club }) {
  const [selected, setSelected] = useState(ledger[0]);
  const [analyze, setAnalyze] = useState(false);

  const spent = 2760;
  const left = 1240;
  const budget = 4000;

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Money</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            The club is the legal recipient. Not your Venmo.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={analyze ? "btn" : "btn ghost"}
            type="button"
            aria-pressed={analyze}
            onClick={() => setAnalyze((v) => !v)}
          >
            Analyze
          </button>
          <button className="btn primary" type="button">
            Record spend
          </button>
        </div>
      </div>

      <section className="section money-hero">
        <p className="text-caption" style={{ margin: "0 0 6px" }}>
          Left this semester
        </p>
        <div className="text-hero num">
          <span className="sym" style={{ color: "var(--n-11)", fontSize: 28 }}>
            $
          </span>
          {left.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </div>
        <div className="money-lines">
          <div className="money-line">
            <span>Spent</span>
            <span className="bar" aria-hidden>
              <span style={{ width: `${(spent / budget) * 100}%` }} />
            </span>
            <span className="money-col">
              <span className="sym">$</span>
              {spent.toFixed(2)}
              <span className="text-caption"> 68%</span>
            </span>
          </div>
          <div className="money-line">
            <span>Owed to you</span>
            <span className="text-caption">1 reimbursement, filed 3 days ago</span>
            <span className="money-col">
              <span className="sym">$</span>
              42.00
            </span>
          </div>
          <div className="money-line">
            <span>Next deadline</span>
            <span className="text-caption">SGA budget request</span>
            <span className="money-col" style={{ width: "auto" }}>
              Oct 14
            </span>
          </div>
        </div>
      </section>

      {analyze && (
        <section className="section">
          <h2 className="text-title-2">If you keep this pace</h2>
          <p className="text-caption">
            Off unless you ask. This is a projection from posted spend, not a promise.
          </p>
          <dl className="stat-strip">
            <div className="stat">
              <dt>Burn through finals</dt>
              <dd>$1,090 left</dd>
            </div>
            <div className="stat">
              <dt>Food vs similar teams</dt>
              <dd>High</dd>
            </div>
            <div className="stat">
              <dt>Competition weekend</dt>
              <dd>Unfunded</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="text-title-2">Ledger</h2>
          <span className="text-caption">Append-only. Corrections are new rows.</span>
        </div>
        <div className="card panel">
          <div>
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Line</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row)}
                    style={{
                      background:
                        selected.id === row.id ? "var(--n-2)" : undefined,
                      cursor: "pointer",
                    }}
                  >
                    <td className="num">{row.date}</td>
                    <td>{row.payee}</td>
                    <td className="muted">{row.line}</td>
                    <td className={row.amount < 0 ? "num money-col neg" : "num"}>
                      <span className="sym">$</span>
                      {money(row.amount)}
                    </td>
                    <td>
                      {row.status === "posted" && <span className="badge">Posted</span>}
                      {row.status === "pending" && (
                        <span className="badge warn">Needs you</span>
                      )}
                      {row.status === "owed" && <span className="badge">Owed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Cash on hand</td>
                  <td className="num">
                    <span className="sym">$</span>
                    1,240.00
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <aside className="panel-side" aria-label="Provenance">
            <div className="text-micro muted">HOW WE KNOW</div>
            <h3 className="text-title-3" style={{ margin: "8px 0 12px" }}>
              {selected.payee}
            </h3>
            <p style={{ margin: "0 0 16px" }}>
              <span className={selected.amount < 0 ? "money-col neg" : "money-col"}>
                <span className="sym">$</span>
                {money(selected.amount)}
              </span>
              <span className="muted"> · {selected.line}</span>
            </p>
            <ol className="trail">
              <li>
                <strong>Recorded</strong>
                {selected.date} 2026, by the ledger · {selected.id}
              </li>
              <li>
                <strong>Receipt</strong>
                {selected.id === "LE-1842"
                  ? "Attached, uploaded Sep 2 by Dev Shah"
                  : "On file"}
              </li>
              <li>
                <strong>Approval</strong>
                {selected.status === "pending"
                  ? "Waiting on Maya Okonkwo, second signer"
                  : "Maya Okonkwo and Dev Shah"}
              </li>
              <li>
                <strong>Budget line</strong>
                {selected.line}
              </li>
            </ol>
            {selected.status === "pending" && (
              <button
                className="btn primary"
                type="button"
                style={{ marginTop: 16, width: "100%" }}
              >
                Sign as treasurer
              </button>
            )}
            <p className="text-caption" style={{ marginTop: 16 }}>
              <span
                className="identity"
                style={{
                  background: hueVar(club.hue),
                  display: "inline-block",
                  width: 3,
                  height: 12,
                  marginRight: 8,
                  verticalAlign: "middle",
                }}
              />
              Club color marks the club. It never fills a button.
            </p>
          </aside>
        </div>
      </section>
    </>
  );
}

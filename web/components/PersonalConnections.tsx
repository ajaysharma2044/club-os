"use client";

import { useState } from "react";
import {
  personalConnections,
  statusBadge,
  statusLabel,
  type PersonalConnection,
} from "@/lib/integrations";

export function PersonalConnections() {
  const [rows, setRows] = useState(personalConnections);
  const [pending, setPending] = useState<PersonalConnection | null>(null);

  function toggle(row: PersonalConnection) {
    setRows((prev) =>
      prev.map((item) =>
        item.id === row.id
          ? { ...item, status: item.status === "connected" ? "off" : "connected" }
          : item,
      ),
    );
    setPending(null);
  }

  return (
    <section className="section">
      <h2 className="text-title-2">Your connections</h2>
      <p className="text-caption" style={{ margin: "4px 0 12px" }}>
        These belong to you, not a club. Club Stripe and Drive live under that
        club’s Settings.
      </p>
      <hr className="rule" />
      <div className="integ-list">
        {rows.map((row) => (
          <article key={row.id} className="integ">
            <div className="integ-head">
              <div className="integ-select" style={{ cursor: "default" }}>
                <div className="integ-title-row">
                  <div className="row-title">{row.name}</div>
                  <span className={statusBadge(row.status)}>{statusLabel(row.status)}</span>
                </div>
                <p className="text-caption integ-writes">{row.value}</p>
                <p className="text-caption">{row.writes}</p>
              </div>
              <div className="integ-actions">
                {row.status === "connected" ? (
                  <button className="btn ghost" type="button" onClick={() => setPending(row)}>
                    Disconnect
                  </button>
                ) : (
                  <button className="btn primary" type="button" onClick={() => toggle(row)}>
                    Connect
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {pending && (
        <div className="kbar-scrim" onMouseDown={() => setPending(null)}>
          <div
            className="confirm"
            role="alertdialog"
            aria-labelledby="you-disconnect-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-title-2" id="you-disconnect-title">
              Disconnect {pending.name}?
            </h3>
            <p className="text-caption">
              Clubs lose this path to you. Your positions and attendance stay on
              the record.
            </p>
            <div className="integ-actions" style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={() => setPending(null)}>
                Keep connected
              </button>
              <button className="btn primary" type="button" onClick={() => toggle(pending)}>
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

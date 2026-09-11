"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  authorizingOffice,
  integrationsFor,
  statusBadge,
  statusLabel,
  type ClubIntegration,
  type IntegStatus,
} from "@/lib/integrations";

type Filter = "all" | IntegStatus;

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "connected", label: "Connected" },
  { id: "action", label: "Action needed" },
  { id: "off", label: "Off" },
];

function officeFallback(slug: string) {
  if (slug === "baja") return "Treasurer";
  if (slug === "hacknight") return "Director";
  if (slug === "herald") return "Editor";
  return "President";
}

export function IntegrationsPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const focus = searchParams.get("integration");

  const [rows, setRows] = useState(() => integrationsFor(slug));
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(focus);
  const [pending, setPending] = useState<ClubIntegration | null>(null);

  useEffect(() => {
    setRows(integrationsFor(slug));
    setFilter("all");
    setPending(null);
  }, [slug]);

  useEffect(() => {
    setOpenId(focus);
    if (focus) {
      document.getElementById("integrations")?.scrollIntoView({ block: "start" });
    }
  }, [focus]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) => row.status === filter);
  }, [filter, rows]);

  function setFocus(id: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("integration", id);
    else next.delete("integration");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    setOpenId(id);
  }

  function patch(id: string, update: Partial<ClubIntegration>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...update } : row)));
  }

  function connect(row: ClubIntegration) {
    const office = authorizingOffice(row) ?? officeFallback(slug);
    if (row.id === "mirrors") {
      patch(row.id, {
        status: "mirror",
        lastSync: "just now",
        office,
        actionLabel: "Keep as mirror",
      });
      return;
    }
    patch(row.id, {
      status: "connected",
      lastSync: "just now",
      office,
      actionLabel: "Review",
    });
  }

  function review(row: ClubIntegration) {
    if (row.status === "off") {
      connect(row);
      return;
    }
    if (row.status === "action") {
      const office = row.office ?? officeFallback(slug);
      const settled: Partial<ClubIntegration> = {
        status: "connected",
        lastSync: "just now",
        office,
        actionLabel: "Review",
      };
      if (row.id === "stripe") {
        settled.detail =
          "Second signer recorded for the President’s office. EIN stays on the club. Agent-of-payee unchanged. We still do not custody funds.";
      }
      if (row.id === "drive") {
        settled.detail =
          "Import staged into the club vault. The insurance cert still needs a person to upload it — Drive cannot transfer the file.";
      }
      if (row.id === "groupme") {
        settled.detail =
          "Numbers written to People. Inbox is the chat. GroupMe is archive only.";
      }
      if (row.id === "bank") {
        settled.detail =
          "Payout destination is on the club EIN. Stripe settles to the club. Not a sponsor.";
      }
      if (row.id === "calendar") {
        settled.detail =
          "Club calendar connected. We write only to the calendar we created. Free/busy in, titles stay here.";
      }
      patch(row.id, settled);
      return;
    }
    setFocus(openId === row.id ? null : row.id);
  }

  function disconnect(row: ClubIntegration) {
    patch(row.id, {
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: row.id === "mirrors" ? "Enable fan-out" : "Connect",
    });
    setPending(null);
  }

  return (
    <section className="section" id="integrations">
      <div className="section-head">
        <div>
          <h2 className="text-title-2">Integrations</h2>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            The club owns the bytes. The office keeps the connection. A graduating
            account cannot take Stripe or Drive with it.
          </p>
        </div>
      </div>

      <div className="views" role="tablist" aria-label="Filter integrations">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="integ-list">
        {visible.map((row) => {
          const open = openId === row.id;
          const office = authorizingOffice(row);
          return (
            <article
              key={row.id}
              className="integ"
              data-open={open}
              id={`integration-${row.id}`}
            >
              <div className="integ-head">
                <button
                  type="button"
                  className="integ-select"
                  aria-expanded={open}
                  onClick={() => setFocus(open ? null : row.id)}
                >
                  <div className="integ-title-row">
                    <div className="row-title">{row.name}</div>
                    <span className={statusBadge(row.status)}>{statusLabel(row.status)}</span>
                  </div>
                  <p className="text-caption integ-writes">{row.writes}</p>
                  <p className="text-caption">
                    {`${office ? `Authorized by ${office}` : "No office yet"} · ${row.lastSync ? `Last sync ${row.lastSync}` : "Never synced"}`}
                  </p>
                </button>
                <div className="integ-actions">
                  {row.status === "off" ? (
                    <button className="btn primary" type="button" onClick={() => connect(row)}>
                      {row.actionLabel}
                    </button>
                  ) : (
                    <button className="btn" type="button" onClick={() => review(row)}>
                      {row.status === "mirror" ? row.actionLabel : row.actionLabel}
                    </button>
                  )}
                  {row.status !== "off" && (
                    <button className="btn ghost" type="button" onClick={() => setPending(row)}>
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
              {open && (
                <div className="integ-body">
                  <p style={{ margin: 0 }}>
                    {row.detail}
                  </p>
                </div>
              )}
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            Nothing in this state.
          </p>
        )}
      </div>

      {pending && (
        <div className="kbar-scrim" onMouseDown={() => setPending(null)}>
          <div
            className="confirm"
            role="alertdialog"
            aria-labelledby="integ-disconnect-title"
            aria-describedby="integ-disconnect-copy"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-title-2" id="integ-disconnect-title">
              Disconnect {pending.name}?
            </h3>
            <p className="text-caption" id="integ-disconnect-copy">
              The record stays. The office can reconnect. A graduating login
              still cannot take these bytes with it.
            </p>
            <div className="integ-actions" style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={() => setPending(null)}>
                Keep connected
              </button>
              <button className="btn primary" type="button" onClick={() => disconnect(pending)}>
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

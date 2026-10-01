"use client";
import Link from "next/link";
import { usePortal } from "./usePortal";
import { useState } from "react";
import type { Portal } from "./usePortal";
import {
  Frame,
  PortalDialog,
  options,
  field,
  select,
  dateLabel,
  type RecordRow,
} from "./shared";
export function ClubRequests() {
  const p = usePortal(),
    [filter, setFilter] = useState("open"),
    [type, setType] = useState("All"),
    [create, setCreate] = useState<string | null>(null),
    [review, setReview] = useState<RecordRow | null>(null);
  const user = p.data?.user,
    officer = user?.role === "officer";
  const types = [
    "Reimbursement",
    "Attendance correction",
    "Equipment",
    "Event proposal",
    "Other",
  ];
  const rows = (p.data?.requests || []).filter(
    (r: RecordRow) =>
      (filter === "all" ||
        (filter === "open"
          ? !["approved", "declined", "cancelled"].includes(r.status!)
          : r.status === filter)) &&
      (type === "All" || r.data.type === type),
  );
  return (
    <Frame
      title={officer ? "Club request review" : "Your requests"}
      description="Submit a request and follow its status. Approval records a decision; it does not send money, reserve equipment or change attendance automatically."
      p={p}
    >
      {!user || user.role === "applicant" ? (
        <p>
          Requests are available to club members.{" "}
          <Link href="/you">View your account</Link>.
        </p>
      ) : (
        <>
          <div className="portal-toolbar">
            <label>
              Status
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {options([
                  "open",
                  "all",
                  "submitted",
                  "in_review",
                  "needs_info",
                  "approved",
                  "declined",
                  "cancelled",
                ]).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {options(["All", ...types]).map((o) => (
                  <option key={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <button
              className="button"
              onClick={() => setCreate(crypto.randomUUID())}
            >
              New request
            </button>
          </div>
          {!rows.length && (
            <p className="portal-empty">No requests in this view.</p>
          )}
          <div className="portal-stack">
            {rows.map((r: RecordRow) => (
              <article className="portal-card" key={r.id}>
                <small>
                  {r.data.type} · {r.status?.replaceAll("_", " ")} ·{" "}
                  {dateLabel(r.created_at)}
                </small>
                <h2>{r.data.title}</h2>
                {officer && (
                  <p>
                    From{" "}
                    {p.data.people.find((x: any) => x.id === r.owner)?.name ||
                      "Club member"}
                  </p>
                )}
                <p className="portal-prose">{r.data.description}</p>
                {r.data.amount != null && (
                  <p>
                    Requested amount: ${Number(r.data.amount).toFixed(2)} USD
                  </p>
                )}
                {r.data.url && (
                  <a href={r.data.url} rel="noreferrer" target="_blank">
                    Supporting link
                  </a>
                )}
                <details>
                  <summary>Request history ({r.history?.length || 0})</summary>
                  {r.history?.map((h: any, i: number) => (
                    <div className="portal-history" key={i}>
                      <strong>{h.status.replaceAll("_", " ")}</strong>
                      <small>{dateLabel(h.at)}</small>
                      <p className="portal-prose">{h.note}</p>
                    </div>
                  ))}
                </details>
                {!["approved", "declined", "cancelled"].includes(r.status!) &&
                  (officer || r.owner === user.id) && (
                    <button
                      className="button secondary"
                      onClick={() => setReview(r)}
                    >
                      {r.owner === user.id
                        ? "Respond or cancel"
                        : "Review request"}
                    </button>
                  )}
              </article>
            ))}
          </div>
          {create && (
            <RequestDialog
              requestKey={create}
              close={() => setCreate(null)}
              p={p}
            />
          )}
          {review && (
            <PortalDialog
              title={
                review.owner === user.id
                  ? "Update your request"
                  : "Review request"
              }
              close={() => setReview(null)}
              fields={[
                select(
                  "status",
                  "Next status",
                  review.owner === user.id
                    ? review.status === "needs_info"
                      ? ["submitted", "cancelled"]
                      : ["cancelled"]
                    : [
                        "in_review",
                        "needs_info",
                        "approved",
                        "declined",
                      ].filter((s) => s !== review.status),
                ),
                field(
                  "note",
                  review.owner === user.id
                    ? "Reply or cancellation reason"
                    : "Decision / feedback",
                  "",
                  "textarea",
                ),
              ]}
              onSave={(d) =>
                p.save("request/update", {
                  ...d,
                  id: review.id,
                  version: review.version,
                })
              }
            />
          )}
        </>
      )}
    </Frame>
  );
}
function RequestDialog({
  requestKey,
  close,
  p,
}: {
  requestKey: string;
  close: () => void;
  p: Portal;
}) {
  return (
    <PortalDialog
      title="New club request"
      close={close}
      fields={[
        select("type", "Request type", [
          "Reimbursement",
          "Attendance correction",
          "Equipment",
          "Event proposal",
          "Other",
        ]),
        field("title", "Title"),
        field(
          "description",
          "Details — include event/date or equipment where relevant",
          "",
          "textarea",
        ),
        {
          ...field(
            "amount",
            "Amount in USD (reimbursements only)",
            "",
            "number",
            false,
          ),
          step: "0.01",
        },
        field("url", "Supporting HTTPS link (optional)", "", "url", false),
      ]}
      onSave={(d) =>
        p.save("request/create", { ...d, request_key: requestKey })
      }
    />
  );
}

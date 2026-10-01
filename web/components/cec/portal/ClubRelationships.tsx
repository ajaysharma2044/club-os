"use client";
import Link from "next/link";
import { usePortal } from "./usePortal";
import { useEffect, useState } from "react";
import { localDateTime } from "../frontendState";
import {
  Frame,
  PortalDialog,
  options,
  field,
  select,
  dateLabel,
  type RecordRow,
} from "./shared";
export function ClubRelationships() {
  const p = usePortal(),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState("All"),
    [target, setTarget] = useState(""),
    [editing, setEditing] = useState<RecordRow | null | undefined>();
  useEffect(() => {
    const person = new URLSearchParams(window.location.search).get("person");
    if (person) setTarget("person:" + person);
  }, []);
  const contacts = p.data?.contacts || [],
    people = p.data?.people || [],
    officers = people.filter((r: any) => r.role === "officer");
  const targets = [
    ...contacts.map((r: RecordRow) => ({
      value: "contact:" + r.id,
      label: r.data.title,
      kind: r.data.relationship,
      detail: `${r.data.organization} ${r.data.email || ""} ${r.data.notes || ""}`,
    })),
    ...people.map((r: any) => ({
      value: "person:" + r.id,
      label: r.name,
      kind: r.role,
      detail: r.profile?.committee || "",
    })),
  ];
  const selected = targets.find((r) => r.value === target);
  const records = (p.data?.followups || []).filter(
    (r: RecordRow) =>
      target ===
      (r.person_id ? "person:" + r.person_id : "contact:" + r.contact_id),
  );
  const filtered = targets.filter(
    (r) =>
      (kind === "All" || r.kind === kind) &&
      `${r.label} ${r.detail}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Frame
      title="Relationships & follow-ups"
      description="Officer-only contact context, commitments and reminders. Inbox conversations are never imported here."
      p={p}
    >
      {p.data?.user?.role !== "officer" ? (
        <p>Officer access is required.</p>
      ) : (
        <>
          <div className="portal-toolbar">
            <label>
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, organization or context"
              />
            </label>
            <label>
              Relationship
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {options([
                  "All",
                  "Sponsor",
                  "Mentor",
                  "Alumni",
                  "Employer",
                  "Vendor",
                  "member",
                  "officer",
                  "applicant",
                ]).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <Link className="button secondary" href="/clubs/cec/money">
              Add or edit contacts & sponsorships
            </Link>
          </div>
          <div className="portal-split">
            <div>
              <h2>People & contacts</h2>
              {filtered.length ? (
                <label>
                  Choose a record
                  <select
                    size={Math.min(10, Math.max(3, filtered.length))}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="" disabled>
                      Select a person or contact
                    </option>
                    {filtered.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label} — {r.kind}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p>No matching people or contacts.</p>
              )}
              <h3>Open follow-ups</h3>
              {!(p.data.followups || []).some(
                (r: RecordRow) => r.data.status === "open",
              ) && <p>No open follow-ups.</p>}
              {(p.data.followups || [])
                .filter((r: RecordRow) => r.data.status === "open")
                .sort(
                  (a: RecordRow, b: RecordRow) =>
                    (Date.parse(a.data.due_at) || Infinity) -
                    (Date.parse(b.data.due_at) || Infinity),
                )
                .map((r: RecordRow) => (
                  <button
                    className="portal-reminder"
                    key={r.id}
                    onClick={() =>
                      setTarget(
                        r.person_id
                          ? "person:" + r.person_id
                          : "contact:" + r.contact_id,
                      )
                    }
                  >
                    {r.data.title}
                    <small>{dateLabel(r.data.due_at)}</small>
                  </button>
                ))}
            </div>
            <section>
              {!selected ? (
                <p>Select a person or contact to see their history.</p>
              ) : (
                <>
                  <h2>{selected.label}</h2>
                  <p>{selected.kind}</p>
                  <p className="portal-prose">{selected.detail}</p>
                  <button className="button" onClick={() => setEditing(null)}>
                    Add follow-up
                  </button>
                  {records.length === 0 && <p>No recorded follow-ups yet.</p>}
                  {records.map((r: RecordRow) => (
                    <article className="portal-card" key={r.id}>
                      <h3>{r.data.title}</h3>
                      <small>
                        {r.data.status} · {dateLabel(r.data.due_at)}
                      </small>
                      <p>
                        Owner:{" "}
                        {people.find((x: any) => x.id === r.owner)?.name ||
                          "Former officer"}
                      </p>
                      <p className="portal-prose">{r.data.note}</p>
                      <details>
                        <summary>History</summary>
                        {r.data.history.map((h: any, i: number) => (
                          <div key={i} className="portal-history">
                            <small>
                              {dateLabel(h.at)} · {h.status}
                            </small>
                            <p>{h.note}</p>
                          </div>
                        ))}
                      </details>
                      <button
                        className="button secondary"
                        onClick={() => setEditing(r)}
                      >
                        Update follow-up
                      </button>
                    </article>
                  ))}
                </>
              )}
            </section>
          </div>
          {editing !== undefined && selected && (
            <PortalDialog
              title={editing ? "Update follow-up" : "Add follow-up"}
              close={() => setEditing(undefined)}
              fields={[
                field("title", "Next action / commitment", editing?.data.title),
                field(
                  "note",
                  "Relationship note or update",
                  editing?.data.note,
                  "textarea",
                ),
                {
                  key: "owner",
                  label: "Responsible officer",
                  options: officers.map((r: any) => ({
                    value: r.id,
                    label: r.name,
                  })),
                  value: editing?.owner || p.data.user.id,
                },
                field(
                  "due_at",
                  "Follow-up date (optional)",
                  editing?.data.due_at
                    ? localDateTime(new Date(editing.data.due_at))
                    : "",
                  "datetime-local",
                  false,
                ),
                select(
                  "status",
                  "Status",
                  ["open", "done"],
                  editing?.data.status,
                ),
              ]}
              onSave={(d) =>
                p.save("followup/save", {
                  ...d,
                  id: editing?.id,
                  version: editing?.version || 0,
                  person_id: target.startsWith("person:")
                    ? target.slice(7)
                    : null,
                  contact_id: target.startsWith("contact:")
                    ? target.slice(8)
                    : null,
                })
              }
            />
          )}
        </>
      )}
    </Frame>
  );
}

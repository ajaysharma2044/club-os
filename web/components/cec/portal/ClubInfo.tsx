"use client";
import Link from "next/link";
import { usePortal } from "./usePortal";
import { useState } from "react";
import {
  Frame,
  PortalDialog,
  options,
  field,
  select,
  dateLabel,
  type RecordRow,
} from "./shared";
export function ClubInfo() {
  const p = usePortal(),
    [filter, setFilter] = useState("All"),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState<RecordRow | null | undefined>();
  const officer = p.data?.user?.role === "officer";
  const rows = (p.data?.content || []).filter(
    (r: RecordRow) =>
      (filter === "All" || r.data.kind === filter) &&
      `${r.data.title} ${r.data.body}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Frame
      title="Club info & resources"
      description="Learn about the club, find people to contact, and get the documents you need."
      p={p}
    >
      <div className="portal-toolbar">
        <label>
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search information and resources"
          />
        </label>
        <label>
          Category
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {options([
              "All",
              "About",
              "Leadership",
              "Recruitment",
              "FAQ",
              "Announcement",
              "Resource",
            ]).map((o) => (
              <option key={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        {officer && (
          <button className="button" onClick={() => setEditing(null)}>
            Add information
          </button>
        )}
      </div>
      {!rows.length && (
        <p className="portal-empty">
          No information matches this view.
          {officer
            ? " Add a club introduction, announcement or resource."
            : " Check back for updates."}
        </p>
      )}
      <div className="portal-grid">
        {rows.map((r: RecordRow) => (
          <article className="portal-card" key={r.id}>
            <small>
              {r.data.kind}
              {officer ? ` · ${r.data.visibility} · ${r.data.status}` : ""}
            </small>
            <h2>{r.data.title}</h2>
            <p className="portal-prose">{r.data.body}</p>
            {r.data.url && (
              <a
                className="button secondary"
                href={r.data.url}
                target="_blank"
                rel="noreferrer"
              >
                Open linked resource
              </a>
            )}
            <small>Updated {dateLabel(r.updated_at)}</small>
            {officer && (
              <button
                className="button secondary"
                onClick={() => setEditing(r)}
              >
                Edit {r.data.title}
              </button>
            )}
          </article>
        ))}
      </div>
      {!p.data?.user && (
        <p>
          <Link href="/you">Sign in</Link> for member resources.
        </p>
      )}
      {editing !== undefined && (
        <PortalDialog
          title={editing ? "Edit club information" : "Add club information"}
          close={() => setEditing(undefined)}
          fields={[
            select(
              "kind",
              "Category",
              [
                "About",
                "Leadership",
                "Recruitment",
                "FAQ",
                "Announcement",
                "Resource",
              ],
              editing?.data.kind,
            ),
            field("title", "Title", editing?.data.title),
            field("body", "Details", editing?.data.body, "textarea"),
            field(
              "url",
              "HTTPS link (optional)",
              editing?.data.url,
              "url",
              false,
            ),
            select(
              "visibility",
              "Who can read this",
              ["club", "public"],
              editing?.data.visibility,
            ),
            select(
              "status",
              "Publication status",
              ["draft", "published", "archived"],
              editing?.data.status,
            ),
          ]}
          onSave={(d) =>
            p.save("content/save", {
              ...d,
              id: editing?.id,
              version: editing?.version || 0,
            })
          }
        />
      )}
    </Frame>
  );
}

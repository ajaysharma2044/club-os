"use client";

import { useMemo, useState } from "react";
import type { Person } from "@/lib/data";
import { mergeRoster } from "@/lib/join";
import { useJoinState } from "@/lib/useJoin";

export function RosterTable({ slug, people }: { slug: string; people: Person[] }) {
  const { state } = useJoinState();
  const roster = useMemo(() => mergeRoster(slug, people, state), [slug, people, state]);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return roster;
    return roster.filter((p) =>
      `${p.name} ${p.role} ${p.year}`.toLowerCase().includes(needle)
    );
  }, [roster, q]);

  const active = filtered.filter((p) => p.status === "active");
  const alumni = filtered.filter((p) => p.status === "alumni");

  return (
    <>
      <div className="toolbar">
        <input
          className="input"
          placeholder="Filter the roster"
          aria-label="Filter the roster"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Year</th>
              <th>Dues</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {active.map((p) => (
              <tr key={p.name}>
                <td className="text-body-strong">{p.name}</td>
                <td>{p.role}</td>
                <td>{p.year}</td>
                <td>
                  {p.dues === "paid" && <span className="badge ok">Paid</span>}
                  {p.dues === "owed" && <span className="badge warn">Owed</span>}
                  {p.dues === "n/a" && <span className="badge">—</span>}
                </td>
                <td className="muted">{p.last}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {alumni.length > 0 && (
        <section className="section" style={{ marginTop: 32 }}>
          <h2 className="text-title-2">Alumni</h2>
          <p className="text-caption">Same person. The membership ended. The record did not.</p>
          <div className="event-list stack" style={{ marginTop: 10 }}>
            {alumni.map((p) => (
              <div key={p.name} className="person-row">
                <span className="avatar">{p.initials}</span>
                <div className="grow">
                  <span className="row-title">{p.name}</span>
                  <span className="muted"> · {p.role}</span>
                </div>
                <div className="meta-col">{p.last}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

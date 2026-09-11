"use client";

import Link from "next/link";
import type { ClubHue, Person } from "@/lib/data";
import { mergeRoster } from "@/lib/join";
import { useJoinState } from "@/lib/useJoin";

export function ClubRosterPreview({
  slug,
  hue,
  people,
}: {
  slug: string;
  hue: ClubHue;
  people: Person[];
}) {
  const { state } = useJoinState();
  const list = mergeRoster(slug, people, state).slice(0, 4);

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="text-title-2">On the roster</h2>
        <Link href={`/clubs/${slug}/people`} className="text-caption">
          {mergeRoster(slug, people, state).length} people
        </Link>
      </div>
      <div className="event-list">
        {list.map((p) => (
          <div key={p.name} className="person-row">
            <span className="avatar" style={{ background: `var(--${hue}-tint)` }}>
              {p.initials}
            </span>
            <div className="grow">
              <span className="row-title">{p.name}</span>
              <span className="muted"> · {p.role}</span>
            </div>
            <div className="meta-col">{p.last}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

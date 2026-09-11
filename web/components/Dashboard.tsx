"use client";

import Link from "next/link";
import { LiveStamp, WriteIn } from "@/components/Presence";
import { clubs, hueVar, needs, tasks } from "@/lib/data";

const nextByClub: Record<string, string> = {
  baja: "Shop hours · tonight 7:00",
  consulting: "Interviews · Thu 6:00",
  hacknight: "Fall Hack · Sat 9:00",
  herald: "Print deadline · Fri 11:00",
};

const owed = [
  ...needs.map((item) => ({
    key: item.title,
    title: item.title,
    detail: item.detail,
    href: item.href,
    club: item.club,
    due: null as string | null,
  })),
  ...tasks.map((task) => ({
    key: task.title,
    title: task.title,
    detail: task.origin,
    href: `/clubs/${task.club}/workspace`,
    club: task.club,
    due: task.due,
  })),
];

export function Dashboard() {
  const [first, ...rest] = owed;

  return (
    <>
      <section className="codex-hero">
        <span className="orbit" aria-hidden />
        <h1 className="display">Club OS</h1>
        <p className="lede">
          The record for college clubs.
          <LiveStamp />
        </p>
        <div className="hero-pills">
          {first && (
            <Link href={first.href} className="pill">
              Do this next
            </Link>
          )}
          <Link href="/chat" className="pill solid">
            Text the group
          </Link>
        </div>
      </section>

      <div className="product-window">
        {first && (
          <section className="hero-need" aria-label="What you owe">
            <p className="text-micro">You owe</p>
            <WriteIn text={first.title} />
            <p className="text-caption">
              {clubs.find((c) => c.slug === first.club)?.short}
              {first.due ? ` · ${first.due}` : ""}
              {first.detail ? ` · ${first.detail}` : ""}
            </p>
          </section>
        )}

        {rest.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2 className="text-title-2">Also open</h2>
              <span className="text-caption">{rest.length} more</span>
            </div>
            <div className="need-list stack">
              {rest.map((item) => {
                const club = clubs.find((c) => c.slug === item.club)!;
                return (
                  <Link key={item.key} href={item.href} className="need-item">
                    <span className="identity" style={{ background: hueVar(club.hue) }} />
                    <div className="grow">
                      <div className="row-title">{item.title}</div>
                      <div className="text-caption">
                        {club.short}
                        {item.due ? ` · ${item.due}` : ""}
                        {item.detail ? ` · ${item.detail}` : ""}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section className="section">
          <div className="section-head">
            <h2 className="text-title-2">Your clubs</h2>
          </div>
          <div className="card-grid">
            {clubs.map((club) => (
              <article key={club.slug} className="dash-card">
                <Link href={`/clubs/${club.slug}`} className="dash-band">
                  <span className="club-chip" style={{ background: hueVar(club.hue) }} />
                  <strong>{club.name}</strong>
                  <span>Fall 2026 · {club.members} members</span>
                </Link>
                <Link href={`/clubs/${club.slug}`} className="dash-body">
                  <div className="role">{club.role}</div>
                  <div className="next">{nextByClub[club.slug]}</div>
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

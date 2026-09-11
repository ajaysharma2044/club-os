"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarBlank,
  FolderSimple,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import { clubs, hueVar, needs, tasks, week } from "@/lib/data";

const nextByClub: Record<string, string> = {
  baja: "Shop hours · tonight 7:00",
  consulting: "Interviews · Thu 6:00",
  hacknight: "Fall Hack · Sat 9:00",
  herald: "Print deadline · Fri 11:00",
};

export function Dashboard() {
  const [view, setView] = useState<"cards" | "list" | "activity">("cards");

  return (
    <>
      <div className="page-title" style={{ marginTop: 20 }}>
        <h1 className="text-title-1">Dashboard</h1>
        <div className="views" role="tablist" aria-label="Dashboard view">
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            type="button"
            aria-pressed={view === "activity"}
            onClick={() => setView("activity")}
          >
            Recent Activity
          </button>
        </div>
      </div>

      {view === "cards" && (
        <div className="card-grid">
          {clubs.map((club) => (
            <article key={club.slug} className="dash-card">
              <Link href={`/clubs/${club.slug}`} className="dash-band" style={{ background: hueVar(club.hue) }}>
                <strong>{club.name}</strong>
                <span>Fall 2026 · {club.members} members</span>
              </Link>
              <div className="dash-body">
                <div className="role">{club.role}</div>
                <div className="next">{nextByClub[club.slug]}</div>
              </div>
              <div className="dash-tabs">
                <Link href={`/clubs/${club.slug}/events`} aria-label={`${club.short} events`}>
                  <CalendarBlank size={18} weight="regular" />
                </Link>
                <Link href={`/clubs/${club.slug}/people`} aria-label={`${club.short} people`}>
                  <Users size={18} weight="regular" />
                </Link>
                <Link href={`/clubs/${club.slug}/money`} aria-label={`${club.short} money`}>
                  <Wallet size={18} weight="regular" />
                </Link>
                <Link href={`/clubs/${club.slug}/workspace`} aria-label={`${club.short} files`}>
                  <FolderSimple size={18} weight="regular" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="event-list stack">
          {week.map((item) => {
            const club = clubs.find((c) => c.slug === item.club)!;
            return (
              <Link
                key={`${item.club}-${item.title}`}
                href={`/clubs/${club.slug}/events`}
                className="event-row"
              >
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <div className="time-col">{item.when}</div>
                <div className="grow">
                  <span className="row-title">{item.title}</span>
                  <span className="muted"> · {club.short}</span>
                </div>
                <div className="meta-col">{item.going}</div>
              </Link>
            );
          })}
        </div>
      )}

      {view === "activity" && (
        <div className="need-list stack">
          {needs.map((item) => {
            const club = clubs.find((c) => c.slug === item.club)!;
            return (
              <Link key={item.title} href={item.href} className="need-item">
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <div className="grow">
                  <div className="row-title">{item.title}</div>
                  <div className="text-caption">
                    {club.short} · {item.detail}
                  </div>
                </div>
              </Link>
            );
          })}
          {tasks.map((task) => {
            const club = clubs.find((c) => c.slug === task.club)!;
            return (
              <Link
                key={task.title}
                href={`/clubs/${club.slug}/workspace`}
                className="need-item"
              >
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <div className="grow">
                  <div className="row-title">{task.title}</div>
                  <div className="text-caption">
                    {club.short} · {task.origin}
                  </div>
                </div>
                <div className="meta-col">{task.due}</div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

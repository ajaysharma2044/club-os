import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClubOfficerWork } from "@/components/ClubOfficerWork";
import { ClubRosterPreview } from "@/components/ClubRosterPreview";
import { JoinedNote } from "@/components/JoinedNote";
import {
  clubBySlug,
  events,
  hueVar,
  minutes,
  needs,
  roster,
  tasks,
} from "@/lib/data";

export default async function ClubHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = clubBySlug(slug);
  if (!club) notFound();

  const clubEvents = events[slug as keyof typeof events] ?? [];
  const people = roster[slug] ?? [];
  const clubNeeds = needs.filter((n) => n.club === slug);
  const clubTasks = tasks.filter((t) => t.club === slug);

  return (
    <>
      <div className="page-title">
        <div>
          <p className="text-caption" style={{ margin: "0 0 6px" }}>
            {club.category} · {club.members} members · {club.role}
          </p>
          <h1 className="text-title-1" style={{ fontSize: 28 }}>{club.name}</h1>
        </div>
        <div className="page-actions">
          <Link href={`/chat?c=${slug}`} className="btn">
            Text the group
          </Link>
          {!clubNeeds[0] && (
            <Link href={`/clubs/${slug}/events`} className="btn primary">
              New event
            </Link>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <JoinedNote slug={slug} />
      </Suspense>

      <ClubOfficerWork slug={slug}>
      {clubNeeds[0] && (
        <section className="hero-need" aria-label="You owe">
          <p className="text-micro">You owe</p>
          <h2 className="text-title-2">{clubNeeds[0].title}</h2>
          <p className="text-caption">{clubNeeds[0].detail}</p>
          <Link href={clubNeeds[0].href} className="btn primary">
            Do this next
          </Link>
        </section>
      )}

      {clubNeeds.length > 1 && (
        <section className="section">
          <div className="section-head">
            <h2 className="text-title-2">Also open</h2>
          </div>
          <div className="need-list stack">
            {clubNeeds.slice(1).map((item) => (
              <Link key={item.title} href={item.href} className="need-item">
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <div className="grow">
                  <div className="row-title">{item.title}</div>
                  <div className="text-caption">{item.detail}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      </ClubOfficerWork>

      <section className="section">
        <div className="section-head">
          <h2 className="text-title-2">This week</h2>
          <Link href={`/clubs/${slug}/events`} className="text-caption">
            All events
          </Link>
        </div>
        <div className="event-list stack">
          {clubEvents.slice(0, 3).map((event) => (
            <Link key={event.title} href={`/clubs/${slug}/events`} className="event-row">
              <span className="identity" style={{ background: hueVar(club.hue) }} />
              <div className="grow">
                <span className="row-title">{event.title}</span>
                <span className="muted"> · {event.where}</span>
              </div>
              <div className="meta-col">
                {event.checkin > 0
                  ? `${event.checkin} checked in`
                  : `${event.rsvp} RSVP`}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {slug === "baja" && (
        <section className="section">
          <div className="section-head">
            <h2 className="text-title-2">Last meeting</h2>
            <span className="text-caption">Sep 8 · 7:04pm · 6 present</span>
          </div>
          <div className="minutes">
            <p className="text-reading" style={{ margin: 0 }}>
              {minutes}
            </p>
          </div>
        </section>
      )}

      {clubTasks.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="text-title-2">From that meeting</h2>
          </div>
          <div className="task-list">
            {clubTasks.map((task) => (
              <Link key={task.title} href={`/clubs/${slug}/workspace`} className="task-row">
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <div className="grow">{task.title}</div>
                <div className="text-caption">{task.due}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <ClubRosterPreview slug={slug} hue={club.hue} people={people} />
    </>
  );
}

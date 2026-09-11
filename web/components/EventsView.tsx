"use client";

import { useState } from "react";
import Link from "next/link";
import { AddToCalendar } from "@/components/AddToCalendar";
import {
  clubCalendarState,
  clubPublicHttps,
  clubPublicWebcal,
  downloadIcs,
  googleSubscribeUrl,
  icsForClubPublic,
  outlookSubscribeUrl,
  workFromClubEvent,
} from "@/lib/calendar";
import { clubBySlug, events, hueVar } from "@/lib/data";

export function EventsView({ slug }: { slug: string }) {
  const club = clubBySlug(slug);
  const list = events[slug as keyof typeof events] ?? [];
  const cal = clubCalendarState(slug);
  const [openSub, setOpenSub] = useState(false);
  const https = clubPublicHttps(slug);
  const webcal = clubPublicWebcal(slug);

  if (!club) return null;

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Events</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            RSVP writes the roster. Check-in writes attendance. Those are different facts.
          </p>
        </div>
        <div className="page-actions">
          <button className="btn" type="button" onClick={() => setOpenSub((v) => !v)}>
            Subscribe to this club
          </button>
          <button className="btn primary" type="button">
            New event
          </button>
        </div>
      </div>

      {openSub && (
        <section className="section cal-sub">
          <div className="text-label">This club’s public calendar</div>
          <p className="text-caption" style={{ margin: "4px 0 10px", maxWidth: "62ch" }}>
            Upcoming events only — title, time, place. Your personal work
            across clubs lives on{" "}
            <Link href="/you#calendar">Account</Link>. Officers set embed and
            ICS under Settings → Integrations.
          </p>
          {cal.publicOn ? (
            <>
              <div className="cal-url-row">
                <input className="input text-mono" readOnly value={https} />
              </div>
              <div className="cal-actions">
                <a className="btn" href={googleSubscribeUrl(https)} target="_blank" rel="noreferrer">
                  Add to Google Calendar
                </a>
                <a className="btn" href={webcal}>
                  Apple Calendar
                </a>
                <a
                  className="btn"
                  href={outlookSubscribeUrl(https, `${club.name} · public`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Outlook
                </a>
                <button
                  className="btn"
                  type="button"
                  onClick={() => downloadIcs(`${slug}-public.ics`, icsForClubPublic(slug))}
                >
                  Download .ics
                </button>
                <Link className="btn ghost" href={`/clubs/${slug}/settings?integration=calendar`}>
                  Club calendar settings
                </Link>
              </div>
            </>
          ) : (
            <p className="text-caption" style={{ margin: 0 }}>
              {club.name} has not published a public calendar. You can still
              add a single event below, or subscribe to your own work from{" "}
              <Link href="/you#calendar">Account</Link>.
            </p>
          )}
        </section>
      )}

      <div className="event-list">
        {list.map((event) => {
          const work = workFromClubEvent(slug, event.title, event.when, event.where);
          return (
            <article key={event.title} className="event-row cal-event" style={{ minHeight: 64 }}>
              <span className="identity" style={{ background: hueVar(club.hue) }} />
              <div className="grow">
                <div className="row-title">{event.title}</div>
                <div className="text-caption">
                  {event.when} · {event.where}
                </div>
              </div>
              <div className="meta-col">
                {event.rsvp}/{event.cap} RSVP
                {event.checkin > 0 ? ` · ${event.checkin} in` : ""}
              </div>
              <div className="cal-event-actions">
                <AddToCalendar work={work} />
                <button className="btn" type="button">
                  {event.checkin > 0 ? "Record" : "Check in"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

import { notFound } from "next/navigation";
import { clubBySlug, events, hueVar } from "@/lib/data";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = clubBySlug(slug);
  if (!club) notFound();
  const list = events[slug as keyof typeof events] ?? [];

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Events</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            RSVP writes the roster. Check-in writes attendance. Those are different facts.
          </p>
        </div>
        <button className="btn primary" type="button">
          New event
        </button>
      </div>

      <div className="event-list">
        {list.map((event) => (
          <article key={event.title} className="event-row" style={{ minHeight: 64 }}>
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
            <button className="btn" type="button">
              {event.checkin > 0 ? "Record" : "Check in"}
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

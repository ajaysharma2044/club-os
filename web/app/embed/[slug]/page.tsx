import { notFound } from "next/navigation";
import {
  clubCalendarState,
  formatWhen,
  publicEventsForClub,
} from "@/lib/calendar";
import { clubBySlug, hueVar } from "@/lib/data";

export default async function EmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = clubBySlug(slug);
  if (!club) notFound();

  const state = clubCalendarState(slug);
  const upcoming = state.publicOn && state.embedOn ? publicEventsForClub(slug) : [];

  return (
    <div className="cal-widget" style={{ borderLeftColor: hueVar(club.hue) }}>
      <header className="cal-widget-head">
        <span className="club-chip" style={{ background: hueVar(club.hue) }} />
        <div>
          <div className="row-title">{club.name}</div>
          <div className="text-caption">Upcoming · title, time, place</div>
        </div>
      </header>
      {upcoming.length === 0 ? (
        <p className="text-caption" style={{ margin: 0 }}>
          This club has not published a public calendar.
        </p>
      ) : (
        <ul className="cal-widget-list">
          {upcoming.map((item) => (
            <li key={item.id}>
              <div className="row-title">{item.title}</div>
              <div className="text-caption">
                {formatWhen(item)} · {item.location}
              </div>
            </li>
          ))}
        </ul>
      )}
      <footer className="cal-widget-foot">
        Club OS · no roster · no money
      </footer>
    </div>
  );
}

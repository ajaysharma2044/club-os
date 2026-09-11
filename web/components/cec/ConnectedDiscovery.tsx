"use client";
import Link from "next/link";
import { useCEC } from "./Connection";
import { cecRoutes } from "@/lib/cec/routes";
export function ConnectedDiscovery() {
  const { data, loading, error, refresh } = useCEC();
  const events = (data?.items || [])
    .filter(
      (r: any) =>
        r.kind === "event" &&
        r.data.status === "published" &&
        Date.parse(r.data.ends_at) > Date.now(),
    )
    .sort((a: any, b: any) => a.data.starts_at.localeCompare(b.data.starts_at));
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Discover</h1>
          <p className="text-caption">
            Cornell Entrepreneurship Club and its upcoming events.
          </p>
        </div>
        <Link className="btn primary" href="/join?club=cec">
          Join CEC
        </Link>
      </div>
      <article className="dash-card">
        <Link
          className="dash-band"
          style={{ background: "#b31b1b" }}
          href={cecRoutes.home}
        >
          <strong>Cornell Entrepreneurship Club</strong>
          <span>Cornell University</span>
        </Link>
        <div className="dash-body">
          <p>
            Meet other builders at Startup Hours, share your work, and find
            collaborators.
          </p>
          <div className="connected-links">
            <Link href={cecRoutes.events}>Events & registration</Link>
            <Link href={cecRoutes.directory}>Shared projects</Link>
            <Link href={cecRoutes.people}>Applications & coffee chats</Link>
          </div>
        </div>
      </article>
      <section className="section">
        <h2 className="text-title-2">Upcoming events</h2>
        {loading ? (
          <p role="status">Loading events…</p>
        ) : error ? (
          <div role="alert">
            <p>{error}</p>
            <button className="btn" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : events.length ? (
          events.map((e: any) => (
            <Link className="event-row" key={e.id} href={cecRoutes.events}>
              <div className="grow">
                <strong>{e.data.title}</strong>
                <p className="text-caption">
                  {new Date(e.data.starts_at).toLocaleString("en-US", {
                    timeZone: "America/New_York",
                  })}{" "}
                  ET · {e.data.location}
                </p>
              </div>
              <span className="btn">View & RSVP</span>
            </Link>
          ))
        ) : (
          <p className="text-caption">
            No upcoming events have been published.
          </p>
        )}
      </section>
    </>
  );
}

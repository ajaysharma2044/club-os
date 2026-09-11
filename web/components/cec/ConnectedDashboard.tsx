"use client";
import Link from "next/link";
import { useCEC } from "./Connection";
import { cecRoutes } from "@/lib/cec/routes";
const when = (s: string) =>
  new Date(s).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export function ConnectedDashboard() {
  const { data, loading, error, refresh } = useCEC();
  const user = data?.user;
  const tasks = (data?.items || [])
    .filter(
      (r: any) =>
        r.kind === "task" &&
        r.data.assignee === user?.id &&
        !["completed", "cancelled"].includes(r.data.status),
    )
    .sort((a: any, b: any) => a.data.due_at.localeCompare(b.data.due_at));
  const upcoming = (data?.items || [])
    .filter(
      (r: any) =>
        r.kind === "event" &&
        r.data.status === "published" &&
        Date.parse(r.data.ends_at) > Date.now(),
    )
    .sort((a: any, b: any) => a.data.starts_at.localeCompare(b.data.starts_at));
  const application = data?.applications?.find(
    (a: any) => a.user_id === user?.id,
  );
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">
            {user
              ? `Welcome back, ${user.name.split(" ")[0]}`
              : "Your club starts here"}
          </h1>
          <p className="text-caption">
            Cornell Entrepreneurship Club · events, people, and the work ahead.
          </p>
        </div>
        <Link className="btn" href="/you">
          {user ? "Your account" : "Sign in"}
        </Link>
      </div>
      {loading ? (
        <p role="status">Loading your club…</p>
      ) : error ? (
        <div role="alert" className="join-nudge">
          <p>{error}</p>
          <button className="btn" onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {user && tasks[0] ? (
            <section className="hero-need">
              <p className="text-micro">Your next commitment</p>
              <h2 className="text-title-2">{tasks[0].data.title}</h2>
              <p className="text-caption">
                {when(tasks[0].data.due_at)} ET · {tasks[0].data.status}
                {tasks[0].data.origin ? ` · ${tasks[0].data.origin}` : ""}
              </p>
              <Link href={cecRoutes.work} className="btn primary">
                Open your work
              </Link>
            </section>
          ) : (
            <section className="hero-need">
              <p className="text-micro">
                {user ? "Your next step" : "Cornell Entrepreneurship Club"}
              </p>
              <h2 className="text-title-2">
                {!user
                  ? "Come to Startup Hours. Build something together."
                  : user.role === "applicant"
                    ? "Find your place in the club."
                    : "You’re up to date on assigned work."}
              </h2>
              <p className="text-caption">
                {!user
                  ? "Browse events, register, and apply to the club."
                  : user.role === "applicant"
                    ? application
                      ? `Your application is ${application.stage}.`
                      : "RSVP to public events or submit a membership application."
                    : "See upcoming events or update what you’re building this week."}
              </p>
              <Link
                className="btn primary"
                href={
                  user?.role === "applicant"
                    ? cecRoutes.people
                    : cecRoutes.events
                }
              >
                {user?.role === "applicant"
                  ? "Your application"
                  : "Explore events"}
              </Link>
            </section>
          )}
          {tasks.length > 1 && (
            <section className="section">
              <div className="section-head">
                <h2 className="text-title-2">Also on your list</h2>
              </div>
              {tasks.slice(1, 6).map((r: any) => (
                <Link className="task-row" key={r.id} href={cecRoutes.work}>
                  <span
                    className="identity"
                    style={{ background: "#b31b1b" }}
                  />
                  <span className="grow">{r.data.title}</span>
                  <span className="text-caption">{when(r.data.due_at)} ET</span>
                </Link>
              ))}
            </section>
          )}
          <section className="section">
            <div className="section-head">
              <h2 className="text-title-2">
                {user && user.role !== "applicant"
                  ? "Your club"
                  : "Explore CEC"}
              </h2>
              <Link className="text-caption" href={cecRoutes.home}>
                Open workspace
              </Link>
            </div>
            <article className="dash-card">
              <Link
                href={cecRoutes.home}
                className="dash-band"
                style={{ background: "#b31b1b" }}
              >
                <strong>Cornell Entrepreneurship Club</strong>
                <span>
                  {user
                    ? user.role === "applicant"
                      ? "Community participant"
                      : user.role
                    : "Cornell University"}
                </span>
              </Link>
              <div className="dash-body">
                <div className="connected-links">
                  <Link href={cecRoutes.events}>Events & RSVPs</Link>
                  <Link href={cecRoutes.work}>Workspace</Link>
                  <Link href={cecRoutes.people}>People & applications</Link>
                  <Link href={cecRoutes.record}>The record</Link>
                  <Link href={cecRoutes.intake}>Weekly update</Link>
                </div>
              </div>
            </article>
          </section>
          <section className="section">
            <div className="section-head">
              <h2 className="text-title-2">Coming up</h2>
              <Link href={cecRoutes.events} className="text-caption">
                All events
              </Link>
            </div>
            {!upcoming.length ? (
              <p className="text-caption">
                No upcoming events have been published yet.
              </p>
            ) : (
              upcoming.slice(0, 5).map((e: any) => (
                <Link href={cecRoutes.events} className="event-row" key={e.id}>
                  <span
                    className="identity"
                    style={{ background: "#b31b1b" }}
                  />
                  <div className="grow">
                    <strong className="row-title">{e.data.title}</strong>
                    <p className="text-caption">
                      {when(e.data.starts_at)} ET · {e.data.location}
                    </p>
                  </div>
                  <span className="btn">View event</span>
                </Link>
              ))
            )}
          </section>
        </>
      )}
    </>
  );
}

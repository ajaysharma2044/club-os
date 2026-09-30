"use client";
import Link from "next/link";
import { useCEC } from "./Connection";
import {homeTasks} from "@/lib/cec/navigation";
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
  const tasks = homeTasks(data?.items || [], user?.id);
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
                {tasks[0].data.due_at ? `${when(tasks[0].data.due_at)} ET` : "No due date"} · {({assigned:"Awaiting your acceptance",accepted:"In progress",submitted:"Waiting for review"} as Record<string,string>)[tasks[0].data.status] || tasks[0].data.status}
                {tasks[0].data.origin ? ` · ${tasks[0].data.origin}` : ""}
              </p>
              <Link href={`${cecRoutes.work}#task-${tasks[0].id}`} className="btn primary">
                View task
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
                <Link className="task-row" key={r.id} href={`${cecRoutes.work}#task-${r.id}`}>
                  <span
                    className="identity"
                    style={{ background: "#b31b1b" }}
                  />
                  <span className="grow">{r.data.title}</span>
                  <span className="text-caption">{r.data.due_at ? `${when(r.data.due_at)} ET` : "No due date"}</span>
                </Link>
              ))}
            </section>
          )}
          <section className="section">
            <div className="section-head">
              <h2 className="text-title-2">Your next events</h2>
              <Link href={cecRoutes.events} className="text-caption">
                All events
              </Link>
            </div>
            {!upcoming.length ? (
              <p className="text-caption">
                No upcoming events have been published yet. Check Events for updates.
              </p>
            ) : (
              upcoming.slice(0, 3).map((e: any) => (
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
          {user && user.role !== "applicant" && <section className="section"><h2 className="text-title-2">Keep your club up to date</h2><p>Share what you’re building and when you’re available.</p><Link className="btn" href={cecRoutes.intake}>Share a weekly update</Link></section>}
        </>
      )}
    </>
  );
}

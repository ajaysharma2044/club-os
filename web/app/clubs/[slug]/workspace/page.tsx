import { CECWorkspace } from "@/components/cec/Workspace";
import { notFound } from "next/navigation";
import { AddToCalendar } from "@/components/AddToCalendar";
import { workByTitle } from "@/lib/calendar";
import { clubBySlug, hueVar, minutes, tasks } from "@/lib/data";

const docs = [
  { title: "Constitution, 2026 revision", kind: "Doc", updated: "Mar 14" },
  { title: "Shop insurance certificate", kind: "File", updated: "missing" },
  { title: "Caterpillar sponsor one-pager", kind: "Doc", updated: "yesterday" },
  { title: "Fall SGA budget request", kind: "Form", updated: "draft" },
];

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "cec") return <CECWorkspace embedded section="work" initialTab="" />;
  const club = clubBySlug(slug);
  if (!club) notFound();
  const clubTasks = tasks.filter((t) => t.club === slug);

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Files</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            Owned by the club. A graduating account cannot take this with it.
          </p>
        </div>
        <button className="btn" type="button">
          New doc
        </button>
      </div>

      <section className="section">
        <h2 className="text-title-2">Tasks</h2>
        <div className="task-list" style={{ marginTop: 10 }}>
          {(clubTasks.length ? clubTasks : [
            { club: slug, title: "No open tasks from meetings yet", due: "", origin: "" },
          ]).map((task) => (
            <div key={task.title} className="task-row">
              <span className="identity" style={{ background: hueVar(club.hue) }} />
              <div className="grow">{task.title}</div>
              <div className="text-caption">{task.due}</div>
              <div className="meta-col">{task.origin}</div>
              {(() => {
                const work = workByTitle(slug, task.title);
                return work ? <AddToCalendar compact work={work} /> : null;
              })()}
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="text-title-2">Vault</h2>
        <div className="event-list" style={{ marginTop: 10 }}>
          {docs.map((doc) => (
            <div key={doc.title} className="event-row">
              <div className="grow">
                <div className="row-title">{doc.title}</div>
                <div className="text-caption">{doc.kind}</div>
              </div>
              <span className={doc.updated === "missing" ? "badge warn" : "badge"}>
                {doc.updated}
              </span>
            </div>
          ))}
        </div>
      </section>

      {slug === "baja" && (
        <section className="section">
          <h2 className="text-title-2">Build log</h2>
          <div className="minutes" style={{ marginTop: 10 }}>
            <p className="text-reading" style={{ margin: 0 }}>
              {minutes}
            </p>
          </div>
        </section>
      )}
    </>
  );
}


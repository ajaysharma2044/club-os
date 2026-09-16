import { dateLabel, type Person } from "./taskTypes";
type Entry = {
    id: string;
    kind: string;
    actor: string;
    at: string;
    submission_id?: string;
    note?: string;
    artifact_url?: string;
};
export function TaskHistory({ history, people }: {
    history: Entry[];
    people: Person[];
}) {
    return <>                      {!!history.length && (<details className="resource">
                          <summary>Work & review history</summary>
                          {history.map((entry: any) => (<div key={entry.id} style={{ marginTop: 12 }}>
                              <strong>{entry.kind === "submission" ? "Work submitted" :
                    entry.kind === "revision" ? "Revision requested" : "Approved"}</strong>
                              <small> · {people.find((p) => p.id === entry.actor)?.name || "Club member"} · {dateLabel(entry.at)} ET</small>
                              {entry.submission_id && <small> · Reviewing submission {history.filter((e: any) => e.kind === "submission").findIndex((e: any) => e.id === entry.submission_id) + 1}</small>}
                              {entry.kind !== "submission" && !entry.submission_id && <small> · Earlier submission has no attached work record</small>}
                              {entry.note && <p style={{ whiteSpace: "pre-wrap" }}>{entry.note}</p>}
                              {entry.artifact_url && <a href={entry.artifact_url} target="_blank" rel="noopener noreferrer">Open submitted work ↗</a>}
                            </div>))}
                        </details>)}</>;
}

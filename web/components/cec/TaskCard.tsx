"use client";
import { useState } from "react";
import { TaskSubmissionDialog, TaskRevisionDialog } from "./TaskDialogs";
import { TaskHistory } from "./TaskHistory";
import { dateLabel, fieldsFrom, type Row, type TaskProps } from "./taskTypes";
export function TaskCard({ r, people, user, busy, action, run, show }: TaskProps & {
    r: Row;
}) {
    const [dialog, setDialog] = useState<{
        kind: "submit" | "revision";
        task: Row;
    } | null>(null);
    const isOfficer = user.role === "officer";
    const button = (label: string, fn: () => void, secondary = false) => <button disabled={busy} onClick={fn} className={"button small " + (secondary ? "secondary" : "")}>{label}</button>;
    const latest = r.data.work_history?.at(-1);
    const revision = r.data.status === "accepted" && latest?.kind === "revision";
    const status = revision ? "Changes requested" : ({ assigned: "Awaiting acceptance", accepted: "In progress", submitted: "Ready for review", completed: "Approved", cancelled: "Closed" } as Record<string, string>)[r.data.status] || r.data.status;
    return (<><article className="row task-row" key={r.id} id={`task-${r.id}`} aria-label={r.data.title}>
                    <div className="detail">
                      <div className="task-heading"><h3>{r.data.title}</h3><span className="tag">{status}</span></div>
                      <small>
                        {people.find((p) => p.id === r.data.assignee)?.name || "Unassigned"} ·{" "}
                        {r.data.due_at ? `Due ${dateLabel(r.data.due_at)} ET` : "No due date"}
                      </small>
                      {r.data.origin && (<p className="source-note">From: {r.data.origin}</p>)}
                      {latest && ["accepted", "submitted"].includes(r.data.status) && (<div className={revision ? "task-feedback revision" : "task-feedback"}>
                          <strong>{revision ? "What needs to change" : "Latest submission"}</strong>
                          {latest.note && <p>{latest.note}</p>}
                          {latest.artifact_url && <a className="link" href={latest.artifact_url} target="_blank" rel="noopener noreferrer">Open submitted work ↗</a>}
                        </div>)}
                      {r.data.status === "submitted" && <p className="source-note">{isOfficer ? "Review the submission before approving or requesting changes." : "An officer will review your work. Your submission is saved below."}</p>}
                      <TaskHistory history={r.data.work_history || []} people={people}/>
                    </div>
                    <div className="actions task-actions">
                      {r.data.assignee === user.id &&
            r.data.status === "assigned" &&
            button("Accept", () => run("task.status", {
                id: r.id,
                status: "accepted",
            }), true)}
                      {r.data.assignee === user.id &&
            r.data.status === "accepted" &&
            button(revision ? "Resubmit work" : "Submit work", () => setDialog({ kind: "submit", task: r }))}
                      {r.data.assignee === user.id && r.data.status === "assigned" &&
            button("Decline", () => run("task.status", { id: r.id, status: "cancelled" }), true)}
                      {isOfficer &&
            r.data.status === "submitted" &&
            button("Approve", () => run("task.status", { id: r.id, version: r.version, status: "completed" }))}
                      {(isOfficer || r.data.assignee === user.id) &&
            ["accepted", "submitted"].includes(r.data.status) &&
            button("Ask for help", () => show("What is blocking this task?", [
                {
                    key: "category",
                    label: "Blocker",
                    options: fieldsFrom([
                        "waiting_on_person",
                        "waiting_on_external_partner",
                        "need_information",
                        "need_approval",
                        "need_resources",
                        "scope_unclear",
                        "technical_issue",
                        "time_constraint",
                        "other",
                    ]),
                },
                {
                    key: "note",
                    label: "What help is needed?",
                    type: "textarea",
                },
            ], async (d) => {
                await action("evidence/block", {
                    task_id: r.id,
                    ...d,
                });
            }), true)}
                      {isOfficer &&
            r.data.status === "submitted" &&
            button("Request revision", () => setDialog({ kind: "revision", task: r }), true)}
                      {isOfficer &&
            !["completed", "cancelled"].includes(r.data.status) &&
            button("Cancel", () => run("task.status", {
                id: r.id,
                status: "cancelled",
            }), true)}
                    </div>
                  </article>
    {dialog?.kind === "submit" && <TaskSubmissionDialog task={dialog.task} action={action} close={() => setDialog(null)}/>}
    {dialog?.kind === "revision" && <TaskRevisionDialog task={dialog.task} action={action} close={() => setDialog(null)}/>}
    </>);
}

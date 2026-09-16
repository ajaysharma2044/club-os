"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cecRoutes } from "@/lib/cec/routes";
import { TaskCard } from "./TaskCard";
import { type Row, type TaskProps } from "./taskTypes";
export function TaskList(props: TaskProps & {
    tasks: Row[];
    onAssign: () => void;
}) {
    const { tasks, user, busy, onAssign } = props;
    const isOfficer = user.role === "officer";
    const empty = (text: string) => <div className="empty" role="status">{text}</div>;
    const button = (label: string, fn: () => void, secondary = false) => <button disabled={busy} onClick={fn} className={"button small " + (secondary ? "secondary" : "")}>{label}</button>;
    const [taskFilter, setTaskFilter] = useState("Open");
    useEffect(() => { if (window.location.hash.startsWith("#task-"))
        setTaskFilter("All"); }, []);
    const matches = (r: Row, filter: string) => filter === "All" ||
        (filter === "My tasks" ? r.data.assignee === user?.id && !["completed", "cancelled"].includes(r.data.status) :
            filter === "Needs review" ? r.data.status === "submitted" :
                filter === "Finished" ? ["completed", "cancelled"].includes(r.data.status) :
                    !["completed", "cancelled"].includes(r.data.status));
    const visibleTasks = tasks.filter(r => matches(r, taskFilter));
    return (<div className="panel">
                <div className="panel-head">
                  <div><h2>Tasks</h2><p className="muted">{isOfficer ? "Assign work, review submissions, and keep the club moving." : "Accept your assignment, share your work, and follow up on feedback."}</p></div>
                  {isOfficer && <div className="actions"><Link className="link" href={cecRoutes.people}>Invite members</Link>{button("Assign task", onAssign)}</div>}
                </div>
                <div className="task-filters" aria-label="Filter tasks">
                  {["Open", "My tasks", ...(isOfficer ? ["Needs review"] : []), "Finished", "All"].map(filter => (<button key={filter} className="button secondary small" aria-pressed={taskFilter === filter} onClick={() => setTaskFilter(filter)}>{filter} <span>{tasks.filter(r => matches(r, filter)).length}</span></button>))}
                </div>
                {visibleTasks.map(r => <TaskCard key={r.id} {...props} r={r}/>)}
                {!visibleTasks.length && empty(tasks.length ? "No tasks in this view. Choose another filter to see the rest." : isOfficer ? "Assign the first task with an owner and a due date. Submitted work will come back here for your review." : "No tasks assigned yet. Your assignments and feedback will appear here.")}
              </div>);
}

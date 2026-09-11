"use client";
import Link from "next/link";
import { useCEC } from "./Connection";
import { cecRoutes } from "@/lib/cec/routes";
export function ConnectedAside() {
  const { data, loading, error } = useCEC();
  const mine = (data?.items || []).filter(
    (r: any) =>
      r.kind === "task" &&
      r.data.assignee === data?.user?.id &&
      !["completed", "cancelled"].includes(r.data.status),
  );
  return (
    <div className="up-next-inner">
      <div className="todo-head">Your next steps</div>
      {loading ? (
        <p className="text-caption">Loading…</p>
      ) : error ? (
        <p className="text-caption">Workspace unavailable.</p>
      ) : (
        <>
          {mine.slice(0, 4).map((r: any) => (
            <Link className="todo-item" key={r.id} href={cecRoutes.work}>
              <div>
                <div className="todo-title">{r.data.title}</div>
                <div className="text-caption">{r.data.status}</div>
              </div>
            </Link>
          ))}
          {!mine.length && (
            <p className="text-caption">
              {data?.user
                ? "No open tasks assigned to you."
                : "Sign in to see your tasks."}
            </p>
          )}
          <Link
            className="todo-item"
            href={data?.user ? cecRoutes.intake : cecRoutes.account}
          >
            {data?.user ? "Update what you’re building" : "Sign in to CEC"}
          </Link>
          <Link className="todo-item" href={cecRoutes.schedule}>
            Meetings & calendar
          </Link>
          <Link className="todo-item" href={cecRoutes.people}>
            Applications & coffee chats
          </Link>
        </>
      )}
    </div>
  );
}

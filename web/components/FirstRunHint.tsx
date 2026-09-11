"use client";

import Link from "next/link";
import { markJoinSeen } from "@/lib/join";
import { useJoinState } from "@/lib/useJoin";

export function FirstRunHint() {
  const { state, ready, save } = useJoinState();
  if (!ready || state?.seen || state?.completed) return null;

  return (
    <aside className="join-nudge" aria-label="New here">
      <div className="grow">
        <div className="row-title">New here?</div>
        <div className="text-caption">Start in two minutes. No password.</div>
      </div>
      <Link className="btn primary" href="/join">
        Show up
      </Link>
      <button
        className="btn ghost"
        type="button"
        onClick={() => save(markJoinSeen(state))}
      >
        Not now
      </button>
    </aside>
  );
}

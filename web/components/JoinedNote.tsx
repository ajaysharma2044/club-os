"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { latestJoinFor, policyFor } from "@/lib/join";
import { useJoinState } from "@/lib/useJoin";

export function JoinedNote({ slug }: { slug: string }) {
  const params = useSearchParams();
  const { state } = useJoinState();
  const policy = policyFor(slug);
  const justLanded = params.get("joined") === "1";
  const membership = latestJoinFor(slug, state);

  if (!policy || (!justLanded && !membership)) return null;

  return (
    <section className="join-landed" aria-label="You joined">
      <p className="text-micro">The roster</p>
      <h2 className="text-title-2">{policy.confirmTitle}</h2>
      <p className="text-caption" style={{ margin: "4px 0 0" }}>
        {policy.confirmLine}
      </p>
      <Link href={`/chat?c=${slug}`} className="btn" style={{ marginTop: 10 }}>
        Text the group
      </Link>
    </section>
  );
}

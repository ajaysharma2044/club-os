"use client";

import { me } from "@/lib/data";
import { useJoinState } from "@/lib/useJoin";

export function ClubOfficerWork({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const { state, ready } = useJoinState();
  const isNewMember =
    ready &&
    state?.completed &&
    state.name &&
    state.name !== me.name &&
    state.joined.some((j) => j.slug === slug);

  if (isNewMember) return null;
  return <>{children}</>;
}

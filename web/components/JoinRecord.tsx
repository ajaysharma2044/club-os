"use client";

import { clubs } from "@/lib/data";
import { revokeJoin, roleForOutcome } from "@/lib/join";
import { useJoinState } from "@/lib/useJoin";

export function JoinRecord() {
  const { state, ready } = useJoinState();
  if (!ready || !state?.completed) return null;

  return (
    <section className="section">
      <h2 className="text-title-2">This session</h2>
      <hr className="rule" />
      <p className="text-caption" style={{ margin: "0 0 10px" }}>
        {state.name} · {state.email} · {state.campus}
      </p>
      {state.joined.map((item) => {
        const club = clubs.find((c) => c.slug === item.slug);
        return (
          <div key={item.slug} className="event-row">
            <div className="grow">
              <div className="row-title">
                {roleForOutcome(item.outcome)}, {club?.name ?? item.slug}
              </div>
              <div className="text-caption">Just showed up · on the person, not a throwaway</div>
            </div>
          </div>
        );
      })}
      <p style={{ marginTop: 12 }}>
        <button className="btn ghost" type="button" onClick={() => revokeJoin()}>
          Revoke campus email
        </button>
      </p>
    </section>
  );
}

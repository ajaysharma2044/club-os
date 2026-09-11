"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WriteIn } from "@/components/Presence";
import { clubs, hueVar } from "@/lib/data";
import {
  emptyJoin,
  initialsFrom,
  markJoinSeen,
  mayaPerson,
  policyFor,
  joinPolicies,
  type JoinState,
} from "@/lib/join";
import { useJoinState } from "@/lib/useJoin";

type Beat = "you" | "club" | "in";

function emailLooksCampus(value: string) {
  return /@/.test(value.trim());
}

export function JoinFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const preset = policyFor(params.get("club") ?? "");
  const { state, save } = useJoinState();

  const [beat, setBeat] = useState<Beat>("you");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState(preset?.slug ?? "");
  const [notifyQuiet, setNotifyQuiet] = useState(true);

  const policy = policyFor(picked);
  const club = clubs.find((c) => c.slug === picked);
  const writing = name.trim().length > 0 || email.trim().length > 0;
  const canWriteIn = name.trim().length > 1 && emailLooksCampus(email);

  const person = useMemo(() => {
    if (writing) {
      return {
        name: name.trim(),
        email: email.trim(),
        initials: initialsFrom(name),
        year: "First-year",
        campus: "Northfield University",
      };
    }
    return mayaPerson;
  }, [writing, name, email]);

  function skip() {
    markJoinSeen(state);
    router.push("/");
  }

  function keepYou(asMaya = false) {
    if (asMaya) {
      setName("");
      setEmail("");
    }
    setBeat(preset ? "in" : "club");
    if (preset) setPicked(preset.slug);
  }

  function pickClub(slug: string) {
    setPicked(slug);
    setBeat("in");
  }

  function finish() {
    if (!policy) return;
    const now = new Date().toISOString();
    const prior = state ?? emptyJoin();
    const joined = [
      ...prior.joined.filter((j) => j.slug !== policy.slug),
      { slug: policy.slug, outcome: policy.outcome, at: now },
    ];
    const next: JoinState = {
      ...prior,
      seen: true,
      completed: true,
      name: person.name,
      email: person.email,
      initials: person.initials,
      year: person.year,
      campus: person.campus,
      joined,
      notifyQuiet,
    };
    save(next);
    router.push(policy.land);
  }

  return (
    <div className="join">
      <p className="join-beat text-caption">
        {beat === "you" && "1 of 3 · You"}
        {beat === "club" && "2 of 3 · A club"}
        {beat === "in" && "3 of 3 · The roster"}
      </p>

      {beat === "you" && (
        <>
          <WriteIn text="Show up." />
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            Name and campus email. That is it.
          </p>

          <button className="btn primary join-primary" type="button" onClick={() => keepYou(true)}>
            Continue as Maya
          </button>
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            {mayaPerson.name} · {mayaPerson.email}
          </p>

          <div className="join-or">or write yours</div>

          <div className="join-fields">
            <label className="join-label">
              <span>Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First and last"
                autoComplete="name"
              />
            </label>
            <label className="join-label">
              <span>Campus email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@northfield.edu"
                autoComplete="email"
              />
            </label>
          </div>

          {writing && (
            <button
              className="btn primary join-primary"
              type="button"
              disabled={!canWriteIn}
              onClick={() => keepYou(false)}
            >
              That&apos;s me
            </button>
          )}

          <p className="join-consent">
            Campus email is how we know it is you — not a university login, and
            Northfield is not a customer. You can revoke this on Account.
          </p>
        </>
      )}

      {beat === "club" && (
        <>
          <WriteIn text="Find a club." />
          <p className="text-caption" style={{ margin: "8px 0 16px" }}>
            What is open this week. One tap.
          </p>
          <div className="join-clubs">
            {joinPolicies.map((item) => {
              const c = clubs.find((x) => x.slug === item.slug)!;
              return (
                <button
                  key={item.slug}
                  type="button"
                  className="join-club"
                  onClick={() => pickClub(item.slug)}
                >
                  <span className="identity" style={{ background: hueVar(c.hue) }} />
                  <div className="grow">
                    <div className="row-title">{c.name}</div>
                    <div className="text-caption">
                      {c.category} · {item.openLine}
                    </div>
                  </div>
                  <span className="btn">{item.verb}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {beat === "in" && policy && club && (
        <>
          <p className="text-micro" style={{ margin: "0 0 8px" }}>
            {club.name}
          </p>
          <WriteIn text={policy.confirmTitle} />
          <p className="text-reading" style={{ margin: "10px 0 0" }}>
            {policy.confirmLine}
          </p>
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            {person.name} · membership on a person, not a throwaway account.
          </p>

          <button
            type="button"
            className="join-ping"
            aria-pressed={notifyQuiet}
            onClick={() => setNotifyQuiet((v) => !v)}
          >
            <span className="join-ping-mark" data-on={notifyQuiet} />
            <span>
              <strong>We&apos;ll ping you when something&apos;s actually yours.</strong>
              <span className="text-caption" style={{ display: "block", marginTop: 2 }}>
                Quiet hours 11pm–8am. Announcements capped. {notifyQuiet ? "On." : "Off."}
              </span>
            </span>
          </button>

          <button className="btn primary join-primary" type="button" onClick={finish}>
            {policy.landLabel}
          </button>
        </>
      )}

      <p className="join-skip-row">
        <button className="join-skip" type="button" onClick={skip}>
          Already here? Skip.
        </button>
        {beat !== "you" && (
          <button
            className="join-skip"
            type="button"
            onClick={() => setBeat(beat === "in" && !preset ? "club" : "you")}
          >
            Back
          </button>
        )}
      </p>

      <p className="text-caption" style={{ marginTop: 24 }}>
        <Link href="/discover" style={{ color: "var(--electric)" }}>
          Or browse Discover
        </Link>
      </p>
    </div>
  );
}

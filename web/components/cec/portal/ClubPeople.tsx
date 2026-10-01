"use client";
import Link from "next/link";
import { usePortal } from "./usePortal";
import { useState } from "react";
import { Modal } from "../FormPrimitives";
import { Frame, ProfileDetails, options } from "./shared";
export function ClubPeople() {
  const p = usePortal(),
    [search, setSearch] = useState(""),
    [role, setRole] = useState("All"),
    [person, setPerson] = useState<any>(null);
  const people = (p.data?.people || []).filter(
    (r: any) =>
      (role === "All" || r.role === role) &&
      [
        r.name,
        r.profile?.major,
        r.profile?.skills,
        r.profile?.committee,
        r.profile?.graduation_year,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Frame
      nested
      title="Member directory"
      description="Find collaborators by name, skills, major or committee."
      p={p}
    >
      <div className="portal-toolbar">
        <label>
          Search people
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, skills, major…"
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {options([
              "All",
              "member",
              "officer",
              ...(p.data?.user?.role === "officer" ? ["applicant"] : []),
            ]).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Link className="button secondary" href="/clubs/cec/profile">
          Edit my profile
        </Link>
        {p.data?.user?.role === "officer" && (
          <Link href="/clubs/cec/relationships">
            Alumni, sponsors & follow-ups
          </Link>
        )}
      </div>
      {!people.length && (
        <p className="portal-empty">
          {p.data?.user?.role === "applicant" || !p.data?.user
            ? "The member directory is available after joining the club."
            : "No people match these filters."}
        </p>
      )}
      <div className="portal-grid">
        {people.map((r: any) => (
          <article className="portal-card" key={r.id}>
            <h2>{r.name}</h2>
            <small>{r.role}</small>
            <p>
              {r.profile
                ? [r.profile.major, r.profile.committee]
                    .filter(Boolean)
                    .join(" · ") || "Club member"
                : "Profile details are private."}
            </p>
            {r.profile?.skills && <p>{r.profile.skills}</p>}
            <button className="button secondary" onClick={() => setPerson(r)}>
              View {r.name}
            </button>
          </article>
        ))}
      </div>
      {person && (
        <Modal title={person.name} close={() => setPerson(null)}>
          <p>{person.role}</p>
          {person.profile ? (
            <ProfileDetails data={person.profile} />
          ) : (
            <p>This person has not shared profile details with the club.</p>
          )}
          {p.data?.user?.role === "officer" && (
            <Link
              href={`/clubs/cec/relationships?person=${encodeURIComponent(person.id)}`}
            >
              Open officer follow-ups
            </Link>
          )}
        </Modal>
      )}
    </Frame>
  );
}

"use client";
import Link from "next/link";
import { usePortal } from "./usePortal";
import { useState } from "react";
import { Frame, PortalDialog, ProfileDetails, field, select } from "./shared";
export function ClubProfile() {
  const p = usePortal(),
    [edit, setEdit] = useState(false);
  const row = p.data?.profile,
    d = row?.data || {};
  return (
    <Frame
      title="Your club profile"
      description="Choose what to share with fellow club members. These details are never published to the public directory."
      p={p}
    >
      {!p.data?.user ? (
        <p>
          <Link href="/you">Sign in</Link> to edit your profile.
        </p>
      ) : (
        <>
          <article className="portal-card">
            <h2>{p.data.user.name}</h2>
            <ProfileDetails data={d} />
            <p>
              Visibility:{" "}
              {d.visibility === "club" ? "Club members" : "Only you"}
            </p>
            <button className="button" onClick={() => setEdit(true)}>
              Edit profile details
            </button>
            <Link href="/you">Account name and public sharing settings</Link>
          </article>
          {edit && (
            <PortalDialog
              title="Edit your club profile"
              close={() => setEdit(false)}
              fields={[
                field("bio", "About you (optional)", d.bio, "textarea", false),
                field(
                  "major",
                  "Major or field (optional)",
                  d.major,
                  "text",
                  false,
                ),
                field(
                  "graduation_year",
                  "Graduation year (optional)",
                  d.graduation_year,
                  "text",
                  false,
                ),
                field("skills", "Skills (optional)", d.skills, "text", false),
                field(
                  "committee",
                  "Committee or area of interest (optional)",
                  d.committee,
                  "text",
                  false,
                ),
                field(
                  "photo_url",
                  "Photo HTTPS URL (optional)",
                  d.photo_url,
                  "url",
                  false,
                ),
                field(
                  "linkedin_url",
                  "LinkedIn HTTPS URL (optional)",
                  d.linkedin_url,
                  "url",
                  false,
                ),
                field(
                  "website_url",
                  "Website HTTPS URL (optional)",
                  d.website_url,
                  "url",
                  false,
                ),
                select(
                  "visibility",
                  "Detail visibility",
                  ["private", "club"],
                  d.visibility,
                ),
              ]}
              onSave={(data) =>
                p.save("profile", { ...data, version: row?.version || 0 })
              }
            />
          )}
        </>
      )}
    </Frame>
  );
}

import { notFound } from "next/navigation";
import { RosterTable } from "@/components/RosterTable";
import { clubBySlug, roster } from "@/lib/data";

export default async function PeoplePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = clubBySlug(slug);
  if (!club) notFound();
  const people = roster[slug] ?? [];

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">People</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            One roster. Dues, attendance, and role all write back here.
          </p>
        </div>
        <button className="btn primary" type="button">
          Invite
        </button>
      </div>
      <RosterTable people={people} />
    </>
  );
}

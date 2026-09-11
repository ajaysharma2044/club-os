import Link from "next/link";
import { clubs, hueVar } from "@/lib/data";
import { joinPolicies, policyFor } from "@/lib/join";

const open = [
  {
    club: "hacknight",
    title: "Fall Hack is open to the campus",
    detail: "Saturday · WALC · no application",
  },
  {
    club: "consulting",
    title: "Northfield Consulting still taking first-years",
    detail: "Apply by Friday 5pm",
  },
  {
    club: "herald",
    title: "The Daily Herald needs two photographers",
    detail: "No portfolio required this cycle",
  },
  {
    club: "baja",
    title: "Baja shop hours are a walk-in",
    detail: "Tonight 7:00 · ABE Bay 2",
  },
];

export default function DiscoverPage() {
  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Discover</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            What is open on campus this week. Newest first.
          </p>
        </div>
        <Link className="btn primary" href="/join">
          Show up
        </Link>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="text-title-2">Walk in this week</h2>
        </div>
        <div className="join-clubs">
          {joinPolicies.map((item) => {
            const club = clubs.find((c) => c.slug === item.slug)!;
            return (
              <Link key={item.slug} href={`/join?club=${item.slug}`} className="join-club">
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <div className="grow">
                  <div className="row-title">{club.name}</div>
                  <div className="text-caption">{item.openLine}</div>
                </div>
                <span className="btn">{item.verb}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="section">
        {open.map((item) => {
          const club = clubs.find((c) => c.slug === item.club)!;
          const policy = policyFor(item.club);
          return (
            <article key={item.title} className="feed-row">
              <span className="identity" style={{ background: hueVar(club.hue) }} />
              <div className="grow">
                <div className="row-title">{item.title}</div>
                <div className="text-caption">
                  {club.name} · {item.detail}
                </div>
              </div>
              <Link className="btn" href={`/join?club=${item.club}`}>
                {policy?.verb ?? "I'm in"}
              </Link>
            </article>
          );
        })}
      </section>
    </>
  );
}

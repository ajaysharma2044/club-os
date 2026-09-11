import { clubs, hueVar } from "@/lib/data";

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
      </div>

      <section className="section">
        {open.map((item) => {
          const club = clubs.find((c) => c.slug === item.club)!;
          return (
            <article key={item.title} className="feed-row">
              <span className="identity" style={{ background: hueVar(club.hue) }} />
              <div className="grow">
                <div className="row-title">{item.title}</div>
                <div className="text-caption">
                  {club.name} · {item.detail}
                </div>
              </div>
              <button className="btn" type="button">
                {item.club === "consulting" ? "Apply" : "RSVP"}
              </button>
            </article>
          );
        })}
      </section>
    </>
  );
}

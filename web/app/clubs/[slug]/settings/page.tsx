import { Suspense } from "react";
import { notFound } from "next/navigation";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { clubBySlug, hueVar } from "@/lib/data";

const hues = [
  "ember",
  "clay",
  "amber",
  "moss",
  "spruce",
  "teal",
  "cobalt",
  "iris",
  "plum",
  "rose",
  "slate",
  "sand",
] as const;

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const club = clubBySlug(slug);
  if (!club) notFound();

  return (
    <>
      <div className="page-title">
        <div>
          <h1 className="text-title-1">Settings</h1>
          <p className="text-caption" style={{ margin: "4px 0 0" }}>
            Identity is a name, not a free color picker.
          </p>
        </div>
      </div>

      <section className="section">
        <label className="text-label" htmlFor="club-name">
          Club name
        </label>
        <input
          id="club-name"
          className="input"
          defaultValue={club.name}
          style={{ marginTop: 8, maxWidth: 420 }}
        />
      </section>

      <section className="section">
        <div className="text-label">Color</div>
        <p className="text-caption">
          Used on the 3px edge, the 20px chip, and calendar dots. Never on buttons.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 12,
          }}
        >
          {hues.map((hue) => (
            <button
              key={hue}
              type="button"
              className="btn ghost"
              aria-pressed={hue === club.hue}
              style={{
                boxShadow:
                  hue === club.hue
                    ? "0 0 0 2px var(--n-1), 0 0 0 4px var(--a-9)"
                    : undefined,
              }}
            >
              <span
                className="club-chip"
                style={{ background: hueVar(hue), width: 20, height: 20 }}
              />
              {hue[0].toUpperCase() + hue.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <Suspense fallback={null}>
        <IntegrationsPanel slug={slug} />
      </Suspense>
    </>
  );
}

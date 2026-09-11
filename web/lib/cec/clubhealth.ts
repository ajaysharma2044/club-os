// Club-level intelligence. Pure math, no database, no I/O.
//
// This is the δ side of the model in docs/17: the club as the unit, its
// demandingness and health estimated across many members, while the person
// layer (signals.ts) estimates θ across many clubs. They are the two variance
// components of one decomposition, not two systems.
//
// The single most important behaviour here is REFUSING TO SCORE. A composite
// index is a z-score against a peer group, and with one club on a campus there
// is no peer group — every z is undefined. A dashboard that renders a
// confident gauge from a sample of one is worse than no dashboard, because
// somebody will act on it. So `index` is null until a real peer group exists,
// and the caveat says why in plain language.
//
// Unlike the person layer, a club composite IS publishable: it describes an
// organisation, and organisations are legitimately measured. That asymmetry is
// the architecture (docs/17 §2), and it is why this file may return a single
// number while signals.ts may not.

import { peerZ, ewma, type Posterior } from "./behavioral";

/** The eight components of the index, from docs/03. Weights sum to 1. */
export const COMPONENTS = [
  { key: "retention", weight: 0.2, label: "Retention", higherIsBetter: true },
  { key: "attendance_trend", weight: 0.15, label: "Attendance trend", higherIsBetter: true },
  { key: "officer_engagement", weight: 0.15, label: "Officer engagement", higherIsBetter: true },
  { key: "bus_factor", weight: 0.1, label: "Bus factor", higherIsBetter: true },
  { key: "funding_runway", weight: 0.1, label: "Funding runway", higherIsBetter: true },
  { key: "content_cadence", weight: 0.1, label: "Content cadence", higherIsBetter: true },
  { key: "network_centrality", weight: 0.1, label: "Network centrality", higherIsBetter: true },
  { key: "pipeline", weight: 0.1, label: "Pipeline", higherIsBetter: true },
] as const;

export type ComponentKey = (typeof COMPONENTS)[number]["key"];
export type Metrics = Partial<Record<ComponentKey, number>>;

/** Minimum peer clubs before any z-score is meaningful. Below this we refuse. */
export const MIN_PEERS = 8;

export type ComponentResult = {
  key: ComponentKey;
  label: string;
  weight: number;
  value: number | null;
  z: number | null;
  percentile: number | null;
  /** peers that supplied a value for this component */
  peers: number;
  reading: string;
};

export type ClubHealth = {
  /** 0-100, or null when there is no peer group to compare against */
  index: number | null;
  components: ComponentResult[];
  /** short-window minus long-window activity; a leading indicator */
  form: number | null;
  formReading: string;
  succession: SuccessionRisk;
  peerGroup: { size: number; label: string };
  caveat: string | null;
};

// Standard normal CDF via Abramowitz–Stegun 7.1.26, used only to turn a z into
// a percentile for display. Accuracy ~1e-7, far beyond what a club index needs.
function normalCdf(z: number): number {
  const s = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + s * y);
}

/**
 * Club Health Index.
 *
 * `metrics` is this club's raw component values; `peers` is the same shape for
 * every comparable club (same campus, category and size band — the caller is
 * responsible for choosing a genuinely comparable set, because comparing a
 * 15-person poetry club to a 300-person business fraternity is the fastest way
 * to make this number meaningless).
 */
export function clubHealth(input: {
  metrics: Metrics;
  peers: Metrics[];
  peerLabel?: string;
  /** activity points for the form indicator: {value, ageDays} */
  activity?: { value: number; ageDays: number }[];
  succession?: SuccessionInput;
  minPeers?: number;
}): ClubHealth {
  const min = input.minPeers ?? MIN_PEERS;
  const peerCount = input.peers.length;
  const enough = peerCount >= min;

  const components: ComponentResult[] = COMPONENTS.map((c) => {
    const value = input.metrics[c.key];
    const peerValues = input.peers
      .map((p) => p[c.key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const have = typeof value === "number" && Number.isFinite(value);
    const z = have && enough ? peerZ(value, peerValues, Math.min(4, min)) : null;
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      value: have ? value : null,
      z,
      percentile: z === null ? null : Math.round(normalCdf(z) * 100),
      peers: peerValues.length,
      reading: !have
        ? "Not measured yet."
        : z === null
          ? `${round(value)} — no peer group to compare against yet.`
          : `${round(value)} — around the ${ordinal(Math.round(normalCdf(z) * 100))} of comparable clubs.`,
    };
  });

  // Weighted mean of the scored components, renormalised over whatever was
  // actually measurable. A club missing half its inputs gets an index over the
  // half it has, and `caveat` says so rather than silently treating absent as
  // zero — which would punish clubs for not having recorded something yet.
  const scored = components.filter((c) => c.z !== null);
  const weight = scored.reduce((a, c) => a + c.weight, 0);
  const index =
    enough && weight > 0
      ? Math.round(
          (scored.reduce((a, c) => a + c.weight * normalCdf(c.z as number), 0) /
            weight) *
            100,
        )
      : null;

  const form = input.activity?.length
    ? (() => {
        const short = ewma(input.activity!, 21);
        const long = ewma(input.activity!, 90);
        return short === null || long === null ? null : short - long;
      })()
    : null;

  const succession = successionRisk(input.succession);

  let caveat: string | null = null;
  if (!enough)
    caveat = `No index yet. A health score is a comparison, and there ${peerCount === 1 ? "is only 1 comparable club" : `are only ${peerCount} comparable clubs`} on record — at least ${min} are needed before a number means anything.`;
  else if (scored.length < COMPONENTS.length)
    caveat = `Based on ${scored.length} of ${COMPONENTS.length} components; the rest are not measured yet.`;

  return {
    index,
    components,
    form,
    formReading:
      form === null
        ? "Not enough activity history for a trend."
        : form > 0.1
          ? "Busier recently than its own baseline."
          : form < -0.1
            ? "Quieter recently than its own baseline — this leads attendance, so it shows up before turnout does."
            : "Holding steady against its own baseline.",
    succession,
    peerGroup: { size: peerCount, label: input.peerLabel || "comparable clubs" },
    caveat,
  };
}

// ------------------------------------------------------------- succession

export type SuccessionInput = {
  officers: {
    id: string;
    role: string;
    /** months until they are expected to leave; null if unknown */
    monthsToDeparture: number | null;
    /** has anyone else ever held this role, or shadowed it? */
    hasSuccessor: boolean;
  }[];
  /** responsibilities whose bus factor is 0 or 1, from the asset register */
  fragileAssets?: { name: string; busFactor: number }[];
};

export type SuccessionRisk = {
  level: "unknown" | "low" | "watch" | "high";
  leavingSoon: number;
  totalOfficers: number;
  withoutSuccessor: number;
  fragileAssets: number;
  reading: string;
};

/**
 * The flag that actually predicts a club dying: half or more of officers within
 * one term of leaving and no successor having held any role. This is the
 * mechanism, not a correlate — it is how the knowledge leaves the building.
 */
export function successionRisk(input?: SuccessionInput): SuccessionRisk {
  const officers = input?.officers ?? [];
  const fragile = input?.fragileAssets?.filter((a) => a.busFactor <= 1) ?? [];
  if (!officers.length)
    return {
      level: "unknown",
      leavingSoon: 0,
      totalOfficers: 0,
      withoutSuccessor: 0,
      fragileAssets: fragile.length,
      reading: "No officer terms on record, so succession risk cannot be assessed.",
    };

  const ONE_TERM = 6; // months
  const leavingSoon = officers.filter(
    (o) => o.monthsToDeparture !== null && o.monthsToDeparture <= ONE_TERM,
  ).length;
  const withoutSuccessor = officers.filter((o) => !o.hasSuccessor).length;
  const share = leavingSoon / officers.length;
  const noneReady = withoutSuccessor === officers.length;

  const level: SuccessionRisk["level"] =
    share >= 0.5 && noneReady
      ? "high"
      : share >= 0.5 || (withoutSuccessor > officers.length / 2 && leavingSoon > 0)
        ? "watch"
        : "low";

  return {
    level,
    leavingSoon,
    totalOfficers: officers.length,
    withoutSuccessor,
    fragileAssets: fragile.length,
    reading:
      level === "high"
        ? `${leavingSoon} of ${officers.length} officers leave within a term and nobody else has held these roles. This is the state a club does not come back from.`
        : level === "watch"
          ? `${leavingSoon} of ${officers.length} officers leave within a term. Get a successor into each role before they go.`
          : `Succession looks covered: ${officers.length - withoutSuccessor} of ${officers.length} roles have someone who has held them.`,
  };
}

const round = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

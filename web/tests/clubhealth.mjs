// Verifies the club intelligence layer, and especially that it REFUSES to
// score when there is no peer group. Pure functions, no database.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/clubhealth.mjs
import assert from "node:assert/strict";
import {
  clubHealth,
  successionRisk,
  COMPONENTS,
  MIN_PEERS,
} from "../lib/cec/clubhealth.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

const full = (v) => Object.fromEntries(COMPONENTS.map((c) => [c.key, v]));
const peers = (n, v) => Array.from({ length: n }, () => full(v));

// --- weights are a proper convex combination -------------------------------
const total = COMPONENTS.reduce((a, c) => a + c.weight, 0);
ok(Math.abs(total - 1) < 1e-9, `component weights sum to 1, got ${total}`);

// --- the headline behaviour: refuse to score without a peer group ----------
const alone = clubHealth({ metrics: full(0.8), peers: [] });
ok(alone.index === null, "no peers -> no index, rather than a confident number");
ok(/comparison/i.test(alone.caveat), `caveat explains why: "${alone.caveat}"`);
ok(
  alone.components.every((c) => c.z === null && c.percentile === null),
  "every component z is undefined with no peer group",
);
ok(
  alone.components.every((c) => c.value !== null),
  "raw values are still reported even when they cannot be scored",
);

const oneClub = clubHealth({ metrics: full(0.8), peers: peers(1, 0.5) });
ok(oneClub.index === null, "1 peer is still not a peer group");
const belowMin = clubHealth({ metrics: full(0.8), peers: peers(MIN_PEERS - 1, 0.5) });
ok(belowMin.index === null, `${MIN_PEERS - 1} peers is below the floor`);
const atMin = clubHealth({ metrics: full(0.8), peers: peers(MIN_PEERS, 0.5) });
ok(atMin.index !== null, `${MIN_PEERS} peers is enough to score`);

// --- the index orders correctly -------------------------------------------
// Spread the peers so there is real variance to z-score against.
const spread = Array.from({ length: 12 }, (_, i) => full(0.3 + i * 0.05));
const strong = clubHealth({ metrics: full(0.95), peers: spread });
const middling = clubHealth({ metrics: full(0.6), peers: spread });
const weak = clubHealth({ metrics: full(0.2), peers: spread });
ok(
  strong.index > middling.index && middling.index > weak.index,
  `index orders: ${weak.index} < ${middling.index} < ${strong.index}`,
);
ok(strong.index <= 100 && weak.index >= 0, "index stays within 0-100");
ok(
  Math.abs(middling.index - 50) < 20,
  `a club at the peer median sits near 50, got ${middling.index}`,
);

// --- partial measurement is not treated as zero ---------------------------
// A club that has only recorded two components should be scored on those two,
// not punished for the six it has not measured yet.
const partial = clubHealth({
  metrics: { retention: 0.95, pipeline: 0.95 },
  peers: spread,
});
ok(partial.index !== null, "a partially-measured club still gets an index");
ok(
  partial.index > 60,
  `strong on what it measured reads high, not low: got ${partial.index}`,
);
ok(
  /components/i.test(partial.caveat || ""),
  `caveat names the partial basis: "${partial.caveat}"`,
);
ok(
  partial.components.filter((c) => c.value === null).length === COMPONENTS.length - 2,
  "unmeasured components are reported as unmeasured",
);

// --- form is a leading indicator ------------------------------------------
const quieting = [
  ...Array.from({ length: 12 }, (_, i) => ({ value: 1, ageDays: 120 - i * 5 })),
  ...Array.from({ length: 4 }, (_, i) => ({ value: 0, ageDays: 12 - i * 3 })),
];
const quiet = clubHealth({ metrics: full(0.8), peers: spread, activity: quieting });
ok(quiet.form < 0, `recent silence reads as negative form, got ${quiet.form}`);
ok(/quieter/i.test(quiet.formReading), `form reading says so: "${quiet.formReading}"`);

const busier = quieting.map((p) => ({ ...p, value: 1 - p.value }));
ok(
  clubHealth({ metrics: full(0.8), peers: spread, activity: busier }).form > 0,
  "a recent uptick reads positive",
);
ok(
  clubHealth({ metrics: full(0.8), peers: spread }).form === null,
  "no activity history -> no form, rather than zero",
);

// --- succession risk: the flag that actually predicts a club dying --------
const noData = successionRisk();
ok(noData.level === "unknown", "no officer terms -> unknown, not low");

const safe = successionRisk({
  officers: [
    { id: "a", role: "president", monthsToDeparture: 20, hasSuccessor: true },
    { id: "b", role: "treasurer", monthsToDeparture: 20, hasSuccessor: true },
    { id: "c", role: "events", monthsToDeparture: 8, hasSuccessor: true },
  ],
});
ok(safe.level === "low", `covered succession reads low, got ${safe.level}`);

// The documented alarm: half or more leaving within a term AND nobody else has
// ever held the role.
const doomed = successionRisk({
  officers: [
    { id: "a", role: "president", monthsToDeparture: 3, hasSuccessor: false },
    { id: "b", role: "treasurer", monthsToDeparture: 2, hasSuccessor: false },
    { id: "c", role: "events", monthsToDeparture: 24, hasSuccessor: false },
  ],
});
ok(doomed.level === "high", `the documented alarm fires, got ${doomed.level}`);
ok(doomed.leavingSoon === 2, "counts who is leaving within a term");
ok(
  /does not come back from/i.test(doomed.reading),
  "the reading is blunt about what this state means",
);

// Half leaving but successors exist is a watch, not a crisis.
const watch = successionRisk({
  officers: [
    { id: "a", role: "president", monthsToDeparture: 3, hasSuccessor: true },
    { id: "b", role: "treasurer", monthsToDeparture: 2, hasSuccessor: false },
  ],
});
ok(watch.level === "watch", `half leaving with partial cover is a watch, got ${watch.level}`);

// Unknown departure dates are not treated as imminent.
const unknown = successionRisk({
  officers: [
    { id: "a", role: "president", monthsToDeparture: null, hasSuccessor: false },
    { id: "b", role: "treasurer", monthsToDeparture: null, hasSuccessor: false },
  ],
});
ok(
  unknown.level !== "high",
  "missing departure dates are a roster gap, not an emergency",
);

// Fragile assets from the register are surfaced alongside.
const fragile = successionRisk({
  officers: [{ id: "a", role: "president", monthsToDeparture: 24, hasSuccessor: true }],
  fragileAssets: [
    { name: "cornellec.com", busFactor: 0 },
    { name: "Instagram", busFactor: 1 },
    { name: "Drive", busFactor: 3 },
  ],
});
ok(fragile.fragileAssets === 2, `only bus factor <=1 counts as fragile, got ${fragile.fragileAssets}`);

// --- the CEC case: one club, no peers, real succession risk ---------------
const cec = clubHealth({
  metrics: { retention: 0.7, officer_engagement: 0.9 },
  peers: [],
  succession: {
    officers: [
      { id: "p", role: "president", monthsToDeparture: 4, hasSuccessor: false },
      { id: "t", role: "recruitment", monthsToDeparture: 4, hasSuccessor: false },
    ],
    fragileAssets: [{ name: "cornellec.com", busFactor: 0 }],
  },
});
ok(cec.index === null, "CEC alone on the platform gets no index, correctly");
ok(
  cec.succession.level === "high",
  "but succession risk is computable from day one and fires",
);
ok(
  cec.succession.fragileAssets === 1,
  "the orphaned domain is counted even with no peer group",
);

console.log(`${checks} club-health assertions passed.`);

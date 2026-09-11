// Verifies the interview scheduler's math. Pure functions, no database.
// Run: node --experimental-strip-types tests/scheduler.mjs
import assert from "node:assert/strict";
import { computeFeasibility, computeAssignment } from "../lib/cec/scheduler.ts";

let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks++;
};
const slots = (n, prefix = "s") =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

// --- 1. Caps bind, and the min-cut says so ---------------------------------
// 3 candidates, one interviewer capped at 2, everyone free at 3 slots.
let f = computeFeasibility({
  panelSize: 1,
  candidates: ["c1", "c2", "c3"],
  panelists: [{ id: "p1", cap: 2 }],
  candidateSlots: { c1: slots(3), c2: slots(3), c3: slots(3) },
  panelistSlots: { p1: slots(3) },
});
ok(f.demand === 3, "counts demand");
ok(f.schedulable === 2, `cap limits to 2, got ${f.schedulable}`);
ok(f.short === 1, "reports shortfall");
ok(f.exact, "panel size 1 is exact");
ok(
  f.binding.some((b) => b.label === "cap:p1"),
  "min-cut names the binding cap",
);
ok(
  !f.binding.some((b) => b.label.startsWith("slot:")),
  "availability is not blamed when caps bind",
);
ok(/cap/i.test(f.explanation), "explanation blames caps");

// --- 2. Availability binds, caps do not ------------------------------------
// Generous caps but only one usable slot: two interviewers => at most 2.
f = computeFeasibility({
  panelSize: 1,
  candidates: ["c1", "c2", "c3"],
  panelists: [
    { id: "p1", cap: 10 },
    { id: "p2", cap: 10 },
  ],
  candidateSlots: { c1: ["s0"], c2: ["s0"], c3: ["s0"] },
  panelistSlots: { p1: ["s0"], p2: ["s0"] },
});
ok(f.schedulable === 2, `one slot x two interviewers = 2, got ${f.schedulable}`);
ok(
  !f.binding.some((b) => b.label.startsWith("cap:")),
  "generous caps are not blamed",
);
ok(
  /availability/i.test(f.explanation),
  `should blame availability: ${f.explanation}`,
);

// --- 3. A stranded candidate is named --------------------------------------
f = computeFeasibility({
  panelSize: 1,
  candidates: ["c1", "c2"],
  panelists: [{ id: "p1", cap: 10 }],
  candidateSlots: { c1: ["s0"], c2: ["zz"] }, // nobody is ever free at zz
  panelistSlots: { p1: ["s0"] },
});
ok(f.schedulable === 1, "only the overlapping candidate is schedulable");
ok(
  f.stranded.includes("c2") && !f.stranded.includes("c1"),
  `the stranded candidate is identified, got ${JSON.stringify(f.stranded)}`,
);
ok(f.noOverlap.includes("c2"), "c2 is flagged as having no overlap at all");
ok(/no availability/i.test(f.explanation), "explanation says to ask for times");

// --- 4. Conflicts of interest actually remove the edge ---------------------
const base = {
  panelSize: 1,
  candidates: ["c1"],
  panelists: [{ id: "p1", cap: 10 }],
  candidateSlots: { c1: ["s0"] },
  panelistSlots: { p1: ["s0"] },
};
ok(computeFeasibility(base).schedulable === 1, "schedulable before conflict");
ok(
  computeFeasibility({ ...base, conflicts: { c1: ["p1"] } }).schedulable === 0,
  "a conflicted pair cannot be scheduled",
);

// --- 5. Panels need k interviewers in the SAME slot ------------------------
const panelInput = {
  panelSize: 4,
  candidates: ["c1", "c2"],
  panelists: ["p1", "p2", "p3", "p4"].map((id) => ({ id, cap: 5 })),
  candidateSlots: { c1: ["s0", "s1"], c2: ["s0", "s1"] },
  panelistSlots: Object.fromEntries(
    ["p1", "p2", "p3", "p4"].map((p) => [p, ["s0", "s1"]]),
  ),
};
const a5 = computeAssignment(panelInput);
ok(a5.assignments.length === 2, "both panels placed");
ok(
  a5.assignments.every((a) => a.panel.length === 4),
  "each panel has exactly 4 interviewers",
);
ok(
  new Set(a5.assignments.map((a) => a.slot)).size === 2,
  "panels cannot share a slot when only 4 interviewers exist",
);
ok(!computeFeasibility(panelInput).exact, "panel feasibility is flagged inexact");

// --- 6. Load balancing spreads work ---------------------------------------
const a6 = computeAssignment({
  panelSize: 1,
  candidates: ["c1", "c2", "c3"],
  panelists: ["p1", "p2", "p3"].map((id) => ({ id, cap: 10 })),
  candidateSlots: Object.fromEntries(
    ["c1", "c2", "c3"].map((c) => [c, slots(3)]),
  ),
  panelistSlots: Object.fromEntries(
    ["p1", "p2", "p3"].map((p) => [p, slots(3)]),
  ),
});
ok(a6.assignments.length === 3, "all placed");
ok(
  Math.max(...Object.values(a6.load)) === 1,
  `work spread evenly, max load ${Math.max(...Object.values(a6.load))}`,
);

// --- 7. Most-constrained-first avoids stranding ---------------------------
// c1 can only do s0. c2 can do s0 or s1. Naive order would strand c1.
const a7 = computeAssignment({
  panelSize: 1,
  candidates: ["c2", "c1"], // deliberately the unhelpful order
  panelists: [{ id: "p1", cap: 2 }],
  candidateSlots: { c1: ["s0"], c2: ["s0", "s1"] },
  panelistSlots: { p1: ["s0", "s1"] },
});
ok(a7.assignments.length === 2, "both placed despite adversarial input order");
ok(a7.unplaced.length === 0, "nobody stranded by ordering");

// --- 8. Feasibility and assignment agree ----------------------------------
const input8 = {
  panelSize: 1,
  candidates: ["c1", "c2", "c3", "c4"],
  panelists: [
    { id: "p1", cap: 2 },
    { id: "p2", cap: 1 },
  ],
  candidateSlots: Object.fromEntries(
    ["c1", "c2", "c3", "c4"].map((c) => [c, slots(3)]),
  ),
  panelistSlots: { p1: slots(3), p2: ["s1"] },
};
const f8 = computeFeasibility(input8);
const a8 = computeAssignment(input8);
ok(f8.schedulable === 3, `total cap 3, got ${f8.schedulable}`);
ok(
  a8.assignments.length === f8.schedulable,
  `assignment (${a8.assignments.length}) matches feasibility (${f8.schedulable})`,
);
ok(a8.unplaced.length === 1, "exactly one candidate unplaced");

// --- 9. Caps are never exceeded -------------------------------------------
ok(
  Object.entries(a8.load).every(
    ([p, n]) => n <= input8.panelists.find((x) => x.id === p).cap,
  ),
  "no interviewer exceeds their declared cap",
);

// --- 10. The real CEC instance from the field evidence --------------------
// 35 first-round candidates, 7 officers, cap 3 each => 21 seats, short by 14.
const week = [];
for (let d = 0; d < 5; d++) for (let h = 0; h < 4; h++) week.push(`d${d}h${h}`);
const officers = ["o1", "o2", "o3", "o4", "o5", "o6", "o7"];
const cands35 = Array.from({ length: 35 }, (_, i) => `x${i}`);
const cec = {
  panelSize: 1,
  candidates: cands35,
  panelists: officers.map((id) => ({ id, cap: 3 })),
  candidateSlots: Object.fromEntries(cands35.map((c) => [c, week])),
  panelistSlots: Object.fromEntries(officers.map((o) => [o, week])),
};
const f10 = computeFeasibility(cec);
ok(f10.demand === 35, "35 candidates");
ok(f10.schedulable === 21, `7 officers x cap 3 = 21, got ${f10.schedulable}`);
ok(f10.short === 14, "short by 14 — the real gap CEC faces");
ok(/cap/i.test(f10.explanation), "correctly identifies caps as the problem");

const f10b = computeFeasibility({
  ...cec,
  panelists: officers.map((id) => ({ id, cap: 5 })),
});
ok(f10b.short === 0, "raising every cap to 5 clears it (7 x 5 = 35)");

const a10 = computeAssignment({
  ...cec,
  panelists: officers.map((id) => ({ id, cap: 5 })),
});
ok(a10.assignments.length === 35, "all 35 actually placed");
ok(
  Math.max(...Object.values(a10.load)) <= 5,
  "nobody exceeds the raised cap",
);
ok(
  new Set(a10.assignments.map((a) => `${a.slot}|${a.panel[0]}`)).size === 35,
  "no interviewer is double-booked in a slot",
);

// --- 11. Second rounds: 17 panels of 4 across the same 7 officers ---------
// 7 officers can seat at most one panel of 4 per slot. 20 slots => plenty of
// slots, but cap 3 each gives 21 seats total, and 17 panels need 68.
const cands17 = Array.from({ length: 17 }, (_, i) => `y${i}`);
const second = {
  panelSize: 4,
  candidates: cands17,
  panelists: officers.map((id) => ({ id, cap: 3 })),
  candidateSlots: Object.fromEntries(cands17.map((c) => [c, week])),
  panelistSlots: Object.fromEntries(officers.map((o) => [o, week])),
};
const a11 = computeAssignment(second);
ok(
  a11.assignments.length === 5,
  `21 seats / 4 per panel = 5 panels, got ${a11.assignments.length}`,
);
ok(
  a11.assignments.every((a) => a.panel.length === 4),
  "every second-round panel is full",
);
ok(
  a11.unplaced.length === 12,
  `12 candidates cannot be seated at cap 3, got ${a11.unplaced.length}`,
);
// This is the finding that matters: second rounds are where CEC breaks.
ok(
  computeAssignment({
    ...second,
    panelists: officers.map((id) => ({ id, cap: 10 })),
  }).assignments.length === 17,
  "raising caps to 10 seats all 17 second rounds",
);

// --- REGRESSION: stranded must equal the actual shortfall -----------------
// A served candidate can remain reachable in the residual graph through a
// reverse edge it shares with an unserved one. Inferring "unmet" from
// reachability named all 35 CEC candidates stranded when only 14 were.
{
  const f = computeFeasibility(cec);
  ok(
    f.stranded.length === f.short,
    `stranded (${f.stranded.length}) must equal short (${f.short})`,
  );
  ok(f.stranded.length === 14, `exactly 14 stranded on the CEC instance, got ${f.stranded.length}`);
}
// Hold across many random instances, which is how the bug was found.
{
  let mismatches = 0;
  const rand = (seed) => { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; };
  const r = rand(20260911);
  for (let trial = 0; trial < 400; trial++) {
    const nC = 1 + Math.floor(r() * 6), nP = 1 + Math.floor(r() * 4), nS = 1 + Math.floor(r() * 4);
    const all = Array.from({ length: nS }, (_, i) => `t${i}`);
    const pick = () => all.filter(() => r() > 0.4);
    const input = {
      panelSize: 1,
      candidates: Array.from({ length: nC }, (_, i) => `c${i}`),
      panelists: Array.from({ length: nP }, (_, i) => ({ id: `p${i}`, cap: Math.floor(r() * 3) })),
      candidateSlots: {}, panelistSlots: {},
    };
    for (const c of input.candidates) input.candidateSlots[c] = pick();
    for (const p of input.panelists) input.panelistSlots[p.id] = pick();
    const f = computeFeasibility(input);
    if (f.stranded.length !== f.short) mismatches++;
  }
  ok(mismatches === 0, `stranded matched short in all 400 random instances, ${mismatches} mismatches`);
}

console.log(`${checks} scheduler assertions passed.`);

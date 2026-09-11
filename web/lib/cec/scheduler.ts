// Pure interview-round scheduling. No database, no I/O — plain data in, plain
// data out, so the math can be tested directly and replayed against history.
//
// See docs/14-quant-per-feature.md §1. Feasibility is a max-flow problem and the
// min-cut is the part users care about: it names the constraint that is actually
// binding, so "raise two caps" can be answered with "that will not help."

import { FlowNetwork } from "./flow";

export type SchedulerInput = {
  panelSize: number;
  candidates: string[];
  panelists: { id: string; cap: number }[];
  /** person id -> slots they are free for */
  candidateSlots: Record<string, string[]>;
  panelistSlots: Record<string, string[]>;
  /** candidate id -> panelist ids who must not interview them */
  conflicts?: Record<string, string[]>;
};

export type Feasibility = {
  demand: number;
  schedulable: number;
  short: number;
  panelSize: number;
  binding: { label: string; cap: number }[];
  /** candidates whose demand could not be met */
  stranded: string[];
  /** of those, the ones with no overlap with any eligible interviewer at all */
  noOverlap: string[];
  explanation: string;
  exact: boolean;
};

const setOf = (xs?: string[]) => new Set(xs || []);

export function computeFeasibility(input: SchedulerInput): Feasibility {
  const k = Math.max(1, input.panelSize);
  const demand = input.candidates.length;
  const net = new FlowNetwork();
  const source = net.node();
  const sink = net.node();

  const candNode = new Map<string, number>();
  for (const c of input.candidates) {
    const n = net.node();
    candNode.set(c, n);
    net.edge(source, n, k, `candidate:${c}`);
  }

  const panelNode = new Map<string, number>();
  for (const p of input.panelists) {
    const n = net.node();
    panelNode.set(p.id, n);
    net.edge(n, sink, Math.max(0, p.cap) * k, `cap:${p.id}`);
  }

  // One seat per (panelist, slot): a person can hold one interview per slot.
  const seat = new Map<string, number>();
  for (const p of input.panelists) {
    for (const s of setOf(input.panelistSlots[p.id])) {
      const n = net.node();
      seat.set(`${p.id}|${s}`, n);
      net.edge(n, panelNode.get(p.id)!, 1, `slot:${p.id}:${s}`);
    }
  }

  for (const c of input.candidates) {
    const blocked = setOf(input.conflicts?.[c]);
    for (const s of setOf(input.candidateSlots[c])) {
      for (const p of input.panelists) {
        if (blocked.has(p.id)) continue;
        const sn = seat.get(`${p.id}|${s}`);
        if (sn !== undefined) net.edge(candNode.get(c)!, sn, 1);
      }
    }
  }

  const seats = net.maxflow(source, sink);
  const schedulable = Math.min(Math.floor(seats / k), demand);
  const binding = net.cut(source);

  const caps = binding.filter((b) => b.label.startsWith("cap:")).length;
  const slots = binding.filter((b) => b.label.startsWith("slot:")).length;

  // A candidate is unmet iff their demand edge carries less than k units of
  // flow. Read the flow directly — do NOT infer it from residual reachability.
  // A fully served candidate can still be reachable through a reverse edge it
  // shares with an unserved one, which on the real CEC instance named all 35
  // candidates stranded when only 14 were.
  const served = new Map<string, number>();
  for (const e of net.graph[source]) {
    if (e.label?.startsWith("candidate:"))
      served.set(e.label.slice("candidate:".length), e.flow);
  }
  const stranded = input.candidates.filter((c) => (served.get(c) ?? 0) < k);
  // Distinguish "no overlap with anyone" from "lost the contest for capacity".
  const noOverlap = stranded.filter((c) => {
    const blocked = setOf(input.conflicts?.[c]);
    for (const s of setOf(input.candidateSlots[c]))
      for (const p of input.panelists)
        if (!blocked.has(p.id) && setOf(input.panelistSlots[p.id]).has(s))
          return false;
    return true;
  });

  let explanation: string;
  if (schedulable >= demand) {
    explanation = `All ${demand} interviews fit within current caps and availability.`;
  } else if (noOverlap.length === stranded.length && stranded.length) {
    explanation = `${noOverlap.length} candidate${noOverlap.length === 1 ? " has" : "s have"} no availability overlapping any interviewer. Ask them for more times.`;
  } else if (caps && !slots) {
    explanation = `Interviewer weekly caps are binding, not availability. Raising ${caps} cap${caps === 1 ? "" : "s"} adds capacity directly.`;
  } else if (slots && !caps) {
    explanation = `Availability is binding, not caps. Raising caps will not help — you need interviewers free at more times.`;
  } else {
    explanation = `Both caps and availability are binding. Adding one interviewer with broad availability helps more than raising an existing cap.`;
  }

  return {
    demand,
    schedulable,
    short: Math.max(0, demand - schedulable),
    panelSize: k,
    binding,
    stranded,
    noOverlap,
    explanation,
    // For panels > 1 the flow relaxation counts seats without forcing a panel's
    // k seats into the same slot, so it is an upper bound. computeAssignment is
    // the ground truth there.
    exact: k === 1,
  };
}

export type Assignment = { candidate: string; slot: string; panel: string[] };

export function computeAssignment(input: SchedulerInput): {
  assignments: Assignment[];
  unplaced: string[];
  load: Record<string, number>;
} {
  const k = Math.max(1, input.panelSize);
  const load: Record<string, number> = {};
  const cap: Record<string, number> = {};
  for (const p of input.panelists) {
    load[p.id] = 0;
    cap[p.id] = Math.max(0, p.cap);
  }
  const busy = new Map<string, Set<string>>();

  const eligible = (c: string, s: string) => {
    const blocked = setOf(input.conflicts?.[c]);
    const used = busy.get(s) || new Set<string>();
    return input.panelists
      .filter(
        (p) =>
          !blocked.has(p.id) &&
          !used.has(p.id) &&
          setOf(input.panelistSlots[p.id]).has(s) &&
          load[p.id] < cap[p.id],
      )
      .sort((a, b) => load[a.id] - load[b.id]);
  };

  const options = (c: string) =>
    setOf(input.candidateSlots[c])
      .values()
      .toArray()
      .filter((s) => eligible(c, s).length >= k);

  const remaining = new Set(input.candidates);
  const assignments: Assignment[] = [];

  while (remaining.size) {
    // Most-constrained candidate first, recomputed every pass because each
    // placement changes everyone else's options. Without this, a candidate with
    // one feasible slot gets stranded by someone who had three.
    let pick: string | null = null;
    let pickOptions: string[] = [];
    let fewest = Infinity;
    for (const c of remaining) {
      const o = options(c);
      if (o.length < fewest) {
        fewest = o.length;
        pick = c;
        pickOptions = o;
      }
    }
    if (pick === null) break;
    remaining.delete(pick);
    if (!pickOptions.length) continue;

    // Among feasible slots prefer the least scarce, so we avoid burning a slot
    // another candidate uniquely depends on.
    pickOptions.sort((a, b) => eligible(pick!, b).length - eligible(pick!, a).length);
    const slot = pickOptions[0];
    const panel = eligible(pick, slot).slice(0, k);
    for (const p of panel) {
      load[p.id]++;
      if (!busy.has(slot)) busy.set(slot, new Set());
      busy.get(slot)!.add(p.id);
    }
    assignments.push({ candidate: pick, slot, panel: panel.map((p) => p.id) });
  }

  const placed = new Set(assignments.map((a) => a.candidate));
  return {
    assignments,
    unplaced: input.candidates.filter((c) => !placed.has(c)),
    load,
  };
}

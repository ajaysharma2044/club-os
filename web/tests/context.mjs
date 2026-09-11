// Campus context: regimes, the state vector, and the attribution fix.
// Pure functions, no database, no network.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/context.mjs
import assert from "node:assert/strict";
import {
  detectRegime,
  campusState,
  behaviouralAlpha,
  topicIntensity,
  REGIME_TURNOUT,
  REGIMES,
} from "../lib/cec/context.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

// A realistic Cornell-shaped fall term.
const cal = {
  termStart: "2026-08-24",
  termEnd: "2026-12-20",
  moveInEnd: "2026-08-26",
  recruitingDays: 21,
  prelimPeriods: [
    { start: "2026-10-05", end: "2026-10-16" },
    { start: "2026-11-09", end: "2026-11-20" },
  ],
  breaks: [
    { start: "2026-10-17", end: "2026-10-20", label: "Fall break" },
    { start: "2026-11-25", end: "2026-11-29", label: "Thanksgiving" },
  ],
  finalsStart: "2026-12-10",
  finalsEnd: "2026-12-18",
};

// --- regimes ---------------------------------------------------------------
const r = (d) => detectRegime(d + "T18:00:00Z", cal).regime;
ok(r("2026-08-25") === "move_in", `move-in, got ${r("2026-08-25")}`);
ok(r("2026-09-05") === "recruiting", `recruiting window, got ${r("2026-09-05")}`);
ok(r("2026-09-30") === "normal_term", `normal term, got ${r("2026-09-30")}`);
ok(r("2026-10-08") === "prelims", `prelim block, got ${r("2026-10-08")}`);
ok(r("2026-10-18") === "break", `fall break, got ${r("2026-10-18")}`);
ok(r("2026-12-12") === "finals", `finals, got ${r("2026-12-12")}`);
ok(r("2026-07-01") === "break", `summer is a break, got ${r("2026-07-01")}`);
ok(r("2027-01-15") === "break", `after term end is a break, got ${r("2027-01-15")}`);

// Breaks must win over prelims when they overlap the same window.
ok(
  detectRegime("2026-10-18T18:00:00Z", cal).regime === "break",
  "a break inside a prelim stretch still reads as a break",
);

// --- term progress and finals countdown -----------------------------------
const early = detectRegime("2026-08-25T12:00:00Z", cal);
const late = detectRegime("2026-12-15T12:00:00Z", cal);
ok(early.termProgress < 0.1, `early term progress is small, got ${early.termProgress}`);
ok(late.termProgress > 0.9, `late term progress is near 1, got ${late.termProgress}`);
ok(
  detectRegime("2027-06-01T12:00:00Z", cal).termProgress === 1,
  "progress clamps at 1 rather than exceeding it",
);
ok(
  detectRegime("2026-12-03T12:00:00Z", cal).daysToFinals === 7,
  `a week before finals reads 7, got ${detectRegime("2026-12-03T12:00:00Z", cal).daysToFinals}`,
);
ok(
  detectRegime("2026-12-12T12:00:00Z", cal).daysToFinals < 0,
  "during finals the countdown is negative, not clamped to zero",
);
ok(/finals/i.test(detectRegime("2026-12-12T12:00:00Z", cal).note), "the note names the regime");

// --- every regime has a turnout prior, and they are ordered sensibly -------
ok(
  REGIMES.every((k) => typeof REGIME_TURNOUT[k] === "number"),
  "every regime has a turnout multiplier",
);
ok(
  REGIME_TURNOUT.finals < REGIME_TURNOUT.prelims &&
    REGIME_TURNOUT.prelims < REGIME_TURNOUT.normal_term &&
    REGIME_TURNOUT.normal_term < REGIME_TURNOUT.recruiting,
  "finals < prelims < normal < recruiting",
);
ok(REGIME_TURNOUT.break < REGIME_TURNOUT.finals, "a break is worse than finals");

// --- campus state vector --------------------------------------------------
const ev = (startsAt, cancelled = false) => ({
  source: "t", externalId: Math.random().toString(36).slice(2), title: "x",
  startsAt, endsAt: null, locationName: "", url: "", tags: [], cancelled,
});
{
  const at = "2026-09-30T23:00:00Z";
  const events = [
    ev("2026-09-30T23:00:00Z"), ev("2026-09-30T22:30:00Z"), ev("2026-10-01T00:00:00Z"),
    ev("2026-09-28T23:00:00Z"), // far outside the window
    ev("2026-09-30T23:00:00Z", true), // cancelled
  ];
  const s = campusState({ at, calendar: cal, events, windowHours: 3 });
  ok(s.eventDensity === 3, `counts only live events in the window, got ${s.eventDensity}`);
  ok(s.regime === "normal_term", "state carries the regime");
  ok(s.relativeDensity === null, "no typical density supplied -> null, not a guess");
  const rel = campusState({ at, calendar: cal, events, windowHours: 3, typicalDensity: 6 });
  ok(Math.abs(rel.relativeDensity - 0.5) < 1e-9, `3 against a typical 6 is 0.5, got ${rel.relativeDensity}`);
}

// --- THE ATTRIBUTION FIX ---------------------------------------------------
// The worked case: expected 100 in a vacuum, 40 showed up, but it was a busy
// night. Context should show this was roughly par, not a catastrophe.
{
  const state = campusState({ at: "2026-09-30T23:00:00Z", calendar: cal, events: [] });
  const busy = behaviouralAlpha({ actual: 40, baseline: 100, state, competing: 50 });
  ok(busy.expected < 60, `50 clashes drags expectation well below baseline, got ${busy.expected}`);
  ok(
    busy.verdict === "as_expected" || busy.verdict === "below",
    `40 on a night like that is not a catastrophe, got ${busy.verdict}`,
  );
  const blind = behaviouralAlpha({ actual: 40, baseline: 100, state, competing: 0 });
  ok(
    blind.verdict === "well_below",
    "the same 40 on a quiet night genuinely is well below",
  );
  ok(
    busy.expected < blind.expected,
    "context lowers the bar when the night is crowded, which is the whole point",
  );
}

// The inverse, which matters just as much: 200 during finals when comparable
// events draw 80 is remarkable, and a context-blind model would understate it.
{
  const finals = campusState({ at: "2026-12-12T23:00:00Z", calendar: cal, events: [] });
  const normal = campusState({ at: "2026-09-30T23:00:00Z", calendar: cal, events: [] });
  const duringFinals = behaviouralAlpha({ actual: 200, baseline: 80, state: finals, competing: 0 });
  const duringTerm = behaviouralAlpha({ actual: 200, baseline: 80, state: normal, competing: 0 });
  ok(duringFinals.verdict === "well_above", "200 in finals reads as well above");
  ok(
    duringFinals.alpha > duringTerm.alpha,
    `the same 200 counts for more in finals: ${duringFinals.alpha} vs ${duringTerm.alpha}`,
  );
  ok(/strong/i.test(duringFinals.reading), "the reading says so in words");
}

// --- competition decays, never goes negative ------------------------------
{
  const state = campusState({ at: "2026-09-30T23:00:00Z", calendar: cal, events: [] });
  const at = (n) => behaviouralAlpha({ actual: 0, baseline: 100, state, competing: n }).expected;
  ok(at(0) > at(5) && at(5) > at(20), `expectation falls monotonically: ${at(0)}, ${at(5)}, ${at(20)}`);
  ok(at(1000) >= 0, "extreme competition never produces a negative expectation");
  ok(at(5) - at(10) > at(50) - at(55), "each additional clash hurts less than the last");
}

// --- topic intensity -------------------------------------------------------
{
  const at = "2026-09-30T12:00:00Z";
  const events = [
    { ...ev("2026-09-29T18:00:00Z"), title: "AI and the future of work" },
    { ...ev("2026-09-30T18:00:00Z"), title: "Machine learning workshop" },
    { ...ev("2026-06-01T18:00:00Z"), title: "AI summit" }, // months stale
    { ...ev("2026-09-30T18:00:00Z"), title: "Poetry reading" },
  ];
  const topics = { ai: ["ai", "machine learning"], arts: ["poetry", "theatre"] };
  const out = topicIntensity(events, topics, at);
  ok(out[0].topic === "ai", "the busier topic ranks first");
  ok(out[0].matches === 3, `all three AI events match, got ${out[0].matches}`);
  ok(
    out[0].intensity < out[0].matches,
    "recency weighting means a stale event counts for less than a fresh one",
  );
  ok(out[0].examples.length <= 3, "examples are capped");
  ok(
    out.find((t) => t.topic === "arts").matches === 1,
    "keyword matching is not bleeding across topics",
  );
}

console.log(`${checks} campus-context assertions passed.`);

// Factor persistence: point-in-time reads, the use gate at the feature store,
// and refusals recorded as rows.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/factor-store.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The database must exist before any module imports db.ts, which resolves the
// path once and caches the connection.
const dir = mkdtempSync(join(tmpdir(), "cec-factors-"));
process.env.CEC_DATABASE = join(dir, "factors.sqlite");

const { db } = await import("../lib/cec/db.ts");
const { defineFactor, computeFactor } = await import("../lib/cec/factors.ts");
const {
  factorStoreInit,
  writeFactorValue,
  computeAndStore,
  factorsAsOf,
  factorHistory,
  factorAtHorizon,
  writeEvaluation,
  latestEvaluations,
  explainOmissions,
} = await import("../lib/cec/factor-store.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

factorStoreInit();
db()
  .prepare("INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)")
  .run("officer1", "Officer", "o@example.edu", "x", "officer");

// Two factors with deliberately different permitted uses.
const density = defineFactor({
  id: "campus_event_density",
  name: "Campus event density",
  description: "Competing programming in the window.",
  entity: "campus",
  valueType: "count",
  hypothesis: "More competing programming at the same hour lowers turnout.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning", "club_reporting", "sponsor_ranking"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["cornell_localist"],
  availableAt: "Feed rows with observed_at <= asOf.",
  version: "1.0.0",
  status: "experimental",
  requires: ["events"],
  compute: (i) => ({ value: i.events, n: i.events }),
  explain: (v) => (v === null ? "Unknown." : `${v} competing events.`),
});

// Planning only. This is the one that must be invisible to a sponsor read.
const pressure = defineFactor({
  id: "assessment_pressure",
  name: "Assessment pressure",
  description: "How much coursework is bearing down.",
  entity: "campus",
  valueType: "index",
  hypothesis: "Higher assessment pressure lowers optional-event turnout.",
  supportedOutcomes: ["event_met_forecast"],
  expectedSign: -1,
  privacy: "public_context",
  permittedUses: ["planning"],
  minimumSampleSize: 0,
  halfLifeDays: null,
  sources: ["academic_calendar"],
  availableAt: "The academic calendar is published before the term.",
  version: "1.0.0",
  status: "experimental",
  requires: ["pressure"],
  compute: (i) => ({ value: i.pressure, n: 1 }),
  explain: (v) => `Pressure ${v}.`,
});

const registry = [density, pressure];

// ============================================================ write and read
{
  computeAndStore(density, "cornell", { events: 12 }, "2026-09-15T00:00:00Z");
  computeAndStore(pressure, "cornell", { pressure: 0.4 }, "2026-09-15T00:00:00Z");

  const planning = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: "2026-09-16T00:00:00Z",
    use: "planning",
    registry,
  });
  ok(planning.factors.length === 2, `planning sees both, got ${planning.factors.length}`);
  ok(planning.omitted.length === 0, "and nothing is omitted");
  const d = planning.factors.find((f) => f.factor === "campus_event_density");
  ok(d.value === 12, `the value round-trips, got ${d.value}`);
  ok(d.n === 12, "so does the sample size");
  ok(d.modelVersion === "1.0.0", "and the model version");
  ok(d.status === "ok", "and the status");
  ok(/12 competing/.test(d.reading), "and the plain-language reading");
}

// ======================== THE FEATURE-STORE GATE — the non-negotiable part
{
  // docs/11 §7: proxies are blocked AT THE FEATURE STORE, not at display.
  // A sponsor read must not receive a planning-only factor, and the store —
  // not a component — is what refuses.
  const sponsor = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: "2026-09-16T00:00:00Z",
    use: "sponsor_ranking",
    registry,
  });
  ok(sponsor.factors.length === 1, `sponsor sees only the permitted factor, got ${sponsor.factors.length}`);
  ok(
    sponsor.factors[0].factor === "campus_event_density",
    "and it is the one that declared sponsor_ranking",
  );
  ok(
    !sponsor.factors.some((f) => f.factor === "assessment_pressure"),
    "the planning-only factor is absent from the sponsor read",
  );

  // Omission must be auditable or it is indistinguishable from a bug.
  ok(sponsor.omitted.length === 1, "the omission is reported, not silent");
  ok(sponsor.omitted[0].factor === "assessment_pressure", "and names the factor");
  ok(/does not permit/i.test(sponsor.omitted[0].reason), "and says why");
  ok(
    explainOmissions(registry, "employer_evidence").length === 2,
    "an employer read is refused BOTH factors, since neither declared it",
  );
}

// ================================== POINT-IN-TIME — the backtest-honesty rule
{
  computeAndStore(
    density,
    "cornell",
    { events: 50 },
    "2026-10-01T00:00:00Z",
    { occurredAt: "2026-10-01T00:00:00Z", observedAt: "2026-10-01T00:00:00Z" },
  );

  // A model replaying 15 September must not see the October row.
  const earlier = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: "2026-09-16T00:00:00Z",
    use: "planning",
    registry,
  });
  ok(
    earlier.factors.find((f) => f.factor === "campus_event_density").value === 12,
    "a read as of September sees the September value, not October's",
  );

  const later = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: "2026-10-02T00:00:00Z",
    use: "planning",
    registry,
  });
  ok(
    later.factors.find((f) => f.factor === "campus_event_density").value === 50,
    "and a read as of October sees the later one",
  );

  // The case the pair exists for: something that HAPPENED in September but was
  // only PUBLISHED to us in November must be invisible to a September replay.
  computeAndStore(
    density,
    "backfilled",
    { events: 99 },
    "2026-09-10T00:00:00Z",
    { occurredAt: "2026-09-10T00:00:00Z", observedAt: "2026-11-20T00:00:00Z" },
  );
  const replay = factorsAsOf({
    entityType: "campus",
    entityId: "backfilled",
    asOf: "2026-09-15T00:00:00Z",
    use: "planning",
    registry,
  });
  ok(
    replay.factors.length === 0,
    "late-observed evidence about an earlier moment is invisible to a replay of that moment",
  );
  const afterPublication = factorsAsOf({
    entityType: "campus",
    entityId: "backfilled",
    asOf: "2026-12-01T00:00:00Z",
    use: "planning",
    registry,
  });
  ok(afterPublication.factors.length === 1, "but visible once it had been published");

  // Observing something before it happened is incoherent and must be refused.
  let threw = false;
  try {
    writeFactorValue(
      computeFactor(density, "bad", { events: 1 }, "2026-09-15T00:00:00Z"),
      { occurredAt: "2026-09-15T00:00:00Z", observedAt: "2026-09-01T00:00:00Z" },
    );
  } catch {
    threw = true;
  }
  ok(threw, "a value observed before the moment it describes is refused");
}

// ================================= A REFUSAL IS A ROW, NOT A MISSING RECORD
{
  const thin = defineFactor({
    ...{
      id: "needs_more",
      name: "Needs more",
      description: "Refuses below five observations.",
      entity: "club",
      valueType: "rate",
      hypothesis: "Something plausible that could be shown false.",
      supportedOutcomes: [],
      expectedSign: null,
      privacy: "club_internal",
      permittedUses: ["planning"],
      minimumSampleSize: 5,
      halfLifeDays: null,
      sources: [],
      availableAt: "Own record only.",
      version: "1.0.0",
      status: "experimental",
      requires: ["n"],
      compute: (i) => ({ value: 0.5, n: i.n }),
      explain: (v) => (v === null ? "Not enough yet." : `Rate ${v}.`),
    },
  });
  const refusal = computeAndStore(thin, "cec", { n: 2 }, "2026-09-15T00:00:00Z");
  ok(refusal.status === "insufficient_data", "the registry refuses");
  ok(refusal.value === null, "with a null value");

  const hist = factorHistory("needs_more", "club", "cec");
  ok(hist.length === 1, "and the refusal is PERSISTED as a row");
  ok(hist[0].value === null, "with a null value");
  ok(hist[0].status === "insufficient_data", "and the reason preserved");
  ok(
    hist[0].n === 2,
    "and how much data it had, so a later reader can see it was asked and declined",
  );

  // factorAtHorizon is for training, so it must skip refusals.
  ok(
    factorAtHorizon("needs_more", "club", "cec", "2026-12-01T00:00:00Z") === null,
    "a refusal is not a training row",
  );
  ok(
    factorAtHorizon("campus_event_density", "campus", "cornell", "2026-09-20T00:00:00Z").value === 12,
    "but a real value is, at the value observable by the horizon",
  );
  ok(
    factorAtHorizon("campus_event_density", "campus", "cornell", "2026-08-01T00:00:00Z") === null,
    "and nothing observable before the horizon means null, never the nearest future value",
  );
}

// =========================================================== idempotency
{
  const before = factorHistory("campus_event_density", "campus", "cornell").length;
  computeAndStore(density, "cornell", { events: 12 }, "2026-09-15T00:00:00Z");
  const after = factorHistory("campus_event_density", "campus", "cornell").length;
  ok(after === before, "recomputing the same factor at the same moment writes no duplicate");

  // A new model version writes a NEW row rather than overwriting, so a decision
  // made under the old version stays reproducible.
  const v2 = defineFactor({ ...density, version: "2.0.0" });
  computeAndStore(v2, "cornell", { events: 14 }, "2026-09-15T00:00:00Z");
  const hist = factorHistory("campus_event_density", "campus", "cornell");
  ok(hist.length === after + 1, "a new model version adds a row");
  ok(
    hist.some((h) => h.modelVersion === "1.0.0") && hist.some((h) => h.modelVersion === "2.0.0"),
    "and both versions remain readable, so an old decision can still be reproduced",
  );
}

// ============================================================== evaluation
{
  writeEvaluation(
    {
      factor: "campus_event_density",
      outcome: "event_met_forecast",
      pairs: 120,
      windows: 4,
      ic: -0.22,
      ir: -1.4,
      signAgrees: true,
      verdict: "strong",
      computedAt: "2026-09-15T00:00:00Z",
    },
    18,
  );
  const rows = latestEvaluations();
  ok(rows.length === 1, "an evaluation persists");
  ok(rows[0].verdict === "strong", "with its verdict");
  ok(rows[0].signAgrees === true, "and its sign agreement, round-tripped as a boolean");
  ok(rows[0].distinctSubjects === 18, "and the distinct-subject count, not just the row count");
  ok(rows[0].pairs === 120, "both are kept: 120 rows from 18 subjects");

  writeEvaluation(
    {
      factor: "campus_event_density",
      outcome: "event_met_forecast",
      pairs: 140,
      windows: 5,
      ic: -0.1,
      ir: -0.9,
      signAgrees: true,
      verdict: "useful",
      computedAt: "2026-10-15T00:00:00Z",
    },
    22,
  );
  const latest = latestEvaluations();
  ok(latest.length === 1, "the latest evaluation supersedes in the view");
  ok(latest[0].verdict === "useful", "showing the newer verdict");
  const all = db().prepare("SELECT COUNT(*) n FROM factor_evaluations").get();
  ok(all.n === 2, "while both rows are retained — evaluations are append-only");

  // A null IC must survive the round trip as null, not as 0.
  writeEvaluation(
    {
      factor: "assessment_pressure", outcome: "event_met_forecast",
      pairs: 3, windows: 0, ic: null, ir: null, signAgrees: null,
      verdict: "insufficient_data", computedAt: "2026-10-15T00:00:00Z",
    },
    3,
  );
  const nullish = latestEvaluations().find((r) => r.factor === "assessment_pressure");
  ok(nullish.ic === null, "a null IC stays null, never becomes zero");
  ok(nullish.signAgrees === null, "and an unknown sign agreement stays unknown");
}

console.log(`${checks} factor-store assertions passed.`);

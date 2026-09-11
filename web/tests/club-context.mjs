// The assembler: club id + moment -> a complete, stored, auditable picture.
// Exercised against real captured Cornell data for CEC.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/club-context.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cec-clubctx-"));
process.env.CEC_DATABASE = join(dir, "ctx.sqlite");

const { assembleContext, contextAcrossSlots, rosterFor } = await import("../lib/cec/club-context.ts");
const { parseCornellRoster } = await import("../lib/cec/academic.ts");
const { parseLocalist } = await import("../lib/cec/campus.ts");
const { parseNwsHourly } = await import("../lib/cec/weather.ts");
const { factorHistory, factorsAsOf } = await import("../lib/cec/factor-store.ts");
const { CONTEXT_FACTORS } = await import("../lib/cec/registry.ts");

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8"));

const courses = parseCornellRoster(fx("cornell-roster.json"));
const events = parseLocalist(fx("cornell-localist.json"), "cornell");
const weather = parseNwsHourly(fx("nws-hourly.json"));

const TUE_7PM = "2026-09-15T23:00:00Z";
const TUE_11AM = "2026-09-15T15:00:00Z";

// ============================================================== the happy path
{
  const ctx = assembleContext("cec", TUE_7PM, { courses, events, weather });
  ok(ctx.club.id === "cornell-ec", "the club resolves to its organization_id");
  ok(ctx.institutionId === "cornell", "and to its institution");
  ok(ctx.term === "FA26", `and the term covering the moment, got ${ctx.term}`);
  ok(ctx.offsetHours === -4, `September at Cornell is UTC-4, got ${ctx.offsetHours}`);
  ok(ctx.state !== null, "a campus state is produced");
  ok(ctx.state.regime === "normal_term", `mid-September is a normal term, got ${ctx.state.regime}`);
  ok(ctx.heatmap !== null, "a heatmap is built");
  ok(ctx.factors.length === CONTEXT_FACTORS.length, `every context factor ran, got ${ctx.factors.length}`);
  ok(ctx.factors.every((f) => f.value !== null), "and all of them could speak, given full inputs");
  ok(ctx.gaps.length === 0, "so there are no gaps");
  ok(/normal term/i.test(ctx.reading), `the reading names the regime: "${ctx.reading}"`);

  // The heatmap is narrowed to CEC's declared departments, not the catalogue.
  ok(
    ctx.heatmap.sections > 0 && ctx.heatmap.sections < 400,
    `the heatmap covers CEC's departments only, got ${ctx.heatmap.sections} sections`,
  );
}

// ================================= GAPS ARE STATED, NEVER QUIETLY FILLED IN
{
  // No roster, no forecast. The factors that depend on them must refuse and
  // say so — not report a clear hour and fair weather.
  const partial = assembleContext("cec", TUE_7PM, { events });
  ok(partial.heatmap === null, "with no courses there is no heatmap");
  ok(partial.gaps.length >= 2, `gaps are reported, got ${partial.gaps.length}`);
  ok(
    partial.gaps.some((g) => g.factor === "class_conflict_intensity"),
    "class conflict is named as a gap",
  );
  ok(
    partial.gaps.some((g) => /unknown rather than clear/i.test(g.reason)),
    "and the reason distinguishes unknown from clear",
  );
  ok(
    partial.gaps.some((g) => g.factor === "weather_turnout_factor"),
    "weather is named as a gap",
  );
  ok(
    partial.factors.find((f) => f.factor === "competing_event_pressure").value !== null,
    "while the factors that CAN run still do",
  );
  ok(/could not/i.test(partial.reading), "and the reading admits it");
}

// ================================== an unconfigured moment is not a normal week
{
  const summer = assembleContext("cec", "2027-07-04T18:00:00Z", { courses, events, weather });
  ok(summer.term === null, "no configured term covers July");
  ok(summer.state === null, "so there is no campus state");
  ok(
    summer.gaps.some((g) => /No configured term/i.test(g.reason)),
    "and the gap says to add one rather than assume a normal week",
  );
  ok(
    !summer.factors.some((f) => f.factor === "regime_turnout_prior" && f.value !== null),
    "the regime prior does NOT quietly default to 1.0",
  );
}

// ======================================================== unknown club is loud
{
  let threw = false;
  try {
    assembleContext("not-a-club", TUE_7PM, {});
  } catch {
    threw = true;
  }
  ok(threw, "an unknown club throws rather than assembling a blank context");
}

// ======================================================= factors are PERSISTED
{
  const hist = factorHistory("competing_event_pressure", "campus", "cornell");
  ok(hist.length > 0, "assembling persisted the factor values");
  ok(hist.every((h) => h.modelVersion === "1.0.0"), "with their model version");

  const read = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: "2026-09-16T00:00:00Z",
    use: "planning",
    registry: CONTEXT_FACTORS,
  });
  ok(read.factors.length > 0, "and they read back through the use gate");

  // The sponsor gate still bites, even on assembled context.
  const sponsor = factorsAsOf({
    entityType: "campus",
    entityId: "cornell",
    asOf: "2026-09-16T00:00:00Z",
    use: "sponsor_ranking",
    registry: CONTEXT_FACTORS,
  });
  ok(
    sponsor.factors.length < read.factors.length,
    `a sponsor read sees fewer factors than a planning read: ${sponsor.factors.length} < ${read.factors.length}`,
  );
  ok(sponsor.omitted.length > 0, "and the omissions are reported");
  ok(
    !sponsor.factors.some((f) => f.factor === "assessment_pressure"),
    "assessment pressure is planning-only and is withheld from a sponsor read",
  );
}

// ================================= BACKTEST MODE writes nothing to the store
{
  const before = factorHistory("competing_event_pressure", "campus", "cornell").length;
  assembleContext("cec", "2026-09-20T23:00:00Z", { courses, events, weather }, { persist: false });
  const after = factorHistory("competing_event_pressure", "campus", "cornell").length;
  ok(
    after === before,
    "replaying history with persist:false writes nothing — a backtest must not pollute the store",
  );
}

// ========================== the officer's question, across candidate slots
{
  const slots = [TUE_11AM, TUE_7PM, "2026-09-19T14:00:00Z"]; // Tue 11am, Tue 7pm, Sat 10am
  const across = contextAcrossSlots("cec", slots, { courses, events, weather }, { persist: false });
  ok(across.length === 3, "three slots, three contexts");

  const val = (c, id) => c.factors.find((f) => f.factor === id)?.value;
  const midday = across[0];
  const evening = across[1];
  const saturday = across[2];

  ok(
    val(midday, "class_conflict_intensity") > val(evening, "class_conflict_intensity"),
    `Tuesday 11am has more teaching against it than Tuesday 7pm: ${val(midday, "class_conflict_intensity").toFixed(2)} vs ${val(evening, "class_conflict_intensity").toFixed(2)}`,
  );
  ok(
    val(saturday, "class_conflict_intensity") < val(midday, "class_conflict_intensity"),
    "and Saturday morning has less than a Tuesday lecture hour",
  );
  ok(
    val(evening, "academic_turnout_factor") > val(midday, "academic_turnout_factor"),
    "so the academic multiplier favours the evening over the lecture hour",
  );

  // Every slot must be explainable. An officer told to move an event is
  // entitled to the reason, not an oracle.
  for (const c of across) {
    ok(c.reading.length > 0, "each slot carries a reading");
    ok(
      c.factors.every((f) => typeof f.reading === "string" && f.reading.length > 0),
      "and every factor within it explains itself",
    );
  }
}

// ============================================ point-in-time roster selection
{
  const published = ["FA14", "SP19", "FA19", "SP26", "FA26"];
  ok(rosterFor("cec", "2019-10-01T00:00:00Z", published) === "FA19", "a 2019 replay gets the 2019 roster");
  ok(rosterFor("cec", "2026-10-01T00:00:00Z", published) === "FA26", "and a 2026 decision gets FA26");
  ok(
    rosterFor("cec", "2013-01-01T00:00:00Z", published) === null,
    "before the record starts, null rather than the earliest available",
  );
  ok(rosterFor("nope", TUE_7PM, published) === null, "an unknown club is null");
}

console.log(`${checks} club-context assertions passed.`);

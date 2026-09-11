// Weather as context, tested against REAL captured payloads:
//   tests/fixtures/nws-hourly.json  — a live NWS hourly forecast for the
//                                     Ithaca grid (BGM 44,70), 156 periods.
//   tests/fixtures/ncei-ithaca.json — 12 years of daily observations from
//                                     GHCN-Daily station USC00304174,
//                                     "ITHACA CORNELL UNIV, NY US".
// Parsing and every model here is pure, so this needs no network.
// Run: node --experimental-strip-types --import ./tests/ts-resolve-register.mjs tests/weather.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseWindSpeed,
  apparentTemperature,
  parseNwsHourly,
  parseNceiDaily,
  weatherAt,
  climatology,
  weatherAnomaly,
  weatherFactor,
  weatherSourceFor,
  forecastUrl,
  historyUrl,
  COMFORT_BAND_F,
  WEATHER_SOURCES,
} from "../lib/cec/weather.ts";
import { campusState, behaviouralAlpha, REGIME_TURNOUT } from "../lib/cec/context.ts";

let checks = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  checks++;
};

// ==================================================================== units
ok(parseWindSpeed("5 mph") === 5, "a simple wind speed parses");
ok(parseWindSpeed("5 to 10 mph") === 5, "a range takes the low end; gusts are separate");
ok(parseWindSpeed("") === null, "an empty wind speed is null");
ok(parseWindSpeed(12) === 12, "a bare number passes through");
ok(parseWindSpeed(null) === null, "null in, null out");

// Wind chill and heat index are the NWS's own formulae, and they matter more
// than raw temperature for the only question being asked: will someone walk.
ok(apparentTemperature(null, 10, 50) === null, "no temperature means no apparent temperature");
ok(apparentTemperature(60, 10, 50) === 60, "a mild day is its own temperature");
{
  const still = apparentTemperature(35, 0, 50);
  const windy = apparentTemperature(35, 20, 50);
  ok(windy < still, `35°F in 20mph wind feels colder: ${windy} vs ${still}`);
  ok(windy < 25, `and materially so, got ${windy}`);
  ok(
    apparentTemperature(35, 2, 50) === 35,
    "a negligible breeze does not trigger the wind-chill formula",
  );
  const humid = apparentTemperature(90, 5, 80);
  ok(humid > 90, `90°F at 80% humidity feels hotter: ${humid}`);
  ok(apparentTemperature(90, 5, null) === 90, "no humidity means no heat index, not a guess");
}

// ============================================================= real forecast
const nws = JSON.parse(readFileSync(new URL("./fixtures/nws-hourly.json", import.meta.url), "utf8"));
const hours = parseNwsHourly(nws);
ok(hours.length > 100, `parsed a real NWS forecast, got ${hours.length} hours`);
ok(
  hours.every((h) => h.startsAt.endsWith("Z")),
  "times are normalised to UTC, not left in the office's local offset",
);
ok(
  hours.every((h, i) => i === 0 || Date.parse(hours[i - 1].startsAt) <= Date.parse(h.startsAt)),
  "hours come back in chronological order",
);
ok(
  hours.every((h) => h.temperatureF === null || (h.temperatureF > -50 && h.temperatureF < 130)),
  "every temperature is physically plausible — the unit was read, not assumed",
);
ok(
  hours.every((h) => h.precipProbability === null || (h.precipProbability >= 0 && h.precipProbability <= 1)),
  "probability of precipitation is a 0-1 fraction, not the raw percentage",
);
ok(
  hours.some((h) => h.isDaytime) && hours.some((h) => !h.isDaytime),
  "the forecast spans day and night",
);
ok(
  hours.every((h) => h.apparentF !== null || h.temperatureF === null),
  "every hour with a temperature gets an apparent temperature",
);
ok(
  hours.some((h) => h.shortForecast.length > 0),
  "the forecaster's own words are kept verbatim",
);
{
  // A Celsius-reporting office must be converted, not assumed to be Fahrenheit.
  const c = parseNwsHourly({
    properties: {
      periods: [
        { startTime: "2026-09-15T19:00:00-04:00", endTime: "2026-09-15T20:00:00-04:00",
          temperature: 20, temperatureUnit: "C", windSpeed: "5 mph" },
      ],
    },
  });
  ok(c[0].temperatureF === 68, `20°C is 68°F, got ${c[0].temperatureF}`);
}
ok(parseNwsHourly(null).length === 0, "null payload yields nothing");
ok(parseNwsHourly({ properties: { periods: [{}, null] } }).length === 0, "junk periods are skipped");
ok(
  parseNwsHourly({ properties: { periods: [{ startTime: "nope", temperature: 60 }] } }).length === 0,
  "a period with no parseable time occupies no hour",
);

// ---- finding the hour ------------------------------------------------------
{
  const first = hours[0];
  const mid = new Date(Date.parse(first.startsAt) + 30 * 60e3).toISOString();
  ok(weatherAt(hours, mid)?.startsAt === first.startsAt, "a moment inside an hour finds that hour");
  ok(weatherAt(hours, first.startsAt)?.startsAt === first.startsAt, "the boundary is inclusive at the start");
  ok(
    weatherAt(hours, "1999-01-01T00:00:00Z") === null,
    "a moment outside the forecast window is null, never the nearest guess",
  );
  ok(weatherAt(hours, "not-a-date") === null, "an unparseable time is null");
  ok(weatherAt([], "2026-09-15T23:00:00Z") === null, "no forecast is null");
}

// ============================================================= real history
const raw = JSON.parse(readFileSync(new URL("./fixtures/ncei-ithaca.json", import.meta.url), "utf8"));
const history = parseNceiDaily(raw);
ok(history.length > 1500, `parsed 12 years of real Ithaca observations, got ${history.length} days`);
ok(
  new Set(history.map((d) => d.date.slice(0, 4))).size >= 10,
  "the record spans at least a decade",
);
ok(
  history.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)),
  "every date is ISO",
);
ok(
  history.every((d, i) => i === 0 || history[i - 1].date <= d.date),
  "days come back in order",
);
ok(
  history.every((d) => d.maxF === null || (d.maxF > -40 && d.maxF < 120)),
  "every high is plausible — NCEI's string values were coerced to numbers",
);
ok(
  history.some((d) => d.snowIn !== null && d.snowIn > 0),
  "it snows in Ithaca, and the record says so",
);
// A missing measurement must NOT become zero: a station that did not report
// precipitation did not report no precipitation.
{
  const gappy = parseNceiDaily([
    { DATE: "2020-11-01", STATION: "X", TMAX: "50" },
    { DATE: "2020-11-02", STATION: "X", TMAX: "48", PRCP: "0.00" },
  ]);
  ok(gappy[0].precipIn === null, "an absent PRCP is null, not zero");
  ok(gappy[1].precipIn === 0, "a reported 0.00 is genuinely zero");
  ok(gappy[0].snowIn === null, "an absent SNOW is null");
}
ok(parseNceiDaily(null).length === 0, "null payload");
ok(parseNceiDaily([{ DATE: "garbage" }]).length === 0, "a malformed date is dropped");

// ============================================================== climatology
{
  // Mid-October in Ithaca, from twelve years of real observations.
  const oct = climatology(history, "2026-10-15");
  ok(oct.observations > 100, `a real sample backs the October normal, got ${oct.observations}`);
  ok(oct.years >= 10, `pooled across ${oct.years} years`);
  ok(oct.normalHighF > 50 && oct.normalHighF < 70, `October normal high is believable, got ${oct.normalHighF}°F`);
  ok(oct.sdHighF > 3, `there is real day-to-day variance, got sd ${oct.sdHighF}`);
  ok(oct.precipFrequency > 0.2 && oct.precipFrequency < 0.8, `it rains sometimes, got ${oct.precipFrequency}`);

  // The seasonal ordering is the real test that the day-of-year window works.
  const sep = climatology(history, "2026-09-05");
  const nov = climatology(history, "2026-11-20");
  const feb = climatology(history, "2026-02-10");
  ok(sep.normalHighF > oct.normalHighF, `September is warmer than October: ${sep.normalHighF} > ${oct.normalHighF}`);
  ok(oct.normalHighF > nov.normalHighF, `October is warmer than November: ${oct.normalHighF} > ${nov.normalHighF}`);
  ok(nov.normalHighF > feb.normalHighF, `November is warmer than February: ${nov.normalHighF} > ${feb.normalHighF}`);
  ok(feb.normalHighF < 40, `an Ithaca February normal high is below 40°F, got ${feb.normalHighF}`);

  // REFUSING TO SPEAK on thin data, the same rule club health follows.
  const thin = climatology(history.slice(0, 3), "2026-10-15");
  ok(thin.normalHighF === null, "three observations is not a normal");
  ok(thin.sdHighF === null, "and certainly not a standard deviation");
  ok(/not enough/i.test(thin.reading), `the reading says why: "${thin.reading}"`);
  ok(climatology([], "2026-10-15").normalHighF === null, "no history at all is null, not zero");

  // The window must be CIRCULAR, or every December normal loses half its sample.
  const dec31 = climatology(history, "2026-12-31", { windowDays: 7 });
  ok(
    dec31.observations > 80,
    `31 December pools across the year boundary, got ${dec31.observations} observations`,
  );

  // ---- anomaly: for attribution, deliberately not for the multiplier -------
  const normal = climatology(history, "2026-10-15");
  const cold = weatherAnomaly({ date: "2026-10-15", station: "X", maxF: normal.normalHighF - 20, minF: null, precipIn: null, snowIn: null }, normal);
  const ordinary = weatherAnomaly({ date: "2026-10-15", station: "X", maxF: normal.normalHighF + 1, minF: null, precipIn: null, snowIn: null }, normal);
  ok(cold.deviationF < 0, "a cold day reads as a negative deviation");
  ok(cold.verdict === "notable" || cold.verdict === "extreme", `20°F below normal is notable, got ${cold.verdict}`);
  ok(/colder than normal/i.test(cold.reading), `the reading is the sentence a spreadsheet could never hold: "${cold.reading}"`);
  ok(ordinary.verdict === "unremarkable", "a degree above normal is unremarkable");
  ok(cold.z !== null && cold.z < -1.5, `the anomaly is expressed in standard deviations, got z=${cold.z}`);
  ok(
    weatherAnomaly({ date: "x", station: "X", maxF: null, minF: null, precipIn: null, snowIn: null }, normal).verdict === "unknown",
    "no observation means unknown, not zero",
  );
  ok(
    weatherAnomaly({ date: "x", station: "X", maxF: 50, minF: null, precipIn: null, snowIn: null }, thin).verdict === "unknown",
    "no usable normal also means unknown",
  );
}

// ================================================================= the factor
const hour = (o = {}) => ({
  startsAt: "2026-11-12T23:00:00Z", endsAt: "2026-11-13T00:00:00Z",
  temperatureF: 60, apparentF: 60, precipProbability: 0, relativeHumidity: 50,
  windMph: 5, isDaytime: false, shortForecast: "Clear", ...o,
});
{
  ok(weatherFactor(null).factor === 1, "no weather means no adjustment");
  ok(weatherFactor(null).confidence === "none", "and it says it had nothing to go on");
  ok(
    weatherFactor(hour({ apparentF: null, precipProbability: null })).factor === 1,
    "an hour with neither temperature nor precipitation is neutral",
  );

  const mild = weatherFactor(hour({ apparentF: 64, precipProbability: 0 }));
  ok(mild.factor >= 1, `a clear mild evening is a small lift, got ${mild.factor}`);
  ok(mild.factor <= 1.03, "and the lift is capped");

  const freezing = weatherFactor(hour({ apparentF: 18, temperatureF: 24, precipProbability: 0.8 }), { snow: true });
  ok(freezing.factor < 1, `a freezing snowy night discounts, got ${freezing.factor}`);
  ok(freezing.components.length >= 2, "and names both causes");
  ok(/feels like/i.test(freezing.reading), `the reading is in plain words: "${freezing.reading}"`);

  // THE BOUND IS THE POINT. An indoor event on a residential campus is not
  // twice as hard a sell in bad weather, and a model free to claim that would
  // explain away every badly-run event as a rainy night.
  const apocalypse = weatherFactor(hour({ apparentF: -40, temperatureF: -20, precipProbability: 1 }), { snow: true });
  ok(apocalypse.factor >= 0.8, `even absurd weather cannot move it past -20%, got ${apocalypse.factor}`);
  const heat = weatherFactor(hour({ apparentF: 115, temperatureF: 100, precipProbability: 0 }));
  ok(heat.factor >= 0.8, "and extreme heat is bounded the same way");
  ok(heat.factor < 1, "but is still a real discount");

  // Monotonicity: worse must never be better.
  const f = (t) => weatherFactor(hour({ apparentF: t, precipProbability: 0 })).factor;
  ok(f(60) >= f(40) && f(40) >= f(20) && f(20) >= f(0), `colder is never better: ${f(60)}, ${f(40)}, ${f(20)}, ${f(0)}`);
  const p = (x) => weatherFactor(hour({ apparentF: 45, precipProbability: x })).factor;
  ok(p(0) >= p(0.5) && p(0.5) >= p(1), `wetter is never better: ${p(0)}, ${p(0.5)}, ${p(1)}`);

  // Inside the comfort band costs nothing at all.
  const [lo, hi] = COMFORT_BAND_F;
  ok(
    weatherFactor(hour({ apparentF: (lo + hi) / 2, precipProbability: 0.05 })).comfortFactor === 1,
    "the middle of the comfort band costs nothing",
  );
  ok(
    weatherFactor(hour({ apparentF: 45, precipProbability: 0.1 })).precipFactor === 1,
    "a 10% chance of rain is not weather; the threshold keeps noise out",
  );

  // Snow is weighted harder than rain at the same probability.
  const rain = weatherFactor(hour({ apparentF: 40, precipProbability: 0.9 }), { snow: false });
  const snow = weatherFactor(hour({ apparentF: 40, precipProbability: 0.9 }), { snow: true });
  ok(snow.factor < rain.factor, `snow costs more than rain: ${snow.factor} vs ${rain.factor}`);

  // An outdoor event genuinely is weather-dependent in a way indoors is not.
  const inside = weatherFactor(hour({ apparentF: 30, precipProbability: 0.7 }));
  const outside = weatherFactor(hour({ apparentF: 30, precipProbability: 0.7 }), { outdoors: true });
  ok(outside.factor < inside.factor, `outdoors is hit harder: ${outside.factor} vs ${inside.factor}`);
  ok(outside.factor >= 0.8, "but the same floor holds");
}

// ================================================== sources and URLs
{
  const cornell = weatherSourceFor("cornell");
  ok(cornell !== null, "Cornell is a configured weather source");
  ok(
    forecastUrl(cornell) === "https://api.weather.gov/gridpoints/BGM/44,70/forecast/hourly",
    "the forecast URL matches the grid resolved live from /points",
  );
  ok(
    historyUrl(cornell, "2019-09-10", "2019-09-13").includes("stations=USC00304174"),
    "the history URL names the GHCN station verified to hold the record",
  );
  ok(
    historyUrl(cornell, "2019-09-10", "2019-09-13").includes("dataset=daily-summaries"),
    "and the dataset that needs no token",
  );
  ok(weatherSourceFor("nowhere") === null, "an unknown campus is null, not a guess");
  ok(
    WEATHER_SOURCES.every((s) => s.nceiStation && s.nwsOffice),
    "every source carries both a forecast grid and a historical station",
  );
}

// ===================================================== end-to-end into alpha
{
  const cal = {
    termStart: "2026-08-24", termEnd: "2026-12-20",
    prelimPeriods: [{ start: "2026-10-05", end: "2026-10-16" }],
    finalsStart: "2026-12-10", finalsEnd: "2026-12-18",
  };
  const at = "2026-11-12T23:00:00Z";
  const clear = [hour({ apparentF: 62, precipProbability: 0 })];
  const foul = [hour({ apparentF: 22, temperatureF: 28, precipProbability: 0.9 })];

  // No forecast covering the hour must be NULL, not a neutral factor dressed up
  // as a reading.
  const none = campusState({ at, calendar: cal, events: [] });
  ok(none.weather === null, "no forecast supplied means a null weather factor");
  const outside = campusState({
    at, calendar: cal, events: [],
    weather: [hour({ startsAt: "2020-01-01T00:00:00Z", endsAt: "2020-01-01T01:00:00Z" })],
  });
  ok(outside.weather === null, "a forecast that does not cover the hour is null, not extrapolated");

  const good = campusState({ at, calendar: cal, events: [], weather: clear });
  const bad = campusState({ at, calendar: cal, events: [], weather: foul });
  ok(good.weather !== null && bad.weather !== null, "a covering forecast produces a factor");
  ok(bad.weather.factor < good.weather.factor, "the foul night discounts relative to the clear one");

  const aGood = behaviouralAlpha({ actual: 40, baseline: 60, state: good, competing: 0 });
  const aBad = behaviouralAlpha({ actual: 40, baseline: 60, state: bad, competing: 0 });
  ok(
    aBad.expected < aGood.expected,
    `the same event expects fewer people on a foul night: ${aBad.expected} vs ${aGood.expected}`,
  );
  ok(
    aBad.alpha > aGood.alpha,
    "so the same 40 people counts for more — the attribution fix, applied to the weather",
  );
  ok(/weather/i.test(aBad.reading), `and the reading says so: "${aBad.reading}"`);

  // Every multiplier must still be named and must still multiply out exactly.
  ok(
    aBad.factors.some((f) => /snow|precipitation|feels like|weather/i.test(f.label)),
    "the weather factor is itemised by its actual cause",
  );
  ok(
    Math.abs(60 * aBad.factors.reduce((a, f) => a * f.multiplier, 1) - aBad.expected) < 1,
    "the named factors multiply out to the stated expectation — nothing hidden",
  );

  // An explicit override wins, and a context-free state is untouched.
  ok(
    behaviouralAlpha({ actual: 40, baseline: 60, state: bad, competing: 0, weather: 1 }).expected >
      aBad.expected,
    "passing a neutral weather factor removes the discount",
  );
  // A state with no weather data must contribute NO weather term at all — not
  // a neutral one that still shows up in the explanation.
  {
    const a = behaviouralAlpha({ actual: 40, baseline: 60, state: none, competing: 0 });
    ok(
      !a.factors.some((f) => /snow|precipitation|feels like|weather/i.test(f.label)),
      "no weather data means no weather factor in the explanation",
    );
    // And with no academic calendar either, the expectation is exactly the
    // pre-existing regime-and-competition model.
    const bareState = campusState({
      at, calendar: { termStart: "2026-08-24", termEnd: "2026-12-20" }, events: [],
    });
    ok(
      behaviouralAlpha({ actual: 40, baseline: 60, state: bareState, competing: 0 }).expected ===
        Math.round(60 * REGIME_TURNOUT.normal_term),
      "with neither weather nor academic data the model is exactly what it was before",
    );
  }

  // Weather must never dominate. Even at its worst it moves expectation less
  // than a handful of competing events does.
  const worst = campusState({
    at, calendar: cal, events: [],
    weather: [hour({ apparentF: -40, temperatureF: -20, precipProbability: 1 })],
  });
  const weatherSwing = 1 - worst.weather.factor;
  const competitionSwing = 1 - Math.exp(-0.015 * 20);
  ok(
    weatherSwing < competitionSwing + 0.05,
    `the worst imaginable weather is comparable to ~20 competing events, not larger: ${weatherSwing.toFixed(3)} vs ${competitionSwing.toFixed(3)}`,
  );
}

console.log(`${checks} weather-context assertions passed.`);

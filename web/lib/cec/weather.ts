// Weather, as a context variable rather than small talk.
//
// Ithaca is the reason this exists. A November evening there is 38°F, raining,
// and dark by five; the same event in September is a pleasant walk across the
// Arts Quad. Officers know this perfectly well and say so in the group chat
// (docs/12), and then the attendance number goes into a spreadsheet with no
// record of it, and six months later someone concludes the November programming
// chair underperformed.
//
//   BehaviouralAlpha = Actual − Expected(given context)
//
// Weather is one more term in the context. It is also the term most likely to
// be over-claimed, so two disciplines are enforced here:
//
//   1. THE EFFECT IS SMALL. Indoor events on a residential campus are far less
//      weather-sensitive than intuition suggests — people already live within a
//      fifteen-minute walk and own coats. The factor is bounded to roughly
//      ±15%, and anything claiming more would be fitting noise.
//   2. ABSOLUTE CONDITIONS AND ANOMALY ARE KEPT SEPARATE. What determines
//      whether someone walks across campus is how unpleasant it actually is,
//      not how it compares to the thirty-year normal. The anomaly is reported
//      for ATTRIBUTION — "that night was 15° below normal" — and deliberately
//      does not enter the multiplier, because charging both would double-count
//      the same cold.
//
// Sources, both verified live, both free, both usable commercially:
//
//   NWS   api.weather.gov            — forecast, US government, public domain,
//                                      no key. Requires an identifying
//                                      User-Agent; that is their stated policy.
//   NCEI  ncei.noaa.gov/access/...   — daily summaries back decades, no key and
//                                      no token. This is what makes a 2019
//                                      event scorable against the weather that
//                                      actually happened in 2019, the same
//                                      point-in-time discipline the roster
//                                      layer applies to courses.
//
// Deliberately NOT used: Open-Meteo. Its free tier is non-commercial only, and
// a free product for clubs that later takes any money would be in breach. The
// licence is a design constraint, not a footnote.
//
// Parsing and modelling are pure; fetching is separate and gated.

export type HourlyWeather = {
  startsAt: string; // ISO, UTC
  endsAt: string;
  /** °F */
  temperatureF: number | null;
  /** °F, wind chill or heat index where they apply */
  apparentF: number | null;
  /** 0..1 */
  precipProbability: number | null;
  relativeHumidity: number | null;
  windMph: number | null;
  isDaytime: boolean;
  /** the forecaster's own words, kept verbatim */
  shortForecast: string;
};

export type DailyWeather = {
  date: string; // YYYY-MM-DD
  station: string;
  maxF: number | null;
  minF: number | null;
  /** inches */
  precipIn: number | null;
  snowIn: number | null;
};

// ================================================================== parsing

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const cToF = (c: number) => (c * 9) / 5 + 32;

/** "5 mph" or "5 to 10 mph" -> 5 (the low end; gusts are a separate field). */
export function parseWindSpeed(v: unknown): number | null {
  if (typeof v !== "string") return num(v);
  const m = v.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * Wind chill below 50°F, heat index above 80°F, otherwise the raw temperature.
 *
 * Both are the NWS's own published formulae. This matters more than raw
 * temperature for the only question being asked — whether someone is willing to
 * walk fifteen minutes across a campus — because 35°F in a 20mph wind and 35°F
 * still are not the same walk.
 */
export function apparentTemperature(
  tempF: number | null,
  windMph: number | null,
  humidityPct: number | null,
): number | null {
  if (tempF === null) return null;
  if (tempF <= 50 && windMph !== null && windMph > 3) {
    const v = Math.pow(windMph, 0.16);
    return Number((35.74 + 0.6215 * tempF - 35.75 * v + 0.4275 * tempF * v).toFixed(1));
  }
  if (tempF >= 80 && humidityPct !== null) {
    const T = tempF;
    const R = humidityPct;
    const hi =
      -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R -
      6.83783e-3 * T * T - 5.481717e-2 * R * R + 1.22874e-3 * T * T * R +
      8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
    return Number(hi.toFixed(1));
  }
  return Number(tempF.toFixed(1));
}

/** NWS /gridpoints/{office}/{x},{y}/forecast/hourly -> hourly rows. */
export function parseNwsHourly(payload: any): HourlyWeather[] {
  const periods = Array.isArray(payload?.properties?.periods) ? payload.properties.periods : [];
  const out: HourlyWeather[] = [];
  for (const p of periods) {
    const start = Date.parse(p?.startTime);
    if (!Number.isFinite(start)) continue;
    // NWS reports temperature in the unit it names; it is °F for US offices but
    // the unit is published, so honour it rather than assuming.
    const rawTemp = num(p?.temperature);
    const temperatureF =
      rawTemp === null ? null : p?.temperatureUnit === "C" ? cToF(rawTemp) : rawTemp;
    const windMph = parseWindSpeed(p?.windSpeed);
    const humidity = num(p?.relativeHumidity?.value);
    const pop = num(p?.probabilityOfPrecipitation?.value);
    const end = Date.parse(p?.endTime);
    out.push({
      startsAt: new Date(start).toISOString(),
      endsAt: Number.isFinite(end)
        ? new Date(end).toISOString()
        : new Date(start + 3600e3).toISOString(),
      temperatureF: temperatureF === null ? null : Number(temperatureF.toFixed(1)),
      apparentF: apparentTemperature(temperatureF, windMph, humidity),
      // NWS publishes probability of precipitation as a percentage.
      precipProbability: pop === null ? null : Math.min(1, Math.max(0, pop / 100)),
      relativeHumidity: humidity,
      windMph,
      isDaytime: p?.isDaytime === true,
      shortForecast: typeof p?.shortForecast === "string" ? p.shortForecast.slice(0, 200) : "",
    });
  }
  return out.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

/**
 * NCEI daily-summaries -> daily rows. Values arrive as STRINGS, and a missing
 * measurement is an absent key rather than a zero — a station that did not
 * report precipitation did not report zero precipitation, and treating it as
 * zero would quietly turn gaps into dry days across a whole climatology.
 */
export function parseNceiDaily(payload: any): DailyWeather[] {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
  const out: DailyWeather[] = [];
  for (const r of rows) {
    const date = typeof r?.DATE === "string" ? r.DATE.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({
      date,
      station: typeof r?.STATION === "string" ? r.STATION : "",
      maxF: num(r?.TMAX),
      minF: num(r?.TMIN),
      precipIn: num(r?.PRCP),
      snowIn: num(r?.SNOW),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** The forecast hour covering a moment. Null rather than the nearest guess. */
export function weatherAt(hours: HourlyWeather[], at: string): HourlyWeather | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  for (const h of hours) {
    const s = Date.parse(h.startsAt);
    const e = Date.parse(h.endsAt);
    if (t >= s && t < e) return h;
  }
  return null;
}

// ============================================================== climatology

export type Climatology = {
  /** day of year, 1-366 */
  dayOfYear: number;
  /** mean daily high across the historical window, °F */
  normalHighF: number | null;
  normalLowF: number | null;
  /** standard deviation of the daily high, for anomaly scoring */
  sdHighF: number | null;
  /** share of days in the window with measurable precipitation */
  precipFrequency: number | null;
  years: number;
  observations: number;
  reading: string;
};

const DAY_MS = 86400e3;

function dayOfYear(date: string): number {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return 0;
  const d = new Date(t);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((t - start) / DAY_MS) + 1;
}

/** Circular distance in days, so 31 December and 1 January are two days apart. */
function doyDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 365 - d);
}

/**
 * What counts as normal for this campus at this point in the year.
 *
 * Built from a window of calendar days around the target, pooled across every
 * year in the record, which is how climate normals are conventionally computed
 * and is the only way to get a usable sample from daily data.
 *
 * Returns nulls rather than numbers when the record is too thin. A "normal"
 * computed from four observations is not a normal, and presenting one would
 * make every anomaly downstream meaningless — the same refusal-to-speak rule
 * the club-health index follows when it has no peer group.
 */
export function climatology(
  history: DailyWeather[],
  date: string,
  opts: { windowDays?: number; minObservations?: number } = {},
): Climatology {
  const windowDays = opts.windowDays ?? 7;
  const minObservations = opts.minObservations ?? 15;
  const target = dayOfYear(date);

  const near = history.filter((d) => doyDistance(dayOfYear(d.date), target) <= windowDays);
  const highs = near.map((d) => d.maxF).filter((v): v is number => v !== null);
  const lows = near.map((d) => d.minF).filter((v): v is number => v !== null);
  const precips = near.map((d) => d.precipIn).filter((v): v is number => v !== null);
  const years = new Set(near.map((d) => d.date.slice(0, 4))).size;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const enough = highs.length >= minObservations;
  const normalHighF = enough ? Number(mean(highs).toFixed(1)) : null;
  const normalLowF = lows.length >= minObservations ? Number(mean(lows).toFixed(1)) : null;
  const sdHighF =
    enough && highs.length > 1
      ? Number(
          Math.sqrt(
            highs.reduce((a, x) => a + (x - mean(highs)) ** 2, 0) / (highs.length - 1),
          ).toFixed(2),
        )
      : null;

  return {
    dayOfYear: target,
    normalHighF,
    normalLowF,
    sdHighF,
    // 0.01 inch is the conventional threshold for a "measurable precipitation" day.
    precipFrequency:
      precips.length >= minObservations
        ? Number((precips.filter((p) => p >= 0.01).length / precips.length).toFixed(3))
        : null,
    years,
    observations: highs.length,
    reading: enough
      ? `Normal high around ${normalHighF}°F for this time of year, from ${highs.length} observations across ${years} years.`
      : `Only ${highs.length} observations within ${windowDays} days of this date — not enough to call anything normal.`,
  };
}

export type Anomaly = {
  /** °F above or below the normal high */
  deviationF: number | null;
  /** deviation in standard deviations */
  z: number | null;
  verdict: "unremarkable" | "mild" | "notable" | "extreme" | "unknown";
  reading: string;
};

/**
 * How unusual a day was for this campus, for ATTRIBUTION ONLY.
 *
 * This deliberately does not feed the turnout multiplier. What stops someone
 * walking across campus is that it is cold and raining, not that it is colder
 * than the thirty-year mean — people in Ithaca own coats and are not consulting
 * climate normals. Charging both the absolute discomfort and the anomaly would
 * bill the same cold twice, exactly the double-count the academic layer had to
 * avoid between regime and assessment pressure.
 *
 * What it is genuinely for: telling an officer, six months later, that the
 * night their event drew forty was 18°F below normal with freezing rain. That
 * is the sentence the spreadsheet could never hold.
 */
export function weatherAnomaly(observed: DailyWeather, normal: Climatology): Anomaly {
  if (observed.maxF === null || normal.normalHighF === null)
    return {
      deviationF: null,
      z: null,
      verdict: "unknown",
      reading: "Not enough history at this station to say what normal looks like.",
    };
  const deviationF = Number((observed.maxF - normal.normalHighF).toFixed(1));
  const z = normal.sdHighF && normal.sdHighF > 0
    ? Number((deviationF / normal.sdHighF).toFixed(2))
    : null;
  const mag = z === null ? Math.abs(deviationF) / 10 : Math.abs(z);
  const verdict: Anomaly["verdict"] =
    mag < 0.75 ? "unremarkable" : mag < 1.5 ? "mild" : mag < 2.5 ? "notable" : "extreme";
  const dir = deviationF >= 0 ? "warmer" : "colder";
  return {
    deviationF,
    z,
    verdict,
    reading:
      verdict === "unremarkable"
        ? "About normal for the date."
        : `${Math.abs(deviationF)}°F ${dir} than normal for the date${z === null ? "" : ` (${Math.abs(z).toFixed(1)} standard deviations)`}.`,
  };
}

// ============================================================== the factor

export type WeatherFactor = {
  /** multiplier on expected turnout; 1.0 is neutral */
  factor: number;
  comfortFactor: number;
  precipFactor: number;
  components: { label: string; multiplier: number }[];
  confidence: "none" | "low" | "normal";
  reading: string;
};

/** Temperatures between these are a pleasant walk and cost nothing. */
export const COMFORT_BAND_F: [number, number] = [50, 78];

/**
 * Weather as a bounded multiplier on expected turnout.
 *
 * Two terms, both about the walk:
 *
 *   comfortFactor — how far APPARENT temperature (wind chill, heat index) sits
 *                   outside a comfortable band. Quadratic in the distance so
 *                   mild discomfort costs almost nothing and genuine cold
 *                   costs something real.
 *   precipFactor  — probability of precipitation times a penalty, with snow
 *                   weighted harder because it makes Ithaca's hills genuinely
 *                   unpleasant rather than merely wet.
 *
 * THE BOUNDS ARE THE POINT. The whole factor is clamped to [0.8, 1.03]. An
 * indoor event on a residential campus is simply not a twice-as-hard sell in
 * bad weather, and a model free to claim that would happily explain away every
 * poorly-run event as a rainy night. If weather ever looks like it is doing
 * heavy lifting in an attribution, the model is wrong, not the world.
 *
 * These are STATED PRIORS, not fitted coefficients — the same discipline as
 * REGIME_TURNOUT. Replacing them with estimates needs several years of
 * attendance paired with observations, which is exactly what the historical
 * NCEI record makes possible later.
 */
export function weatherFactor(
  w: HourlyWeather | null,
  opts: { snow?: boolean; outdoors?: boolean } = {},
): WeatherFactor {
  if (!w || (w.apparentF === null && w.precipProbability === null))
    return {
      factor: 1,
      comfortFactor: 1,
      precipFactor: 1,
      components: [],
      confidence: "none",
      reading: "No weather data for that hour, so no adjustment is made.",
    };

  // An outdoor event is genuinely weather-dependent in a way an indoor one is
  // not, so the same conditions are allowed to move it further.
  const scale = opts.outdoors ? 3 : 1;
  const components: { label: string; multiplier: number }[] = [];

  let comfortFactor = 1;
  if (w.apparentF !== null) {
    const [lo, hi] = COMFORT_BAND_F;
    const outside = w.apparentF < lo ? lo - w.apparentF : w.apparentF > hi ? w.apparentF - hi : 0;
    if (outside > 0) {
      // Quadratic, normalised so 40°F outside the band costs the full budget.
      const penalty = Math.min(1, (outside / 40) ** 2);
      comfortFactor = 1 - 0.12 * penalty * scale;
      components.push({
        label:
          w.apparentF < lo
            ? `feels like ${Math.round(w.apparentF)}°F`
            : `feels like ${Math.round(w.apparentF)}°F`,
        multiplier: Number(comfortFactor.toFixed(3)),
      });
    }
  }

  let precipFactor = 1;
  if (w.precipProbability !== null && w.precipProbability > 0.15) {
    const severity = opts.snow ? 0.12 : 0.08;
    precipFactor = 1 - severity * w.precipProbability * scale;
    components.push({
      label: `${Math.round(w.precipProbability * 100)}% chance of ${opts.snow ? "snow" : "precipitation"}`,
      multiplier: Number(precipFactor.toFixed(3)),
    });
  }

  // A clear, mild evening is a small genuine lift, and a much smaller one than
  // the downside — good weather does not fill a room, bad weather empties one.
  let bonus = 1;
  if (
    w.apparentF !== null &&
    w.apparentF >= COMFORT_BAND_F[0] + 8 &&
    w.apparentF <= COMFORT_BAND_F[1] - 8 &&
    (w.precipProbability ?? 0) < 0.1
  ) {
    bonus = 1.03;
    components.push({ label: "clear and mild", multiplier: 1.03 });
  }

  const raw = comfortFactor * precipFactor * bonus;
  const factor = Math.max(0.8, Math.min(1.03, raw));

  return {
    factor: Number(factor.toFixed(4)),
    comfortFactor: Number(comfortFactor.toFixed(4)),
    precipFactor: Number(precipFactor.toFixed(4)),
    components,
    confidence: "normal",
    reading: components.length
      ? `${components.map((c) => c.label).join(", ")} — about ${Math.abs(Math.round((factor - 1) * 100))}% ${factor < 1 ? "off" : "on"} expected turnout.`
      : "Unremarkable weather; no adjustment.",
  };
}

// ============================================================== the sources

export type WeatherSource = {
  campus: string;
  label: string;
  latitude: number;
  longitude: number;
  /** NWS grid, resolved once from /points and cached here */
  nwsOffice: string;
  nwsGridX: number;
  nwsGridY: number;
  /** NCEI GHCN-Daily station for the historical record */
  nceiStation: string;
  /** hours from UTC, standard time; daylight saving is handled by the feed */
  timeZoneOffsetHours: number;
};

/** Verified live. Adding a campus is a row here, not new code. */
export const WEATHER_SOURCES: WeatherSource[] = [
  {
    campus: "cornell",
    label: "Ithaca, NY",
    latitude: 42.444,
    longitude: -76.5019,
    // Resolved from api.weather.gov/points/42.4440,-76.5019
    nwsOffice: "BGM",
    nwsGridX: 44,
    nwsGridY: 70,
    // GHCN-Daily "ITHACA CORNELL UNIV, NY US" — verified to return daily
    // summaries back decades with no key and no token.
    nceiStation: "USC00304174",
    timeZoneOffsetHours: -5,
  },
];

export function weatherSourceFor(campus: string): WeatherSource | null {
  return WEATHER_SOURCES.find((s) => s.campus === campus) || null;
}

export function forecastUrl(s: WeatherSource): string {
  return `https://api.weather.gov/gridpoints/${s.nwsOffice}/${s.nwsGridX},${s.nwsGridY}/forecast/hourly`;
}

export function historyUrl(s: WeatherSource, startDate: string, endDate: string): string {
  const q = new URLSearchParams({
    dataset: "daily-summaries",
    stations: s.nceiStation,
    startDate,
    endDate,
    dataTypes: "TMAX,TMIN,PRCP,SNOW",
    format: "json",
    units: "standard",
  });
  return `https://www.ncei.noaa.gov/access/services/data/v1?${q}`;
}

// NWS asks every caller to identify itself. That is their published policy, not
// a nicety, and requests without it are throttled.
const UA = "ClubOS/1.0 (campus context for student clubs; contact via club officers)";

export async function fetchForecast(
  s: WeatherSource,
  opts: { timeoutMs?: number } = {},
): Promise<HourlyWeather[]> {
  const res = await fetch(forecastUrl(s), {
    headers: { Accept: "application/geo+json", "User-Agent": UA },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  if (!res.ok) throw new Error(`NWS forecast returned ${res.status}`);
  return parseNwsHourly(await res.json());
}

export async function fetchHistory(
  s: WeatherSource,
  startDate: string,
  endDate: string,
  opts: { timeoutMs?: number } = {},
): Promise<DailyWeather[]> {
  const res = await fetch(historyUrl(s, startDate, endDate), {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  if (!res.ok) throw new Error(`NCEI history returned ${res.status}`);
  return parseNceiDaily(await res.json());
}

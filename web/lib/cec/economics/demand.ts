// The economic shadow of an operational object.
//
// A 300-person conference implies a venue, food, microphones, printed badges, a
// photographer, maybe buses. None of that is recorded anywhere in Club OS. The
// event row knows a title, a time and a capacity; the money register (a
// `transaction` item) knows what was spent afterwards. Between the two there is
// a demand that exists in the world and nowhere in the system.
//
// ==========================================================================
// AN INFERRED NEED IS NOT A PURCHASE, AND THIS FILE EXISTS TO KEEP IT THAT WAY.
//
// Everything below produces a `PotentialEconomicNeed`: a guess, with a stated
// confidence, a stated basis, and a `status` that starts at 'inferred' and can
// only be moved to 'club_confirmed' by a human being with officer access. There
// is no path — no threshold, no confidence level, no "obviously they need
// catering" — by which an inference becomes a confirmed need on its own.
//
// The reason is not squeamishness. A system that books catering because it
// guessed an event was large is strictly worse than one that stays quiet: the
// quiet system costs a club nothing, and the confident one costs it a deposit
// on food nobody ordered, for an event whose attendance we estimated from three
// past meetings. The asymmetry is total. So the inference is offered, never
// acted on, and the club's answer — including "no" — is the only thing that
// changes the record.
//
// Two further consequences, both enforced in code rather than documented:
//
//   1. Re-running the inference NEVER overwrites a club's decision. A declined
//      need stays declined no matter how confident a later forecast becomes;
//      otherwise "no" would decay back into "maybe" every time a new RSVP
//      arrived, and a club that has to keep saying no will stop reading.
//   2. Confidence has a ceiling below 1.0. A need is not a fact until someone
//      says it is, and a 1.0 on a row a human never saw would read as one.
//
// ==========================================================================
//
// Quantities come from the attendance PREDICTIVE DISTRIBUTION, never the point
// estimate. "About 280 people" is not a number you can order food against; the
// question is what the upper tail looks like and what running short costs. For
// catering that decision is exactly the newsvendor in forecast.ts, and it is
// reused here rather than reimplemented — including its central rule that the
// system must not invent the cost ratio. Since no club has stated one at
// inference time, catering is presented as the BAND between two plausible
// ratios, and the band is labelled as such.
//
// Tested in tests/economics.mjs.

import { db, fail, id, timestamp, officer, audit, type User } from "../db";
import {
  betaBinomialQuantile,
  recommendFoodOrder,
  type CostRatio,
  type FoodOrder,
  type Forecast,
  type PredictiveDistribution,
} from "../forecast";
import { defineFactor, type Driver } from "../factors";

// ================================================================= taxonomy

/**
 * What a club can plausibly need to buy. A closed list on purpose: an open
 * category string would let a caller invent "drone_footage", get a confident
 * quantity out of a rule that never existed, and never find out.
 */
export const NEED_CATEGORIES = [
  "venue",
  "catering",
  "av_equipment",
  "printing",
  "photography",
  "videography",
  "transportation",
  "merchandise",
  "software",
  "insurance",
  "security",
  "decor",
  "speaker_travel",
  "prizes",
] as const;
export type NeedCategory = (typeof NEED_CATEGORIES)[number];

/**
 * Three states, and note what is absent: there is no 'confirmed', no 'ordered',
 * no 'booked'. 'club_confirmed' is spelled that way so that no reader and no
 * query can mistake who did the confirming.
 */
export const NEED_STATUSES = ["inferred", "club_confirmed", "declined"] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

/** How a quantity range was arrived at. Carried so a reader can check it. */
export const SIZING_METHODS = [
  /** newsvendor critical fractile on the attendance predictive (forecast.ts) */
  "newsvendor_band",
  /** quantiles of the attendance predictive distribution */
  "predictive_interval",
  /** a predictive quantile divided by a stated per-unit capacity */
  "per_unit_capacity",
  /** a count somebody typed in, not a guess at all */
  "stated_fact",
] as const;
export type SizingMethod = (typeof SIZING_METHODS)[number];

export type PotentialEconomicNeed = {
  /** empty until the row is stored; inference is pure and writes nothing */
  id: string;
  clubId: string;
  eventId: string;
  category: NeedCategory;
  status: NeedStatus;
  /** plausible planning range. Never a single number — see the header. */
  quantityLow: number;
  quantityHigh: number;
  /** servings, seats, hours, vehicles… so nobody adds seats to hours */
  unit: string;
  method: SizingMethod;
  /** 0..1, ceilinged below 1: an inference is never a fact */
  confidence: number;
  /** the sentence that justifies the row, in the club's language */
  basis: string;
  /** named contributions, the same Driver shape a factor returns */
  drivers: Driver[];
  inferredAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  declinedAt: string | null;
  notes: string;
};

// ------------------------------------------------------------------- input

export const EVENT_FORMATS = [
  "meeting",
  "workshop",
  "speaker",
  "conference",
  "competition",
  "social",
  "recruiting",
] as const;
export type EventFormat = (typeof EVENT_FORMATS)[number];

/**
 * What the inference is allowed to look at.
 *
 * Every flag here is STATED by an officer. None of it is parsed out of a title
 * or a description: "Annual Gala" in a title is not evidence that anyone booked
 * decor, and a keyword rule would produce needs for an event called "Gala Prep
 * Meeting (4 people, someone's room)". Unstated means unknown, and unknown
 * suppresses the rules that depend on it rather than defaulting them to true.
 */
export type EventShape = {
  id: string;
  clubId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** the room cap officers entered; a ceiling on attendance, not a forecast */
  capacity?: number;
  format?: EventFormat;
  /** officers said food is happening. Undefined means nobody said. */
  foodProvided?: boolean;
  /** a venue is already secured, so it is not a need */
  venueSecured?: boolean;
  offCampus?: boolean;
  /** people travelling in. A count somebody typed, not an inference. */
  externalSpeakers?: number;
  /** registration/ticketing is being run, so a platform is in play */
  ticketed?: boolean;
  /** a competition with a prize pool, stated */
  prizesOffered?: boolean;
};

// =============================================================== sizing rules

/**
 * Planning quantiles on the attendance predictive.
 *
 * Not a credible interval and not symmetric on purpose. The low end is the 25th
 * percentile because ordering below that is negligent, and the high end is the
 * 90th rather than the 97.5th because the extreme tail of a beta-binomial on a
 * few hundred RSVPs is driven by our uncertainty about conversion, not by any
 * plausible crowd, and quoting it would make every range look absurd.
 */
export const PLANNING_QUANTILES = { low: 0.25, high: 0.9 };

/**
 * The cost-ratio band for catering.
 *
 * forecast.ts is emphatic that the system must not infer Cu/Co — it cannot know
 * whether running out at a recruitment event is an annoyance or the thing that
 * loses the incoming class. At inference time nobody has stated one, so instead
 * of picking a ratio we run the newsvendor at both ends of the range clubs
 * actually state and present the two orders as a band. When the club confirms
 * the need and states its ratio, `cateringOrder` gives the single number.
 */
export const CATERING_RATIO_BAND: { cautious: CostRatio; generous: CostRatio } = {
  /** waste costs twice a shortage — a small club paying out of dues */
  cautious: { shortage: 1, surplus: 2 },
  /** a shortage costs four times the waste — a recruiting night */
  generous: { shortage: 4, surplus: 1 },
};

/** Seats in the vehicle a campus club can actually hire. */
const SEATS_PER_VEHICLE = 14;
/** One microphone/speaker kit covers roughly this many people in a room. */
const PEOPLE_PER_AV_KIT = 75;
/** One security staffer per this many attendees, the usual campus rule. */
const PEOPLE_PER_SECURITY_STAFF = 100;

/**
 * Confidence ceiling. An inference the club has never seen must never read as
 * certain, however clean the arithmetic behind it was.
 */
export const CONFIDENCE_CEILING = 0.8;
const CONFIDENCE_FLOOR = 0.05;

type Ctx = {
  event: EventShape;
  forecast: Forecast;
  /** quantile of the attendance predictive */
  q: (p: number) => number;
  expected: number;
  durationHours: number;
  comparables: number;
};

type Sizing = {
  low: number;
  high: number;
  method: SizingMethod;
  note: string;
  drivers?: Driver[];
};

type Rule = {
  category: NeedCategory;
  unit: string;
  /**
   * Prior plausibility that an event of this shape genuinely needs this, before
   * any discount for how thin the attendance history is. Stated, not fitted —
   * there is no dataset of club purchases to fit against, and pretending
   * otherwise is how a made-up number acquires a decimal place.
   */
  basePlausibility: number;
  /**
   * Whether the quantity leans on the attendance forecast. Rules that do are
   * suppressed entirely when the forecast is prior-only; rules that read a
   * stated fact are not, because an officer typing "3 speakers" is evidence
   * whether or not anybody has ever checked in at this club.
   */
  dependsOnForecast: boolean;
  applies: (c: Ctx) => boolean;
  size: (c: Ctx) => Sizing;
};

const round = (n: number) => Math.max(0, Math.round(n));
const isConf = (c: Ctx, f: EventFormat[]) => !!c.event.format && f.includes(c.event.format);

const RULES: Rule[] = [
  {
    category: "venue",
    unit: "seats",
    basePlausibility: 0.6,
    dependsOnForecast: true,
    // A secured venue is not a need. Everything else is a maybe: plenty of
    // clubs hold 200-person events in rooms the university gives them free.
    applies: (c) => c.event.venueSecured !== true && c.q(PLANNING_QUANTILES.high) >= 20,
    size: (c) => ({
      low: round(c.q(0.5)),
      high: round(c.q(PLANNING_QUANTILES.high)),
      method: "predictive_interval",
      note: "A room has to hold the people who turn up, so this is sized from the middle to the upper end of the attendance range, not from the average.",
    }),
  },
  {
    category: "catering",
    unit: "servings",
    // The single most confident inference on the list when food is stated, and
    // deliberately not inferred at all when it is not: "students like pizza" is
    // not a basis for telling a club it needs to buy pizza.
    basePlausibility: 0.85,
    dependsOnForecast: true,
    applies: (c) => c.event.foodProvided === true,
    size: (c) => {
      const cautious = recommendFoodOrder({
        demand: c.forecast.predictive,
        costRatio: CATERING_RATIO_BAND.cautious,
      });
      const generous = recommendFoodOrder({
        demand: c.forecast.predictive,
        costRatio: CATERING_RATIO_BAND.generous,
      });
      return {
        low: cautious.quantity,
        high: generous.quantity,
        method: "newsvendor_band",
        note:
          `Food is a newsvendor decision: the order is the smallest quantity whose chance of covering the room beats the cost ratio you state. ` +
          `Nobody has stated one, so this is the band between "waste costs twice a shortage" (${cautious.quantity}, the ${Math.round(cautious.fractile * 100)}th percentile) ` +
          `and "a shortage costs four times the waste" (${generous.quantity}, the ${Math.round(generous.fractile * 100)}th). Pick the ratio and the band collapses to one number.`,
        drivers: [
          { label: "cautious ratio 1:2", contribution: cautious.quantity },
          { label: "generous ratio 4:1", contribution: generous.quantity },
        ],
      };
    },
  },
  {
    category: "av_equipment",
    unit: "kits",
    basePlausibility: 0.5,
    dependsOnForecast: true,
    applies: (c) =>
      c.q(0.5) >= 25 || isConf(c, ["conference", "speaker", "workshop", "competition"]),
    size: (c) => ({
      low: 1,
      high: Math.max(1, Math.ceil(c.q(PLANNING_QUANTILES.high) / PEOPLE_PER_AV_KIT)),
      method: "per_unit_capacity",
      note: `One microphone and speaker kit covers roughly ${PEOPLE_PER_AV_KIT} people in a room; the top of the range is the upper end of the attendance range divided by that.`,
    }),
  },
  {
    category: "printing",
    unit: "pieces",
    basePlausibility: 0.45,
    dependsOnForecast: true,
    applies: (c) => c.q(0.5) >= 40 || isConf(c, ["conference"]),
    size: (c) => ({
      low: round(c.q(PLANNING_QUANTILES.low)),
      high: round(c.q(PLANNING_QUANTILES.high)),
      method: "predictive_interval",
      note: "Badges, programmes or signage, one per attendee, across the attendance range.",
    }),
  },
  {
    category: "photography",
    unit: "hours",
    basePlausibility: 0.35,
    dependsOnForecast: true,
    applies: (c) => c.q(0.5) >= 50 || isConf(c, ["conference", "competition"]),
    size: (c) => ({
      low: Math.max(1, Math.ceil(c.durationHours * 0.5)),
      high: Math.max(1, Math.ceil(c.durationHours)),
      method: "per_unit_capacity",
      note: `Scheduled hours, from covering half the ${c.durationHours.toFixed(1)}-hour programme to all of it. Attendance sets whether this is worth doing, not how long it takes.`,
    }),
  },
  {
    category: "videography",
    unit: "hours",
    // Lower than photography: plenty of large events are never filmed, and the
    // ones that are usually decided so for a reason we cannot see.
    basePlausibility: 0.2,
    dependsOnForecast: true,
    applies: (c) => c.q(0.5) >= 100 || isConf(c, ["conference"]),
    size: (c) => ({
      low: Math.max(1, Math.ceil(c.durationHours * 0.5)),
      high: Math.max(1, Math.ceil(c.durationHours)),
      method: "per_unit_capacity",
      note: `Recording hours across the ${c.durationHours.toFixed(1)}-hour programme.`,
    }),
  },
  {
    category: "transportation",
    unit: "vehicles",
    basePlausibility: 0.55,
    dependsOnForecast: true,
    // Only when somebody has said the event is off campus. Inferring travel
    // from a location string would put buses on every event held in a building
    // whose name we failed to recognise.
    applies: (c) => c.event.offCampus === true,
    size: (c) => ({
      low: Math.max(1, Math.ceil(c.q(PLANNING_QUANTILES.low) / SEATS_PER_VEHICLE)),
      high: Math.max(1, Math.ceil(c.q(PLANNING_QUANTILES.high) / SEATS_PER_VEHICLE)),
      method: "per_unit_capacity",
      note: `Vehicles at ${SEATS_PER_VEHICLE} seats each, across the attendance range. Assumes everybody travels together, which is usually false and always worth checking.`,
    }),
  },
  {
    category: "merchandise",
    unit: "units",
    // The weakest number on the list, and it says so. Merchandise is genuinely
    // newsvendor-shaped — unsold shirts and disappointed attendees are not
    // symmetric costs — but a newsvendor needs a demand distribution, and we
    // have no attach-rate history whatsoever. So this is an openly-stated band
    // of attach rates rather than a fractile dressed up as one.
    basePlausibility: 0.2,
    dependsOnForecast: true,
    applies: (c) => c.q(0.5) >= 50,
    size: (c) => ({
      low: round(c.q(PLANNING_QUANTILES.low) * 0.2),
      high: round(c.q(PLANNING_QUANTILES.high) * 0.6),
      method: "predictive_interval",
      note: "Assumes between a fifth and three fifths of attendees take one. We have never measured an attach rate for this club, so treat the range as an illustration and not a forecast.",
    }),
  },
  {
    category: "software",
    unit: "licences",
    basePlausibility: 0.5,
    dependsOnForecast: false,
    applies: (c) => c.event.ticketed === true,
    size: () => ({
      low: 1,
      high: 1,
      method: "stated_fact",
      note: "You said registration or ticketing is being run, which normally means one platform for the event.",
    }),
  },
  {
    category: "insurance",
    unit: "policies",
    // Low on purpose: whether a policy is needed is an institutional rule, not
    // a headcount, and this rule is a prompt to go and ask, not an answer.
    basePlausibility: 0.25,
    dependsOnForecast: true,
    applies: (c) => c.q(PLANNING_QUANTILES.high) >= 150 || c.event.offCampus === true,
    size: () => ({
      low: 1,
      high: 1,
      method: "stated_fact",
      note: "Large or off-campus events often need event cover. Whether yours does is a question for your student activities office, not something this can work out.",
    }),
  },
  {
    category: "security",
    unit: "staff",
    basePlausibility: 0.3,
    dependsOnForecast: true,
    applies: (c) => c.q(PLANNING_QUANTILES.high) >= 200,
    size: (c) => ({
      low: Math.max(1, Math.ceil(c.q(0.5) / PEOPLE_PER_SECURITY_STAFF)),
      high: Math.max(1, Math.ceil(c.q(PLANNING_QUANTILES.high) / PEOPLE_PER_SECURITY_STAFF)),
      method: "per_unit_capacity",
      note: `One staffer per ${PEOPLE_PER_SECURITY_STAFF} attendees, across the attendance range. Your venue may set its own number and theirs wins.`,
    }),
  },
  {
    category: "decor",
    unit: "packages",
    basePlausibility: 0.25,
    dependsOnForecast: false,
    applies: (c) => isConf(c, ["social", "conference"]),
    size: () => ({
      low: 1,
      high: 1,
      method: "stated_fact",
      note: "Events of this format often carry a decor budget. This is a prompt, not a quantity.",
    }),
  },
  {
    category: "speaker_travel",
    unit: "trips",
    // The most confident row here, because it is not an inference about scale
    // at all — an officer typed the number of people travelling in.
    basePlausibility: 0.8,
    dependsOnForecast: false,
    applies: (c) => (c.event.externalSpeakers ?? 0) > 0,
    size: (c) => {
      const n = c.event.externalSpeakers ?? 0;
      return {
        low: n,
        high: n,
        method: "stated_fact",
        note: `You told us ${n} speaker${n === 1 ? "" : "s"} ${n === 1 ? "is" : "are"} travelling in. That is your number, not ours.`,
      };
    },
  },
  {
    category: "prizes",
    unit: "prizes",
    basePlausibility: 0.5,
    dependsOnForecast: false,
    applies: (c) => c.event.prizesOffered === true || isConf(c, ["competition"]),
    size: () => ({
      low: 1,
      high: 3,
      method: "stated_fact",
      note: "Competitions usually award between one and three places. The pool itself is yours to set.",
    }),
  },
];

// ================================================================= inference

/**
 * Whether the attendance forecast can carry a quantity at all.
 *
 * A forecast with no comparable events is, in its own words, "the prior and
 * nothing else — a placeholder, not a forecast". Sizing an order off it would
 * dress a Beta(1,1) up as a demand estimate. So scale-driven rules are
 * suppressed and the caller is told why; rules that read a stated fact still
 * run, because those never depended on the forecast.
 */
export function canSizeFromForecast(f: Forecast): { ok: boolean; reason: string } {
  if (!f || !f.predictive || f.predictive.n <= 0)
    return {
      ok: false,
      reason:
        "Nobody has RSVP'd yet, so there is no attendance distribution to size anything against.",
    };
  if (f.basis.comparables === 0)
    return {
      ok: false,
      reason:
        "No comparable past event informs this forecast, so any quantity would be our prior with a decimal point on it. Check people in at one event and this becomes answerable.",
    };
  return { ok: true, reason: "" };
}

/** Quantile of the attendance predictive distribution. */
function quantiler(p: PredictiveDistribution) {
  return (x: number) => betaBinomialQuantile(x, p.n, p.alpha, p.beta);
}

/**
 * How much to discount a scale-driven inference for the thinness of the
 * history behind it. Five comparable events is where forecast.ts stops calling
 * a basis thin, so that is where this stops discounting.
 */
function evidenceMultiplier(comparables: number): number {
  if (comparables >= 5) return 1;
  return 0.5 + 0.1 * Math.max(0, comparables);
}

const clampConfidence = (v: number) =>
  Math.min(CONFIDENCE_CEILING, Math.max(CONFIDENCE_FLOOR, v));

/**
 * Infer what an event might cost the club money on.
 *
 * Pure: no database, no clock beyond `asOf`, nothing written. Every row comes
 * back as status 'inferred' — this function has no way to produce any other
 * status, which is the point.
 */
export function inferNeeds(
  event: EventShape,
  attendanceForecast: Forecast,
  asOf: string = timestamp(),
): PotentialEconomicNeed[] {
  const usable = canSizeFromForecast(attendanceForecast);
  const predictive = attendanceForecast?.predictive ?? { n: 0, alpha: 1, beta: 1 };
  const q = quantiler(predictive);

  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  const durationHours =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? (end - start) / 3600e3
      : 2; // a stated default, used only to size hours-based services

  const ctx: Ctx = {
    event,
    forecast: attendanceForecast,
    q: usable.ok ? q : () => 0,
    expected: attendanceForecast?.expected ?? 0,
    durationHours,
    comparables: attendanceForecast?.basis?.comparables ?? 0,
  };

  const evidence = evidenceMultiplier(ctx.comparables);
  const rangeLabel = usable.ok
    ? `Expected attendance ${q(PLANNING_QUANTILES.low)}–${q(PLANNING_QUANTILES.high)} of ${predictive.n} RSVPs, from ${ctx.comparables} comparable event${ctx.comparables === 1 ? "" : "s"}.`
    : usable.reason;

  const out: PotentialEconomicNeed[] = [];
  for (const rule of RULES) {
    // A rule that leans on the forecast does not run on a forecast that cannot
    // carry it. Refusing is the whole behaviour, not a fallback.
    if (rule.dependsOnForecast && !usable.ok) continue;
    if (!rule.applies(ctx)) continue;

    const sized = rule.size(ctx);
    if (!(sized.high > 0)) continue;

    const confidence = clampConfidence(
      rule.basePlausibility * (rule.dependsOnForecast ? evidence : 1),
    );
    out.push({
      id: "",
      clubId: event.clubId,
      eventId: event.id,
      category: rule.category,
      status: "inferred",
      quantityLow: Math.min(sized.low, sized.high),
      quantityHigh: Math.max(sized.low, sized.high),
      unit: rule.unit,
      method: sized.method,
      confidence,
      basis: `${sized.note} ${rule.dependsOnForecast ? rangeLabel : ""}`.trim(),
      drivers: sized.drivers ?? [],
      inferredAt: asOf,
      confirmedAt: null,
      confirmedBy: null,
      declinedAt: null,
      notes: "",
    });
  }
  // Deterministic order, so two runs of the same inference are comparable.
  out.sort((a, b) => NEED_CATEGORIES.indexOf(a.category) - NEED_CATEGORIES.indexOf(b.category));
  return out;
}

/**
 * The single catering number, once a club has stated its cost ratio.
 *
 * This is the newsvendor from forecast.ts and nothing else: the value of this
 * wrapper is that it refuses to be called without a ratio, where
 * `recommendFoodOrder` politely defaults to 1:1 and says so.
 */
export function cateringOrder(forecast: Forecast, costRatio: CostRatio): FoodOrder {
  if (
    !costRatio ||
    !(costRatio.shortage > 0) ||
    !(costRatio.surplus > 0) ||
    !Number.isFinite(costRatio.shortage) ||
    !Number.isFinite(costRatio.surplus)
  )
    fail(
      "State how much worse running out is than having food left over. The system will not guess it: that ratio is the entire decision.",
    );
  return recommendFoodOrder({
    demand: forecast.predictive,
    costRatio,
    expected: forecast.expected,
  });
}

// ================================================================== storage

let ready = false;
export function demandInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS economic_needs(
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  category TEXT NOT NULL,
  -- 'inferred' | 'club_confirmed' | 'declined'. There is no 'confirmed':
  -- the column name has to say who did it, because nobody reading a query
  -- result six months later will remember.
  status TEXT NOT NULL DEFAULT 'inferred',
  quantity_low REAL NOT NULL,
  quantity_high REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL,
  basis TEXT NOT NULL,
  inferred_at TEXT NOT NULL,
  confirmed_at TEXT,
  confirmed_by TEXT,
  declined_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE(club_id,event_id,category));
CREATE INDEX IF NOT EXISTS econ_need_club ON economic_needs(club_id,status,category);
CREATE INDEX IF NOT EXISTS econ_need_event ON economic_needs(event_id);
`);
  // Additive migration for databases created before unit/method existed. Both
  // are descriptive, so an old row reads as an empty string rather than a lie.
  const cols = db().prepare("PRAGMA table_info(economic_needs)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "unit"))
    db().exec("ALTER TABLE economic_needs ADD COLUMN unit TEXT NOT NULL DEFAULT ''");
  if (!cols.some((c) => c.name === "method"))
    db().exec("ALTER TABLE economic_needs ADD COLUMN method TEXT NOT NULL DEFAULT ''");
  ready = true;
}

export type NeedRow = {
  id: string;
  club_id: string;
  event_id: string;
  category: string;
  status: string;
  quantity_low: number;
  quantity_high: number;
  unit: string;
  method: string;
  confidence: number;
  basis: string;
  inferred_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  declined_at: string | null;
  notes: string;
};

function toNeed(r: NeedRow): PotentialEconomicNeed {
  return {
    id: r.id,
    clubId: r.club_id,
    eventId: r.event_id,
    category: r.category as NeedCategory,
    status: r.status as NeedStatus,
    quantityLow: r.quantity_low,
    quantityHigh: r.quantity_high,
    unit: r.unit,
    method: (r.method || "predictive_interval") as SizingMethod,
    confidence: r.confidence,
    basis: r.basis,
    drivers: [],
    inferredAt: r.inferred_at,
    confirmedAt: r.confirmed_at,
    confirmedBy: r.confirmed_by,
    declinedAt: r.declined_at,
    notes: r.notes,
  };
}

/**
 * Persist inferred needs.
 *
 * The `WHERE status='inferred'` on the upsert is the load-bearing clause in
 * this file. Re-running the inference refreshes a row nobody has ruled on and
 * leaves every club decision — confirmed or declined — exactly where the club
 * left it. Without it, a decline would silently revert to a suggestion on the
 * next forecast refresh, and the club would have to keep saying no to the same
 * row until it stopped reading them.
 */
export function recordInferredNeeds(u: User, needs: PotentialEconomicNeed[]): string[] {
  officer(u);
  demandInit();
  const insert = db().prepare(
    `INSERT INTO economic_needs(id,club_id,event_id,category,status,quantity_low,quantity_high,unit,method,confidence,basis,inferred_at,notes)
     VALUES (?,?,?,?,'inferred',?,?,?,?,?,?,?,'')
     ON CONFLICT(club_id,event_id,category) DO UPDATE SET
       quantity_low=excluded.quantity_low,
       quantity_high=excluded.quantity_high,
       unit=excluded.unit,
       method=excluded.method,
       confidence=excluded.confidence,
       basis=excluded.basis,
       inferred_at=excluded.inferred_at
     WHERE economic_needs.status='inferred'`,
  );
  const find = db().prepare(
    "SELECT id FROM economic_needs WHERE club_id=? AND event_id=? AND category=?",
  );
  const ids: string[] = [];
  for (const n of needs) {
    if (!NEED_CATEGORIES.includes(n.category)) fail(`Unknown need category "${n.category}".`);
    insert.run(
      id(),
      n.clubId,
      n.eventId,
      n.category,
      n.quantityLow,
      n.quantityHigh,
      n.unit,
      n.method,
      n.confidence,
      n.basis,
      n.inferredAt || timestamp(),
    );
    const row = find.get(n.clubId, n.eventId, n.category) as { id: string } | undefined;
    if (row) ids.push(row.id);
  }
  if (ids.length)
    audit(u, "economic_need.infer", ids[0], { count: ids.length, event_id: needs[0]?.eventId });
  return ids;
}

export function need(needId: string): PotentialEconomicNeed {
  demandInit();
  const row = db().prepare("SELECT * FROM economic_needs WHERE id=?").get(needId) as
    | NeedRow
    | undefined;
  if (!row) fail("Need not found.", 404);
  return toNeed(row);
}

/**
 * A club says yes. This is the ONLY way a row becomes a marketplace
 * opportunity, and it takes a User because somebody has to be accountable for
 * it by name.
 */
export function confirmNeed(
  u: User,
  needId: string,
  o: { notes?: string; quantityLow?: number; quantityHigh?: number } = {},
): PotentialEconomicNeed {
  officer(u);
  demandInit();
  const current = need(needId);
  const now = timestamp();
  // The club may correct the quantity while confirming — it knows things the
  // forecast does not, and a confirmation the club cannot edit is a rubber
  // stamp on our guess rather than its own decision.
  const low = Number.isFinite(o.quantityLow as number) ? Number(o.quantityLow) : current.quantityLow;
  const high = Number.isFinite(o.quantityHigh as number)
    ? Number(o.quantityHigh)
    : current.quantityHigh;
  if (high < low) fail("The upper quantity must not be below the lower one.");
  db()
    .prepare(
      `UPDATE economic_needs SET status='club_confirmed',confirmed_at=?,confirmed_by=?,declined_at=NULL,
       quantity_low=?,quantity_high=?,notes=? WHERE id=?`,
    )
    .run(now, u.id, low, high, String(o.notes || current.notes || "").slice(0, 2000), needId);
  audit(u, "economic_need.confirm", needId, { category: current.category });
  return need(needId);
}

/**
 * A club says no. Recorded rather than deleted, for two reasons: the decline is
 * the only honest measure of whether this inference engine is any good (see
 * `needConfirmationRateFactor` below), and a deleted row would be re-inferred
 * next week as though the club had never answered.
 */
export function declineNeed(u: User, needId: string, notes = ""): PotentialEconomicNeed {
  officer(u);
  demandInit();
  const current = need(needId);
  db()
    .prepare(
      `UPDATE economic_needs SET status='declined',declined_at=?,confirmed_at=NULL,confirmed_by=NULL,notes=? WHERE id=?`,
    )
    .run(timestamp(), String(notes || current.notes || "").slice(0, 2000), needId);
  audit(u, "economic_need.decline", needId, { category: current.category });
  return need(needId);
}

export function needsForEvent(eventId: string): PotentialEconomicNeed[] {
  demandInit();
  return (
    db()
      .prepare("SELECT * FROM economic_needs WHERE event_id=? ORDER BY category")
      .all(eventId) as NeedRow[]
  ).map(toNeed);
}

export function needsForClub(
  clubId: string,
  o: { status?: NeedStatus } = {},
): PotentialEconomicNeed[] {
  demandInit();
  const rows = o.status
    ? db()
        .prepare("SELECT * FROM economic_needs WHERE club_id=? AND status=? ORDER BY category")
        .all(clubId, o.status)
    : db()
        .prepare("SELECT * FROM economic_needs WHERE club_id=? ORDER BY category")
        .all(clubId);
  return (rows as NeedRow[]).map(toNeed);
}

/**
 * Every need a club has actually said yes to, across clubs. The input to group
 * purchasing — and note that it can only ever return 'club_confirmed' rows.
 */
export function confirmedNeeds(o: { category?: NeedCategory } = {}): PotentialEconomicNeed[] {
  demandInit();
  const rows = o.category
    ? db()
        .prepare(
          "SELECT * FROM economic_needs WHERE status='club_confirmed' AND category=? ORDER BY club_id",
        )
        .all(o.category)
    : db()
        .prepare("SELECT * FROM economic_needs WHERE status='club_confirmed' ORDER BY club_id")
        .all();
  return (rows as NeedRow[]).map(toNeed);
}

// =================================================================== factors

export type ClubNeedsInput = { needs: PotentialEconomicNeed[] };

/**
 * How broad an economic footprint a club's events imply.
 *
 * Breadth of category, not money. Summing quantities would add seats to hours,
 * and we have no prices — a club that needs a venue, food, AV, printing and
 * buses is running a bigger operation than one that needs a room, and that is
 * all this claims. Confirmed needs count fully; inferred ones count only as
 * much as we believe them; declined ones count zero, because the club told us.
 */
export const eventEconomicScaleFactor = defineFactor<ClubNeedsInput>({
  id: "event_economic_scale",
  name: "Event economic scale",
  description:
    "Breadth of the economic footprint a club's events imply, 0..1, weighted by how much of it the club has actually confirmed.",
  entity: "club",
  valueType: "index",
  hypothesis:
    "Clubs whose events trigger more confirmed need categories go on to record larger and more varied outgoings in the money register; if this is noise, realised spend per club will not order with it.",
  // No registered outcome kind measures club spend yet, so this is descriptive
  // until one exists. Claiming an outcome it cannot be scored against is how a
  // factor zoo starts.
  supportedOutcomes: [],
  expectedSign: 1,
  // About a club as an organisation, and publishable to its officers.
  privacy: "club_internal",
  // Sponsor ranking is permitted here and nowhere else in this file: the scale
  // of an event is exactly the thing a sponsor is entitled to weigh, it is a
  // property of an organisation rather than of a person, and the club can see
  // the same number.
  permittedUses: ["planning", "club_reporting", "sponsor_ranking", "research"],
  minimumSampleSize: 1,
  halfLifeDays: null,
  sources: ["economic_needs"],
  availableAt:
    "Every need row carries inferred_at, and a confirmation carries confirmed_at; a caller reconstructing a past moment passes only rows whose timestamps precede asOf. Nothing here reads a person's record.",
  version: "1.0.0",
  status: "experimental",
  requires: ["needs"],
  compute: (input) => {
    const needs = Array.isArray(input.needs) ? input.needs : [];
    if (!needs.length) return null;
    const weight = new Map<NeedCategory, number>();
    for (const n of needs) {
      const w =
        n.status === "club_confirmed" ? 1 : n.status === "declined" ? 0 : Math.max(0, n.confidence);
      weight.set(n.category, Math.max(weight.get(n.category) ?? 0, w));
    }
    const total = [...weight.values()].reduce((a, b) => a + b, 0);
    const drivers: Driver[] = [...weight.entries()]
      .filter(([, w]) => w > 0)
      .map(([c, w]) => ({ label: c, contribution: w / NEED_CATEGORIES.length }))
      .sort((a, b) => b.contribution - a.contribution);
    return {
      value: Math.min(1, total / NEED_CATEGORIES.length),
      n: needs.length,
      drivers,
      basis: {
        categories: weight.size,
        confirmed: needs.filter((n) => n.status === "club_confirmed").length,
        declined: needs.filter((n) => n.status === "declined").length,
      },
    };
  },
  explain: (value, reading) => {
    if (value === null) return "No needs have been recorded for this club yet.";
    const cats = (reading?.basis?.categories as number) ?? 0;
    const confirmed = (reading?.basis?.confirmed as number) ?? 0;
    return `Your events touch ${cats} of ${NEED_CATEGORIES.length} spending categories, ${confirmed} of which you have confirmed. That is breadth, not money: nobody here knows your prices.`;
  },
});

/**
 * The share of inferred needs a club confirms.
 *
 * This factor is pointed at US, not at the club. If clubs confirm almost
 * nothing we put in front of them, the inference engine is noise and should be
 * narrowed or switched off — and this is the number that would say so. It is
 * therefore deliberately NOT available for sponsor ranking: a club that
 * carefully declines our guesses would otherwise be ranked below one that
 * clicks yes, which punishes exactly the behaviour we need.
 */
export const needConfirmationRateFactor = defineFactor<ClubNeedsInput>({
  id: "need_confirmation_rate",
  name: "Need confirmation rate",
  description:
    "Of the inferred needs a club has actually ruled on, the share it confirmed. A measure of the inference engine as much as of the club.",
  entity: "club",
  valueType: "rate",
  hypothesis:
    "If inferred needs correspond to real procurement, clubs confirm a substantial share of the ones they rule on; a rate indistinguishable from zero falsifies the inference rules rather than describing the club.",
  supportedOutcomes: [],
  // Genuinely unknown: a low rate is a verdict on our rules, a high one might
  // only mean officers click yes to clear a list.
  expectedSign: null,
  privacy: "club_internal",
  permittedUses: ["planning", "club_reporting", "research"],
  // Four decisions cannot distinguish a useful engine from a coin.
  minimumSampleSize: 5,
  halfLifeDays: null,
  sources: ["economic_needs"],
  availableAt:
    "Confirmed and declined rows carry confirmed_at and declined_at; only decisions made before asOf may be passed in. Pending 'inferred' rows are excluded from both sides of the ratio.",
  version: "1.0.0",
  status: "experimental",
  requires: ["needs"],
  compute: (input) => {
    const needs = Array.isArray(input.needs) ? input.needs : [];
    const confirmed = needs.filter((n) => n.status === "club_confirmed").length;
    const declined = needs.filter((n) => n.status === "declined").length;
    const decided = confirmed + declined;
    // A need nobody has answered is not a soft no. Counting pending rows as
    // declines would let an unread inbox read as a verdict on the engine.
    if (decided === 0) return null;
    return {
      value: confirmed / decided,
      n: decided,
      drivers: [
        { label: "confirmed", contribution: confirmed / decided },
        { label: "declined", contribution: -declined / decided },
      ],
      basis: { confirmed, declined, pending: needs.length - decided },
    };
  },
  explain: (value, reading) => {
    if (value === null)
      return "You have not ruled on enough suggested needs for this to mean anything yet.";
    const c = (reading?.basis?.confirmed as number) ?? 0;
    const d = (reading?.basis?.declined as number) ?? 0;
    return `You confirmed ${c} of the ${c + d} suggested needs you answered. If that share is low, the fault is ours: it means we are suggesting things you do not need.`;
  },
});

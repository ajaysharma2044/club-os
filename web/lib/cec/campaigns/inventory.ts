// Activation inventory: what a club is actually willing to sell, on its terms.
//
// WHY THIS IS THE FIRST FILE AND NOT THE RANKING.
//
// The obvious way to build a sponsorship marketplace is to start with the
// matching model, treat clubs as supply, and let the ranker decide what each
// club gets offered. That system works exactly once. The second week, the run
// club has had four shoe brands in its inbox, the officers stop opening the
// emails, and the marketplace has spent its only real asset — a club's
// willingness to be contacted — to buy one quarter of impressions.
//
// So supply is DECLARED, not inferred. A club says which activation types it
// will host, how many people it can put in a room, which categories it refuses,
// what a slot is worth to it, and how often it is willing to be commercial at
// all. Nothing downstream may exceed those numbers. Eligibility enforces them
// before ranking runs (eligibility.ts), fatigue enforces the frequency side
// over time (fatigue.ts), and neither is allowed to "score around" a boundary:
// a club preference is a filter, never a penalty term.
//
// WHY THE CLUB POLICY LIVES HERE RATHER THAN IN fatigue.ts.
//
// The same four settings — excluded categories, preferred categories, a minimum
// sponsorship value, a maximum number of commercial activations per month —
// are read by eligibility, by fatigue and by ranking. Stored twice they would
// drift, and the failure mode of drift here is a club receiving a category it
// explicitly refused. One table, one reader, at the bottom of the dependency
// graph. fatigue.ts imports it; it imports nothing of fatigue's.
//
// The shared vocabulary (activation types, sponsor categories, the sponsor
// profile shape) also lives here for the same reason: every other file in this
// directory needs it, so it has to sit below all of them.

import { db, fail, id, officer, text, timestamp, audit, type User } from "../db";

// =============================================================== the vocabulary

/**
 * Every shape a sponsorship can take on a campus. Deliberately concrete: a
 * "brand partnership" is not an activation, it is a press release. Each of
 * these is a thing that either happens on a date or does not.
 */
export const ACTIVATION_TYPES = [
  "weekly_run",
  "race_5k",
  "product_test",
  "workshop",
  "challenge",
  "conference",
  "newsletter_placement",
  "member_discount",
  "training_series",
  "travel_sponsorship",
  "competition_funding",
  "sampling_event",
  "recruiting_event",
  "scholarship",
  "ambassador_program",
  "speaker_series",
  "demo_day",
] as const;
export type ActivationType = (typeof ACTIVATION_TYPES)[number];

/**
 * Roughly how many officer-hours one instance costs the club to run.
 *
 * This is the OperationalBurden input in ranking.ts, and it is stated here
 * rather than learned because we have no execution history yet and a learned
 * burden from zero observations is a made-up number wearing a lab coat. These
 * are priors; replace them per-club from `historical_execution` once a club has
 * actually run enough of them to say.
 */
export const ACTIVATION_BURDEN_HOURS: Record<ActivationType, number> = {
  weekly_run: 3,
  race_5k: 40,
  product_test: 8,
  workshop: 12,
  challenge: 10,
  conference: 80,
  newsletter_placement: 1,
  member_discount: 2,
  training_series: 20,
  travel_sponsorship: 6,
  competition_funding: 4,
  sampling_event: 5,
  recruiting_event: 10,
  scholarship: 6,
  ambassador_program: 14,
  speaker_series: 16,
  demo_day: 50,
};

/**
 * The ONLY activations that do not spend the club's attention budget.
 *
 * Defined as an exclusion list rather than an inclusion list, deliberately, and
 * the difference is a live loophole. Listing what counts as commercial means
 * every activation type nobody thought to list is free, and the frequency cap
 * can then be walked straight through: five brands each "just sponsoring the
 * weekly run" is five brands in front of members in one week, and a cap that
 * only counted product demos would have waved all five through.
 *
 * So the question is not "is this an advertisement" but "does a brand reach
 * members through it". These three are money that arrives without a pitch —
 * a covered entry fee, a travel grant, a scholarship. Everything else counts.
 */
export const NON_COMMERCIAL_ACTIVATIONS: ActivationType[] = [
  "scholarship",
  "competition_funding",
  "travel_sponsorship",
];

export const COMMERCIAL_ACTIVATIONS: ActivationType[] = ACTIVATION_TYPES.filter(
  (t) => !NON_COMMERCIAL_ACTIVATIONS.includes(t),
);

export function isCommercial(t: ActivationType): boolean {
  return !NON_COMMERCIAL_ACTIVATIONS.includes(t);
}

export const SPONSOR_CATEGORIES = [
  "athletic_apparel",
  "footwear",
  "wearables",
  "sports_nutrition",
  "beverage",
  "energy_drink",
  "food",
  "financial_services",
  "fintech",
  "crypto",
  "software",
  "hardware",
  "consulting",
  "recruiting",
  "healthcare",
  "pharma",
  "education",
  "retail",
  "automotive",
  "telecom",
  "media",
  "nonprofit",
  "alcohol",
  "tobacco",
  "vape",
  "gambling",
  "dating",
  "political",
] as const;
export type SponsorCategory = (typeof SPONSOR_CATEGORIES)[number];

/**
 * Categories that require an explicit, recorded opt-in from the club before any
 * activation is even ranked.
 *
 * Default-deny rather than default-allow, and the asymmetry is intentional: the
 * cost of wrongly excluding a legitimate sponsor is a missed deal, and the cost
 * of wrongly including one is a university-age audience receiving gambling or
 * vape promotion through a channel their club vouched for. Those are not the
 * same size of mistake, so they do not get the same default.
 */
export const RESTRICTED_CATEGORIES: SponsorCategory[] = [
  "alcohol",
  "tobacco",
  "vape",
  "gambling",
  "crypto",
  "dating",
  "political",
  "pharma",
];

/**
 * Categories a student experiences as ONE pitch rather than several.
 *
 * Nike and Hoka are competitors to a brand manager and the same email to a
 * sophomore. Fatigue is measured over these sectors, not over the finer
 * category, which is why the grouping lives in the shared vocabulary and not
 * inside the fatigue calculation.
 */
export const CATEGORY_SECTORS: Record<string, SponsorCategory[]> = {
  endurance_sport: [
    "athletic_apparel",
    "footwear",
    "wearables",
    "sports_nutrition",
    "energy_drink",
  ],
  money: ["financial_services", "fintech", "crypto"],
  tech: ["software", "hardware", "telecom"],
  career: ["consulting", "recruiting"],
  consumables: ["beverage", "food"],
  health: ["healthcare", "pharma"],
};

/** The sector a category belongs to, or the category itself when it has none. */
export function sectorOf(category: string): string {
  for (const [sector, members] of Object.entries(CATEGORY_SECTORS))
    if ((members as string[]).includes(category)) return sector;
  return category;
}

// ============================================================ sponsor profile

/**
 * What a sponsor is, as far as eligibility and ranking are concerned.
 *
 * Note what is NOT here: anything about individual members. A sponsor never
 * supplies, requests or receives a person-level attribute. `wantsMemberData`
 * exists only so the privacy filter has something to reject — a sponsor that
 * asks for member contact data is not quietly downgraded, it is refused by a
 * named filter and told why.
 */
export type SponsorProfile = {
  id: string;
  name: string;
  category: SponsorCategory | string;
  /** campuses or regions this campaign may run in; "national" matches all */
  geographies: string[];
  /** what the sponsor will pay for one activation, in whole currency units */
  budget: number;
  /** smallest audience the sponsor considers worth activating against */
  minimumAudience: number;
  activationTypes: ActivationType[];
  /** windows the sponsor can actually deliver in, ISO dates [start,end] */
  windows: { start: string; end: string }[];
  /**
   * Vendor-declared brand safety tier. "unrated" is treated as unsafe, not as
   * neutral: an unverified claim about a brand's own conduct is not evidence.
   */
  brandSafety: "verified" | "self_attested" | "unrated" | "flagged";
  /** true when the campaign requires member personal data to run */
  wantsMemberData?: boolean;
  /** prior campaigns, for P(deliverables_complete) and P(brand_renews) */
  history?: {
    campaignsRun: number;
    deliverablesComplete: number;
    renewals: number;
    renewalOpportunities: number;
  };
};

// =============================================================== club policy

/**
 * The club's standing terms. Every field is a boundary, not a preference the
 * ranker may trade away.
 */
export type ClubSponsorshipPolicy = {
  clubId: string;
  /** categories this club refuses outright */
  excludedCategories: string[];
  /** categories this club actively wants; a ranking bonus, never a filter */
  preferredCategories: string[];
  /** below this, the club would rather not be interrupted at all */
  minimumSponsorshipValue: number;
  /** hard ceiling on commercial activations inside a calendar month */
  maxActivationsPerMonth: number;
  /** hard ceiling inside any rolling 7 days; the week is how students feel it */
  maxActivationsPerWeek: number;
  /** ceiling per sector per month; stops five versions of the same pitch */
  maxPerSectorPerMonth: number;
  /**
   * Whether any member-level data may inform or be produced by a campaign.
   * "none" is the default and means exactly that — aggregate counts only.
   */
  memberDataSharing: "none" | "aggregate_only" | "opt_in_per_campaign";
  /** every activation needs an officer to say yes, unless a club turns this off */
  approvalRequired: boolean;
  updatedAt: string;
  updatedBy: string;
};

/**
 * What a club gets before it has said anything.
 *
 * Conservative on purpose. A club that has never configured this should not be
 * discoverable as unlimited inventory — silence is not consent, and the club
 * that has not set up its policy is precisely the one not watching its inbox.
 */
export function defaultPolicy(clubId: string): ClubSponsorshipPolicy {
  return {
    clubId,
    excludedCategories: [...RESTRICTED_CATEGORIES],
    preferredCategories: [],
    minimumSponsorshipValue: 0,
    maxActivationsPerMonth: 2,
    maxActivationsPerWeek: 1,
    maxPerSectorPerMonth: 1,
    memberDataSharing: "none",
    approvalRequired: true,
    updatedAt: "",
    updatedBy: "default",
  };
}

// =================================================================== the table

export type ActivationInventory = {
  id: string;
  clubId: string;
  activationType: ActivationType;
  /** who is in the room, in the club's own words — never a member list */
  audience: string;
  /** how many people the club can physically host */
  capacity: number;
  /** how many the club expects to actually reach, which is not capacity */
  estimatedReach: number;
  historicalExecution: ExecutionHistory;
  /** ISO date windows the club will host this in */
  availableDates: { start: string; end: string }[];
  location: string;
  /** categories refused for THIS slot, on top of the club-wide exclusions */
  categoryRestrictions: string[];
  minimumBudget: number;
  /** most instances of this activation the club will host per month */
  maximumFrequency: number;
  clubPreferences: Record<string, unknown>;
  approvalRequired: boolean;
  status: "open" | "paused" | "withdrawn";
  createdAt: string;
  updatedAt: string;
};

/**
 * What actually happened last time, which is the only honest input to
 * P(event_occurs). `offered` is the denominator that stops a club with one
 * successful event looking like a certainty.
 */
export type ExecutionHistory = {
  offered: number;
  accepted: number;
  occurred: number;
  cancelled: number;
  /** median headcount actually achieved, or null when nothing has run */
  medianAttendance: number | null;
  lastOccurredAt: string | null;
};

export const EMPTY_HISTORY: ExecutionHistory = {
  offered: 0,
  accepted: 0,
  occurred: 0,
  cancelled: 0,
  medianAttendance: null,
  lastOccurredAt: null,
};

let ready = false;

export function inventoryInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS activation_inventory(
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  activation_type TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 0,
  -- Reach is stated separately from capacity because they differ and the
  -- difference is the club's honesty about its own turnout.
  estimated_reach INTEGER NOT NULL DEFAULT 0,
  historical_execution TEXT NOT NULL DEFAULT '{}',
  available_dates TEXT NOT NULL DEFAULT '[]',
  location TEXT NOT NULL DEFAULT '',
  category_restrictions TEXT NOT NULL DEFAULT '[]',
  minimum_budget REAL NOT NULL DEFAULT 0,
  maximum_frequency INTEGER NOT NULL DEFAULT 1,
  club_preferences TEXT NOT NULL DEFAULT '{}',
  approval_required INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- One declaration per club per activation type. A club offering two
  -- differently-shaped workshops edits the row rather than accumulating
  -- duplicates that eligibility would then double-count as inventory.
  UNIQUE(club_id,activation_type));
CREATE INDEX IF NOT EXISTS activation_inventory_club ON activation_inventory(club_id,status);

CREATE TABLE IF NOT EXISTS club_sponsorship_policy(
  club_id TEXT PRIMARY KEY,
  excluded_categories TEXT NOT NULL DEFAULT '[]',
  preferred_categories TEXT NOT NULL DEFAULT '[]',
  minimum_sponsorship_value REAL NOT NULL DEFAULT 0,
  max_activations_per_month INTEGER NOT NULL DEFAULT 2,
  max_activations_per_week INTEGER NOT NULL DEFAULT 1,
  max_per_sector_per_month INTEGER NOT NULL DEFAULT 1,
  member_data_sharing TEXT NOT NULL DEFAULT 'none',
  approval_required INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL);
`);
  // Additive migration for databases created before the weekly and sector caps
  // existed. Same idiom as interviews.ts: add the column, keep the old rows.
  const cols = db()
    .prepare("PRAGMA table_info(club_sponsorship_policy)")
    .all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("max_activations_per_week"))
    db().exec(
      "ALTER TABLE club_sponsorship_policy ADD COLUMN max_activations_per_week INTEGER NOT NULL DEFAULT 1",
    );
  if (!have.has("max_per_sector_per_month"))
    db().exec(
      "ALTER TABLE club_sponsorship_policy ADD COLUMN max_per_sector_per_month INTEGER NOT NULL DEFAULT 1",
    );
  ready = true;
}

// ===================================================================== policy

function parseList(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parseObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseWindows(raw: unknown): { start: string; end: string }[] {
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (w): w is { start: string; end: string } =>
        !!w && typeof w === "object" && typeof w.start === "string" && typeof w.end === "string",
    );
  } catch {
    return [];
  }
}

/**
 * The club's standing terms, or the conservative default when it has not set
 * any. Never throws: an unconfigured club is a club with strict defaults, not
 * an error, because eligibility must be able to answer for every club.
 */
export function clubPolicy(clubId: string): ClubSponsorshipPolicy {
  inventoryInit();
  const row = db()
    .prepare("SELECT * FROM club_sponsorship_policy WHERE club_id=?")
    .get(clubId) as Record<string, unknown> | undefined;
  if (!row) return defaultPolicy(clubId);
  return {
    clubId,
    excludedCategories: parseList(row.excluded_categories),
    preferredCategories: parseList(row.preferred_categories),
    minimumSponsorshipValue: Number(row.minimum_sponsorship_value ?? 0),
    maxActivationsPerMonth: Number(row.max_activations_per_month ?? 2),
    maxActivationsPerWeek: Number(row.max_activations_per_week ?? 1),
    maxPerSectorPerMonth: Number(row.max_per_sector_per_month ?? 1),
    memberDataSharing: (row.member_data_sharing as ClubSponsorshipPolicy["memberDataSharing"]) ?? "none",
    approvalRequired: Number(row.approval_required ?? 1) === 1,
    updatedAt: String(row.updated_at ?? ""),
    updatedBy: String(row.updated_by ?? ""),
  };
}

/**
 * Set the club's terms. OFFICER ONLY, and that gate is the point of the
 * function: a sponsor, a platform operator or an eager growth experiment must
 * not be able to widen a club's own limits. If this is ever called from a
 * sponsor-facing route, the route is the bug.
 */
export function setClubPolicy(
  u: User,
  clubId: string,
  patch: Partial<Omit<ClubSponsorshipPolicy, "clubId" | "updatedAt" | "updatedBy">>,
): ClubSponsorshipPolicy {
  officer(u);
  inventoryInit();
  const current = clubPolicy(clubId);
  const next: ClubSponsorshipPolicy = {
    ...current,
    ...patch,
    clubId,
    updatedAt: timestamp(),
    updatedBy: u.id,
  };
  if (!Number.isFinite(next.minimumSponsorshipValue) || next.minimumSponsorshipValue < 0)
    fail("A minimum sponsorship value cannot be negative.", 422);
  for (const [label, v] of [
    ["per month", next.maxActivationsPerMonth],
    ["per week", next.maxActivationsPerWeek],
    ["per sector", next.maxPerSectorPerMonth],
  ] as [string, number][])
    if (!Number.isFinite(v) || v < 0)
      fail(`The maximum activations ${label} must be zero or more.`, 422);

  db()
    .prepare(
      `INSERT INTO club_sponsorship_policy(club_id,excluded_categories,preferred_categories,minimum_sponsorship_value,max_activations_per_month,max_activations_per_week,max_per_sector_per_month,member_data_sharing,approval_required,updated_at,updated_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(club_id) DO UPDATE SET
         excluded_categories=excluded.excluded_categories,
         preferred_categories=excluded.preferred_categories,
         minimum_sponsorship_value=excluded.minimum_sponsorship_value,
         max_activations_per_month=excluded.max_activations_per_month,
         max_activations_per_week=excluded.max_activations_per_week,
         max_per_sector_per_month=excluded.max_per_sector_per_month,
         member_data_sharing=excluded.member_data_sharing,
         approval_required=excluded.approval_required,
         updated_at=excluded.updated_at,
         updated_by=excluded.updated_by`,
    )
    .run(
      clubId,
      JSON.stringify(next.excludedCategories),
      JSON.stringify(next.preferredCategories),
      next.minimumSponsorshipValue,
      Math.floor(next.maxActivationsPerMonth),
      Math.floor(next.maxActivationsPerWeek),
      Math.floor(next.maxPerSectorPerMonth),
      next.memberDataSharing,
      next.approvalRequired ? 1 : 0,
      next.updatedAt,
      next.updatedBy,
    );
  audit(u, "campaign.policy.set", clubId, {
    excluded: next.excludedCategories.length,
    max_per_month: next.maxActivationsPerMonth,
  });
  return next;
}

// ================================================================== inventory

const hydrate = (r: Record<string, unknown>): ActivationInventory => ({
  id: String(r.id),
  clubId: String(r.club_id),
  activationType: String(r.activation_type) as ActivationType,
  audience: String(r.audience ?? ""),
  capacity: Number(r.capacity ?? 0),
  estimatedReach: Number(r.estimated_reach ?? 0),
  historicalExecution: {
    ...EMPTY_HISTORY,
    ...(parseObject(r.historical_execution) as Partial<ExecutionHistory>),
  },
  availableDates: parseWindows(r.available_dates),
  location: String(r.location ?? ""),
  categoryRestrictions: parseList(r.category_restrictions),
  minimumBudget: Number(r.minimum_budget ?? 0),
  maximumFrequency: Number(r.maximum_frequency ?? 1),
  clubPreferences: parseObject(r.club_preferences),
  approvalRequired: Number(r.approval_required ?? 1) === 1,
  status: (String(r.status ?? "open") as ActivationInventory["status"]),
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? ""),
});

export type DeclareInventoryInput = {
  clubId: string;
  activationType: ActivationType;
  audience?: string;
  capacity: number;
  estimatedReach?: number;
  historicalExecution?: Partial<ExecutionHistory>;
  availableDates?: { start: string; end: string }[];
  location?: string;
  categoryRestrictions?: string[];
  minimumBudget?: number;
  maximumFrequency?: number;
  clubPreferences?: Record<string, unknown>;
  approvalRequired?: boolean;
  status?: ActivationInventory["status"];
};

/**
 * Declare or update one slot of inventory. Officer only, same reason as the
 * policy: supply is the club's statement about itself.
 *
 * `estimatedReach` defaults to capacity when unstated, and that is a generous
 * default the club can correct. It is bounded at capacity on purpose — a club
 * cannot advertise reaching more people than it can seat, because that number
 * goes straight into a sponsor's expected value and would be the first thing
 * the marketplace learned to inflate.
 */
export function declareInventory(u: User, input: DeclareInventoryInput): ActivationInventory {
  officer(u);
  inventoryInit();
  if (!ACTIVATION_TYPES.includes(input.activationType))
    fail(`Unknown activation type "${input.activationType}".`, 422);
  const capacity = Math.max(0, Math.floor(Number(input.capacity) || 0));
  const reach = Math.min(
    capacity,
    Math.max(0, Math.floor(Number(input.estimatedReach ?? capacity) || 0)),
  );
  const now = timestamp();
  const existing = db()
    .prepare("SELECT * FROM activation_inventory WHERE club_id=? AND activation_type=?")
    .get(input.clubId, input.activationType) as Record<string, unknown> | undefined;

  const history: ExecutionHistory = {
    ...EMPTY_HISTORY,
    ...(existing ? parseObject(existing.historical_execution) : {}),
    ...(input.historicalExecution ?? {}),
  } as ExecutionHistory;

  const row = {
    id: existing ? String(existing.id) : id(),
    club_id: text(input.clubId, 64),
    activation_type: input.activationType,
    audience: input.audience ?? String(existing?.audience ?? ""),
    capacity,
    estimated_reach: reach,
    historical_execution: JSON.stringify(history),
    available_dates: JSON.stringify(input.availableDates ?? []),
    location: input.location ?? String(existing?.location ?? ""),
    category_restrictions: JSON.stringify(input.categoryRestrictions ?? []),
    minimum_budget: Math.max(0, Number(input.minimumBudget ?? 0)),
    maximum_frequency: Math.max(0, Math.floor(Number(input.maximumFrequency ?? 1))),
    club_preferences: JSON.stringify(input.clubPreferences ?? {}),
    approval_required: (input.approvalRequired ?? true) ? 1 : 0,
    status: input.status ?? "open",
    created_at: existing ? String(existing.created_at) : now,
    updated_at: now,
  };

  db()
    .prepare(
      `INSERT INTO activation_inventory(id,club_id,activation_type,audience,capacity,estimated_reach,historical_execution,available_dates,location,category_restrictions,minimum_budget,maximum_frequency,club_preferences,approval_required,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(club_id,activation_type) DO UPDATE SET
         audience=excluded.audience, capacity=excluded.capacity,
         estimated_reach=excluded.estimated_reach,
         historical_execution=excluded.historical_execution,
         available_dates=excluded.available_dates, location=excluded.location,
         category_restrictions=excluded.category_restrictions,
         minimum_budget=excluded.minimum_budget,
         maximum_frequency=excluded.maximum_frequency,
         club_preferences=excluded.club_preferences,
         approval_required=excluded.approval_required,
         status=excluded.status, updated_at=excluded.updated_at`,
    )
    .run(
      row.id,
      row.club_id,
      row.activation_type,
      row.audience,
      row.capacity,
      row.estimated_reach,
      row.historical_execution,
      row.available_dates,
      row.location,
      row.category_restrictions,
      row.minimum_budget,
      row.maximum_frequency,
      row.club_preferences,
      row.approval_required,
      row.status,
      row.created_at,
      row.updated_at,
    );
  audit(u, "campaign.inventory.declare", row.id, {
    club: row.club_id,
    activation: row.activation_type,
  });
  return hydrate(row as unknown as Record<string, unknown>);
}

/** Open inventory for a club. Paused and withdrawn rows are not supply. */
export function inventoryFor(
  clubId: string,
  opts: { includeClosed?: boolean } = {},
): ActivationInventory[] {
  inventoryInit();
  const rows = opts.includeClosed
    ? db()
        .prepare("SELECT * FROM activation_inventory WHERE club_id=? ORDER BY activation_type")
        .all(clubId)
    : db()
        .prepare(
          "SELECT * FROM activation_inventory WHERE club_id=? AND status='open' ORDER BY activation_type",
        )
        .all(clubId);
  return (rows as Record<string, unknown>[]).map(hydrate);
}

export function inventoryRow(inventoryId: string): ActivationInventory | null {
  inventoryInit();
  const r = db()
    .prepare("SELECT * FROM activation_inventory WHERE id=?")
    .get(inventoryId) as Record<string, unknown> | undefined;
  return r ? hydrate(r) : null;
}

/**
 * Record what happened to a slot, so P(event_occurs) has a denominator.
 *
 * Separate from the declaration because a club declares intentions and the
 * system observes outcomes, and letting a club overwrite its own execution
 * record would make the one honest input to the model the most flattering one.
 */
export function recordExecution(
  inventoryId: string,
  event: "offered" | "accepted" | "occurred" | "cancelled",
  at: string,
  attendance?: number,
): ExecutionHistory | null {
  inventoryInit();
  const row = inventoryRow(inventoryId);
  if (!row) return null;
  const h = { ...row.historicalExecution };
  h[event] = (h[event] ?? 0) + 1;
  if (event === "occurred") {
    h.lastOccurredAt = at;
    if (typeof attendance === "number" && Number.isFinite(attendance))
      // A running median needs the samples; with one number kept we take the
      // midpoint of the old median and the new observation, which is a smoothed
      // estimate and is labelled as such rather than claimed to be a median.
      h.medianAttendance =
        h.medianAttendance === null ? attendance : (h.medianAttendance + attendance) / 2;
  }
  db()
    .prepare("UPDATE activation_inventory SET historical_execution=?, updated_at=? WHERE id=?")
    .run(JSON.stringify(h), timestamp(), inventoryId);
  return h;
}

/**
 * Does this slot have a date window covering `at`?
 *
 * No windows declared means the club has not said when it will host this, which
 * is NOT "any time". Returning false here is what makes the available_date
 * filter honest rather than optimistic.
 */
export function hasWindowCovering(row: ActivationInventory, at: string): boolean {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return false;
  if (!row.availableDates.length) return false;
  return row.availableDates.some((w) => {
    const s = Date.parse(w.start);
    const e = Date.parse(w.end);
    return Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e;
  });
}

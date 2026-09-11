// Vendors: who a club could ask, and where several clubs could ask together.
//
// ==========================================================================
// THIS MODULE CANNOT CONTACT ANYONE, AND THAT IS A DESIGN PROPERTY, NOT A
// MISSING FEATURE.
//
// There is no send function. No order function. No book function. No email, no
// webhook, no outbox write. Search this file for `fetch` and you will not find
// one. The reason is that the failure mode of an automated vendor layer is not
// an inconvenience — it is a student club discovering a catering deposit it
// never agreed to, placed against an attendance number a model produced from
// four past meetings, in the club's name, with the club's money.
//
// So the API surface is shaped so that the mistake cannot be made by accident:
// the only verbs here are `recommend`, `list` and `record`. `recommendVendors`
// returns a shortlist with reasons. `recordEngagement` writes down something a
// human already did, in the past tense, after the fact. Nothing here initiates
// anything. If a future reader is about to add `sendInquiry()`: the reason it
// is absent is not that nobody got round to it.
//
// A recommendation is also NOT a booking, a quote, a price, or an endorsement.
// It is a filtered list with the filter shown. Any UI rendering it has to say
// so, because "recommended vendor" reads as "arranged" to an officer at 1am.
// ==========================================================================
//
// The matching is deterministic and explainable on purpose. There is no trained
// model here and there should not be: the entire training set would be a few
// dozen engagements from one campus, a model fitted on it would encode which
// vendors happened to be entered first, and nobody — not the officer, not us —
// could say why a particular vendor came top. What we have instead is a short
// table of stated weights, every one of which appears in the output as a named
// reason with its contribution. If a recommendation looks wrong, you can see
// exactly which clause produced it and argue with that clause.
//
// Tested in tests/economics.mjs.

import { db, fail, id, text, timestamp, officer, audit, type User } from "../db";
import { clubInstitution } from "../institutions";
import type { Driver } from "../factors";
import {
  NEED_CATEGORIES,
  type NeedCategory,
  type PotentialEconomicNeed,
} from "./demand";

// ================================================================== storage

/**
 * What happened between a club and a vendor, recorded after the fact by a
 * person. Note that every value is past tense: there is no 'requested' or
 * 'pending', because this module never initiates anything that could be
 * pending.
 */
export const VENDOR_ENGAGEMENT_STATUSES = [
  "considered", // the club looked at them
  "quoted", // the club got a price
  "engaged", // the club went ahead
  "completed", // the work happened
  "fell_through", // it did not, for whatever reason
] as const;
export type VendorEngagementStatus = (typeof VENDOR_ENGAGEMENT_STATUSES)[number];

/** Engagements that say the vendor actually delivered. */
const GOOD_OUTCOMES: VendorEngagementStatus[] = ["completed"];

let ready = false;
export function vendorsInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS vendors(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  -- The campus this vendor serves, or '' for one that serves anywhere. Never
  -- guessed from an address: a blank here means unknown, and unknown must not
  -- read as "not local".
  institution_id TEXT NOT NULL DEFAULT '',
  -- How a human would reach them. Held so an officer can pick up the phone.
  -- Nothing in this codebase reads it to send anything.
  contact TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_identity ON vendors(name,category,institution_id);
CREATE INDEX IF NOT EXISTS vendor_category ON vendors(category,active);
-- What a club did with a vendor, written down afterwards. observed_at is when
-- we learned it, occurred_at is when it happened; a point-in-time read filters
-- on observed_at or it will use facts that had not been recorded yet.
CREATE TABLE IF NOT EXISTS vendor_engagements(
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES vendors(id),
  need_id TEXT NOT NULL DEFAULT '',
  club_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS vendor_engage_vendor ON vendor_engagements(vendor_id,observed_at);
CREATE INDEX IF NOT EXISTS vendor_engage_club ON vendor_engagements(club_id,status);
`);
  // Additive migration for databases created before currency was separated
  // from the amount. Defaulted rather than backfilled: we do not know what
  // currency an old row was in, and 'USD' is at least stated.
  const cols = db().prepare("PRAGMA table_info(vendor_engagements)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "currency"))
    db().exec("ALTER TABLE vendor_engagements ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'");
  ready = true;
}

export type Vendor = {
  id: string;
  name: string;
  category: NeedCategory;
  institution_id: string;
  contact: string;
  notes: string;
  active: number;
  created_at: string;
};

export type VendorEngagement = {
  id: string;
  vendor_id: string;
  need_id: string;
  club_id: string;
  status: VendorEngagementStatus;
  amount_cents: number | null;
  currency: string;
  occurred_at: string;
  observed_at: string;
  notes: string;
};

export function addVendor(
  u: User,
  v: {
    name: string;
    category: NeedCategory;
    institutionId?: string;
    contact?: string;
    notes?: string;
  },
): string {
  officer(u);
  vendorsInit();
  if (!NEED_CATEGORIES.includes(v.category)) fail(`Unknown vendor category "${v.category}".`);
  const name = text(v.name, 200);
  const institution = String(v.institutionId || "").slice(0, 64);
  const existing = db()
    .prepare("SELECT id FROM vendors WHERE name=? AND category=? AND institution_id=?")
    .get(name, v.category, institution) as { id: string } | undefined;
  if (existing) return existing.id;
  const key = id();
  db()
    .prepare(
      "INSERT INTO vendors(id,name,category,institution_id,contact,notes,active,created_at) VALUES (?,?,?,?,?,?,1,?)",
    )
    .run(
      key,
      name,
      v.category,
      institution,
      String(v.contact || "").slice(0, 400),
      String(v.notes || "").slice(0, 2000),
      timestamp(),
    );
  audit(u, "vendor.add", key, { category: v.category });
  return key;
}

/** Retire a vendor without deleting the history of who used them. */
export function deactivateVendor(u: User, vendorId: string): void {
  officer(u);
  vendorsInit();
  db().prepare("UPDATE vendors SET active=0 WHERE id=?").run(vendorId);
  audit(u, "vendor.deactivate", vendorId, {});
}

export function vendor(vendorId: string): Vendor {
  vendorsInit();
  const row = db().prepare("SELECT * FROM vendors WHERE id=?").get(vendorId) as Vendor | undefined;
  if (!row) fail("Vendor not found.", 404);
  return row;
}

export function listVendors(
  o: { category?: NeedCategory; institutionId?: string; includeInactive?: boolean } = {},
): Vendor[] {
  vendorsInit();
  const where: string[] = [];
  const args: unknown[] = [];
  if (o.category) {
    where.push("category=?");
    args.push(o.category);
  }
  if (o.institutionId) {
    where.push("(institution_id=? OR institution_id='')");
    args.push(o.institutionId);
  }
  if (!o.includeInactive) where.push("active=1");
  const sql = `SELECT * FROM vendors${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY name`;
  return db()
    .prepare(sql)
    .all(...(args as any[])) as Vendor[];
}

/**
 * Write down something that already happened.
 *
 * Past tense throughout, and deliberately so: this is a ledger of human
 * decisions, not a queue of instructions. Nothing in this codebase reads a row
 * from this table and acts on it.
 *
 * No behavioural event is emitted. The quant store has a closed schema and
 * nothing in it describes a club hiring a caterer; inventing a kind would be
 * rejected at ingest, and stretching an existing one would put a purchase into
 * a person's behavioural record, which is exactly where it does not belong.
 */
export function recordEngagement(
  u: User,
  e: {
    vendorId: string;
    clubId: string;
    status: VendorEngagementStatus;
    needId?: string;
    amountCents?: number | null;
    currency?: string;
    occurredAt?: string;
    notes?: string;
  },
): string {
  officer(u);
  vendorsInit();
  if (!VENDOR_ENGAGEMENT_STATUSES.includes(e.status)) fail("Unknown engagement status.");
  vendor(e.vendorId); // 404s rather than orphaning a row
  const key = id();
  const now = timestamp();
  db()
    .prepare(
      "INSERT INTO vendor_engagements(id,vendor_id,need_id,club_id,status,amount_cents,currency,occurred_at,observed_at,notes) VALUES (?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      key,
      e.vendorId,
      String(e.needId || "").slice(0, 64),
      text(e.clubId, 64),
      e.status,
      Number.isFinite(e.amountCents as number) ? Math.round(Number(e.amountCents)) : null,
      String(e.currency || "USD").slice(0, 8),
      e.occurredAt || now,
      now,
      String(e.notes || "").slice(0, 2000),
    );
  audit(u, "vendor.engagement", key, { vendor_id: e.vendorId, status: e.status });
  return key;
}

export function engagementsFor(vendorId: string, asOf?: string): VendorEngagement[] {
  vendorsInit();
  const rows = asOf
    ? db()
        .prepare(
          "SELECT * FROM vendor_engagements WHERE vendor_id=? AND observed_at<=? ORDER BY occurred_at",
        )
        .all(vendorId, asOf)
    : db()
        .prepare("SELECT * FROM vendor_engagements WHERE vendor_id=? ORDER BY occurred_at")
        .all(vendorId);
  return rows as VendorEngagement[];
}

// =========================================================== recommendation

/**
 * The entire scoring model, in one table, in units of "share of a perfect
 * match". Every weight that fires appears in the output as a named reason
 * carrying exactly this contribution, so a recommendation can be argued with
 * rather than trusted.
 *
 * These are stated weights. They are not fitted, and they should not be fitted
 * until there is a body of engagements large enough that a fit would mean
 * something — which for one campus is years away, if ever.
 */
export const MATCH_WEIGHTS = {
  /** they do this category at all. Required, so it is the floor, not a bonus. */
  categoryMatch: 0.35,
  /** listed against the club's own campus rather than nowhere in particular */
  sameInstitution: 0.2,
  /** this club has used them before */
  priorEngagementWithClub: 0.15,
  /** and the work actually got done */
  completedForClub: 0.2,
  /** other clubs have used them, capped so a popular vendor cannot run away */
  usedByOtherClubs: 0.1,
  /** something fell through. Scaled by how often. */
  fellThroughPenalty: -0.35,
};

/** How many other clubs it takes to max out the `usedByOtherClubs` term. */
const OTHER_CLUB_SATURATION = 3;

export type VendorRecommendation = {
  vendor: Vendor;
  /** 0..1. A ranking device, not a rating of the vendor. */
  score: number;
  /** the named clauses that produced the score, same Driver shape as a factor */
  reasons: Driver[];
  /** what this recommendation does not know */
  caveats: string[];
  /** the sentence an officer reads */
  reading: string;
};

/**
 * Whether a need is even eligible for a shortlist.
 *
 * Only a club confirming a need turns it into a marketplace opportunity. An
 * inferred need is our guess; putting vendors next to a guess invites somebody
 * to act on it, and a declined need has already been answered. Both return an
 * empty list from `recommendVendors`, and this function says which and why so a
 * UI can show the reason instead of an unexplained blank.
 */
export function mayRecommendFor(need: PotentialEconomicNeed): { ok: boolean; reason: string } {
  if (!need) return { ok: false, reason: "No need supplied." };
  if (need.status === "declined")
    return {
      ok: false,
      reason: "You told us you do not need this, so there is nothing to shortlist.",
    };
  if (need.status !== "club_confirmed")
    return {
      ok: false,
      reason:
        "This is still our inference, not your decision. Confirm the need and we will show you who does this kind of work.",
    };
  return { ok: true, reason: "" };
}

/**
 * A shortlist of vendors for a CONFIRMED need, with the reason for each.
 *
 * Deterministic: same inputs, same order, every time. Ties break on name so
 * that two vendors with identical histories do not swap places between page
 * loads and make the ranking look like it means something it does not.
 */
export function recommendVendors(
  need: PotentialEconomicNeed,
  options: { institutionId?: string; limit?: number; asOf?: string } = {},
): VendorRecommendation[] {
  vendorsInit();
  if (!mayRecommendFor(need).ok) return [];

  // The club's campus, if we know it. Unknown means no institution term fires
  // in either direction — it must not read as "this vendor is not local".
  const institutionId =
    options.institutionId ?? clubInstitution(need.clubId)?.id ?? "";

  const candidates = (
    db()
      .prepare("SELECT * FROM vendors WHERE category=? AND active=1 ORDER BY name")
      .all(need.category) as Vendor[]
  ).filter(
    // A vendor pinned to another campus is not a candidate. One pinned to no
    // campus is, because blank means unknown.
    (v) => !v.institution_id || !institutionId || v.institution_id === institutionId,
  );

  const out: VendorRecommendation[] = [];
  for (const v of candidates) {
    const history = engagementsFor(v.id, options.asOf);
    const mine = history.filter((h) => h.club_id === need.clubId);
    const others = new Set(history.filter((h) => h.club_id !== need.clubId).map((h) => h.club_id));
    const completedForClub = mine.filter((h) => GOOD_OUTCOMES.includes(h.status)).length;
    const fellThrough = history.filter((h) => h.status === "fell_through").length;

    const reasons: Driver[] = [
      {
        label: `does ${need.category.replace(/_/g, " ")}`,
        contribution: MATCH_WEIGHTS.categoryMatch,
      },
    ];
    const caveats: string[] = [];

    if (institutionId && v.institution_id === institutionId)
      reasons.push({
        label: "listed for your campus",
        contribution: MATCH_WEIGHTS.sameInstitution,
      });
    else if (!institutionId)
      caveats.push("We do not know which campus your club is on, so nothing here is local.");
    else if (!v.institution_id)
      caveats.push("Not listed against any campus, so nobody has said they work near you.");

    if (mine.length)
      reasons.push({
        label: `your club has worked with them ${mine.length} time${mine.length === 1 ? "" : "s"}`,
        contribution: MATCH_WEIGHTS.priorEngagementWithClub,
      });
    if (completedForClub)
      reasons.push({
        label: `${completedForClub} of those finished`,
        contribution: MATCH_WEIGHTS.completedForClub,
      });
    if (others.size)
      reasons.push({
        label: `${others.size} other club${others.size === 1 ? "" : "s"} used them`,
        contribution:
          MATCH_WEIGHTS.usedByOtherClubs * Math.min(1, others.size / OTHER_CLUB_SATURATION),
      });
    if (fellThrough) {
      // A negative reason is still a reason, and it is shown rather than
      // silently sinking the vendor down the list.
      const share = fellThrough / Math.max(1, history.length);
      reasons.push({
        label: `${fellThrough} engagement${fellThrough === 1 ? "" : "s"} fell through`,
        contribution: MATCH_WEIGHTS.fellThroughPenalty * share,
      });
    }
    if (!history.length)
      caveats.push(
        "No club has recorded using them through Club OS, so this is a category match and nothing more.",
      );

    const score = Math.min(
      1,
      Math.max(0, reasons.reduce((a, r) => a + r.contribution, 0)),
    );
    out.push({
      vendor: v,
      score,
      reasons,
      caveats,
      // The last clause is not decoration. An officer reading a shortlist at
      // 1am needs to know that nothing has been arranged.
      reading:
        `${v.name} — ${reasons.map((r) => r.label).join("; ")}. ` +
        "Nobody has been contacted and nothing has been booked; this is a list of people you could ask.",
    });
  }

  out.sort((a, b) => b.score - a.score || a.vendor.name.localeCompare(b.vendor.name));
  return out.slice(0, Math.max(1, options.limit ?? 10));
}

// ========================================================== group purchasing

/**
 * A confirmed need with the date window its event occupies.
 *
 * The window has to be supplied by the caller. `economic_needs` stores no date
 * — a need belongs to an event, and the event owns the calendar — and inventing
 * one here would manufacture an overlap that does not exist, which is the one
 * error this function must not make.
 */
export type WindowedNeed = PotentialEconomicNeed & {
  window: { start: string; end: string };
};

export type GroupPurchaseOpportunity = {
  category: NeedCategory;
  unit: string;
  /** distinct clubs, sorted, so the output is stable */
  clubs: string[];
  needIds: string[];
  combinedQuantityLow: number;
  combinedQuantityHigh: number;
  /** the window every participating need shares */
  window: { start: string; end: string } | null;
  /** earliest start to latest end across the group */
  span: { start: string; end: string };
  reading: string;
  caveats: string[];
};

const DAY_MS = 86400e3;

/**
 * Where several clubs could buy the same thing together.
 *
 * This is the part of an economics layer that is straightforwardly good for
 * clubs: four clubs printing 200 badges each in the same week are one print run
 * with one setup fee, and none of them can see the other three. It is not a
 * take-rate play and there is no fee anywhere in this file — the output is a
 * list of clubs who could talk to each other.
 *
 * Three rules keep it honest:
 *
 *   1. CONFIRMED NEEDS ONLY. Combining inferences would put a club's name on a
 *      shared order it never agreed to.
 *   2. A GENUINE COMMON WINDOW. A group is only reported when every member's
 *      window overlaps every other member's — enforced by intersecting as we
 *      go, not by comparing each new member against the first. Two clubs three
 *      months apart are not a group purchase, however alike their needs look.
 *   3. TWO DISTINCT CLUBS MINIMUM. One club with two events is not a group.
 *
 * `maxGapDays` defaults to 0: windows must actually overlap. A caller who knows
 * the goods are not perishable can widen it deliberately, and the result says
 * that it did.
 */
export function groupPurchaseOpportunities(
  needs: WindowedNeed[],
  options: { maxGapDays?: number; minClubs?: number } = {},
): GroupPurchaseOpportunity[] {
  const gap = Math.max(0, options.maxGapDays ?? 0) * DAY_MS;
  const minClubs = Math.max(2, options.minClubs ?? 2);

  const usable = (needs || [])
    .filter((n) => n && n.status === "club_confirmed")
    .map((n) => ({
      need: n,
      start: Date.parse(n.window?.start ?? ""),
      end: Date.parse(n.window?.end ?? ""),
    }))
    .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end >= x.start);

  // Group by category AND unit. Same category should always mean same unit, but
  // a row stored before a unit existed reads as '', and adding servings to
  // blanks would produce a combined quantity that means nothing.
  const buckets = new Map<string, typeof usable>();
  for (const x of usable) {
    const key = `${x.need.category}|${x.need.unit}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(x);
  }

  const out: GroupPurchaseOpportunity[] = [];
  for (const [key, rows] of buckets) {
    const [category, unit] = key.split("|");
    rows.sort((a, b) => a.start - b.start || a.need.clubId.localeCompare(b.need.clubId));

    let group: typeof rows = [];
    // The running INTERSECTION, not the running span. Every member overlaps
    // every other member because each new member had to overlap what they all
    // already share.
    let lo = -Infinity;
    let hi = Infinity;

    const pushGroup = (g: typeof rows) => {
      const clubs = [...new Set(g.map((x) => x.need.clubId))].sort();
      if (clubs.length < minClubs) return;
      const low = g.reduce((a, x) => a + x.need.quantityLow, 0);
      const high = g.reduce((a, x) => a + x.need.quantityHigh, 0);
      const start = Math.max(...g.map((x) => x.start));
      const end = Math.min(...g.map((x) => x.end));
      const spanStart = Math.min(...g.map((x) => x.start));
      const spanEnd = Math.max(...g.map((x) => x.end));
      const caveats = [
        "Nobody has been contacted and no order exists. This is a list of clubs whose plans overlap.",
        "Each club still decides for itself; combined quantities are only a starting point for a conversation.",
      ];
      if (gap > 0)
        caveats.push(
          `Windows were allowed to sit up to ${options.maxGapDays} day(s) apart, so these events are not necessarily on the same day.`,
        );
      out.push({
        category: category as NeedCategory,
        unit,
        clubs,
        needIds: g.map((x) => x.need.id).filter(Boolean),
        combinedQuantityLow: low,
        combinedQuantityHigh: high,
        window: end >= start ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null,
        span: {
          start: new Date(spanStart).toISOString(),
          end: new Date(spanEnd).toISOString(),
        },
        reading: `${clubs.length} clubs each need ${category.replace(/_/g, " ")} in the same window — ${low}–${high} ${unit || "units"} between them. Worth asking together.`,
        caveats,
      });
    };
    const flush = () => {
      if (group.length) pushGroup(group);
      group = [];
      lo = -Infinity;
      hi = Infinity;
    };

    for (const row of rows) {
      if (!group.length) {
        group = [row];
        lo = row.start;
        hi = row.end;
        continue;
      }
      // Overlap against the shared window, widened by the stated slack.
      if (row.start <= hi + gap && row.end >= lo - gap) {
        group.push(row);
        lo = Math.max(lo, row.start);
        hi = Math.min(hi, row.end);
      } else {
        flush();
        group = [row];
        lo = row.start;
        hi = row.end;
      }
    }
    flush();
  }

  out.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.span.start.localeCompare(b.span.start),
  );
  return out;
}

// Frequency caps: the thing that keeps this marketplace from eating itself.
//
// THE FAILURE THIS PREVENTS, CONCRETELY.
//
// A run club is the single most valuable inventory on a campus for endurance
// brands. A ranker optimising sponsor value will discover that within a week.
// Adidas ranks first, and so do Nike, Hoka, Garmin and Gatorade, because
// nothing in a per-campaign score knows about the other four. The club receives
// all five in seven days. What happens next is not a slightly worse quarter: the
// officers stop reading, the members start treating club email as advertising,
// and the asset is gone. There is no bid high enough to buy it back.
//
// So the cap is a CONSTRAINT, not a term in the objective. Ranking may not
// outbid it. A sponsor willing to pay ten times the going rate still does not
// get the sixth slot, because the thing being protected does not belong to the
// marketplace — it belongs to the club and to its members.
//
// THREE COUNTS, NOT ONE.
//
//   per week     — how a student actually experiences density
//   per month    — the club's stated commercial budget
//   per sector   — five shoe brands are one pitch heard five times
//
// The sector count is the one that catches the case above. Nike and Hoka are
// competitors to a brand manager and the same email to a sophomore, which is
// why fatigue is measured over sectors (inventory.ts CATEGORY_SECTORS) and not
// over the finer category.
//
// MEMBER-LEVEL EXPOSURE IS OPT-IN AND NARROW.
//
// docs/11 §7 rules out passive tracking of individuals, and a per-member
// sponsor-exposure log is exactly the sort of thing that becomes an audience
// segment if left unguarded. So a member-level row may only be written when the
// club's policy is `opt_in_per_campaign` AND a consent reference is supplied,
// and it is never returned to a sponsor — only aggregated counts are. Anything
// else is refused with an error rather than silently downgraded.

import { db, fail, id, timestamp } from "../db";
import {
  clubPolicy,
  sectorOf,
  type ActivationType,
  type ClubSponsorshipPolicy,
  type SponsorProfile,
} from "./inventory";

/**
 * The stages that actually spend the club's attention.
 *
 * `recommended` is a candidate the system generated and nobody has seen. It
 * costs the club nothing and must not count against a cap, or the cap would be
 * consumed by the ranker's own internal churn. Everything from `shown` onward
 * reached a human.
 */
export const ATTENTION_STAGES = ["shown", "accepted", "delivered"] as const;
export type ExposureStage = "recommended" | "shown" | "accepted" | "declined" | "delivered";

export type ExposureRow = {
  id: string;
  clubId: string;
  sponsorId: string;
  sponsorCategory: string;
  sector: string;
  campaignId: string | null;
  activationType: string | null;
  stage: ExposureStage;
  commercial: boolean;
  /** null for every club-level row, which is nearly all of them */
  memberId: string | null;
  consentBasis: string | null;
  occurredAt: string;
  observedAt: string;
};

let ready = false;

export function fatigueInit() {
  if (ready) return;
  db().exec(`
CREATE TABLE IF NOT EXISTS campaign_exposures(
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  sponsor_id TEXT NOT NULL,
  sponsor_category TEXT NOT NULL DEFAULT '',
  -- Denormalised on purpose: the sector a category belonged to at the time is
  -- part of the decision record. Recomputing it later from a changed grouping
  -- would rewrite why a cap fired.
  sector TEXT NOT NULL DEFAULT '',
  campaign_id TEXT,
  activation_type TEXT,
  stage TEXT NOT NULL,
  commercial INTEGER NOT NULL DEFAULT 1,
  -- Null for club-level exposure, which is the only kind written by default.
  member_id TEXT,
  consent_basis TEXT,
  occurred_at TEXT NOT NULL,
  observed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS campaign_exposure_club ON campaign_exposures(club_id,occurred_at);
CREATE INDEX IF NOT EXISTS campaign_exposure_sector ON campaign_exposures(club_id,sector,occurred_at);
CREATE INDEX IF NOT EXISTS campaign_exposure_member ON campaign_exposures(member_id,occurred_at);
`);
  ready = true;
}

// ==================================================================== writing

export type RecordExposureInput = {
  clubId: string;
  sponsorId: string;
  sponsorCategory: string;
  stage: ExposureStage;
  campaignId?: string | null;
  activationType?: ActivationType | string | null;
  commercial?: boolean;
  occurredAt?: string;
  observedAt?: string;
  /** member-level only; requires opt_in_per_campaign AND a consent reference */
  memberId?: string;
  consentBasis?: string;
};

/**
 * Record that a club (or, where permissioned, a member) was exposed to a
 * sponsor.
 *
 * The member-level branch refuses rather than degrades. A function that quietly
 * dropped `memberId` when consent was missing would leave a caller believing it
 * had per-member data when it did not, and the next person to read the table
 * would draw conclusions from a silently truncated log.
 */
export function recordExposure(input: RecordExposureInput): ExposureRow {
  fatigueInit();
  const now = timestamp();
  const occurredAt = input.occurredAt || now;
  const observedAt = input.observedAt || occurredAt;
  if (occurredAt > observedAt)
    fail("An exposure cannot be observed before it happened.", 422);

  if (input.memberId) {
    const policy = clubPolicy(input.clubId);
    if (policy.memberDataSharing !== "opt_in_per_campaign")
      fail(
        `Member-level exposure refused: ${input.clubId} shares "${policy.memberDataSharing}". ` +
          "Per-member sponsor exposure requires opt_in_per_campaign and is never inferred from club settings (docs/11 §7).",
        403,
      );
    if (!input.consentBasis?.trim())
      fail(
        "Member-level exposure refused: no consent reference supplied. A consent that cannot be pointed at is not a consent.",
        403,
      );
  }

  const row: ExposureRow = {
    id: id(),
    clubId: input.clubId,
    sponsorId: input.sponsorId,
    sponsorCategory: input.sponsorCategory,
    sector: sectorOf(input.sponsorCategory),
    campaignId: input.campaignId ?? null,
    activationType: (input.activationType as string) ?? null,
    stage: input.stage,
    commercial: input.commercial ?? true,
    memberId: input.memberId ?? null,
    consentBasis: input.consentBasis ?? null,
    occurredAt,
    observedAt,
  };
  db()
    .prepare(
      `INSERT INTO campaign_exposures(id,club_id,sponsor_id,sponsor_category,sector,campaign_id,activation_type,stage,commercial,member_id,consent_basis,occurred_at,observed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      row.id,
      row.clubId,
      row.sponsorId,
      row.sponsorCategory,
      row.sector,
      row.campaignId,
      row.activationType,
      row.stage,
      row.commercial ? 1 : 0,
      row.memberId,
      row.consentBasis,
      row.occurredAt,
      row.observedAt,
    );
  return row;
}

// ==================================================================== reading

const hydrate = (r: Record<string, unknown>): ExposureRow => ({
  id: String(r.id),
  clubId: String(r.club_id),
  sponsorId: String(r.sponsor_id),
  sponsorCategory: String(r.sponsor_category ?? ""),
  sector: String(r.sector ?? ""),
  campaignId: r.campaign_id === null || r.campaign_id === undefined ? null : String(r.campaign_id),
  activationType:
    r.activation_type === null || r.activation_type === undefined ? null : String(r.activation_type),
  stage: String(r.stage) as ExposureStage,
  commercial: Number(r.commercial ?? 1) === 1,
  memberId: r.member_id === null || r.member_id === undefined ? null : String(r.member_id),
  consentBasis:
    r.consent_basis === null || r.consent_basis === undefined ? null : String(r.consent_basis),
  occurredAt: String(r.occurred_at),
  observedAt: String(r.observed_at),
});

const daysBefore = (at: string, days: number): string =>
  new Date(Date.parse(at) - days * 86400e3).toISOString();

/**
 * Club-level exposures inside a window, point-in-time honest.
 *
 * `observed_at <= at` matters as much here as in the factor store: a cap that
 * counted an exposure recorded after the decision would report a violation that
 * the decision could not have known about, and a replay would disagree with
 * what actually happened.
 */
export function exposuresInWindow(
  clubId: string,
  at: string,
  days: number,
  opts: { stages?: readonly string[]; commercialOnly?: boolean } = {},
): ExposureRow[] {
  fatigueInit();
  const stages = opts.stages ?? ATTENTION_STAGES;
  const rows = db()
    .prepare(
      `SELECT * FROM campaign_exposures
       WHERE club_id=? AND member_id IS NULL
         AND occurred_at > ? AND occurred_at <= ? AND observed_at <= ?
       ORDER BY occurred_at DESC`,
    )
    .all(clubId, daysBefore(at, days), at, at) as Record<string, unknown>[];
  return rows
    .map(hydrate)
    .filter((r) => stages.includes(r.stage))
    .filter((r) => (opts.commercialOnly === false ? true : r.commercial));
}

export type ExposureSummary = {
  clubId: string;
  at: string;
  week: number;
  month: number;
  bySector: { sector: string; count: number; sponsors: string[] }[];
  bySponsor: { sponsorId: string; count: number; lastAt: string }[];
  distinctSponsorsThisWeek: number;
};

/** What this club has already absorbed, the shape every cap reads from. */
export function exposureSummary(clubId: string, at: string): ExposureSummary {
  const week = exposuresInWindow(clubId, at, 7);
  const month = exposuresInWindow(clubId, at, 30);

  const sectorMap = new Map<string, Set<string>>();
  const sectorCount = new Map<string, number>();
  for (const r of month) {
    sectorCount.set(r.sector, (sectorCount.get(r.sector) ?? 0) + 1);
    if (!sectorMap.has(r.sector)) sectorMap.set(r.sector, new Set());
    sectorMap.get(r.sector)!.add(r.sponsorId);
  }
  const sponsorCount = new Map<string, { count: number; lastAt: string }>();
  for (const r of month) {
    const cur = sponsorCount.get(r.sponsorId);
    sponsorCount.set(r.sponsorId, {
      count: (cur?.count ?? 0) + 1,
      lastAt: cur && cur.lastAt > r.occurredAt ? cur.lastAt : r.occurredAt,
    });
  }

  return {
    clubId,
    at,
    week: week.length,
    month: month.length,
    bySector: [...sectorCount.entries()]
      .map(([sector, count]) => ({
        sector,
        count,
        sponsors: [...(sectorMap.get(sector) ?? new Set<string>())],
      }))
      .sort((a, b) => b.count - a.count),
    bySponsor: [...sponsorCount.entries()]
      .map(([sponsorId, v]) => ({ sponsorId, count: v.count, lastAt: v.lastAt }))
      .sort((a, b) => b.count - a.count),
    distinctSponsorsThisWeek: new Set(week.map((r) => r.sponsorId)).size,
  };
}

// ====================================================================== caps

export const FATIGUE_RULES = [
  "max_per_week",
  "max_per_month",
  "max_per_sector_per_month",
  "same_sponsor_repeat",
] as const;
export type FatigueRule = (typeof FATIGUE_RULES)[number];

export type FatigueViolation = {
  rule: FatigueRule;
  limit: number;
  observed: number;
  /** plain language, naming the rule, so a sponsor can tell a cap from a bug */
  reason: string;
};

export type FatigueCheck = {
  clubId: string;
  sponsorId: string;
  at: string;
  withinCaps: boolean;
  violations: FatigueViolation[];
  /**
   * 0..1 crowding, used as a PENALTY inside the cap rather than a second gate.
   * A club at 0 of 2 this month and a club at 1 of 2 are both eligible and
   * should not rank identically; this is the difference between them.
   */
  fatigue: number;
  summary: ExposureSummary;
  reading: string;
};

/**
 * How crowded is this club already, and would this sponsor breach a cap?
 *
 * Every cap is evaluated, never short-circuited. A sponsor blocked by three
 * rules should be told all three — one at a time is how a marketplace teaches
 * its buyers to retry blindly.
 */
export function fatigueCheck(input: {
  clubId: string;
  sponsor: Pick<SponsorProfile, "id" | "category">;
  at: string;
  policy?: ClubSponsorshipPolicy;
  /** counts the proposed activation against the caps; default true */
  includeProposed?: boolean;
}): FatigueCheck {
  fatigueInit();
  const policy = input.policy ?? clubPolicy(input.clubId);
  const summary = exposureSummary(input.clubId, input.at);
  const proposed = input.includeProposed === false ? 0 : 1;
  const sector = sectorOf(input.sponsor.category);

  const weekObserved = summary.week + proposed;
  const monthObserved = summary.month + proposed;
  const sectorObserved =
    (summary.bySector.find((s) => s.sector === sector)?.count ?? 0) + proposed;
  const sponsorRow = summary.bySponsor.find((s) => s.sponsorId === input.sponsor.id);
  const sponsorObserved = (sponsorRow?.count ?? 0) + proposed;

  const violations: FatigueViolation[] = [];
  if (weekObserved > policy.maxActivationsPerWeek)
    violations.push({
      rule: "max_per_week",
      limit: policy.maxActivationsPerWeek,
      observed: weekObserved,
      reason: `max_per_week: this club allows ${policy.maxActivationsPerWeek} commercial activation${policy.maxActivationsPerWeek === 1 ? "" : "s"} in any 7 days and already has ${summary.week}. This is the club's setting, not a scoring outcome.`,
    });
  if (monthObserved > policy.maxActivationsPerMonth)
    violations.push({
      rule: "max_per_month",
      limit: policy.maxActivationsPerMonth,
      observed: monthObserved,
      reason: `max_per_month: this club allows ${policy.maxActivationsPerMonth} commercial activations per month and already has ${summary.month}.`,
    });
  if (sectorObserved > policy.maxPerSectorPerMonth)
    violations.push({
      rule: "max_per_sector_per_month",
      limit: policy.maxPerSectorPerMonth,
      observed: sectorObserved,
      reason: `max_per_sector_per_month: ${sectorObserved - proposed} sponsor${sectorObserved - proposed === 1 ? " is" : "s are"} already in the "${sector}" sector this month and the club allows ${policy.maxPerSectorPerMonth}. Members hear competing brands in one sector as the same pitch repeated, not as choice.`,
    });
  // Two placements from the same brand inside a month reads as pressure even
  // when the club's overall budget has room.
  if (sponsorObserved > 2)
    violations.push({
      rule: "same_sponsor_repeat",
      limit: 2,
      observed: sponsorObserved,
      reason: `same_sponsor_repeat: ${input.sponsor.id} has already reached this club ${sponsorRow?.count ?? 0} times in 30 days.`,
    });

  const ratios = [
    policy.maxActivationsPerWeek > 0 ? summary.week / policy.maxActivationsPerWeek : 1,
    policy.maxActivationsPerMonth > 0 ? summary.month / policy.maxActivationsPerMonth : 1,
    policy.maxPerSectorPerMonth > 0
      ? (summary.bySector.find((s) => s.sector === sector)?.count ?? 0) /
        policy.maxPerSectorPerMonth
      : 1,
  ];
  const fatigue = Math.max(0, Math.min(1, Math.max(...ratios)));

  return {
    clubId: input.clubId,
    sponsorId: input.sponsor.id,
    at: input.at,
    withinCaps: violations.length === 0,
    violations,
    fatigue,
    summary,
    reading: violations.length
      ? `Blocked by ${violations.map((v) => v.rule).join(", ")}.`
      : `Within caps: ${summary.week} of ${policy.maxActivationsPerWeek} this week, ${summary.month} of ${policy.maxActivationsPerMonth} this month, ${summary.bySector.find((s) => s.sector === sector)?.count ?? 0} of ${policy.maxPerSectorPerMonth} in "${sector}".`,
  };
}

// ======================================================== member-level counts

/**
 * How many sponsor messages one member has seen, where the club permits it.
 *
 * Returns a COUNT and nothing else — no sponsor names, no categories, no
 * timeline. The legitimate use is a per-member cap; a per-member profile is not
 * a legitimate use, and the return type is narrow so that nothing downstream can
 * accidentally build one. Never call this on a sponsor's behalf.
 */
export function memberExposureCount(memberId: string, at: string, days = 30): number {
  fatigueInit();
  const row = db()
    .prepare(
      `SELECT COUNT(*) n FROM campaign_exposures
       WHERE member_id=? AND occurred_at > ? AND occurred_at <= ? AND observed_at <= ?`,
    )
    .get(memberId, daysBefore(at, days), at, at) as { n: number };
  return Number(row?.n ?? 0);
}

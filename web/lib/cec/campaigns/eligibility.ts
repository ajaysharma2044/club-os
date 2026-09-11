// Hard filters. Everything here runs BEFORE any ranking.
//
// WHY A FILTER AND NOT A PENALTY.
//
// The tempting design is one score with negative weights: excluded category
// minus 40, out of geography minus 30, over the frequency cap minus 25. It
// ranks everything, it never errors, and it is wrong in a specific and
// expensive way — a sufficiently valuable sponsor eventually outbids a club's
// stated refusal. A club that wrote "no gambling" would one day receive a
// gambling campaign because the expected value cleared the penalty. Once that
// happens the club's settings are decoration and it will never trust them again.
//
// So a boundary is a boundary. If a filter rejects, the candidate does not
// enter the ranking at any price.
//
// WHY EVERY FILTER RUNS EVEN AFTER ONE HAS REJECTED.
//
// Short-circuiting is cheaper and produces a worse marketplace. A sponsor told
// only "not eligible" retries with random changes; a sponsor told "your category
// is excluded by this club, your budget is below its floor, and its week is
// already full" either fixes what is fixable or stops asking. It also makes the
// system debuggable: when every rejection names its filter, an engineer can tell
// a bug from a boundary without reading the ranker.
//
// This module does not fetch. `checkEligibility` is a pure function of what it
// is handed, so a decision from any past moment can be replayed exactly;
// `eligibilityFor` is the thin wrapper that loads today's state and calls it.

import { club } from "../institutions";
import {
  clubPolicy,
  hasWindowCovering,
  inventoryFor,
  isCommercial,
  RESTRICTED_CATEGORIES,
  type ActivationInventory,
  type ClubSponsorshipPolicy,
  type SponsorProfile,
} from "./inventory";
import { fatigueCheck, type FatigueCheck } from "./fatigue";

/**
 * The filters, named. This list is the contract: every rejection cites exactly
 * one of these, and nothing may reject for a reason that is not on it.
 */
export const ELIGIBILITY_FILTERS = [
  "inventory_exists",
  "campus_eligibility",
  "geography",
  "category_accepted",
  "club_category_exclusion",
  "minimum_value",
  "minimum_audience",
  "available_date",
  "frequency_limit",
  "brand_safety",
  "member_privacy",
] as const;
export type EligibilityFilter = (typeof ELIGIBILITY_FILTERS)[number];

export type EligibilityCheck = {
  filter: EligibilityFilter;
  passed: boolean;
  /** names the filter in plain language; the sponsor-facing string */
  reason: string;
  /** which inventory row this applied to, when it was row-specific */
  inventoryId?: string;
  detail?: Record<string, unknown>;
};

export type SlotEligibility = {
  inventory: ActivationInventory;
  eligible: boolean;
  checks: EligibilityCheck[];
  reasons: EligibilityCheck[];
};

export type EligibilityResult = {
  clubId: string;
  sponsorId: string;
  at: string;
  eligible: boolean;
  /** rejections only, each naming its filter */
  reasons: EligibilityCheck[];
  /** every filter that ran, passes included, for audit */
  checks: EligibilityCheck[];
  /** the slots that survived; ranking sees these and nothing else */
  slots: SlotEligibility[];
  /** the slots that did not, with their own named rejections */
  rejectedSlots: SlotEligibility[];
  reading: string;
};

/**
 * Categories a university generally will not allow promoted on its own campus,
 * regardless of what a club or a sponsor wants.
 *
 * Stated as a default and overridable per call, because this is genuinely an
 * institutional policy question and we do not have the real policy documents
 * for any campus yet. Defaulting to prohibited means the first mistake is a
 * missed deal rather than a vape brand sampling in a residence hall.
 */
export const CAMPUS_PROHIBITED_DEFAULT: string[] = [
  "alcohol",
  "tobacco",
  "vape",
  "gambling",
];

export type EligibilityInput = {
  clubId: string;
  /** institution id; null when the club is not on a configured campus */
  campusId: string | null;
  sponsor: SponsorProfile;
  policy: ClubSponsorshipPolicy;
  inventory: ActivationInventory[];
  at: string;
  /** null means the frequency check was not run, which is itself a rejection */
  fatigue: FatigueCheck | null;
  campusProhibited?: string[];
};

const pass = (
  filter: EligibilityFilter,
  reason: string,
  extra: Partial<EligibilityCheck> = {},
): EligibilityCheck => ({ filter, passed: true, reason, ...extra });

const reject = (
  filter: EligibilityFilter,
  reason: string,
  extra: Partial<EligibilityCheck> = {},
): EligibilityCheck => ({ filter, passed: false, reason: `${filter}: ${reason}`, ...extra });

/**
 * Can this sponsor run anything at this club at this moment?
 *
 * Pure. Every input is supplied, so a 2026 decision can be re-derived in 2028
 * from the state that was live at the time rather than from today's settings.
 */
export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { sponsor, policy } = input;
  const prohibited = input.campusProhibited ?? CAMPUS_PROHIBITED_DEFAULT;
  const checks: EligibilityCheck[] = [];

  // ---------------------------------------------------------- club-level
  const open = input.inventory.filter((r) => r.status === "open");
  checks.push(
    open.length
      ? pass("inventory_exists", `${open.length} open activation slot(s) declared.`)
      : reject(
          "inventory_exists",
          `${input.clubId} has not declared any open inventory. No inventory is not the same as unlimited inventory — a club that has said nothing has not said yes.`,
        ),
  );

  checks.push(
    input.campusId
      ? prohibited.includes(sponsor.category)
        ? reject(
            "campus_eligibility",
            `"${sponsor.category}" is on the campus prohibited list for ${input.campusId}. This is an institutional rule; the club cannot waive it and neither can a bid.`,
            { detail: { campusId: input.campusId } },
          )
        : pass("campus_eligibility", `${input.campusId} permits this category on campus.`)
      : reject(
          "campus_eligibility",
          `${input.clubId} is not attached to a configured campus, so no campus rules can be checked. Configure the institution before selling against it.`,
        ),
  );

  const geoOk =
    sponsor.geographies.includes("national") ||
    (input.campusId ? sponsor.geographies.includes(input.campusId) : false) ||
    sponsor.geographies.includes(input.clubId);
  checks.push(
    geoOk
      ? pass("geography", `Campaign covers ${input.campusId ?? input.clubId}.`)
      : reject(
          "geography",
          `the campaign runs in ${sponsor.geographies.join(", ") || "no declared geography"}, which does not include ${input.campusId ?? input.clubId}.`,
        ),
  );

  const excluded = policy.excludedCategories.includes(sponsor.category);
  checks.push(
    excluded
      ? reject(
          "club_category_exclusion",
          `${input.clubId} excludes "${sponsor.category}". This is the club's own setting and is not scored against; it is a refusal.`,
          { detail: { excludedCategories: policy.excludedCategories } },
        )
      : pass("club_category_exclusion", `"${sponsor.category}" is not excluded by this club.`),
  );

  // Restricted categories need an affirmative acceptance, not merely the
  // absence of an exclusion. Silence is not consent.
  const restricted = RESTRICTED_CATEGORIES.includes(sponsor.category as never);
  const accepted = policy.preferredCategories.includes(sponsor.category);
  checks.push(
    !restricted || accepted
      ? pass("category_accepted", `"${sponsor.category}" needs no explicit opt-in, or the club has given one.`)
      : reject(
          "category_accepted",
          `"${sponsor.category}" is a restricted category and this club has not explicitly accepted it. Restricted categories are default-deny: the cost of wrongly refusing one is a missed deal, and the cost of wrongly allowing one lands on students.`,
        ),
  );

  const floor = policy.minimumSponsorshipValue;
  checks.push(
    sponsor.budget >= floor
      ? pass("minimum_value", `Budget ${sponsor.budget} meets the club's floor of ${floor}.`)
      : reject(
          "minimum_value",
          `budget ${sponsor.budget} is below ${input.clubId}'s stated floor of ${floor}. Below its floor the club would rather not be interrupted at all.`,
        ),
  );

  const safetyOk = sponsor.brandSafety === "verified" || sponsor.brandSafety === "self_attested";
  checks.push(
    safetyOk
      ? pass("brand_safety", `Brand safety "${sponsor.brandSafety}".`)
      : reject(
          "brand_safety",
          sponsor.brandSafety === "flagged"
            ? `${sponsor.name} is flagged. Flagged sponsors do not rank at any budget.`
            : `${sponsor.name} is unrated. Unrated is treated as unsafe rather than neutral — an unverified claim about a brand's own conduct is not evidence.`,
        ),
  );

  // docs/11 §7: no person-level data reaches a sponsor. A campaign that needs
  // it is refused here rather than being run in a degraded form, because a
  // degraded run would still have collected the consent question wrongly.
  const wantsMembers = sponsor.wantsMemberData === true;
  checks.push(
    !wantsMembers
      ? pass("member_privacy", "Campaign needs no member-level data.")
      : policy.memberDataSharing === "opt_in_per_campaign"
        ? pass(
            "member_privacy",
            "Club permits per-campaign member opt-in; members still opt in individually and may decline.",
          )
        : reject(
            "member_privacy",
            `this campaign requires member-level data and ${input.clubId} shares "${policy.memberDataSharing}". Sponsors receive aggregate counts; they never receive members (docs/11 §7).`,
          ),
  );

  checks.push(
    input.fatigue === null
      ? reject(
          "frequency_limit",
          "the frequency check did not run. An unchecked cap is a failed cap, not a passed one.",
        )
      : input.fatigue.withinCaps
        ? pass("frequency_limit", input.fatigue.reading, {
            detail: { fatigue: input.fatigue.fatigue },
          })
        : reject("frequency_limit", input.fatigue.violations.map((v) => v.reason).join(" "), {
            detail: { violations: input.fatigue.violations },
          }),
  );

  const clubReasons = checks.filter((c) => !c.passed);

  // ------------------------------------------------------------ per-slot
  const slots: SlotEligibility[] = [];
  const rejectedSlots: SlotEligibility[] = [];
  for (const row of open) {
    const rowChecks: EligibilityCheck[] = [];
    const on = { inventoryId: row.id };

    rowChecks.push(
      sponsor.activationTypes.includes(row.activationType)
        ? pass("inventory_exists", `Sponsor runs ${row.activationType}.`, on)
        : reject(
            "inventory_exists",
            `the sponsor does not run "${row.activationType}", which is what this slot offers.`,
            on,
          ),
    );

    rowChecks.push(
      row.categoryRestrictions.includes(sponsor.category)
        ? reject(
            "club_category_exclusion",
            `this slot specifically excludes "${sponsor.category}", over and above the club-wide list.`,
            on,
          )
        : pass("club_category_exclusion", "Slot has no category restriction on this sponsor.", on),
    );

    rowChecks.push(
      row.estimatedReach >= sponsor.minimumAudience
        ? pass(
            "minimum_audience",
            `Estimated reach ${row.estimatedReach} meets the sponsor's minimum of ${sponsor.minimumAudience}.`,
            on,
          )
        : reject(
            "minimum_audience",
            `estimated reach ${row.estimatedReach} is below the sponsor's minimum of ${sponsor.minimumAudience}. Estimated reach is used, not capacity: a club cannot be matched on seats it does not fill.`,
            on,
          ),
    );

    rowChecks.push(
      sponsor.budget >= row.minimumBudget
        ? pass("minimum_value", `Budget ${sponsor.budget} meets the slot's floor of ${row.minimumBudget}.`, on)
        : reject(
            "minimum_value",
            `budget ${sponsor.budget} is below this slot's floor of ${row.minimumBudget}.`,
            on,
          ),
    );

    const clubOpen = hasWindowCovering(row, input.at);
    const sponsorOpen = sponsor.windows.some((w) => {
      const s = Date.parse(w.start);
      const e = Date.parse(w.end);
      const t = Date.parse(input.at);
      return Number.isFinite(s) && Number.isFinite(e) && Number.isFinite(t) && t >= s && t <= e;
    });
    rowChecks.push(
      clubOpen && sponsorOpen
        ? pass("available_date", `Both sides are open at ${input.at}.`, on)
        : reject(
            "available_date",
            !clubOpen
              ? `the club has not declared an available window covering ${input.at}. An undeclared window is not an open one.`
              : `the sponsor's campaign windows do not cover ${input.at}.`,
            on,
          ),
    );

    // A non-commercial slot still costs officer time, but it does not spend the
    // club's attention budget, so the frequency cap is only inherited by
    // commercial activations. Everything else club-level is inherited as-is.
    const inherited = clubReasons.filter(
      (c) => c.filter !== "frequency_limit" || isCommercial(row.activationType),
    );

    const all = [...inherited, ...rowChecks];
    const reasons = all.filter((c) => !c.passed);
    const slot: SlotEligibility = {
      inventory: row,
      eligible: reasons.length === 0,
      checks: all,
      reasons,
    };
    (slot.eligible ? slots : rejectedSlots).push(slot);
  }

  const eligible = slots.length > 0;
  return {
    clubId: input.clubId,
    sponsorId: sponsor.id,
    at: input.at,
    eligible,
    reasons: eligible ? [] : dedupe([...clubReasons, ...rejectedSlots.flatMap((s) => s.reasons)]),
    checks,
    slots,
    rejectedSlots,
    reading: eligible
      ? `${slots.length} of ${open.length} declared slot(s) are eligible for ${sponsor.name}.`
      : clubReasons.length
        ? `Not eligible: ${clubReasons.map((c) => c.filter).join(", ")}.`
        : open.length
          ? `Not eligible: every declared slot was rejected (${dedupe(rejectedSlots.flatMap((s) => s.reasons)).map((c) => c.filter).join(", ")}).`
          : "Not eligible: no inventory declared.",
  };
}

function dedupe(checks: EligibilityCheck[]): EligibilityCheck[] {
  const seen = new Set<string>();
  const out: EligibilityCheck[] = [];
  for (const c of checks) {
    const key = `${c.filter}|${c.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Load today's state and run the filters. The convenience wrapper; the pure
 * function above is what a backtest should call.
 */
export function eligibilityFor(
  clubId: string,
  sponsor: SponsorProfile,
  at: string,
  opts: { campusProhibited?: string[]; policy?: ClubSponsorshipPolicy } = {},
): EligibilityResult {
  const identity = club(clubId);
  const policy = opts.policy ?? clubPolicy(clubId);
  return checkEligibility({
    clubId,
    campusId: identity?.institutionId ?? null,
    sponsor,
    policy,
    inventory: inventoryFor(clubId),
    at,
    fatigue: fatigueCheck({ clubId, sponsor, at, policy }),
    campusProhibited: opts.campusProhibited,
  });
}

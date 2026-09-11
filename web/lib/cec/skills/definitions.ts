// The skill vocabulary. A stated, curated list — not an inferred taxonomy.
//
// WHY THIS IS A LIST AND NOT A MODEL:
//
// The obvious alternative is to mine skill names out of task titles and project
// descriptions. That produces a vocabulary nobody wrote down, which drifts every
// time the club's phrasing changes, and which the person it describes cannot
// contest because there is no definition to argue with. "You were tagged
// `growth_hacking` because a clustering step said so" fails the mirror test in
// docs/11 §7: a signal that cannot be shown to the student it is about, in plain
// language, does not get computed.
//
// So the vocabulary is closed and written by hand. Adding a skill is a code
// change with a description attached, reviewable in a diff. The cost is that
// real work outside this list has nowhere to attach, which is the correct
// failure: it shows up as a missing skill rather than as a fabricated one.
//
// The list is scoped to what a student entrepreneurship club actually does.
// It is deliberately NOT a general occupational taxonomy (O*NET, ESCO): a
// twenty-thousand-entry vocabulary over a few hundred episodes guarantees that
// almost every entry is backed by nothing, and a skill backed by nothing is the
// thing this whole module exists to refuse.
//
// Pure module. No database, no clock.

export const SKILL_CATEGORIES = [
  "engineering",
  "product",
  "data",
  "operations",
  "growth",
  "finance",
  "creative",
  "people",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export type SkillDefinition = {
  /** lower_snake_case, stable forever: link rows are keyed on it. */
  id: string;
  /** How it is written for a human — the person, an officer, an employer. */
  canonical_name: string;
  category: SkillCategory;
  /**
   * What counts as this skill, in a sentence someone could argue with. If a
   * reviewer cannot tell from this whether a given episode belongs here, the
   * description is not finished.
   */
  description: string;
};

/**
 * The curated set. Order is presentation order; nothing depends on it.
 */
export const SKILLS: readonly SkillDefinition[] = Object.freeze([
  {
    id: "backend_engineering",
    canonical_name: "Backend engineering",
    category: "engineering",
    description:
      "Building and operating server-side systems: data models, APIs, jobs, storage, and the deployment that keeps them up.",
  },
  {
    id: "frontend_engineering",
    canonical_name: "Frontend engineering",
    category: "engineering",
    description:
      "Building interfaces people use: markup, state, styling, browser behaviour, and the accessibility of the result.",
  },
  {
    id: "data_analysis",
    canonical_name: "Data analysis",
    category: "data",
    description:
      "Turning a real dataset into a defensible answer: cleaning, aggregating, checking, and stating what the numbers do and do not support.",
  },
  {
    id: "product_management",
    canonical_name: "Product management",
    category: "product",
    description:
      "Deciding what gets built and why: scoping, sequencing, cutting, and carrying a decision through to a shipped thing.",
  },
  {
    id: "project_management",
    canonical_name: "Project management",
    category: "operations",
    description:
      "Running work to a date: breaking it down, assigning it, tracking it, unblocking it, and closing it out.",
  },
  {
    id: "operations",
    canonical_name: "Operations",
    category: "operations",
    description:
      "Making the recurring machinery work: process, logistics, vendors, access, handoffs, and the records that survive a graduation.",
  },
  {
    id: "event_production",
    canonical_name: "Event production",
    category: "operations",
    description:
      "Producing a live event end to end: venue, run of show, staffing, day-of execution, and what actually happened on the night.",
  },
  {
    id: "fundraising",
    canonical_name: "Fundraising",
    category: "finance",
    description:
      "Raising money for a venture or an organisation: pipeline, narrative, diligence materials, and closed commitments.",
  },
  {
    id: "sponsorship_sales",
    canonical_name: "Sponsorship sales",
    category: "growth",
    description:
      "Sourcing and closing sponsors: outbound, pitch, negotiation, contract, and delivery against what was promised.",
  },
  {
    id: "financial_modeling",
    canonical_name: "Financial modeling",
    category: "finance",
    description:
      "Building a model that forecasts something: stated assumptions, working arithmetic, sensitivity, and a result someone acted on.",
  },
  {
    id: "budgeting",
    canonical_name: "Budgeting",
    category: "finance",
    description:
      "Planning and holding a real budget: allocation, approvals, reconciliation, and the variance between plan and outturn.",
  },
  {
    id: "marketing",
    canonical_name: "Marketing",
    category: "growth",
    description:
      "Getting the right people to show up: channel choice, campaign execution, and measured turnout or signups against a target.",
  },
  {
    id: "content",
    canonical_name: "Content",
    category: "creative",
    description:
      "Producing written, video, or social material on a cadence, for a named audience, with the output itself as the artifact.",
  },
  {
    id: "design",
    canonical_name: "Design",
    category: "creative",
    description:
      "Visual and interaction design: brand, layout, deck and interface work, and the revisions that got it to shipped.",
  },
  {
    id: "community_building",
    canonical_name: "Community building",
    category: "people",
    description:
      "Growing and holding a group of people together: onboarding, rituals, moderation, and retention across terms.",
  },
  {
    id: "recruiting",
    canonical_name: "Recruiting",
    category: "people",
    description:
      "Running a selection process: sourcing, screening, interviewing, calibrating, and the offers and onboarding that followed.",
  },
  {
    id: "public_speaking",
    canonical_name: "Public speaking",
    category: "people",
    description:
      "Presenting to a room or a panel: pitches, demos, workshops, and moderated sessions, with a recording or an audience on record.",
  },
  {
    id: "partnerships",
    canonical_name: "Partnerships",
    category: "growth",
    description:
      "Building working relationships with outside organisations: outreach, agreement, and the collaboration that actually ran.",
  },
]);

const BY_ID: ReadonlyMap<string, SkillDefinition> = new Map(
  SKILLS.map((s) => [s.id, s]),
);

export const SKILL_IDS: readonly string[] = Object.freeze(SKILLS.map((s) => s.id));

/** The definition, or null. Callers that need a hard failure use `requireSkill`. */
export function skill(id: string): SkillDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function isSkill(id: string): boolean {
  return BY_ID.has(id);
}

export function skillsInCategory(category: SkillCategory): SkillDefinition[] {
  return SKILLS.filter((s) => s.category === category);
}

/**
 * The display name, or the raw id if someone stored a skill that is no longer
 * defined. Never invents a name: an unknown id is shown as the id so the gap is
 * visible rather than papered over.
 */
export function skillName(id: string): string {
  return BY_ID.get(id)?.canonical_name ?? id;
}

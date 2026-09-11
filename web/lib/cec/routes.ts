// CEC is the only organization backed by the current API. Never derive an API tenant from a demo slug.
export const CEC_SLUG = "cec";
export const cecClub = {
  slug: CEC_SLUG,
  name: "Cornell Entrepreneurship Club",
  short: "CEC",
  hue: "ember" as const,
  role: "Club workspace",
  members: 0,
  category: "Entrepreneurship",
};
export const cecRoutes: Record<string, string> = {
  home: "/clubs/cec",
  events: "/clubs/cec/events",
  work: "/clubs/cec/workspace",
  people: "/clubs/cec/people",
  crm: "/clubs/cec/money",
  account: "/clubs/cec/settings",
  record: "/clubs/cec/record",
  intake: "/clubs/cec/intake",
  schedule: "/clubs/cec/schedule",
  directory: "/clubs/cec/directory",
  interviews: "/clubs/cec/interviews",
  signals: "/clubs/cec/signals",
};

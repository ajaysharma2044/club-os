export type ClubHue =
  | "ember"
  | "clay"
  | "amber"
  | "moss"
  | "spruce"
  | "teal"
  | "cobalt"
  | "iris"
  | "plum"
  | "rose"
  | "slate"
  | "sand";

export type Club = {
  slug: string;
  name: string;
  short: string;
  hue: ClubHue;
  role: string;
  members: number;
  category: string;
};

export const me = {
  name: "Maya Okonkwo",
  initials: "MO",
  year: "Junior",
  campus: "Northfield University",
};

export const clubs: Club[] = [
  {
    slug: "baja",
    name: "Baja Racing",
    short: "Baja",
    hue: "spruce",
    role: "Treasurer",
    members: 48,
    category: "Competition",
  },
  {
    slug: "consulting",
    name: "Northfield Consulting",
    short: "Consulting",
    hue: "cobalt",
    role: "Case team",
    members: 62,
    category: "Professional",
  },
  {
    slug: "hacknight",
    name: "Hack Night",
    short: "Hack Night",
    hue: "ember",
    role: "Member",
    members: 210,
    category: "Hackathon",
  },
  {
    slug: "herald",
    name: "The Daily Herald",
    short: "Herald",
    hue: "slate",
    role: "Contributor",
    members: 34,
    category: "Newspaper",
  },
];

export const needs = [
  {
    club: "baja",
    title: "Second signature on Dev’s catering receipt",
    detail: "$412.88 · Fall Kickoff · filed 3 days ago",
    href: "/clubs/baja/money",
  },
  {
    club: "consulting",
    title: "14 applications sitting in Review",
    detail: "Cycle closes Friday 5pm",
    href: "/clubs/consulting/workspace",
  },
  {
    club: "hacknight",
    title: "Saturday room still unconfirmed",
    detail: "WALC 1132 · 9am–9pm",
    href: "/clubs/hacknight/events",
  },
];

export const week = [
  {
    club: "baja",
    title: "Shop hours",
    when: "Tonight 7:00",
    where: "ABE Bay 2",
    going: "31 going",
  },
  {
    club: "consulting",
    title: "First-round interviews",
    when: "Thu 6:00",
    where: "Krannert 204",
    going: "8 slots left",
  },
  {
    club: "herald",
    title: "Print deadline, Monday issue",
    when: "Fri 11:00",
    where: "Newsroom",
    going: "copy locked",
  },
  {
    club: "hacknight",
    title: "Fall Hack",
    when: "Sat 9:00",
    where: "WALC 1132",
    going: "186 RSVP",
  },
  {
    club: "baja",
    title: "Sponsor dinner, Caterpillar",
    when: "Sat 6:30",
    where: "Nine Irish",
    going: "eboard only",
  },
];

export const tasks = [
  { club: "baja", title: "Upload shop insurance cert", due: "Tomorrow", origin: "meeting Sep 8" },
  { club: "baja", title: "Cut carbon-fiber order to 4 sheets", due: "Fri", origin: "meeting Sep 8" },
  { club: "consulting", title: "Score 3 remaining first-rounds", due: "Thu", origin: "recruiting" },
];

export type Person = {
  name: string;
  initials: string;
  role: string;
  year: string;
  dues: "paid" | "owed" | "n/a";
  last: string;
  status: "active" | "alumni";
};

export const roster: Record<string, Person[]> = {
  baja: [
    { name: "Dev Shah", initials: "DS", role: "President", year: "Senior", dues: "paid", last: "Shop · last night", status: "active" },
    { name: "Maya Okonkwo", initials: "MO", role: "Treasurer", year: "Junior", dues: "paid", last: "Ledger · 2h ago", status: "active" },
    { name: "Priya Raman", initials: "PR", role: "Chief engineer", year: "Senior", dues: "paid", last: "Shop · last night", status: "active" },
    { name: "Jonah Hale", initials: "JH", role: "Composites", year: "Sophomore", dues: "owed", last: "Shop · Sep 8", status: "active" },
    { name: "Aisha Grant", initials: "AG", role: "Driver", year: "Junior", dues: "paid", last: "Shop · last night", status: "active" },
    { name: "Chris Nguyen", initials: "CN", role: "Electrical", year: "Sophomore", dues: "paid", last: "Never", status: "active" },
    { name: "Elena Voss", initials: "EV", role: "Sponsorship", year: "Junior", dues: "paid", last: "Dinner brief · today", status: "active" },
    { name: "Marcus Bell", initials: "MB", role: "Member", year: "Freshman", dues: "owed", last: "Kickoff · Sep 2", status: "active" },
    { name: "J. Ruiz", initials: "JR", role: "Treasurer, 2025", year: "Alum", dues: "n/a", last: "Handoff · Mar 14", status: "alumni" },
  ],
  consulting: [
    { name: "Sasha Patel", initials: "SP", role: "President", year: "Senior", dues: "paid", last: "Case night · Tue", status: "active" },
    { name: "Maya Okonkwo", initials: "MO", role: "Case team B", year: "Junior", dues: "paid", last: "Interview desk · today", status: "active" },
    { name: "Theo Park", initials: "TP", role: "VP Recruiting", year: "Junior", dues: "paid", last: "Rubric · 1h ago", status: "active" },
  ],
  hacknight: [
    { name: "Riley Chen", initials: "RC", role: "Director", year: "Senior", dues: "n/a", last: "Venue thread · today", status: "active" },
    { name: "Maya Okonkwo", initials: "MO", role: "Volunteer", year: "Junior", dues: "n/a", last: "RSVP · Sat", status: "active" },
  ],
  herald: [
    { name: "Noah Kim", initials: "NK", role: "Editor", year: "Senior", dues: "n/a", last: "Slug list · 40m ago", status: "active" },
    { name: "Maya Okonkwo", initials: "MO", role: "Contributor", year: "Junior", dues: "n/a", last: "Draft · Mon", status: "active" },
  ],
};

export type LedgerRow = {
  date: string;
  payee: string;
  line: string;
  amount: number;
  status: "posted" | "pending" | "owed";
  id: string;
};

export const ledger: LedgerRow[] = [
  { date: "Sep 5", payee: "Dev Shah", line: "Events / Food", amount: -412.88, status: "pending", id: "LE-1842" },
  { date: "Sep 2", payee: "McMaster-Carr", line: "Build / Fasteners", amount: -186.4, status: "posted", id: "LE-1839" },
  { date: "Sep 1", payee: "Member dues · 41 paid", line: "Income / Dues", amount: 1640, status: "posted", id: "LE-1831" },
  { date: "Aug 28", payee: "SGA allocation, fall", line: "Income / SGA", amount: 2246, status: "posted", id: "LE-1822" },
  { date: "Aug 22", payee: "Onyx Composites", line: "Build / Carbon", amount: -890, status: "posted", id: "LE-1814" },
  { date: "Aug 18", payee: "Maya Okonkwo", line: "Travel / Fuel", amount: -42, status: "owed", id: "LE-1809" },
];

export const events = {
  baja: [
    { title: "Shop hours", when: "Thu Sep 10 · 7:00–10:00", where: "ABE Bay 2", rsvp: 31, cap: 48, checkin: 0, budget: "Events / Food $0" },
    { title: "Sponsor dinner, Caterpillar", when: "Sat Sep 12 · 6:30", where: "Nine Irish", rsvp: 8, cap: 8, checkin: 0, budget: "Fundraising $180" },
    { title: "Fall Kickoff", when: "Tue Sep 2 · 6:00", where: "ARMS B071", rsvp: 52, cap: 80, checkin: 41, budget: "Events / Food $412.88" },
  ],
  consulting: [
    { title: "First-round interviews", when: "Thu Sep 10 · 6:00–9:00", where: "Krannert 204", rsvp: 16, cap: 24, checkin: 0, budget: "Recruiting $0" },
    { title: "Case night", when: "Tue Sep 8 · 8:00", where: "RAWL 1086", rsvp: 28, cap: 40, checkin: 22, budget: "Events $64.00" },
  ],
  hacknight: [
    { title: "Fall Hack", when: "Sat Sep 12 · 9:00–21:00", where: "WALC 1132", rsvp: 186, cap: 220, checkin: 0, budget: "Logistics $1,140" },
  ],
  herald: [
    { title: "Print deadline", when: "Fri Sep 11 · 11:00", where: "Newsroom", rsvp: 12, cap: 12, checkin: 0, budget: "Print $310" },
  ],
};

export const minutes = `Shop ran late. Priya walked the suspension bind on the right rear. Dev moved to cut the carbon order from six sheets to four — vote 5–1, Maya recorded the line change. Insurance certificate is still sitting in last year’s Drive, which we cannot transfer. Jonah takes the upload. Next shop Thursday.`;

export function clubBySlug(slug: string) {
  return clubs.find((c) => c.slug === slug);
}

export function hueVar(hue: ClubHue) {
  return `var(--club-${hue})`;
}

export function tintVar(hue: ClubHue) {
  return `var(--club-${hue})`;
}

export function money(n: number) {
  const abs = Math.abs(n).toFixed(2);
  return n < 0 ? `−${abs}` : abs;
}

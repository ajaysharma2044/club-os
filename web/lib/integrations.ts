export type IntegStatus = "connected" | "action" | "off" | "mirror";

export type IntegrationId =
  | "stripe"
  | "drive"
  | "email"
  | "groupme"
  | "bank"
  | "calendar"
  | "mirrors";

export type ClubIntegration = {
  id: IntegrationId;
  name: string;
  writes: string;
  detail: string;
  status: IntegStatus;
  lastSync: string | null;
  office: string | null;
  actionLabel: string;
};

export type PersonalConnection = {
  id: "campus-email" | "phone";
  name: string;
  value: string;
  writes: string;
  status: "connected" | "off";
};

const offices: Record<string, { money: string; files: string; comms: string }> = {
  baja: { money: "Treasurer", files: "President", comms: "President" },
  consulting: { money: "President", files: "President", comms: "VP Recruiting" },
  hacknight: { money: "Director", files: "Director", comms: "Director" },
  herald: { money: "Editor", files: "Editor", comms: "Editor" },
};

function officeFor(slug: string) {
  return offices[slug] ?? { money: "President", files: "President", comms: "President" };
}

export function integrationsFor(slug: string): ClubIntegration[] {
  const office = officeFor(slug);

  const byClub: Record<string, Partial<Record<IntegrationId, Partial<ClubIntegration>>>> = {
    baja: {
      stripe: {
        status: "action",
        lastSync: "2h ago",
        office: office.money,
        actionLabel: "Review",
        detail:
          "Connected as Baja Racing, EIN 38-2941876. Agent-of-payee is on file. President still owes the second signer. We never custody funds; payouts go to the club.",
      },
      drive: {
        status: "action",
        lastSync: "never finished",
        office: office.files,
        actionLabel: "Review",
        detail:
          "Last year’s Drive still holds the shop insurance cert. Transferring a folder does not transfer the files inside it. Import into the club vault before the .edu is deleted.",
      },
      email: {
        status: "connected",
        lastSync: "this morning",
        office: office.comms,
      },
      groupme: {
        status: "action",
        lastSync: null,
        office: null,
        actionLabel: "Import",
        detail:
          "48 numbers on the 2025 thread. SMS mode is dying mid-semester. Import the roster into People. Inbox is the chat; GroupMe is not.",
      },
      bank: {
        status: "off",
        lastSync: null,
        office: null,
      },
      calendar: {
        status: "connected",
        lastSync: "40m ago",
        office: office.comms,
        detail:
          "Public ICS and embed are live. Members subscribe from Account for shop hours, assigned tasks, the catering signature, and e-board. We write only to a calendar we created.",
      },
      mirrors: {
        status: "mirror",
        lastSync: "yesterday",
        office: office.comms,
        actionLabel: "Keep as mirror",
      },
    },
    consulting: {
      stripe: { status: "off", lastSync: null, office: null },
      drive: { status: "off", lastSync: null, office: null },
      email: { status: "connected", lastSync: "today", office: office.comms },
      groupme: {
        status: "connected",
        lastSync: "Aug 22",
        office: office.comms,
        detail:
          "62 numbers imported from the recruiting thread. Inbox holds the conversation now. GroupMe is archive only.",
      },
      bank: { status: "off", lastSync: null, office: null },
      calendar: {
        status: "connected",
        lastSync: "3h ago",
        office: office.comms,
        detail:
          "Events-only. Public ICS is on; embed is off. Interviews land on a member’s personal feed if they RSVP’d. Work and money stay off the public calendar.",
      },
      mirrors: { status: "off", lastSync: null, office: null, actionLabel: "Enable fan-out" },
    },
    hacknight: {
      stripe: {
        status: "connected",
        lastSync: "12m ago",
        office: office.money,
        detail:
          "Connected as Hack Night, EIN 84-1102291. Agent-of-payee on file. Ticket payouts settle to the club, not a student.",
      },
      drive: {
        status: "connected",
        lastSync: "Fri",
        office: office.files,
        detail: "Sponsor decks and venue riders live in the club vault. The old Drive folder is closed.",
      },
      email: { status: "connected", lastSync: "today", office: office.comms },
      groupme: { status: "off", lastSync: null, office: null },
      bank: {
        status: "action",
        lastSync: null,
        office: office.money,
        actionLabel: "Review",
        detail:
          "Stripe is live. The club still needs a payout destination on the EIN. Not a sponsor account.",
      },
      calendar: {
        status: "action",
        lastSync: null,
        office: null,
        actionLabel: "Connect",
        detail:
          "Fall Hack is ready to publish. Public ICS and embed can go live without a campus Workspace admin. Free/busy is optional and titles never leave.",
      },
      mirrors: {
        status: "mirror",
        lastSync: "Sat",
        office: office.comms,
        actionLabel: "Keep as mirror",
        detail:
          "Discord gets the announcement. RSVP, check-in, and spend stay here. Discord is not the record.",
      },
    },
    herald: {
      stripe: { status: "off", lastSync: null, office: null },
      drive: {
        status: "connected",
        lastSync: "Mon",
        office: office.files,
        detail: "Print PDFs and the rate card live in the club vault. Graduating editors keep a copy, not the original.",
      },
      email: { status: "connected", lastSync: "1h ago", office: office.comms },
      groupme: { status: "off", lastSync: null, office: null },
      bank: { status: "off", lastSync: null, office: null },
      calendar: {
        status: "off",
        lastSync: null,
        office: null,
        detail:
          "Off. Contributors can still add a single deadline to their phone from Events, or subscribe to their own work from Account. A public Herald calendar would be title, time, and place only.",
      },
      mirrors: { status: "off", lastSync: null, office: null, actionLabel: "Enable fan-out" },
    },
  };

  const patch = byClub[slug] ?? {};

  const catalog: ClubIntegration[] = [
    {
      id: "stripe",
      name: "Stripe Connect Express",
      writes: "Dues, tickets, and payouts into the club ledger. The EIN stays on the club, not a student SSN.",
      detail:
        "Each club is its own connected account. We are agent-of-payee only. We do not build a fiscal sponsor and we do not hold the money.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Connect",
    },
    {
      id: "drive",
      name: "Club vault · Drive import",
      writes: "Files into club-owned storage. A graduating .edu cannot take them.",
      detail:
        "Google puts a leaving student’s files on a 20-day fuse. The vault is the club’s from the first byte. Import is a one-way move, not a live Drive sync.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Connect",
    },
    {
      id: "email",
      name: "Campus email",
      writes: "Roster invites and officer mail. Sourced from membership, not a university admin console.",
      detail:
        "This is the club talking to its people. It is not a campus IT product and it does not read a university SIS.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Connect",
    },
    {
      id: "groupme",
      name: "GroupMe · SMS history",
      writes: "Phone numbers and invite history into People. Not a live chat.",
      detail:
        "SMS mode is the reason GroupMe won campus, and it is going away mid-semester. Import the numbers. Inbox is the conversation now.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Connect",
    },
    {
      id: "bank",
      name: "Payout account",
      writes: "Where Stripe sends the club’s money. Club-owned destination, never our balance.",
      detail:
        "Plaid-style link for payouts only. The club remains the legal recipient. This is not a sponsor and not a student Venmo.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Connect",
    },
    {
      id: "calendar",
      name: "Club calendar",
      writes:
        "A projection of the record: public ICS, embed widget, and a path for members to subscribe. The event stays club-owned.",
      detail:
        "Calendars are copies. Club OS keeps who RSVP’d, who came, and what it cost. Public embed is title, time, and place — never roster or money. Members subscribe from Account.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Connect",
    },
    {
      id: "mirrors",
      name: "Announcement mirrors",
      writes: "Fan-out to Discord or email. Decisions, attendance, and money stay here.",
      detail:
        "Slack, Discord, and Notion are not the system of record. A mirror can shout. It cannot keep who decided, who came, or what it cost.",
      status: "off",
      lastSync: null,
      office: null,
      actionLabel: "Enable fan-out",
    },
  ];

  return catalog.map((item) => {
    const next = { ...item, ...patch[item.id] };
    if (next.status === "off") {
      next.actionLabel = item.id === "mirrors" ? "Enable fan-out" : "Connect";
    } else if (next.status === "action" && !patch[item.id]?.actionLabel) {
      next.actionLabel = "Review";
    } else if (next.status === "mirror") {
      next.actionLabel = "Keep as mirror";
    } else if (next.status === "connected") {
      next.actionLabel = "Review";
    }
    return next;
  });
}

export const personalConnections: PersonalConnection[] = [
  {
    id: "campus-email",
    name: "Campus email",
    value: "maya@northfield.edu",
    writes: "Identity on your person record. Survives graduation. Clubs may write mail to this address; they do not own it.",
    status: "connected",
  },
  {
    id: "phone",
    name: "Phone",
    value: "SMS join links · ending 4412",
    writes: "Used when a club imports GroupMe numbers. Never sold. Revocable from your record.",
    status: "connected",
  },
];

export function statusLabel(status: IntegStatus | PersonalConnection["status"]) {
  if (status === "connected") return "Connected";
  if (status === "action") return "Action needed";
  if (status === "mirror") return "Do not replace the record";
  return "Off";
}

export function statusBadge(status: IntegStatus | PersonalConnection["status"]) {
  if (status === "connected") return "badge ok";
  if (status === "action") return "badge warn";
  if (status === "mirror") return "badge";
  return "badge";
}

export function authorizingOffice(item: ClubIntegration) {
  if (item.status === "off") return null;
  return item.office;
}

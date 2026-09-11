import { clubs, hueVar, type ClubHue } from "@/lib/data";

export type CardKind = "rsvp" | "pay" | "task" | "decision";

export type ChatCard = {
  kind: CardKind;
  title: string;
  detail: string;
  href?: string;
  action?: string;
};

export type ChatMessage = {
  id: string;
  who: string;
  initials: string;
  time: string;
  text: string;
  card?: ChatCard;
  mine?: boolean;
};

export type Topic = {
  id: string;
  name: string;
  open: boolean;
};

export type Channel = {
  id: string;
  club: string;
  name: string;
  kind: "channel" | "dm";
  unread: number;
  fromRoster: string;
  topics: Topic[];
  messages: Record<string, ChatMessage[]>;
};

export const channels: Channel[] = [
  {
    id: "baja-announcements",
    club: "baja",
    name: "announcements",
    kind: "channel",
    unread: 1,
    fromRoster: "Officers can post. Everyone can read.",
    topics: [{ id: "kickoff", name: "Fall Kickoff", open: true }],
    messages: {
      kickoff: [
        {
          id: "a1",
          who: "Dev Shah",
          initials: "DS",
          time: "Mon 6:02",
          text: "Kickoff is Tuesday 6pm in ARMS B071. If you are on a build team, be there.",
        },
      ],
    },
  },
  {
    id: "baja-general",
    club: "baja",
    name: "general",
    kind: "channel",
    unread: 0,
    fromRoster: "All 48 members. Rotates when the roster does.",
    topics: [{ id: "welcome", name: "This week", open: true }],
    messages: {
      welcome: [
        {
          id: "g1",
          who: "Aisha Grant",
          initials: "AG",
          time: "Tue 8:14",
          text: "Who has the bay key after 10? I can lock up Thursday.",
        },
        {
          id: "g2",
          who: "Priya Raman",
          initials: "PR",
          time: "Tue 8:21",
          text: "I have it. Leave the stands down if you finish after I leave.",
        },
      ],
    },
  },
  {
    id: "baja-eboard",
    club: "baja",
    name: "eboard",
    kind: "channel",
    unread: 2,
    fromRoster: "President, treasurer, chief engineer. History stays with the office.",
    topics: [
      { id: "insurance", name: "Insurance cert", open: true },
      { id: "dinner", name: "Sponsor dinner", open: true },
    ],
    messages: {
      insurance: [
        {
          id: "e1",
          who: "Dev Shah",
          initials: "DS",
          time: "9:42",
          text: "Insurance cert is still in last year’s Drive. We cannot move the files.",
        },
        {
          id: "e2",
          who: "Maya Okonkwo",
          initials: "MO",
          time: "9:44",
          text: "Put it in the club vault. I will attach it to the SGA packet.",
          mine: true,
        },
        {
          id: "e3",
          who: "Dev Shah",
          initials: "DS",
          time: "9:46",
          text: "Done. Need your second signature on the catering receipt too.",
          card: {
            kind: "pay",
            title: "Catering, Fall Kickoff",
            detail: "$412.88 · waiting on Maya",
            href: "/clubs/baja/money",
            action: "Open ledger",
          },
        },
      ],
      dinner: [
        {
          id: "d1",
          who: "Elena Voss",
          initials: "EV",
          time: "Yesterday",
          text: "Caterpillar confirmed Saturday 6:30 at Nine Irish. E-board only.",
          card: {
            kind: "rsvp",
            title: "Sponsor dinner, Caterpillar",
            detail: "Sat 6:30 · Nine Irish · 8 seats",
            href: "/clubs/baja/events",
            action: "RSVP",
          },
        },
      ],
    },
  },
  {
    id: "baja-shop",
    club: "baja",
    name: "shop",
    kind: "channel",
    unread: 1,
    fromRoster: "Build, electrical, composites.",
    topics: [
      { id: "bind", name: "Thursday bind", open: true },
      { id: "carbon", name: "Carbon order", open: true },
    ],
    messages: {
      bind: [
        {
          id: "s1",
          who: "Priya Raman",
          initials: "PR",
          time: "18:11",
          text: "Right rear is binding at full bump. Do not take it off the stands tonight.",
        },
        {
          id: "s2",
          who: "Jonah Hale",
          initials: "JH",
          time: "18:19",
          text: "I can stay and measure. Need a second person for the scale.",
        },
      ],
      carbon: [
        {
          id: "c1",
          who: "Dev Shah",
          initials: "DS",
          time: "Sep 8",
          text: "Vote was 5–1. Cut the order from six sheets to four.",
          card: {
            kind: "decision",
            title: "Decision recorded",
            detail: "Carbon order cut to 4 sheets · meeting Sep 8",
            href: "/clubs/baja",
            action: "Open minutes",
          },
        },
        {
          id: "c2",
          who: "Maya Okonkwo",
          initials: "MO",
          time: "Sep 8",
          text: "Line change is in the ledger. Jonah uploads the insurance cert.",
          mine: true,
          card: {
            kind: "task",
            title: "Upload shop insurance cert",
            detail: "Assigned to Jonah Hale · due tomorrow",
            href: "/clubs/baja/workspace",
            action: "Open task",
          },
        },
      ],
    },
  },
  {
    id: "consulting-recruiting",
    club: "consulting",
    name: "recruiting",
    kind: "channel",
    unread: 3,
    fromRoster: "VP Recruiting and case-team leads.",
    topics: [{ id: "review", name: "First-round review", open: true }],
    messages: {
      review: [
        {
          id: "r1",
          who: "Theo Park",
          initials: "TP",
          time: "1h ago",
          text: "14 applications still in Review. Cycle closes Friday 5pm. Score yours tonight.",
          card: {
            kind: "task",
            title: "Score remaining first-rounds",
            detail: "14 in Review · due Thu",
            href: "/clubs/consulting/workspace",
            action: "Open pipeline",
          },
        },
      ],
    },
  },
  {
    id: "hack-fall",
    club: "hacknight",
    name: "fall-hack",
    kind: "channel",
    unread: 1,
    fromRoster: "Organizing + logistics.",
    topics: [{ id: "room", name: "Saturday room", open: true }],
    messages: {
      room: [
        {
          id: "h1",
          who: "Riley Chen",
          initials: "RC",
          time: "Today",
          text: "WALC 1132 is still unconfirmed. If you know the building manager, ping me.",
          card: {
            kind: "rsvp",
            title: "Fall Hack",
            detail: "Sat 9:00–21:00 · WALC 1132 · 186 RSVP",
            href: "/clubs/hacknight/events",
            action: "Open event",
          },
        },
      ],
    },
  },
  {
    id: "herald-newsroom",
    club: "herald",
    name: "newsroom",
    kind: "channel",
    unread: 0,
    fromRoster: "Editorial and writers.",
    topics: [{ id: "monday", name: "Monday issue", open: true }],
    messages: {
      monday: [
        {
          id: "n1",
          who: "Noah Kim",
          initials: "NK",
          time: "40m",
          text: "Print deadline Friday 11. Photographers still open. No portfolio this cycle.",
        },
      ],
    },
  },
  {
    id: "dm-dev",
    club: "baja",
    name: "Dev Shah",
    kind: "dm",
    unread: 0,
    fromRoster: "Direct message.",
    topics: [{ id: "dm", name: "Message", open: true }],
    messages: {
      dm: [
        {
          id: "m1",
          who: "Dev Shah",
          initials: "DS",
          time: "Sun",
          text: "Can you bring the receipt printout to shop hours? Advisor asked.",
        },
      ],
    },
  },
];

export function resolveChannelId(raw: string | null) {
  if (raw && channels.some((c) => c.id === raw)) return raw;
  if (raw) {
    const inClub = channels
      .filter((c) => c.club === raw)
      .sort((a, b) => b.unread - a.unread);
    if (inClub[0]) return inClub[0].id;
  }
  return "baja-eboard";
}

export function inboxUnread() {
  return channels.reduce((n, c) => n + c.unread, 0);
}

const CHANNEL_LABELS: Record<string, string> = {
  announcements: "Announcements",
  general: "Everyone",
  eboard: "E-board",
  shop: "Shop",
  recruiting: "Recruiting",
  "fall-hack": "Planning",
  newsroom: "Newsroom",
};

export function channelLabel(channel: Channel) {
  if (channel.kind === "dm") return channel.name;
  return CHANNEL_LABELS[channel.name] ?? channel.name.replace(/-/g, " ");
}

export function groupTitle(channel: Channel) {
  if (channel.kind === "dm") return channel.name;
  const club = clubs.find((c) => c.slug === channel.club);
  return `${club?.short ?? channel.club} ${channelLabel(channel)}`;
}

export function groupInitials(channel: Channel) {
  if (channel.kind === "dm") {
    const parts = channel.name.split(/\s+/);
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  const club = clubs.find((c) => c.slug === channel.club);
  const short = club?.short ?? channel.club;
  const bits = short.split(/\s+/);
  if (bits.length > 1) return `${bits[0][0]}${bits[1][0]}`.toUpperCase();
  return short.slice(0, 2).toUpperCase();
}

export function lastMessage(channel: Channel, topicId?: string): ChatMessage | undefined {
  const id = topicId ?? channel.topics[0]?.id;
  if (!id) return undefined;
  const list = channel.messages[id] ?? [];
  return list[list.length - 1];
}

export function previewText(message?: ChatMessage) {
  if (!message) return "Nothing yet";
  if (message.card) return message.card.title;
  return message.text;
}

export function channelClub(channel: Channel) {
  return clubs.find((c) => c.slug === channel.club);
}

export function clubHue(slug: string): ClubHue {
  return clubs.find((c) => c.slug === slug)?.hue ?? "cobalt";
}

export function clubColor(slug: string) {
  return hueVar(clubHue(slug));
}

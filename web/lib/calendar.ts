/**
 * Calendar projections of the Club OS record.
 *
 * Source of truth is Event / Assignment / Commitment on the record.
 * A phone calendar is a copy. It is not the record.
 *
 * Real Convex path (do not build in this slice):
 * - Tables: Event, Assignment, Commitment, plus Attendance and Position.
 * - Each person gets a feed token; rotate/revoke writes a new token and
 *   invalidates the old URL. Token is person-owned, not club-owned.
 * - ICS is generated on a public-but-unlisted URL. Anyone with the link
 *   can read that person's work, so treat it like a password.
 * - Optional Google Calendar OAuth is as the student, never a university
 *   Workspace admin. Subscribe-first is v1 because it needs no Google
 *   cloud project.
 * - Reschedules: same UID, bump SEQUENCE, set LAST-MODIFIED. The phone
 *   moves the block. Do not emit a second event.
 * - Quiet hours and push live in chat. Calendar is time, not spam.
 */

import { clubBySlug, clubs, type Club } from "@/lib/data";

export type WorkKind = "event" | "task" | "money" | "meeting";

export type CalendarScope = "events" | "work";

export type ClubCalendarState = {
  slug: string;
  scope: CalendarScope;
  publicOn: boolean;
  embedOn: boolean;
  lastIssued: string;
  membersCanSubscribe: boolean;
};

export type CalendarWork = {
  id: string;
  uid: string;
  club: string;
  kind: WorkKind;
  title: string;
  location: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  sequence: number;
  lastModified: Date;
  why: string;
  public: boolean;
};

export type WorkFilter = Record<WorkKind, boolean>;

export const workKindLabel: Record<WorkKind, string> = {
  event: "Events you RSVP’d",
  task: "Tasks assigned to you",
  money: "Money you must sign",
  meeting: "Meetings for offices you hold",
};

export const defaultWorkFilter: WorkFilter = {
  event: true,
  task: true,
  money: true,
  meeting: true,
};

const FEED_HOST = "feeds.clubos.app";
const PERSON_SLUG = "maya";

function at(y: number, m: number, d: number, hh: number, mm: number) {
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

function uidFor(id: string) {
  return `${id}@clubos.app`;
}

const issued = at(2026, 9, 3, 9, 12);

export const personalWork: CalendarWork[] = [
  {
    id: "baja-shop",
    uid: uidFor("baja-shop-2026-09-10"),
    club: "baja",
    kind: "event",
    title: "Shop hours",
    location: "ABE Bay 2",
    start: at(2026, 9, 10, 19, 0),
    end: at(2026, 9, 10, 22, 0),
    sequence: 1,
    lastModified: at(2026, 9, 8, 21, 4),
    why: "You RSVP’d",
    public: true,
  },
  {
    id: "baja-dinner",
    uid: uidFor("baja-dinner-2026-09-12"),
    club: "baja",
    kind: "event",
    title: "Sponsor dinner, Caterpillar",
    location: "Nine Irish",
    start: at(2026, 9, 12, 18, 30),
    end: at(2026, 9, 12, 21, 0),
    sequence: 0,
    lastModified: at(2026, 9, 7, 16, 10),
    why: "You RSVP’d · office you hold",
    public: true,
  },
  {
    id: "baja-kickoff",
    uid: uidFor("baja-kickoff-2026-09-02"),
    club: "baja",
    kind: "event",
    title: "Fall Kickoff",
    location: "ARMS B071",
    start: at(2026, 9, 2, 18, 0),
    end: at(2026, 9, 2, 20, 0),
    sequence: 0,
    lastModified: at(2026, 9, 2, 20, 12),
    why: "You checked in",
    public: true,
  },
  {
    id: "baja-insurance",
    uid: uidFor("baja-task-insurance"),
    club: "baja",
    kind: "task",
    title: "Upload shop insurance cert",
    location: "Club vault",
    start: at(2026, 9, 11, 17, 0),
    end: at(2026, 9, 11, 17, 30),
    sequence: 2,
    lastModified: at(2026, 9, 8, 21, 10),
    why: "Assigned to you · meeting Sep 8",
    public: false,
  },
  {
    id: "baja-carbon",
    uid: uidFor("baja-task-carbon"),
    club: "baja",
    kind: "task",
    title: "Cut carbon-fiber order to 4 sheets",
    location: "Shop",
    start: at(2026, 9, 11, 16, 0),
    end: at(2026, 9, 11, 16, 30),
    sequence: 1,
    lastModified: at(2026, 9, 8, 21, 8),
    why: "Assigned to you · meeting Sep 8",
    public: false,
  },
  {
    id: "baja-sign",
    uid: uidFor("baja-commit-le1842"),
    club: "baja",
    kind: "money",
    title: "Second signature on catering receipt",
    location: "Ledger · LE-1842",
    start: at(2026, 9, 10, 17, 0),
    end: at(2026, 9, 10, 17, 20),
    sequence: 0,
    lastModified: at(2026, 9, 5, 14, 2),
    why: "You must sign · Treasurer",
    public: false,
  },
  {
    id: "baja-eboard",
    uid: uidFor("baja-eboard-2026-09-11"),
    club: "baja",
    kind: "meeting",
    title: "E-board",
    location: "ARMS 3115",
    start: at(2026, 9, 11, 12, 0),
    end: at(2026, 9, 11, 13, 0),
    sequence: 0,
    lastModified: at(2026, 9, 4, 10, 0),
    why: "Office you hold · Treasurer",
    public: false,
  },
  {
    id: "consulting-interviews",
    uid: uidFor("consulting-interviews-2026-09-10"),
    club: "consulting",
    kind: "event",
    title: "First-round interviews",
    location: "Krannert 204",
    start: at(2026, 9, 10, 18, 0),
    end: at(2026, 9, 10, 21, 0),
    sequence: 0,
    lastModified: at(2026, 9, 6, 11, 20),
    why: "You RSVP’d",
    public: true,
  },
  {
    id: "consulting-score",
    uid: uidFor("consulting-task-score"),
    club: "consulting",
    kind: "task",
    title: "Score 3 remaining first-rounds",
    location: "Recruiting desk",
    start: at(2026, 9, 10, 16, 0),
    end: at(2026, 9, 10, 17, 0),
    sequence: 0,
    lastModified: at(2026, 9, 9, 9, 40),
    why: "Assigned to you",
    public: false,
  },
  {
    id: "hack-fall",
    uid: uidFor("hacknight-fall-2026-09-12"),
    club: "hacknight",
    kind: "event",
    title: "Fall Hack",
    location: "WALC 1132",
    start: at(2026, 9, 12, 9, 0),
    end: at(2026, 9, 12, 21, 0),
    sequence: 0,
    lastModified: at(2026, 9, 1, 12, 0),
    why: "You RSVP’d",
    public: true,
  },
  {
    id: "herald-print",
    uid: uidFor("herald-print-2026-09-11"),
    club: "herald",
    kind: "event",
    title: "Print deadline",
    location: "Newsroom",
    start: at(2026, 9, 11, 11, 0),
    end: at(2026, 9, 11, 11, 30),
    sequence: 0,
    lastModified: at(2026, 9, 8, 8, 15),
    why: "You RSVP’d",
    public: true,
  },
];

const clubState: Record<string, ClubCalendarState> = {
  baja: {
    slug: "baja",
    scope: "work",
    publicOn: true,
    embedOn: true,
    lastIssued: "40m ago",
    membersCanSubscribe: true,
  },
  consulting: {
    slug: "consulting",
    scope: "events",
    publicOn: true,
    embedOn: false,
    lastIssued: "3h ago",
    membersCanSubscribe: true,
  },
  hacknight: {
    slug: "hacknight",
    scope: "events",
    publicOn: true,
    embedOn: true,
    lastIssued: "never finished",
    membersCanSubscribe: true,
  },
  herald: {
    slug: "herald",
    scope: "events",
    publicOn: false,
    embedOn: false,
    lastIssued: "never",
    membersCanSubscribe: true,
  },
};

export function clubCalendarState(slug: string): ClubCalendarState {
  return (
    clubState[slug] ?? {
      slug,
      scope: "events",
      publicOn: false,
      embedOn: false,
      lastIssued: "never",
      membersCanSubscribe: true,
    }
  );
}

export function workForClub(slug: string) {
  return personalWork.filter((item) => item.club === slug);
}

export function publicEventsForClub(slug: string) {
  const now = at(2026, 9, 10, 12, 0);
  return personalWork.filter(
    (item) => item.club === slug && item.kind === "event" && item.public && item.end >= now,
  );
}

export function workByTitle(club: string, title: string) {
  const needle = title.toLowerCase();
  return (
    personalWork.find(
      (item) => item.club === club && item.title.toLowerCase() === needle,
    ) ??
    personalWork.find((item) => {
      const name = item.title.toLowerCase();
      return item.club === club && (needle.includes(name) || name.includes(needle));
    }) ??
    null
  );
}

export function workFromClubEvent(slug: string, title: string, when: string, where: string) {
  const found = workByTitle(slug, title);
  if (found) return found;
  return {
    id: `${slug}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    uid: uidFor(`${slug}-${title}`),
    club: slug,
    kind: "event" as const,
    title,
    location: where,
    start: at(2026, 9, 10, 18, 0),
    end: at(2026, 9, 10, 20, 0),
    sequence: 0,
    lastModified: issued,
    why: when,
    public: true,
  };
}

export function filterWork(
  items: CalendarWork[],
  clubsOn: Record<string, boolean>,
  kinds: WorkFilter,
) {
  return items.filter((item) => clubsOn[item.club] !== false && kinds[item.kind]);
}

export function personalHttpsFeed(token: string) {
  return `https://${FEED_HOST}/p/${PERSON_SLUG}/${token}.ics`;
}

export function personalWebcalFeed(token: string) {
  return `webcal://${FEED_HOST}/p/${PERSON_SLUG}/${token}.ics`;
}

export function clubPublicHttps(slug: string) {
  return `https://${FEED_HOST}/c/${slug}/public.ics`;
}

export function clubPublicWebcal(slug: string) {
  return `webcal://${FEED_HOST}/c/${slug}/public.ics`;
}

export function googleSubscribeUrl(httpsFeed: string) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(httpsFeed)}`;
}

export function outlookSubscribeUrl(httpsFeed: string, name: string) {
  const q = new URLSearchParams({ url: httpsFeed, name });
  return `https://outlook.live.com/calendar/0/addfromweb?${q.toString()}`;
}

export function googleEventUrl(work: CalendarWork) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `${clubShort(work.club)} · ${work.title}`,
    dates: `${icsUtc(work.start)}/${icsUtc(work.end)}`,
    location: work.location,
    details: `${work.why}. The club owns this. Your phone holds a copy.`,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookEventUrl(work: CalendarWork) {
  const q = new URLSearchParams({
    subject: `${clubShort(work.club)} · ${work.title}`,
    startdt: work.start.toISOString(),
    enddt: work.end.toISOString(),
    location: work.location,
    body: work.why,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}

export function newFeedToken() {
  const chunk = Math.random().toString(36).slice(2, 10);
  return `c0s_${PERSON_SLUG}_${chunk}`;
}

export const initialFeedToken = "c0s_maya_7f3k2q9m";

export function embedSnippet(slug: string, origin: string) {
  const club = clubBySlug(slug);
  const src = `${origin}/embed/${slug}`;
  return `<iframe src="${src}" title="${club?.name ?? slug} upcoming events" width="100%" height="320" style="border:1px solid #c7cdd1;border-radius:4px" loading="lazy"></iframe>`;
}

export function clubShort(slug: string) {
  return clubBySlug(slug)?.short ?? slug;
}

export function clubName(slug: string) {
  return clubBySlug(slug)?.name ?? slug;
}

export function myClubs(): Club[] {
  return clubs;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function icsLocal(date: Date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function icsUtc(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function icsStamp(date: Date) {
  return icsUtc(date);
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function fold(line: string) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

function vevent(work: CalendarWork, organizer: string) {
  const club = clubName(work.club);
  const summary = `${clubShort(work.club)} · ${work.title}`;
  const lines = [
    "BEGIN:VEVENT",
    `UID:${work.uid}`,
    `DTSTAMP:${icsStamp(work.lastModified)}`,
    `DTSTART;TZID=America/Indiana/Indianapolis:${icsLocal(work.start)}`,
    `DTEND;TZID=America/Indiana/Indianapolis:${icsLocal(work.end)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `LOCATION:${escapeIcs(work.location)}`,
    `ORGANIZER;CN=${escapeIcs(club)}:mailto:calendar@${work.club}.clubos.app`,
    `DESCRIPTION:${escapeIcs(`${work.why}. ${organizer}`)}`,
    `SEQUENCE:${work.sequence}`,
    `LAST-MODIFIED:${icsStamp(work.lastModified)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
  ];
  return lines.map(fold).join("\r\n");
}

export function icsForWork(work: CalendarWork) {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club OS//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    vevent(work, "The club owns this event. Your phone holds a copy."),
    "END:VCALENDAR",
  ];
  return `${body.join("\r\n")}\r\n`;
}

export function icsForFeed(items: CalendarWork[], calName: string) {
  const eventsBlock = items
    .map((item) => vevent(item, "Club OS personal feed. Revoke the token to cut this copy."))
    .join("\r\n");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Club OS//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calName)}`,
    eventsBlock,
    "END:VCALENDAR",
  ];
  return `${body.join("\r\n")}\r\n`;
}

export function icsForClubPublic(slug: string) {
  const items = publicEventsForClub(slug);
  return icsForFeed(items, `${clubName(slug)} · public`);
}

export function filenameFor(work: CalendarWork) {
  return `${work.id}.ics`;
}

export function downloadIcs(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function formatWhen(work: CalendarWork) {
  const start = work.start;
  const end = work.end;
  const day = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(start)}–${t(end)}`;
}


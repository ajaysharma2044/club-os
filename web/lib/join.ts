import { me, type Person } from "@/lib/data";

export const JOIN_STORAGE_KEY = "clubos:join";
export const JOIN_EVENT = "clubos:join";

export type JoinOutcome = "member" | "applicant" | "contributor";

export type ClubJoinPolicy = {
  slug: string;
  verb: string;
  outcome: JoinOutcome;
  openLine: string;
  confirmTitle: string;
  confirmLine: string;
  land: string;
  landLabel: string;
};

export type JoinMembership = {
  slug: string;
  outcome: JoinOutcome;
  at: string;
};

export type JoinState = {
  seen: boolean;
  completed: boolean;
  name: string;
  email: string;
  initials: string;
  year: string;
  campus: string;
  joined: JoinMembership[];
  notifyQuiet: boolean;
};

export const MAYA_EMAIL = "maya@northfield.edu";

export const mayaPerson = {
  name: me.name,
  email: MAYA_EMAIL,
  initials: me.initials,
  year: me.year,
  campus: me.campus,
};

export const joinPolicies: ClubJoinPolicy[] = [
  {
    slug: "baja",
    verb: "I'm in",
    outcome: "member",
    openLine: "Shop is open. Walk in tonight.",
    confirmTitle: "You're in.",
    confirmLine: "The office keeps the history. You just showed up.",
    land: "/clubs/baja?joined=1",
    landLabel: "Open Baja",
  },
  {
    slug: "consulting",
    verb: "Request to join",
    outcome: "applicant",
    openLine: "Still taking first-years. Apply by Friday 5pm.",
    confirmTitle: "Request sent.",
    confirmLine: "Sitting in Review with the other 14. Theo sees it. No extra essay.",
    land: "/clubs/consulting?joined=1",
    landLabel: "See Consulting",
  },
  {
    slug: "hacknight",
    verb: "I'm in",
    outcome: "member",
    openLine: "Saturday at WALC. No application.",
    confirmTitle: "You're in.",
    confirmLine: "Saturday's open. Text the group if you're coming.",
    land: "/chat?c=hacknight",
    landLabel: "Text the group",
  },
  {
    slug: "herald",
    verb: "I'll contribute",
    outcome: "contributor",
    openLine: "Need two photographers. No portfolio this cycle.",
    confirmTitle: "You're on the desk.",
    confirmLine: "Contributor, not staff. The newsroom keeps the clips.",
    land: "/clubs/herald?joined=1",
    landLabel: "Open Herald",
  },
];

export function policyFor(slug: string) {
  return joinPolicies.find((p) => p.slug === slug);
}

export function initialsFrom(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function emptyJoin(): JoinState {
  return {
    seen: false,
    completed: false,
    name: "",
    email: "",
    initials: "",
    year: "First-year",
    campus: "Northfield University",
    joined: [],
    notifyQuiet: true,
  };
}

export function readJoin(): JoinState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(JOIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JoinState;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...emptyJoin(), ...parsed, joined: parsed.joined ?? [] };
  } catch {
    return null;
  }
}

export function writeJoin(next: JoinState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(JOIN_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(JOIN_EVENT));
}

export function markJoinSeen(state?: JoinState | null) {
  const next = { ...(state ?? readJoin() ?? emptyJoin()), seen: true };
  writeJoin(next);
  return next;
}

export function revokeJoin() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(JOIN_STORAGE_KEY);
  window.dispatchEvent(new Event(JOIN_EVENT));
}

export function roleForOutcome(outcome: JoinOutcome) {
  if (outcome === "applicant") return "Applicant";
  if (outcome === "contributor") return "Contributor";
  return "Member";
}

export function mergeRoster(slug: string, people: Person[], state: JoinState | null): Person[] {
  if (!state?.name) return people;
  const hit = state.joined.find((j) => j.slug === slug);
  if (!hit) return people;
  if (people.some((p) => p.name === state.name)) return people;
  const added: Person = {
    name: state.name,
    initials: state.initials || initialsFrom(state.name),
    role: roleForOutcome(hit.outcome),
    year: state.year || "First-year",
    dues: "n/a",
    last: "Just showed up",
    status: "active",
  };
  return [added, ...people];
}

export function latestJoinFor(slug: string, state: JoinState | null) {
  if (!state) return undefined;
  return [...state.joined].reverse().find((j) => j.slug === slug);
}

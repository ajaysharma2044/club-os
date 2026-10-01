"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useCEC } from "@/components/cec/Connection";
import { memberNavigation, currentNavigation } from "@/lib/cec/navigation";
import { cecClub } from "@/lib/cec/routes";
import { usePathname } from "next/navigation";
import {
  ChatCircle,
  CalendarBlank,
  CheckSquare,
  Users,
  Gear,
  House,
  MagnifyingGlass,
  User,
} from "@phosphor-icons/react";
import { CommandPalette } from "@/components/CommandPalette";
import { clubBySlug, hueVar, me } from "@/lib/data";
import { useJoinState } from "@/lib/useJoin";

const icons = [House, CalendarBlank, CheckSquare, ChatCircle, Users];
const global = memberNavigation.map((item, i) => ({...item, icon: icons[i]}));

const clubTabs = [
  { seg: "", label: "Home" },
  { seg: "events", label: "Events" },
  { seg: "workspace", label: "Files" },
  { seg: "people", label: "People" },
  { seg: "money", label: "Money" },
  { seg: "settings", label: "Settings" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clubMatch = pathname.match(/^\/clubs\/([^/]+)/);
  const club = clubMatch
    ? clubMatch[1] === "cec"
      ? cecClub
      : clubBySlug(clubMatch[1])
    : undefined;
  const inChat = pathname.startsWith("/chat");
  const { data } = useCEC();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    let alive = true, pending = false;
    setUnread(false);
    if (!data?.user || data.user.role === "applicant") return;
    const refresh = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try { const r = await fetch("/api/cec/messaging/state"); if (!r.ok) return; const j = await r.json(); if (alive) setUnread(j.inbox.entries.some((e: any) => !e.muted && e.unread > 0)); }
      catch {} finally {pending = false;}
    };
    void refresh(); const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {alive = false; clearInterval(timer); window.removeEventListener("focus", refresh);};
  }, [data?.user?.id, data?.user?.role, pathname]);
  const { state: join } = useJoinState();
  const isDemo = !!clubMatch && clubMatch[1] !== "cec";
  const who = isDemo ? (join?.completed && join.name ? join : me) : data?.user;
  const initials =
    who?.initials ||
    who?.name
      ?.split(" ")
      .map((n: string) => n[0])
      .slice(0, 2)
      .join("") ||
    "?";
  if (pathname.startsWith("/embed")) return <>{children}</>;

  return (
    <div
      className={
        (isDemo ? "app in-club" : "app member-shell") +
        (menuOpen ? " mobile-menu-open" : "")
      }
    >
      <a className="skip" href="#content">
        Skip to content
      </a>
      <nav className="global-rail" aria-label="Global Navigation">
        <Link href="/" className="mark" aria-label="Club OS home">
          <span className="mark-box" aria-hidden />
          <span className="mark-name">Club OS</span>
        </Link>
        <div className="nav-list">
          {global.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="nav-item"
                aria-current={
                  currentNavigation(pathname, item.href) ? "page" : undefined
                }
              >
                <Icon size={20} weight="regular" aria-hidden />
                {item.label}
                {item.href === "/clubs/cec/messages" && unread && (
                  <span className="rail-unread" aria-label="New inbox activity">●</span>
                )}
              </Link>
            );
          })}
          {data?.user?.role === "officer" && <Link href="/clubs/cec/operations" className="nav-item" aria-current={["operations","money","integrations","planning"].some(p => pathname === `/clubs/cec/${p}`) ? "page" : undefined}><Gear size={20} aria-hidden/>Manage club</Link>}
          <button
            type="button"
            className="nav-item"
            onClick={() => window.dispatchEvent(new Event("clubos:command"))}
          >
            <MagnifyingGlass size={20} weight="regular" aria-hidden />
            Shortcuts
          </button>
        </div>
        <div className="nav-secondary">
          <Link href="/clubs/cec/info" onClick={()=>setMenuOpen(false)}>Club info & resources</Link>
          <Link href="/clubs/cec/requests" onClick={()=>setMenuOpen(false)}>Requests</Link>
          <Link href="/clubs/cec/record">Club activity</Link>
          <Link href="/clubs/cec/schedule">Calendar</Link>
          <Link href="/discover">Explore clubs</Link>
        </div>
        <div className="rail-foot">
          <Link
            href="/you"
            className={who?.name ? "avatar" : "btn"}
            title={who?.name || "Sign in"}
            aria-label={who?.name ? "Your account" : "Sign in"}
          >
            {who?.name ? initials : "Sign in"}
          </Link>
        </div>
      </nav>

      {isDemo && club && (
        <nav className="club-rail" aria-label={`${club.name} navigation`}>
          <div className="club-rail-head">
            <span
              className="club-chip"
              style={{ background: hueVar(club.hue) }}
            />
            <strong>{club.name}</strong>
          </div>
          <div className="nav-list">
            {clubTabs.map((tab) => {
              const href = tab.seg
                ? `/clubs/${club.slug}/${tab.seg}`
                : `/clubs/${club.slug}`;
              const current =
                tab.seg === "" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={
                    club.slug === "cec" && tab.seg === "workspace"
                      ? "Workspace"
                      : tab.label
                  }
                  href={href}
                  className="nav-item"
                  aria-current={current ? "page" : undefined}
                >
                  {club.slug === "cec" && tab.seg === "workspace"
                    ? "Workspace"
                    : tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <div className="mobile-bar">
        <Link href="/">Club OS</Link>
        <Link href="/you" className="mobile-account" aria-label={who?.name ? "Your account" : "Sign in"}>{who?.name ? initials : "Sign in"}</Link>
        <button
          className="btn ghost"
          type="button"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? "Close" : "Menu"}
        </button>
      </div>

      <div
        className={
          inChat ? "work wide chat-work" : "work wide"
        }
      >
        {inChat ? (
          <div id="content">{children}</div>
        ) : (
          <main id="content" className="main">
            {club && pathname !== `/clubs/${club.slug}` && (
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span aria-hidden>/</span>
                <Link href={`/clubs/${club.slug}`}>{club.name}</Link>
                {pathname !== `/clubs/${club.slug}` && (
                  <>
                    <span aria-hidden>/</span>
                    <strong>
                      {club?.slug === "cec" && pathname.endsWith("workspace")
                        ? "Tasks & Projects"
                        : (clubTabs.find(
                            (t) => t.seg && pathname.endsWith(t.seg),
                          )?.label ??
                          (
                            {
                              record: "Club activity",
                              messages: "Inbox",
                              integrations: "Integrations",
                              planning: "Event planning",
                              interviews: "Interviews",
                              signals: "Your activity",
                              operations: "Manage club",
                              info: "Club info", requests: "Requests", profile: "Club profile", relationships: "Relationships",
                              intake: "Weekly update",
                              schedule: "Calendar",
                              directory: "Shared projects",
                            } as Record<string, string>
                          )[pathname.split("/").pop() || ""] ??
                          "Page")}
                    </strong>
                  </>
                )}
              </nav>
            )}
            {isDemo && (
              <p className="demo-notice">
                Example club · interactions here use demonstration data.{" "}
                <Link href="/clubs/cec">Open the connected CEC workspace</Link>
              </p>
            )}
            {children}
          </main>
        )}

      </div>
      <CommandPalette />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useCEC } from "@/components/cec/Connection";
import { ConnectedAside } from "@/components/cec/ConnectedAside";
import { cecClub } from "@/lib/cec/routes";
import { usePathname } from "next/navigation";
import {
  ChatCircle,
  Compass,
  House,
  MagnifyingGlass,
  User,
} from "@phosphor-icons/react";
import { CommandPalette } from "@/components/CommandPalette";
import { clubBySlug, hueVar, me } from "@/lib/data";
import { useJoinState } from "@/lib/useJoin";

const global = [
  { href: "/clubs/cec", label: "CEC", icon: House },
  { href: "/", label: "Home", icon: House },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/chat", label: "Inbox", icon: ChatCircle },
  { href: "/you", label: "Account", icon: User },
];

const clubTabs = [
  { seg: "", label: "Home" },
  { seg: "events", label: "Events" },
  { seg: "workspace", label: "Files" },
  { seg: "people", label: "People" },
  { seg: "money", label: "Money" },
  { seg: "settings", label: "Settings" },
];

function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clubMatch = pathname.match(/^\/clubs\/([^/]+)/);
  const club = clubMatch
    ? clubMatch[1] === "cec"
      ? cecClub
      : clubBySlug(clubMatch[1])
    : undefined;
  const inChat = pathname.startsWith("/chat");
  const joining = pathname.startsWith("/join");
  const showTodo = (pathname === "/" || pathname === "/discover") && !joining;
  const { data } = useCEC();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const unread = 0;
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
        (club ? "app in-club" : inChat ? "app in-chat" : "app") +
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
                className="nav-item"
                aria-current={
                  isCurrent(pathname, item.href) ? "page" : undefined
                }
              >
                <Icon size={20} weight="regular" aria-hidden />
                {item.label}
                {item.href === "/chat" && unread > 0 && (
                  <span className="rail-unread">{unread}</span>
                )}
              </Link>
            );
          })}
          <button
            type="button"
            className="nav-item"
            onClick={() => window.dispatchEvent(new Event("clubos:command"))}
          >
            <MagnifyingGlass size={20} weight="regular" aria-hidden />
            Search
          </button>
        </div>
        <div className="rail-foot">
          <Link
            href="/you"
            className="avatar"
            title={who?.name || "Sign in"}
            aria-label={who?.name ? "Your account" : "Sign in"}
          >
            {initials}
          </Link>
        </div>
      </nav>

      {club && (
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
          inChat ? "work wide chat-work" : showTodo ? "work" : "work wide"
        }
      >
        {inChat ? (
          <div id="content">{children}</div>
        ) : (
          <main id="content" className="main">
            {club && (
              <nav className="crumbs" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span aria-hidden>/</span>
                <Link href={`/clubs/${club.slug}`}>{club.name}</Link>
                {pathname !== `/clubs/${club.slug}` && (
                  <>
                    <span aria-hidden>/</span>
                    <strong>
                      {club?.slug === "cec" && pathname.endsWith("workspace")
                        ? "Workspace"
                        : (clubTabs.find(
                            (t) => t.seg && pathname.endsWith(t.seg),
                          )?.label ??
                          (
                            {
                              record: "Club record",
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
        {showTodo && (
          <aside className="up-next" aria-label="You owe">
            <ConnectedAside />
          </aside>
        )}
      </div>
      <CommandPalette />
    </div>
  );
}

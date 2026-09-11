"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChatCircle,
  Compass,
  House,
  MagnifyingGlass,
  User,
} from "@phosphor-icons/react";
import { CommandPalette } from "@/components/CommandPalette";
import { inboxUnread } from "@/lib/chat";
import { clubBySlug, clubs, hueVar, me, needs, week } from "@/lib/data";

const global = [
  { href: "/", label: "Dashboard", icon: House },
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
  if (pathname.startsWith("/embed")) {
    return <>{children}</>;
  }
  const clubMatch = pathname.match(/^\/clubs\/([^/]+)/);
  const club = clubMatch ? clubBySlug(clubMatch[1]) : undefined;
  const inChat = pathname.startsWith("/chat");
  const showTodo = pathname === "/" || pathname === "/discover";
  const unread = inboxUnread();

  return (
    <div className={club ? "app in-club" : inChat ? "app in-chat" : "app"}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <nav className="global-rail" aria-label="Global Navigation">
        <Link href="/" className="mark" aria-label="Club OS dashboard">
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
                aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
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
          <span className="avatar" title={me.name}>
            {me.initials}
          </span>
        </div>
      </nav>

      {club && (
        <nav className="club-rail" aria-label={`${club.name} navigation`}>
          <div className="club-rail-head">
            <span className="club-chip" style={{ background: hueVar(club.hue) }} />
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
                  key={tab.label}
                  href={href}
                  className="nav-item"
                  aria-current={current ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      <div className="mobile-bar">
        <Link href="/">Club OS</Link>
        <span>Menu</span>
      </div>

      <div className={inChat ? "work wide chat-work" : showTodo ? "work" : "work wide"}>
        {inChat ? (
          <div id="content">{children}</div>
        ) : (
        <main id="content" className="main">
          {club && (
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link href="/">Dashboard</Link>
              <span aria-hidden>/</span>
              <Link href={`/clubs/${club.slug}`}>{club.name}</Link>
              {pathname !== `/clubs/${club.slug}` && (
                <>
                  <span aria-hidden>/</span>
                  <strong>
                    {clubTabs.find((t) => t.seg && pathname.endsWith(t.seg))?.label ??
                      "Page"}
                  </strong>
                </>
              )}
            </nav>
          )}
          {children}
        </main>
        )}
        {showTodo && (
          <aside className="up-next" aria-label="To Do">
            <div className="up-next-inner">
              <div className="todo-head">To Do</div>
              {needs.map((item) => {
                const c = clubs.find((x) => x.slug === item.club)!;
                return (
                  <Link key={item.title} href={item.href} className="todo-item">
                    <span className="todo-dot" style={{ background: hueVar(c.hue) }} />
                    <div>
                      <div className="todo-title">{item.title}</div>
                      <div className="text-caption">
                        {c.short} · {item.detail}
                      </div>
                    </div>
                  </Link>
                );
              })}
              <div className="todo-head" style={{ marginTop: 20 }}>
                Coming Up
              </div>
              {week.slice(0, 4).map((item) => {
                const c = clubs.find((x) => x.slug === item.club)!;
                return (
                  <Link
                    key={item.title}
                    href={`/clubs/${c.slug}/events`}
                    className="todo-item"
                  >
                    <span className="todo-dot" style={{ background: hueVar(c.hue) }} />
                    <div>
                      <div className="todo-title">{item.title}</div>
                      <div className="text-caption">
                        {item.when} · {item.where}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>
        )}
      </div>
      <CommandPalette />
    </div>
  );
}

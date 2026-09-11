"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CommandPalette } from "@/components/CommandPalette";
import { inboxUnread } from "@/lib/chat";
import { clubBySlug, me } from "@/lib/data";

const global = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/chat", label: "Inbox" },
  { href: "/you", label: "Account" },
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
  const unread = inboxUnread();

  return (
    <div className={club ? "app in-club" : inChat ? "app in-chat" : "app"}>
      <div className="atmosphere" aria-hidden />
      <a className="skip" href="#content">
        Skip to content
      </a>
      <nav className="topbar" aria-label="Global Navigation">
        <Link href="/" className="wordmark">
          Club OS
        </Link>
        <div className="top-links">
          {global.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
            >
              {item.label}
              {item.href === "/chat" && unread > 0 && (
                <span className="top-unread">{unread}</span>
              )}
            </Link>
          ))}
        </div>
        <div className="top-end">
          <button
            type="button"
            className="pill"
            onClick={() => window.dispatchEvent(new Event("clubos:command"))}
          >
            Search
          </button>
          <Link href="/you" className="pill solid" title={me.name}>
            {me.initials}
          </Link>
        </div>
      </nav>

      {club && (
        <nav className="club-bar" aria-label={`${club.name} navigation`}>
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
                aria-current={current ? "page" : undefined}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="mobile-bar">
        <Link href="/">Club OS</Link>
        <span>Menu</span>
      </div>

      <div className={inChat ? "work wide chat-work" : "work wide"}>
        {inChat ? (
          <div id="content">{children}</div>
        ) : (
          <main id="content" className="main">
            {children}
          </main>
        )}
      </div>
      <CommandPalette />
    </div>
  );
}

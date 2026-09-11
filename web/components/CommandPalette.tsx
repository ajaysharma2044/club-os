"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { channelLabel, channels } from "@/lib/chat";
import { clubs } from "@/lib/data";

const staticItems = [
  { href: "/", label: "Dashboard", hint: "Home" },
  { href: "/discover", label: "Discover", hint: "Campus" },
  { href: "/chat", label: "Chat", hint: "Inbox" },
  { href: "/you", label: "Your record", hint: "You" },
  { href: "/clubs/baja/settings#integrations", label: "Integrations", hint: "Baja" },
  { href: "/clubs/baja/settings?integration=stripe", label: "Stripe", hint: "Baja" },
  { href: "/clubs/baja/settings?integration=drive", label: "Drive import", hint: "Baja" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    const clubItems = clubs.flatMap((c) => [
      { href: `/clubs/${c.slug}`, label: c.name, hint: "Home" },
      { href: `/clubs/${c.slug}/events`, label: `${c.short} · Events`, hint: "Events" },
      { href: `/clubs/${c.slug}/people`, label: `${c.short} · People`, hint: "Roster" },
      { href: `/clubs/${c.slug}/money`, label: `${c.short} · Money`, hint: "Ledger" },
      { href: `/clubs/${c.slug}/settings`, label: `${c.short} · Settings`, hint: "Settings" },
      { href: `/clubs/${c.slug}/settings#integrations`, label: `${c.short} · Integrations`, hint: "Settings" },
      { href: `/clubs/${c.slug}/settings?integration=stripe`, label: `${c.short} · Stripe`, hint: "Money" },
      { href: `/chat?c=${c.slug}`, label: `${c.short} · Chat`, hint: "Inbox" },
    ]);
    const chatItems = channels.map((ch) => {
      const club = clubs.find((c) => c.slug === ch.club);
      return {
        href: `/chat?c=${ch.id}`,
        label: ch.kind === "dm" ? ch.name : `${club?.short ?? ch.club} ${channelLabel(ch)}`,
        hint: "Inbox",
      };
    });
    const all = [...staticItems, ...clubItems, ...chatItems];
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 8);
    return all.filter((i) => i.label.toLowerCase().includes(needle)).slice(0, 8);
  }, [q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpen() {
      setOpen(true);
      setQ("");
      setActive(0);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("clubos:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("clubos:command", onOpen);
    };
  }, []);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="kbar-scrim" onMouseDown={() => setOpen(false)}>
      <div
        className="kbar"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          placeholder="Go to a club, event, or person"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter" && items[active]) go(items[active].href);
          }}
        />
        <div>
          {items.map((item, i) => (
            <button
              key={item.href + item.label}
              className="pal-item"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(item.href)}
            >
              <span>{item.label}</span>
              <span className="text-caption">{item.hint}</span>
            </button>
          ))}
          {items.length === 0 && (
            <div className="pal-item muted">Nothing matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}

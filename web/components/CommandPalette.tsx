"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { channelLabel, channels } from "@/lib/chat";
import { Modal } from "./cec/FormPrimitives";
import {useCEC} from "./cec/Connection";
import {memberNavigation} from "@/lib/cec/navigation";
import { clubs } from "@/lib/data";

const staticItems = [
  {href:"/clubs/cec/info",label:"Club info & resources",hint:"Information"},
  {href:"/clubs/cec/requests",label:"Requests",hint:"Member self-service"},
  {href:"/clubs/cec/profile",label:"My club profile",hint:"Photo, skills and interests"},
  ...memberNavigation.map(i => ({...i, hint: "Navigate"})),
  {href: "/you", label: "Profile & preferences", hint: "Account"},
  {href: "/clubs/cec/record", label: "Club activity", hint: "Resources"},
  {href: "/clubs/cec/intake", label: "Share a weekly update", hint: "Availability and projects"},
  {href: "/clubs/cec/schedule", label: "Calendar", hint: "Events and meetings"},
  {href: "/discover", label: "Explore clubs", hint: "Discover"},
];

export function CommandPalette() {
  const router = useRouter();
  const {data} = useCEC();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    const clubItems = clubs.flatMap((c) => [
      { href: `/clubs/${c.slug}`, label: c.name, hint: "Home" },
      {
        href: `/clubs/${c.slug}/events`,
        label: `${c.short} · Events`,
        hint: "Events",
      },
      {
        href: `/clubs/${c.slug}/people`,
        label: `${c.short} · People`,
        hint: "Roster",
      },
      {
        href: `/clubs/${c.slug}/money`,
        label: `${c.short} · Money`,
        hint: "Ledger",
      },
      {
        href: `/clubs/${c.slug}/settings`,
        label: `${c.short} · Settings`,
        hint: "Settings",
      },
      {
        href: `/clubs/${c.slug}/settings#integrations`,
        label: `${c.short} · Integrations`,
        hint: "Settings",
      },
      {
        href: `/clubs/${c.slug}/settings?integration=stripe`,
        label: `${c.short} · Stripe`,
        hint: "Money",
      },
      {
        href: `/clubs/${c.slug}/settings?integration=calendar`,
        label: `${c.short} · Club calendar`,
        hint: "Settings",
      },
      {
        href: `/clubs/${c.slug}/events`,
        label: `${c.short} · Add to calendar`,
        hint: "Events",
      },
      { href: `/chat?c=${c.slug}`, label: `${c.short} · Chat`, hint: "Inbox" },
    ]);
    const chatItems = channels.map((ch) => {
      const club = clubs.find((c) => c.slug === ch.club);
      return {
        href: `/chat?c=${ch.id}`,
        label:
          ch.kind === "dm"
            ? ch.name
            : `${club?.short ?? ch.club} ${channelLabel(ch)}`,
        hint: "Inbox",
      };
    });
    const all = [
      ...staticItems,
      ...(data?.user?.role === "officer" ? [{href:"/clubs/cec/operations",label:"Manage club",hint:"Officer tools"}] : []),
      ...clubItems.map((i) => ({ ...i, hint: "Example club" })),
      ...chatItems.map((i) => ({ ...i, hint: "Example inbox" })),
    ];
    const needle = q.trim().toLowerCase();
    if (!needle) return all.slice(0, 8);
    return all
      .filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [q, data?.user?.role]);

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
    <Modal title="Navigation shortcuts" close={() => setOpen(false)}>
      <div
        className="kbar"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          aria-label="Find a navigation shortcut"
          placeholder="Find a navigation shortcut"
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
    </Modal>
  );
}

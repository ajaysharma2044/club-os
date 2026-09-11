"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  downloadIcs,
  filenameFor,
  googleEventUrl,
  icsForWork,
  outlookEventUrl,
  type CalendarWork,
} from "@/lib/calendar";

export function AddToCalendar({
  work,
  compact = false,
}: {
  work: CalendarWork;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function download() {
    downloadIcs(filenameFor(work), icsForWork(work));
    setOpen(false);
  }

  return (
    <div className="cal-add" ref={wrap}>
      <button
        className={compact ? "btn ghost" : "btn"}
        type="button"
        aria-expanded={open}
        aria-controls={labelId}
        onClick={() => setOpen((v) => !v)}
      >
        Add to calendar
      </button>
      {open && (
        <div className="cal-menu" id={labelId} role="menu">
          <p className="text-caption" style={{ margin: "0 0 8px" }}>
            One copy of this item. The club keeps the original.
          </p>
          <button type="button" role="menuitem" onClick={download}>
            Download .ics
          </button>
          <a href={googleEventUrl(work)} target="_blank" rel="noreferrer" role="menuitem">
            Google Calendar
          </a>
          <button type="button" role="menuitem" onClick={download}>
            Apple Calendar
          </button>
          <a href={outlookEventUrl(work)} target="_blank" rel="noreferrer" role="menuitem">
            Outlook
          </a>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultWorkFilter,
  downloadIcs,
  filterWork,
  formatWhen,
  googleSubscribeUrl,
  icsForFeed,
  initialFeedToken,
  myClubs,
  newFeedToken,
  outlookSubscribeUrl,
  personalHttpsFeed,
  personalWebcalFeed,
  personalWork,
  workKindLabel,
  type WorkFilter,
  type WorkKind,
} from "@/lib/calendar";
import { hueVar } from "@/lib/data";

const kinds = Object.keys(workKindLabel) as WorkKind[];

export function PersonalCalendar() {
  const clubs = myClubs();
  const [token, setToken] = useState(initialFeedToken);
  const [issued, setIssued] = useState("Sep 3, 2026");
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState(false);
  const [kindsOn, setKindsOn] = useState<WorkFilter>(defaultWorkFilter);
  const [clubsOn, setClubsOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(clubs.map((c) => [c.slug, true])),
  );

  const https = personalHttpsFeed(token);
  const webcal = personalWebcalFeed(token);
  const items = useMemo(
    () => filterWork(personalWork, clubsOn, kindsOn),
    [clubsOn, kindsOn],
  );

  useEffect(() => {
    if (window.location.hash === "#calendar") {
      document.getElementById("calendar")?.scrollIntoView({ block: "start" });
    }
  }, []);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function rotate() {
    setToken(newFeedToken());
    setIssued("just now");
    setRevoke(false);
  }

  return (
    <section className="section" id="calendar">
      <h2 className="text-title-2">Your calendar</h2>
      <p className="text-caption" style={{ margin: "4px 0 12px", maxWidth: "62ch" }}>
        One secret feed of your work across clubs. The club owns the event.
        Your phone holds a copy. Graduating does not take a club calendar with
        you. This token is yours.
      </p>
      <hr className="rule" />

      <div className="cal-feed">
        <label className="text-label" htmlFor="personal-feed">
          Subscribe URL
        </label>
        <div className="cal-url-row">
          <input
            id="personal-feed"
            className="input text-mono"
            readOnly
            value={https}
          />
          <button className="btn primary" type="button" onClick={() => copy(https)}>
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="text-caption" style={{ margin: "8px 0 0" }}>
          webcal · {webcal}
        </p>
        <p className="text-caption" style={{ margin: "4px 0 0" }}>
          Last issued {issued}. Anyone with this link can see your work. Treat
          it like a password.
        </p>

        <div className="cal-actions">
          <a className="btn" href={googleSubscribeUrl(https)} target="_blank" rel="noreferrer">
            Add to Google Calendar
          </a>
          <a className="btn" href={webcal}>
            Add to Apple Calendar
          </a>
          <a
            className="btn"
            href={outlookSubscribeUrl(https, "Club OS · Maya")}
            target="_blank"
            rel="noreferrer"
          >
            Outlook
          </a>
          <button
            className="btn"
            type="button"
            onClick={() =>
              downloadIcs("club-os-maya.ics", icsForFeed(items, "Club OS · Maya"))
            }
          >
            Download .ics
          </button>
          <button className="btn ghost" type="button" onClick={() => setRevoke(true)}>
            Revoke & rotate
          </button>
        </div>
      </div>

      <div className="cal-split">
        <div>
          <div className="text-label">Which work</div>
          <p className="text-caption" style={{ margin: "4px 0 10px" }}>
            Chat history, other people’s assignments, and ledger amounts stay
            off this feed.
          </p>
          <div className="cal-toggles">
            {kinds.map((kind) => (
              <label key={kind} className="cal-check">
                <input
                  type="checkbox"
                  checked={kindsOn[kind]}
                  onChange={() =>
                    setKindsOn((prev) => ({ ...prev, [kind]: !prev[kind] }))
                  }
                />
                <span>{workKindLabel[kind]}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-label">Which clubs</div>
          <p className="text-caption" style={{ margin: "4px 0 10px" }}>
            Positions stay on the record either way. This only changes what
            lands on your phone.
          </p>
          <div className="cal-toggles">
            {clubs.map((club) => (
              <label key={club.slug} className="cal-check">
                <input
                  type="checkbox"
                  checked={clubsOn[club.slug] !== false}
                  onChange={() =>
                    setClubsOn((prev) => ({
                      ...prev,
                      [club.slug]: prev[club.slug] === false,
                    }))
                  }
                />
                <span className="identity" style={{ background: hueVar(club.hue) }} />
                <span>
                  {club.name}
                  <span className="muted"> · {club.role}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="cal-preview">
        <div className="text-label">On this feed · {items.length}</div>
        {items.map((item) => (
          <div key={item.id} className="cal-preview-row">
            <span
              className="identity"
              style={{
                background: hueVar(
                  clubs.find((c) => c.slug === item.club)?.hue ?? "slate",
                ),
              }}
            />
            <div className="grow">
              <div className="row-title">{item.title}</div>
              <div className="text-caption">
                {formatWhen(item)} · {item.location} · {item.why}
              </div>
            </div>
            <span className="badge">{item.kind}</span>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            Nothing selected. The record is unchanged.
          </p>
        )}
      </div>

      {revoke && (
        <div className="kbar-scrim" onMouseDown={() => setRevoke(false)}>
          <div
            className="confirm"
            role="alertdialog"
            aria-labelledby="cal-revoke-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-title-2" id="cal-revoke-title">
              Revoke this feed?
            </h3>
            <p className="text-caption">
              Phones still subscribed to the old URL stop updating. Your
              positions and attendance stay on the record. A new secret link
              is issued.
            </p>
            <div className="integ-actions" style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={() => setRevoke(false)}>
                Keep this link
              </button>
              <button className="btn primary" type="button" onClick={rotate}>
                Revoke & rotate
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

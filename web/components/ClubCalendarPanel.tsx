"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  clubCalendarState,
  clubName,
  clubPublicHttps,
  clubPublicWebcal,
  downloadIcs,
  embedSnippet,
  formatWhen,
  googleSubscribeUrl,
  icsForClubPublic,
  outlookSubscribeUrl,
  publicEventsForClub,
  type CalendarScope,
} from "@/lib/calendar";
import type { ClubIntegration } from "@/lib/integrations";

export function ClubCalendarPanel({
  slug,
  row,
}: {
  slug: string;
  row: ClubIntegration;
}) {
  const seed = clubCalendarState(slug);
  const [scope, setScope] = useState<CalendarScope>(seed.scope);
  const [publicOn, setPublicOn] = useState(seed.publicOn && row.status !== "off");
  const [embedOn, setEmbedOn] = useState(seed.embedOn && row.status !== "off");
  const [copied, setCopied] = useState<"ics" | "embed" | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://app.clubos.app";
  const https = clubPublicHttps(slug);
  const webcal = clubPublicWebcal(slug);
  const snippet = useMemo(() => embedSnippet(slug, origin), [origin, slug]);
  const upcoming = publicEventsForClub(slug);
  const live = row.status !== "off";

  async function copy(which: "ics" | "embed", value: string) {
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
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <div className="cal-club">
      <p style={{ margin: "0 0 12px" }}>{row.detail}</p>
      <p className="text-caption" style={{ margin: "0 0 14px" }}>
        Calendars are a projection. Events, tasks, and commitments stay on the
        record. We write only to a calendar we created, or we hand a person a
        subscribe link they own. Campus free/busy can come in; titles do not
        leave. There is no university admin product here.
      </p>

      <div className="cal-note">
        <div className="text-label">Your members can subscribe</div>
        <p className="text-caption" style={{ margin: "4px 0 8px" }}>
          Each person gets a secret feed of <em>their</em> work across clubs —
          RSVPs, assigned tasks, money they must sign, meetings for offices
          they hold. That lives on Account, not in this club’s Settings.
          Graduating cuts the club calendar. The personal token stays theirs.
        </p>
        <Link className="btn" href="/you#calendar">
          Open your calendar
        </Link>
      </div>

      <div className="cal-scope">
        <div className="text-label">What this club publishes</div>
        <div className="views" role="tablist" aria-label="Club calendar scope">
          <button
            type="button"
            aria-pressed={scope === "events"}
            onClick={() => setScope("events")}
          >
            Events only
          </button>
          <button
            type="button"
            aria-pressed={scope === "work"}
            onClick={() => setScope("work")}
          >
            Events + work
          </button>
        </div>
        <p className="text-caption" style={{ margin: "8px 0 0" }}>
          {scope === "events"
            ? "Public ICS and the embed stay title, time, and place. That is the default."
            : "Members who subscribe can pull tasks, signatures, and officer meetings they own. The public embed never does. Ledger amounts, payee names, and roster never leave."}
        </p>
      </div>

      <div className="cal-pub">
        <div className="cal-pub-head">
          <div>
            <div className="text-label">Public club ICS</div>
            <p className="text-caption" style={{ margin: "4px 0 0" }}>
              Structural facts only. No roster, no money, no membership. A
              Linktree or Discord can subscribe. Political and identity orgs
              stay on this rule even when the club calendar is on.
            </p>
          </div>
          <button
            className={publicOn ? "btn" : "btn ghost"}
            type="button"
            aria-pressed={publicOn}
            disabled={!live}
            onClick={() => setPublicOn((v) => !v)}
          >
            {publicOn ? "On" : "Off"}
          </button>
        </div>
        {live && publicOn ? (
          <>
            <div className="cal-url-row">
              <input className="input text-mono" readOnly value={https} />
              <button className="btn" type="button" onClick={() => copy("ics", https)}>
                {copied === "ics" ? "Copied" : "Copy ICS"}
              </button>
            </div>
            <div className="cal-actions">
              <a className="btn" href={googleSubscribeUrl(https)} target="_blank" rel="noreferrer">
                Add to Google
              </a>
              <a className="btn" href={webcal}>
                Apple
              </a>
              <a
                className="btn"
                href={outlookSubscribeUrl(https, `${clubName(slug)} · public`)}
                target="_blank"
                rel="noreferrer"
              >
                Outlook
              </a>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  downloadIcs(`${slug}-public.ics`, icsForClubPublic(slug))
                }
              >
                Download .ics
              </button>
            </div>
          </>
        ) : (
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            {live
              ? "Public feed is off. Members can still subscribe from Account."
              : "Connect the club calendar to publish a public ICS. Members can already subscribe from Account."}
          </p>
        )}
      </div>

      <div className="cal-pub">
        <div className="cal-pub-head">
          <div>
            <div className="text-label">Embed on a club site</div>
            <p className="text-caption" style={{ margin: "4px 0 0" }}>
              Upcoming events widget. Title, time, place. Nothing else.
            </p>
          </div>
          <button
            className={embedOn ? "btn" : "btn ghost"}
            type="button"
            aria-pressed={embedOn}
            disabled={!live}
            onClick={() => setEmbedOn((v) => !v)}
          >
            {embedOn ? "On" : "Off"}
          </button>
        </div>
        {live && embedOn ? (
          <>
            <textarea className="input cal-embed" readOnly rows={4} value={snippet} />
            <div className="cal-actions">
              <button className="btn" type="button" onClick={() => copy("embed", snippet)}>
                {copied === "embed" ? "Copied" : "Copy snippet"}
              </button>
              <Link className="btn" href={`/embed/${slug}`} target="_blank">
                Open widget
              </Link>
            </div>
            <iframe
              className="cal-embed-frame"
              src={`/embed/${slug}`}
              title={`${clubName(slug)} upcoming events`}
            />
          </>
        ) : (
          <p className="text-caption" style={{ margin: "8px 0 0" }}>
            Embed stays off until an officer publishes it. The public page
            will not list members.
          </p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div>
          <div className="text-label">Public upcoming</div>
          {upcoming.map((item) => (
            <div key={item.id} className="cal-preview-row">
              <div className="grow">
                <div className="row-title">{item.title}</div>
                <div className="text-caption">
                  {formatWhen(item)} · {item.location}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

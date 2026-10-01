"use client";
import { useRef, useState } from "react";
import { Editor, Modal, type Field } from "../FormPrimitives";
import type { Portal } from "./usePortal";
export type RecordRow = {
  id: string;
  owner: string;
  version: number;
  data: any;
  status?: string;
  history?: any[];
  person_id?: string;
  contact_id?: string;
  created_at: string;
  updated_at: string;
};
export const options = (values: string[]) =>
  values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
export const field = (
  key: string,
  label: string,
  value: any = "",
  type = "text",
  required = true,
): Field => ({ key, label, value, type, required });
export const select = (
  key: string,
  label: string,
  values: string[],
  value?: string,
): Field => ({
  key,
  label,
  options: options(values),
  value: value || values[0],
});
export const dateLabel = (s: string) =>
  s
    ? new Date(s).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) + " ET"
    : "No due date";
export function Frame({
  title,
  description,
  p,
  children,
  nested = false,
}: {
  title: string;
  description: string;
  p: Portal;
  children: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <div className="cec embedded club-portal">
      <header className="portal-heading">
        {nested ? <h2>{title}</h2> : <h1>{title}</h1>}
        <p>{description}</p>
      </header>
      {p.notice && <p role="status">{p.notice}</p>}
      {p.error && (
        <div role="alert">
          <p>{p.error}</p>
          <button
            className="button secondary"
            onClick={() => void p.refresh().catch(() => {})}
          >
            Try again
          </button>
        </div>
      )}
      {!p.data && !p.error ? (
        <p role="status">Loading…</p>
      ) : p.data ? (
        children
      ) : null}
    </div>
  );
}
export function PortalDialog({
  title,
  fields,
  onSave,
  close,
}: {
  title: string;
  fields: Field[];
  onSave: (d: any) => Promise<any>;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  // Bind this draft to the account and record snapshot present when it opened.
  const submit = useRef(onSave);
  return (
    <Modal
      title={title}
      close={() => {
        if (!lock.current) close();
      }}
    >
      {error && <p role="alert">{error}</p>}
      <Editor
        fields={fields}
        busy={busy}
        onSubmit={async (d) => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await submit.current(d);
            close();
          } catch (e: any) {
            setError(e.message);
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      />
    </Modal>
  );
}
export function ProfileDetails({ data: d }: { data: any }) {
  return (
    <>
      {d.photo_url && (
        <img
          className="portal-avatar"
          src={d.photo_url}
          alt="Profile"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      )}
      {d.bio && <p className="portal-prose">{d.bio}</p>}
      <dl>
        {[
          ["Major / field", d.major],
          ["Graduation year", d.graduation_year],
          ["Skills", d.skills],
          ["Committee / interests", d.committee],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {d.linkedin_url && (
        <a href={d.linkedin_url} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
      )}
      {d.website_url && (
        <a href={d.website_url} target="_blank" rel="noreferrer">
          Website
        </a>
      )}
    </>
  );
}

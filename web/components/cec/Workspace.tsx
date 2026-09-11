"use client";
import Link from "next/link";
import { cecRoutes } from "@/lib/cec/routes";
import { useEffect, useRef, useState, FormEvent, ReactNode } from "react";
import {
  House,
  CalendarDots,
  SquaresFour,
  Users,
  Handshake,
  ChartLine,
  ArrowUpRight,
  Plus,
  SignOut,
} from "@phosphor-icons/react";
import "./cec.css";
import ProjectSuggestions from "./ProjectSuggestions";
import ChatScheduler from "./ChatScheduler";
import EpisodeRecord from "./EpisodeRecord";
import AdaptiveIntake, { SharedAdaptiveProfiles } from "./AdaptiveIntake";

type Row = {
  id: string;
  kind: string;
  owner: string;
  data: Record<string, any>;
  version: number;
};
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  value?: any;
};
const dateLabel = (s: string) =>
  new Date(s).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
const navigation = [
  ["home", "Overview", House],
  ["events", "Events", CalendarDots],
  ["work", "Workspace", SquaresFour],
  ["people", "People", Users],
  ["crm", "Relationships", Handshake],
  ["record", "The record", ChartLine],
] as const;
const empty = (text: string) => <div className="empty">{text}</div>;
const tag = (v: string) => (
  <span
    className={
      "tag " +
      (["draft", "declined", "lost", "missed", "cancelled"].includes(v)
        ? "red"
        : "")
    }
  >
    {v.replaceAll("_", " ")}
  </span>
);
function fieldsFrom(options: string[]) {
  return options.map((value) => ({ value, label: value }));
}

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    const first = ref.current?.querySelector<HTMLElement>(
      "input,select,textarea,button",
    );
    first?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button,input,select,textarea,a[href]",
        );
        if (!nodes?.length) return;
        const a = nodes[0],
          b = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          b.focus();
        } else if (!e.shiftKey && document.activeElement === b) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      prior?.focus();
    };
  }, [close]);
  return (
    <div className="modal-shade">
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="close" onClick={close} aria-label="Close dialog">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
function Editor({
  fields,
  onSubmit,
  busy,
  label = "Save",
}: {
  fields: Field[];
  onSubmit: (d: any) => Promise<void>;
  busy: boolean;
  label?: string;
}) {
  const [values, setValues] = useState<any>(
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        f.value ??
          (f.type === "checkbox" ? false : f.options?.[0]?.value || ""),
      ]),
    ),
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    const d = { ...values };
    for (const f of fields) {
      if (f.type === "datetime-local" && d[f.key])
        d[f.key] = new Date(d[f.key]).toISOString();
    }
    await onSubmit(d);
  }
  return (
    <form onSubmit={submit} className="form-grid">
      {fields.map((f) => (
        <label
          className={f.type === "checkbox" ? "check" : "field"}
          key={f.key}
        >
          {f.type === "checkbox" ? (
            <>
              <input
                type="checkbox"
                checked={!!values[f.key]}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.checked })
                }
              />
              {f.label}
            </>
          ) : (
            <>
              {f.label}
              {f.options ? (
                <select
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  required={f.required !== false}
                  maxLength={4000}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  required={f.required !== false}
                  type={f.type || "text"}
                  value={values[f.key]}
                  onChange={(e) =>
                    setValues({ ...values, [f.key]: e.target.value })
                  }
                />
              )}
            </>
          )}
        </label>
      ))}
      <button disabled={busy} className="button" type="submit">
        {busy ? "Saving…" : label}
      </button>
    </form>
  );
}
export function CECWorkspace({
  section,
  embedded = false,
  initialTab = "",
  personal = false,
  initialChannel = "general",
}: {
  section: string;
  embedded?: boolean;
  initialTab?: string;
  personal?: boolean;
  initialChannel?: string;
}) {
  const Content = embedded ? "section" : "main";
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(initialTab),
    [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{
    title: string;
    fields: Field[];
    submit: (d: any) => Promise<void>;
    label?: string;
  } | null>(null);
  const [insight, setInsight] = useState<any>(null),
    [directory, setDirectory] = useState<any>(null),
    [authMode, setAuthMode] = useState("login");
  const [channel, setChannel] = useState(
      ["general", "events", "builders"].includes(initialChannel)
        ? initialChannel
        : "general",
    ),
    [message, setMessage] = useState("");
  const user = data?.user,
    isOfficer = user?.role === "officer",
    isMember = user && user.role !== "applicant";
  const records: Row[] = data?.items || [];
  const list = (kind: string) =>
    records.filter(
      (r) =>
        r.kind === kind &&
        (!query ||
          JSON.stringify(r.data).toLowerCase().includes(query.toLowerCase())),
    );
  const people: any[] = data?.people || [];
  const loadSequence = useRef(0);
  async function load() {
    const current = ++loadSequence.current;
    try {
      const r = await fetch("/api/cec/state", { cache: "no-store" });
      if (!r.ok)
        throw new Error("Unable to load the club workspace. Please try again.");
      const j = await r.json();
      if (current !== loadSequence.current) return;
      setData(j);
      setError("");
      if (section === "directory") {
        const response = await fetch("/api/cec/directory", {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Unable to load the shared directory.");
        const shared = await response.json();
        if (current === loadSequence.current) setDirectory(shared);
      }
    } catch (e) {
      if (current !== loadSequence.current) return;
      setData(null);
      setDirectory(null);
      throw e;
    }
  }
  useEffect(() => {
    setChannel(
      ["general", "events", "builders"].includes(initialChannel)
        ? initialChannel
        : "general",
    );
    setMessage("");
  }, [initialChannel]);
  useEffect(() => {
    setTab(initialTab);
    setQuery("");
    load().catch((e) => setError(e.message));
  }, [section, initialTab]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible")
        load().catch((e) => setError(e.message));
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("cec:changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer =
      section === "work" ? window.setInterval(refresh, 15000) : null;
    return () => {
      loadSequence.current++;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("cec:changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
      if (timer) clearInterval(timer);
    };
  }, [section]);
  useEffect(() => {
    setDialog(null);
    setInsight(null);
    setMessage("");
    setNotice("");
  }, [user?.id]);
  async function action(path: string, body: any) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/cec/" + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Unable to save.");
      window.dispatchEvent(new Event("cec:changed"));
      await load();
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function run(path: string, body: any) {
    try {
      await action(path, body);
      setNotice("Saved to the club record.");
    } catch {}
  }
  const button = (label: string, fn: () => void, secondary = false) => (
    <button
      disabled={busy}
      onClick={fn}
      className={"button small " + (secondary ? "secondary" : "")}
    >
      {label}
    </button>
  );
  function show(
    title: string,
    fields: Field[],
    submit: (d: any) => Promise<void>,
    label?: string,
  ) {
    setDialog({
      title,
      fields,
      submit: async (d) => {
        await submit(d);
        setDialog(null);
        setNotice("Saved to the club record.");
      },
      label,
    });
  }
  function create(kind: string, existing?: Row) {
    const title = { key: "title", label: "Title" };
    let fields: Field[] = [];
    switch (kind) {
      case "event":
        fields = [
          title,
          { key: "description", label: "About this event", type: "textarea" },
          { key: "location", label: "Location", value: "eHub Collegetown" },
          {
            key: "starts_at",
            label: "Starts (your local time)",
            type: "datetime-local",
          },
          {
            key: "ends_at",
            label: "Ends (your local time)",
            type: "datetime-local",
          },
          { key: "capacity", label: "Capacity", type: "number", value: "50" },
          {
            key: "status",
            label: "Visibility",
            options: fieldsFrom(["draft", "published"]),
          },
        ];
        break;
      case "task":
        fields = [
          title,
          {
            key: "assignee",
            label: "Owner",
            options: people
              .filter((p) => p.role !== "applicant")
              .map((p) => ({ value: p.id, label: p.name })),
          },
          {
            key: "due_at",
            label: "Due (your local time)",
            type: "datetime-local",
          },
          { key: "origin", label: "Origin / decision", required: false },
          {
            key: "project_id",
            label: "Project",
            options: [
              { value: "", label: "Club operations" },
              ...list("project").map((p) => ({
                value: p.id,
                label: p.data.title,
              })),
            ],
          },
        ];
        break;
      case "project":
        fields = [
          title,
          {
            key: "description",
            label: "What are you building?",
            type: "textarea",
          },
          {
            key: "stage",
            label: "Stage",
            options: fieldsFrom(["idea", "building", "launched"]),
          },
          {
            key: "url",
            label: "Project or repository link",
            type: "url",
            required: false,
          },
          {
            key: "shared",
            label:
              "Include this project in the opt-in directory when my profile is also shared.",
            type: "checkbox",
          },
        ];
        break;
      case "doc":
        fields = [
          title,
          { key: "url", label: "Document link", type: "url" },
          {
            key: "category",
            label: "Category",
            options: fieldsFrom([
              "Playbook",
              "Meeting notes",
              "Project",
              "Resource",
            ]),
          },
          {
            key: "description",
            label: "Context",
            type: "textarea",
            required: false,
          },
        ];
        break;
      case "meeting":
        fields = [
          title,
          { key: "starts_at", label: "Meeting time", type: "datetime-local" },
          { key: "agenda", label: "Agenda", type: "textarea" },
          {
            key: "decision",
            label: "Confirmed decisions (leave blank until agreed)",
            type: "textarea",
            required: false,
          },
        ];
        break;
      case "course":
        fields = [
          title,
          {
            key: "instructions",
            label: "Assignment and review expectations",
            type: "textarea",
          },
          {
            key: "url",
            label: "Learning resource",
            type: "url",
            required: false,
          },
        ];
        break;
      case "slot":
        fields = [
          title,
          { key: "starts_at", label: "Starts", type: "datetime-local" },
          { key: "ends_at", label: "Ends", type: "datetime-local" },
          { key: "location", label: "Meeting location or video link" },
        ];
        break;
      case "contact":
        fields = [
          { key: "title", label: "Contact name" },
          { key: "organization", label: "Organization" },
          { key: "email", label: "Email", type: "email", required: false },
          {
            key: "relationship",
            label: "Relationship",
            options: fieldsFrom([
              "Sponsor",
              "Mentor",
              "Employer",
              "Alumni",
              "Vendor",
            ]),
          },
          {
            key: "notes",
            label: "Relationship context",
            type: "textarea",
            required: false,
          },
        ];
        break;
      case "deal":
        fields = [
          title,
          {
            key: "contact_id",
            label: "Contact",
            options: list("contact").map((r) => ({
              value: r.id,
              label: r.data.title,
            })),
          },
          {
            key: "stage",
            label: "Stage",
            options: fieldsFrom([
              "lead",
              "contacted",
              "proposed",
              "signed",
              "fulfilled",
              "lost",
            ]),
          },
          { key: "amount", label: "Amount (USD)", value: "0" },
          { key: "next_step", label: "Next step", required: false },
        ];
        break;
      case "transaction":
        fields = [
          title,
          { key: "amount", label: "Amount (USD)" },
          {
            key: "direction",
            label: "Direction",
            options: fieldsFrom(["expense", "income"]),
          },
          { key: "category", label: "Budget category" },
          {
            key: "status",
            label: "Status",
            options: fieldsFrom(["planned", "approved", "paid"]),
          },
          {
            key: "receipt",
            label: "Receipt / invoice link",
            type: "url",
            required: false,
          },
        ];
        break;
      case "form":
        fields = [
          title,
          {
            key: "questions",
            label: "Questions (one per line; each is required)",
            type: "textarea",
          },
          {
            key: "open",
            label: "Open for responses from signed-in participants",
            type: "checkbox",
            value: true,
          },
        ];
        break;
    }
    if (existing)
      fields = fields.map((f) => {
        let value = existing.data[f.key];
        if (f.key === "amount")
          value = (existing.data.amount_cents / 100).toFixed(2);
        if (f.key === "questions")
          value = existing.data.fields.map((q: any) => q.label).join("\n");
        if (f.type === "datetime-local" && value) {
          const dt = new Date(value);
          value = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        }
        return { ...f, value };
      });
    show(
      (existing ? "Edit " : "New ") + kind.replace("_", " "),
      fields,
      async (d) => {
        if (kind === "task") d.status = existing?.data.status || "assigned";
        if (kind === "form") {
          d.fields = d.questions
            .split("\n")
            .filter((s: string) => s.trim())
            .map((label: string) => ({ label, required: true }));
          delete d.questions;
        }
        await action(existing ? "update" : "create", {
          kind,
          data: d,
          ...(existing ? { id: existing.id, version: existing.version } : {}),
        });
      },
    );
  }
  function update(r: Row, changes: any) {
    return run("update", {
      id: r.id,
      version: r.version,
      data: {
        ...r.data,
        ...changes,
        ...(r.kind === "deal"
          ? { amount: (r.data.amount_cents / 100).toFixed(2) }
          : {}),
        ...(r.kind === "transaction"
          ? { amount: (r.data.amount_cents / 100).toFixed(2) }
          : {}),
      },
    });
  }
  function login() {
    setAuthMode("login");
    window.location.href = cecRoutes.account;
  }
  const titles: Record<string, string> = {
    home: "Your club, in motion.",
    events: "Events & Startup Hours",
    work: "The workspace",
    people: "People & recruitment",
    crm: "Relationships",
    record: "The club record",
    account: "Your account",
    directory: "Builder directory",
    intake: "Your weekly update",
    schedule: "Your meetings",
  };
  const subtitles: Record<string, string> = {
    home: "The work, people, and decisions that move CEC forward.",
    events: "From the first RSVP to the last follow-up.",
    work: "Give every commitment an owner and every project a next step.",
    people: "Meet the next builders. Keep the process connected.",
    crm: "Keep context when people and leadership change.",
    record: "Understand what happened—and the evidence behind it.",
    account: "Your identity, interests, and sharing preferences.",
    directory: "Projects and profiles that members have chosen to share.",
    intake: "Confirm your context. Answer what is useful next.",
    schedule: "Confirmed plans, invitations, and your personal calendar feed.",
  };
  function Auth() {
    return (
      <div className="panel login">
        <h2>
          {authMode === "setup"
            ? "Set up the club"
            : authMode === "register"
              ? "Join the workspace"
              : "Welcome back"}
        </h2>
        <p className="muted">
          {authMode === "register"
            ? "Create a participant account. Club membership is approved separately."
            : "Cornell Entrepreneurship Club · Club OS"}
        </p>
        <Editor
          key={authMode}
          busy={busy}
          label={
            authMode === "login"
              ? "Sign in"
              : authMode === "setup"
                ? "Create officer account"
                : "Create account"
          }
          fields={[
            ...(authMode !== "login"
              ? [{ key: "name", label: "Your name" }]
              : []),
            { key: "email", label: "Email", type: "email" },
            {
              key: "password",
              label: "Password (at least 12 characters)",
              type: "password",
            },
            ...(authMode === "setup"
              ? [
                  {
                    key: "bootstrap",
                    label: "Workspace setup key",
                    type: "password",
                  },
                ]
              : []),
          ]}
          onSubmit={async (d) => {
            try {
              await action("auth/" + authMode, d);
              setNotice("You are signed in.");
            } catch {}
          }}
        />
        <div className="actions" style={{ marginTop: 18 }}>
          <button
            className="button secondary small"
            onClick={() =>
              setAuthMode(authMode === "login" ? "register" : "login")
            }
          >
            {authMode === "login"
              ? "Create an account"
              : "Already have an account?"}
          </button>
          {data?.setupNeeded && (
            <button
              className="button secondary small"
              onClick={() => setAuthMode("setup")}
            >
              Officer setup
            </button>
          )}
        </div>
        <p className="source-note">
          Email ownership is not yet verified. This account does not claim
          Cornell affiliation.
        </p>
      </div>
    );
  }
  function eventRows() {
    return list("event")
      .slice(0, 4)
      .map((e) => (
        <div className="row" key={e.id}>
          <div className="date-block">
            <small>
              {new Date(e.data.starts_at).toLocaleString("en-US", {
                month: "short",
              })}
            </small>
            <b>{new Date(e.data.starts_at).getDate()}</b>
          </div>
          <div className="detail">
            <strong>{e.data.title}</strong>
            <small>
              {dateLabel(e.data.starts_at)} ET · {e.data.location}
            </small>
          </div>
          {tag(e.data.status)}
        </div>
      ));
  }
  function Home() {
    return (
      <>
        {user && (
          <div className="notice">
            <Link href={cecRoutes.intake} className="link">
              Update what you are building and what help you need →
            </Link>
            <p>
              Up to three optional questions. Review and control what you share.
            </p>
          </div>
        )}
        {isMember && <ProjectSuggestions key={user.id} />}
        {!user && (
          <div className="notice">
            A working CEC workspace. Sign in to RSVP, apply, and book a coffee
            chat.{" "}
            <Link className="link" href={cecRoutes.account}>
              Sign in →
            </Link>
          </div>
        )}
        <div className="stats">
          {[
            [
              data?.stats?.published || list("event").length,
              "Published events",
              "Plan the next gathering",
            ],
            [
              data?.stats?.openTasks || 0,
              "Open commitments",
              "Across the club workspace",
            ],
            [
              data?.stats?.projects || 0,
              "Projects",
              "Ideas moving into action",
            ],
            [
              isOfficer
                ? people.filter((p) => p.role !== "applicant").length
                : "CEC",
              isOfficer ? "Club members" : "Cornell community",
              isOfficer ? "Approved membership" : "Build, learn, connect",
            ],
          ].map(([n, label, detail]) => (
            <div className="stat" key={String(label)}>
              <label>{label}</label>
              <strong>{n}</strong>
              <small>{detail}</small>
            </div>
          ))}
        </div>
        <div className="columns">
          <div>
            <div className="panel">
              <div className="panel-head">
                <h2>On the calendar</h2>
                <Link href={cecRoutes.events}>
                  All events <ArrowUpRight />
                </Link>
              </div>
              {list("event").length
                ? eventRows()
                : empty(
                    "Your next Startup Hours starts here. An officer can create a draft, set capacity, and publish the registration page.",
                  )}
            </div>
            <div className="panel">
              <div className="panel-head">
                <h2>Commitments</h2>
                <Link href={cecRoutes.work}>Open workspace →</Link>
              </div>
              {list("task")
                .filter(
                  (r) => !["completed", "cancelled"].includes(r.data.status),
                )
                .slice(0, 5)
                .map((t) => (
                  <div className="row" key={t.id}>
                    <div>
                      <strong>{t.data.title}</strong>
                      <small>
                        {people.find((p) => p.id === t.data.assignee)?.name ||
                          "Assigned member"}{" "}
                        · {dateLabel(t.data.due_at)} ET
                      </small>
                    </div>
                    {tag(t.data.status)}
                  </div>
                ))}
              {!list("task").length &&
                empty(
                  "No commitments yet. Capture the next agreed action, its owner, and its deadline.",
                )}
            </div>
          </div>
          <div>
            <div className="panel">
              <div className="eyebrow">The Cornell pilot</div>
              <h2>A home for builders.</h2>
              <p className="muted">
                CEC brings students together around founder events,
                venture-building, and practical learning.
              </p>
              <div className="resource">
                <strong>Startup Hours</strong>
                <p className="muted">
                  Work on projects, find advice, and meet other builders.
                </p>
              </div>
              <div className="resource">
                <strong>Recruitment tracks</strong>
                <p className="muted">Events · Media · Generalist</p>
                <Link className="link" href={cecRoutes.people}>
                  Explore recruitment →
                </Link>
              </div>
              <p className="source-note">
                Based on{" "}
                <a
                  href="https://www.cornellec.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CEC
                </a>{" "}
                and{" "}
                <a
                  href="https://eship.cornell.edu/event/startup-hours/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Cornell’s Startup Hours listing
                </a>
                . Dates are set by officers.
              </p>
            </div>
            <div className="panel">
              <h2>Campus resources</h2>
              <a
                className="link"
                href="https://eship.cornell.edu/item/ehub/"
                target="_blank"
                rel="noreferrer"
              >
                eHub access & room reservations ↗
              </a>
              <p className="source-note">
                External university process. A calendar entry does not reserve a
                room.
              </p>
              <a
                className="link"
                href="https://eship.cornell.edu/cornell-startups/how-to-launch-a-startup-at-cornell/"
                target="_blank"
                rel="noreferrer"
              >
                Cornell startup resources ↗
              </a>
            </div>
          </div>
        </div>
      </>
    );
  }
  function Events() {
    return (
      <>
        <div className="actions" style={{ marginBottom: 22 }}>
          {isOfficer && button("New event", () => create("event"))}
          <a className="button secondary small" href="/api/cec/calendar">
            Download calendar
          </a>
        </div>
        <div className="cards">
          {list("event").map((e) => {
            const rsvps = (data?.rsvps || []).filter(
              (r: any) => r.event_id === e.id,
            );
            const mine = rsvps.find((r: any) => r.user_id === user?.id);
            return (
              <article className="event-card" key={e.id}>
                <div className="event-band" />
                <div className="event-body">
                  {tag(e.data.status)}
                  <h2>{e.data.title}</h2>
                  <p>{dateLabel(e.data.starts_at)} ET</p>
                  <p className="muted">{e.data.location}</p>
                  <p className="muted">{e.data.description}</p>
                  <div className="metrics">
                    <div>
                      <b>
                        {isOfficer
                          ? rsvps.filter((r: any) => r.status === "yes").length
                          : e.data.capacity}
                      </b>
                      <span>{isOfficer ? "Going" : "Capacity"}</span>
                    </div>
                    {isOfficer && (
                      <div>
                        <b>
                          {
                            rsvps.filter((r: any) => r.attendance === "present")
                              .length
                          }
                        </b>
                        <span>Checked in</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="event-foot">
                  <div className="actions">
                    {!user
                      ? button("Sign in to RSVP", login)
                      : e.data.status === "published" &&
                          new Date(e.data.starts_at) > new Date()
                        ? button(
                            mine?.status === "yes"
                              ? "Cancel RSVP"
                              : mine?.status === "waitlist"
                                ? "Leave waitlist"
                                : "RSVP",
                            () =>
                              run("rsvp", {
                                event_id: e.id,
                                status:
                                  mine && mine.status !== "no" ? "no" : "yes",
                              }),
                          )
                        : tag("registration closed")}
                    {mine && tag(mine.status)}
                  </div>
                  <a className="link" href={"/api/cec/calendar?event=" + e.id}>
                    Calendar ↗
                  </a>
                </div>
                {isOfficer && (
                  <div className="event-foot">
                    <div className="actions">
                      {e.data.status !== "closed" &&
                        button("Edit", () => create("event", e), true)}
                      {e.data.status === "draft" &&
                        button("Publish", () =>
                          update(e, { status: "published" }),
                        )}
                      {e.data.status === "published" &&
                        button(
                          "Close event",
                          () => update(e, { status: "closed" }),
                          true,
                        )}
                      {e.data.status === "published" &&
                        button(
                          "Forecast",
                          async () => {
                            try {
                              setInsight(
                                await action("quant/forecast", {
                                  event_id: e.id,
                                }),
                              );
                            } catch {}
                          },
                          true,
                        )}
                    </div>
                  </div>
                )}
                {isOfficer && rsvps.length > 0 && (
                  <details style={{ padding: "0 24px 20px" }}>
                    <summary>Attendees & check-in ({rsvps.length})</summary>
                    {rsvps.map((r: any) => (
                      <div className="row" key={r.user_id}>
                        <div>
                          <strong>{r.name}</strong>
                          <small>
                            {r.status} · {r.attendance || "not recorded"}
                          </small>
                        </div>
                        <div className="actions">
                          {button(
                            "Present",
                            () =>
                              run("attendance", {
                                event_id: e.id,
                                user_id: r.user_id,
                                status: "present",
                              }),
                            true,
                          )}
                          {button(
                            "Absent",
                            () =>
                              run("attendance", {
                                event_id: e.id,
                                user_id: r.user_id,
                                status: "absent",
                              }),
                            true,
                          )}
                        </div>
                      </div>
                    ))}
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {!list("event").length &&
          empty(
            "No events published yet. Create a Startup Hours event when its date and venue are confirmed.",
          )}
      </>
    );
  }
  function Tabs({ values }: { values: string[] }) {
    return (
      <div className="tabs">
        {values.map((v, i) => (
          <button
            className={(tab || values[0]) === v ? "active" : ""}
            key={v}
            onClick={() => setTab(v)}
          >
            {v}
          </button>
        ))}
      </div>
    );
  }
  function Work() {
    const current = tab || "Tasks";
    if (!user) return Auth();
    return (
      <>
        <Tabs
          values={[
            "Tasks",
            "Projects",
            "Documents",
            "Meetings",
            "Learning",
            "Forms",
            "Inbox",
          ]}
        />
        {!isMember ? (
          empty(
            "This part of the workspace is available to approved club members.",
          )
        ) : (
          <>
            {current === "Tasks" && (
              <div className="panel">
                <div className="panel-head">
                  <h2>Commitments</h2>
                  {isOfficer && button("Assign task", () => create("task"))}
                </div>
                {list("task").map((r) => (
                  <div className="row" key={r.id}>
                    <div className="detail">
                      <strong>{r.data.title}</strong>
                      <small>
                        {people.find((p) => p.id === r.data.assignee)?.name} ·{" "}
                        {dateLabel(r.data.due_at)} ET
                      </small>
                      {r.data.origin && (
                        <p className="source-note">From: {r.data.origin}</p>
                      )}
                    </div>
                    {tag(r.data.status)}
                    <div className="actions">
                      {r.data.assignee === user.id &&
                        r.data.status === "assigned" &&
                        button(
                          "Accept",
                          () =>
                            run("task.status", {
                              id: r.id,
                              status: "accepted",
                            }),
                          true,
                        )}
                      {r.data.assignee === user.id &&
                        r.data.status === "accepted" &&
                        button("Submit", () =>
                          run("task.status", { id: r.id, status: "submitted" }),
                        )}
                      {isOfficer &&
                        r.data.status === "submitted" &&
                        button("Approve", () =>
                          run("task.status", { id: r.id, status: "completed" }),
                        )}
                      {(isOfficer || r.data.assignee === user.id) &&
                        ["accepted", "submitted"].includes(r.data.status) &&
                        button(
                          "Blocked",
                          () =>
                            show(
                              "What is blocking this task?",
                              [
                                {
                                  key: "category",
                                  label: "Blocker",
                                  options: fieldsFrom([
                                    "waiting_on_person",
                                    "waiting_on_external_partner",
                                    "need_information",
                                    "need_approval",
                                    "need_resources",
                                    "scope_unclear",
                                    "technical_issue",
                                    "time_constraint",
                                    "other",
                                  ]),
                                },
                                {
                                  key: "note",
                                  label: "What help is needed?",
                                  type: "textarea",
                                },
                              ],
                              async (d) => {
                                await action("evidence/block", {
                                  task_id: r.id,
                                  ...d,
                                });
                              },
                            ),
                          true,
                        )}
                      {isOfficer &&
                        r.data.status === "submitted" &&
                        button(
                          "Request revision",
                          () =>
                            run("task.status", {
                              id: r.id,
                              status: "accepted",
                            }),
                          true,
                        )}
                      {isOfficer &&
                        !["completed", "cancelled"].includes(r.data.status) &&
                        button(
                          "Cancel",
                          () =>
                            run("task.status", {
                              id: r.id,
                              status: "cancelled",
                            }),
                          true,
                        )}
                    </div>
                  </div>
                ))}
                {!list("task").length &&
                  empty(
                    "Assign the first task. Completion requires an officer review.",
                  )}
              </div>
            )}
            {current === "Projects" && (
              <>
                <div className="actions" style={{ marginBottom: 20 }}>
                  {button("New project", () => create("project"))}
                </div>
                <div className="cards">
                  {list("project").map((r) => (
                    <div className="panel" key={r.id}>
                      {tag(r.data.stage)}
                      <h2 style={{ marginTop: 15 }}>{r.data.title}</h2>
                      <p className="muted">{r.data.description}</p>
                      {r.data.url && (
                        <a
                          className="link"
                          href={r.data.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open project ↗
                        </a>
                      )}
                      <div className="actions" style={{ marginTop: 18 }}>
                        {(isOfficer || r.owner === user.id) &&
                          button(
                            r.data.shared
                              ? "Make private"
                              : "Share in directory",
                            () => update(r, { shared: !r.data.shared }),
                            true,
                          )}
                        {(isOfficer || r.owner === user.id) &&
                          r.data.stage !== "launched" &&
                          button(
                            r.data.stage === "idea"
                              ? "Start building"
                              : "Mark launched",
                            () =>
                              update(r, {
                                stage:
                                  r.data.stage === "idea"
                                    ? "building"
                                    : "launched",
                              }),
                          )}
                      </div>
                      <p className="source-note">
                        {r.data.shared
                          ? "Directory visibility also requires the owner’s profile opt-in."
                          : "Visible within the club."}
                      </p>
                    </div>
                  ))}
                </div>
                {!list("project").length &&
                  empty("Add a project, its stage, and a link to the work.")}
              </>
            )}
            {current === "Documents" && (
              <div className="panel">
                <div className="panel-head">
                  <h2>Shared knowledge</h2>
                  {button("Link document", () => create("doc"))}
                </div>
                {list("doc").map((r) => (
                  <div className="row" key={r.id}>
                    <div>
                      <strong>{r.data.title}</strong>
                      <small>
                        {r.data.category} · {r.data.description}
                      </small>
                    </div>
                    <a
                      className="button secondary small"
                      href={r.data.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open ↗
                    </a>
                  </div>
                ))}
                <p className="source-note">
                  Linked documents retain their source permissions. Content is
                  not imported or analyzed automatically.
                </p>
              </div>
            )}
            {current === "Meetings" && (
              <div className="panel">
                <div className="panel-head">
                  <h2>Meetings & decisions</h2>
                  {isOfficer && button("New meeting", () => create("meeting"))}
                </div>
                {list("meeting").map((r) => (
                  <div className="row" key={r.id}>
                    <div className="detail">
                      <strong>{r.data.title}</strong>
                      <small>{dateLabel(r.data.starts_at)} ET</small>
                      <p style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
                        {r.data.agenda}
                      </p>
                      {r.data.decision && (
                        <div className="resource">
                          <strong>Confirmed decision</strong>
                          <p>{r.data.decision}</p>
                        </div>
                      )}
                    </div>
                    {isOfficer &&
                      button(
                        "Record decision",
                        () =>
                          show(
                            "Record confirmed decision",
                            [
                              {
                                key: "decision",
                                label: "Decision",
                                type: "textarea",
                                value: r.data.decision,
                              },
                            ],
                            async (d) => {
                              await action("update", {
                                id: r.id,
                                version: r.version,
                                data: { ...r.data, ...d },
                              });
                            },
                          ),
                        true,
                      )}
                  </div>
                ))}
                {!list("meeting").length &&
                  empty(
                    "Keep the agenda and confirmed decisions together. Assign follow-ups in Tasks.",
                  )}
              </div>
            )}
            {current === "Learning" && (
              <>
                <div className="actions" style={{ marginBottom: 20 }}>
                  {isOfficer &&
                    button("New assignment", () => create("course"))}
                </div>
                {list("course").map((r) => (
                  <div className="panel" key={r.id}>
                    <h2>{r.data.title}</h2>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {r.data.instructions}
                    </p>
                    {r.data.url && (
                      <a
                        className="link"
                        href={r.data.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Learning resource ↗
                      </a>
                    )}
                    <div className="actions" style={{ marginTop: 18 }}>
                      {button("Submit work", () =>
                        show(
                          "Submit work",
                          [
                            {
                              key: "url",
                              label: "Deliverable link",
                              type: "url",
                            },
                            {
                              key: "note",
                              label: "Context",
                              type: "textarea",
                              required: false,
                            },
                          ],
                          async (d) => {
                            await action("submit", { course_id: r.id, ...d });
                          },
                        ),
                      )}
                    </div>
                    {(data.submissions || [])
                      .filter((s: any) => s.course_id === r.id)
                      .map((s: any) => (
                        <div className="row" key={s.id}>
                          <div>
                            <strong>{s.name || "Your submission"}</strong>
                            <a
                              className="link"
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View work ↗
                            </a>
                            <p className="source-note">{s.note}</p>
                            {s.feedback && <p>{s.feedback}</p>}
                          </div>
                          {tag(s.status)}
                          {isOfficer &&
                            button(
                              "Review",
                              () =>
                                show(
                                  "Review submission",
                                  [
                                    {
                                      key: "status",
                                      label: "Result",
                                      options: fieldsFrom([
                                        "reviewed",
                                        "revision",
                                      ]),
                                    },
                                    {
                                      key: "feedback",
                                      label: "Feedback",
                                      type: "textarea",
                                    },
                                  ],
                                  async (d) => {
                                    await action("submission.review", {
                                      id: s.id,
                                      ...d,
                                    });
                                  },
                                ),
                              true,
                            )}
                        </div>
                      ))}
                  </div>
                ))}
              </>
            )}
            {current === "Forms" && (
              <div className="panel">
                <div className="panel-head">
                  <h2>Club forms</h2>
                  {isOfficer && button("Create form", () => create("form"))}
                </div>
                {list("form").map((r) => (
                  <div key={r.id} className="row">
                    <div>
                      <strong>{r.data.title}</strong>
                      <small>
                        {r.data.fields.length} questions ·{" "}
                        {r.data.open ? "Open" : "Closed"}
                      </small>
                    </div>
                    <div className="actions">
                      {r.data.open &&
                        button(
                          "Respond",
                          () =>
                            show(
                              r.data.title,
                              r.data.fields.map((q: any) => ({
                                key: q.id,
                                label: q.label,
                                required: q.required,
                                type: "textarea",
                              })),
                              async (answers) => {
                                await action("respond", {
                                  form_id: r.id,
                                  answers,
                                });
                              },
                              "Submit response",
                            ),
                          true,
                        )}
                      {isOfficer &&
                        button(
                          r.data.open ? "Close" : "Open",
                          () => update(r, { open: !r.data.open }),
                          true,
                        )}
                      {isOfficer &&
                        button(
                          "Responses",
                          () =>
                            setInsight({
                              title: r.data.title,
                              responses: (data.responses || [])
                                .filter((s: any) => s.form_id === r.id)
                                .map((s: any) => ({
                                  name: s.name,
                                  answers: JSON.parse(s.answers),
                                })),
                            }),
                          true,
                        )}
                    </div>
                  </div>
                ))}
                {!list("form").length &&
                  empty(
                    "Create an event-interest, feedback, or club operations form.",
                  )}
              </div>
            )}
            {current === "Inbox" && (
              <div className="panel">
                <div className="panel-head">
                  <h2>Club conversation</h2>
                  <select
                    style={{ width: 180 }}
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                  >
                    {["general", "events", "builders"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <ChatScheduler
                  key={channel}
                  messages={(data.messages || []).filter(
                    (m: any) => m.channel === channel,
                  )}
                  people={people}
                  userId={user.id}
                />
                <div className="thread">
                  {(data.messages || [])
                    .filter((m: any) => m.channel === channel)
                    .reverse()
                    .map((m: any) => (
                      <div className="message" key={m.id}>
                        <strong>{m.name}</strong>{" "}
                        <small>{dateLabel(m.created_at)} ET</small>
                        <p>{m.body}</p>
                      </div>
                    ))}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await action("message", { channel, body: message });
                      setMessage("");
                    } catch {}
                  }}
                  className="form-grid"
                  style={{ marginTop: 20 }}
                >
                  <label className="field">
                    Message #{channel}
                    <textarea
                      required
                      maxLength={4000}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Send message
                  </button>
                </form>
                <p className="source-note">
                  Messages stay in the club conversation. Message content is not
                  sent to the quant engine.
                </p>
              </div>
            )}
          </>
        )}
      </>
    );
  }
  function People() {
    const current = tab || "Recruitment";
    if (!user) return Auth();
    return (
      <>
        <Tabs
          values={[
            "Recruitment",
            "Coffee chats",
            ...(isOfficer ? ["Weekly context"] : []),
            ...(isMember ? ["Roster"] : []),
            "Forms",
          ]}
        />
        {current === "Recruitment" &&
          (isOfficer ? (
            <div className="panel">
              <h2>Recruitment pipeline</h2>
              {!data.applications.length &&
                empty(
                  "Applications will appear here after participants submit.",
                )}
              {data.applications.map((a: any) => (
                <div className="row" key={a.user_id}>
                  <div className="detail">
                    <strong>{a.name}</strong>
                    <small>
                      {a.track} · {a.email}
                    </small>
                    <p style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                      {a.statement}
                    </p>
                    {a.url && (
                      <a
                        className="link"
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Project evidence ↗
                      </a>
                    )}
                    {a.review && (
                      <p className="source-note">Internal review: {a.review}</p>
                    )}
                  </div>
                  {tag(a.stage)}
                  {button(
                    "Review",
                    () =>
                      show(
                        "Review " + a.name,
                        [
                          {
                            key: "stage",
                            label: "Decision",
                            options: fieldsFrom([
                              "review",
                              "accepted",
                              "declined",
                            ]),
                            value: a.stage === "submitted" ? "review" : a.stage,
                          },
                          {
                            key: "review",
                            label: "Internal review note",
                            type: "textarea",
                            required: false,
                            value: a.review,
                          },
                        ],
                        async (d) => {
                          await action("application.review", {
                            user_id: a.user_id,
                            ...d,
                          });
                        },
                      ),
                    true,
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="panel">
              <h2>Apply to CEC</h2>
              <p className="muted">
                Choose the work you want to contribute to. This application is
                stored in this workspace; it does not submit to the existing
                external CEC Google Form.
              </p>
              {data.applications.length ? (
                data.applications.map((a: any) => (
                  <div className="row" key={a.user_id}>
                    <div>
                      <strong>{a.track}</strong>
                      <p>{a.statement}</p>
                    </div>
                    {tag(a.stage)}
                  </div>
                ))
              ) : (
                <Editor
                  busy={busy}
                  label="Submit application"
                  fields={[
                    {
                      key: "track",
                      label: "Track",
                      options: fieldsFrom(["Events", "Media", "Generalist"]),
                    },
                    {
                      key: "statement",
                      label:
                        "What do you want to build or contribute? Tell us about your work.",
                      type: "textarea",
                    },
                    {
                      key: "url",
                      label: "Project or portfolio link",
                      type: "url",
                      required: false,
                    },
                  ]}
                  onSubmit={async (d) => {
                    try {
                      await action("apply", d);
                      setNotice("Application submitted.");
                    } catch {}
                  }}
                />
              )}
              <p className="source-note">
                Tracks verified on{" "}
                <a
                  href="https://www.cornellec.com/recruitment"
                  target="_blank"
                  rel="noreferrer"
                >
                  CEC’s recruitment page
                </a>
                . Current deadlines require officer confirmation.
              </p>
            </div>
          ))}
        {current === "Weekly context" && isOfficer && (
          <SharedAdaptiveProfiles />
        )}
        {current === "Coffee chats" && (
          <div className="panel">
            <div className="panel-head">
              <h2>Meet the club</h2>
              {isOfficer && button("Add availability", () => create("slot"))}
            </div>
            {list("slot").map((r) => {
              const booking = data.bookings.find(
                (b: any) => b.slot_id === r.id,
              );
              return (
                <div className="row" key={r.id}>
                  <div className="detail">
                    <strong>{r.data.title}</strong>
                    <small>
                      {dateLabel(r.data.starts_at)} ET · {r.data.location}
                    </small>
                    {booking?.name && (
                      <p className="source-note">Booked by {booking.name}</p>
                    )}
                  </div>
                  {booking
                    ? isOfficer || booking.user_id === user.id
                      ? button(
                          "Cancel booking",
                          () => run("booking.cancel", { slot_id: r.id }),
                          true,
                        )
                      : tag("booked")
                    : new Date(r.data.starts_at) > new Date()
                      ? button("Book chat", () =>
                          run("book", { slot_id: r.id }),
                        )
                      : tag("past")}
                </div>
              );
            })}
            {!list("slot").length &&
              empty(
                "Officers can add coffee-chat availability. Booking prevents duplicate and overlapping reservations.",
              )}
          </div>
        )}
        {current === "Roster" && isMember && (
          <div className="panel">
            <h2>People</h2>
            <input
              className="search"
              aria-label="Search people"
              placeholder="Search people…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    {isOfficer && <th>Email</th>}
                    <th>Interests</th>
                  </tr>
                </thead>
                <tbody>
                  {people
                    .filter((p) =>
                      p.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{tag(p.role)}</td>
                        {isOfficer && <td>{p.email}</td>}
                        <td>{p.interests || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {current === "Forms" && (
          <div className="panel">
            <div className="panel-head">
              <h2>Open forms</h2>
              {isOfficer && button("New form", () => create("form"))}
            </div>
            {list("form")
              .filter((r) => r.data.open)
              .map((r) => (
                <div className="row" key={r.id}>
                  <div>
                    <strong>{r.data.title}</strong>
                    <small>{r.data.fields.length} questions</small>
                  </div>
                  {button("Respond", () =>
                    show(
                      r.data.title,
                      r.data.fields.map((q: any) => ({
                        key: q.id,
                        label: q.label,
                        type: "textarea",
                        required: q.required,
                      })),
                      async (answers) => {
                        await action("respond", { form_id: r.id, answers });
                      },
                      "Submit response",
                    ),
                  )}
                </div>
              ))}
          </div>
        )}
      </>
    );
  }
  function CRM() {
    if (!isOfficer)
      return empty(
        "Relationship and financial records are available to officers.",
      );
    const current = tab || "Contacts";
    return (
      <>
        <Tabs values={["Contacts", "Opportunities", "Money"]} />
        {current === "Contacts" && (
          <div className="panel">
            <div className="panel-head">
              <h2>Relationship directory</h2>
              {button("Add contact", () => create("contact"))}
            </div>
            {list("contact").map((r) => (
              <div className="row" key={r.id}>
                <div>
                  <strong>{r.data.title}</strong>
                  <small>
                    {r.data.organization} · {r.data.email}
                  </small>
                  <p className="source-note">{r.data.notes}</p>
                </div>
                {tag(r.data.relationship)}
              </div>
            ))}
            {!list("contact").length &&
              empty(
                "Keep sponsors, mentors, alumni, employers, and vendors connected to the club.",
              )}
          </div>
        )}
        {current === "Opportunities" && (
          <div className="panel">
            <div className="panel-head">
              <h2>Opportunity pipeline</h2>
              {list("contact").length ? (
                button("New opportunity", () => create("deal"))
              ) : (
                <span className="muted">Add a contact first</span>
              )}
            </div>
            {list("deal").map((r) => (
              <div className="row" key={r.id}>
                <div className="detail">
                  <strong>{r.data.title}</strong>
                  <small>
                    {
                      list("contact").find((c) => c.id === r.data.contact_id)
                        ?.data.title
                    }{" "}
                    · {money(r.data.amount_cents)}
                  </small>
                  <p>{r.data.next_step}</p>
                </div>
                {tag(r.data.stage)}
                {button(
                  "Update",
                  () =>
                    show(
                      "Update opportunity",
                      [
                        {
                          key: "stage",
                          label: "Stage",
                          value: r.data.stage,
                          options: fieldsFrom([
                            "lead",
                            "contacted",
                            "proposed",
                            "signed",
                            "fulfilled",
                            "lost",
                          ]),
                        },
                        {
                          key: "next_step",
                          label: "Next step",
                          value: r.data.next_step,
                          required: false,
                        },
                      ],
                      async (d) => {
                        await action("update", {
                          id: r.id,
                          version: r.version,
                          data: {
                            ...r.data,
                            ...d,
                            amount: (r.data.amount_cents / 100).toFixed(2),
                          },
                        });
                      },
                    ),
                  true,
                )}
              </div>
            ))}
            {!list("deal").length &&
              empty(
                "Track opportunities from first contact through fulfillment. Pipeline amounts are not received revenue.",
              )}
          </div>
        )}
        {current === "Money" && (
          <div className="panel">
            <div className="panel-head">
              <h2>Club money</h2>
              {button("Record item", () => create("transaction"))}
            </div>
            <p className="muted">
              A register of planned, approved, and paid items. No bank or
              payment processor is connected.
            </p>
            <div className="metrics">
              <div>
                <b>
                  {money(
                    list("transaction")
                      .filter(
                        (r) =>
                          r.data.status === "paid" &&
                          r.data.direction === "income",
                      )
                      .reduce((a, r) => a + r.data.amount_cents, 0),
                  )}
                </b>
                <span>Recorded income paid</span>
              </div>
              <div>
                <b>
                  {money(
                    list("transaction")
                      .filter(
                        (r) =>
                          r.data.status === "paid" &&
                          r.data.direction === "expense",
                      )
                      .reduce((a, r) => a + r.data.amount_cents, 0),
                  )}
                </b>
                <span>Recorded expenses paid</span>
              </div>
            </div>
            {list("transaction").map((r) => (
              <div className="row" key={r.id}>
                <div className="detail">
                  <strong>{r.data.title}</strong>
                  <small>
                    {r.data.category} · {r.data.direction}
                  </small>
                  {r.data.receipt && (
                    <a
                      className="link"
                      style={{ display: "block" }}
                      href={r.data.receipt}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Receipt ↗
                    </a>
                  )}
                </div>
                <strong>{money(r.data.amount_cents)}</strong>
                {tag(r.data.status)}
                {r.data.status !== "paid" &&
                  button(
                    r.data.status === "planned" ? "Approve" : "Mark paid",
                    () =>
                      update(r, {
                        status:
                          r.data.status === "planned" ? "approved" : "paid",
                      }),
                    true,
                  )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }
  function Record() {
    if (!isOfficer)
      return empty(
        "Internal audit and quantitative tools are available to officers. Export your accessible records from Account.",
      );
    return (
      <div className="columns">
        <div className="panel">
          <div className="panel-head">
            <h2>Activity ledger</h2>
            <a className="link" href="/api/cec/export">
              Export record
            </a>
          </div>
          {data.audit.map((r: any) => (
            <div className="row" key={r.id}>
              <div className="detail">
                <strong>{r.action.replaceAll(".", " · ")}</strong>
                <small>
                  {r.name || "Club service"} · {dateLabel(r.at)} ET
                </small>
                <p className="source-note">Record {r.object_id.slice(0, 12)}</p>
              </div>
              <span className="tag">#{r.seq}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="panel">
            <div className="eyebrow">Quant engine</div>
            <h2>Evidence before estimates.</h2>
            <p className="muted">
              Forecasts use recorded RSVP and attendance outcomes. Missing
              check-ins remain unknown.
            </p>
            <div className="metrics">
              <div>
                <b>{data.outbox?.count || 0}</b>
                <span>Records awaiting delivery</span>
              </div>
            </div>
            {button(
              "Retry synchronization",
              () => run("quant/retry", {}),
              true,
            )}
            <p className="source-note">
              Request attendance forecasts from an event. They do not rank
              individuals.
            </p>
          </div>
          <div className="panel">
            <h2>Project duration scenario</h2>
            <p className="muted">
              Explore a draft and review process using declared duration
              estimates.
            </p>
            <Editor
              busy={busy}
              label="Run simulation"
              fields={[
                {
                  key: "draft",
                  label: "Likely draft duration (days)",
                  type: "number",
                  value: "2",
                },
                {
                  key: "review",
                  label: "Likely review duration (days)",
                  type: "number",
                  value: "1",
                },
                {
                  key: "deadline",
                  label: "Deadline from start (days)",
                  type: "number",
                  value: "5",
                },
              ]}
              onSubmit={async (d) => {
                const a = Number(d.draft),
                  b = Number(d.review);
                try {
                  setInsight(
                    await action("quant/plan", {
                      tasks: [
                        {
                          id: "draft",
                          dependencies: [],
                          optimistic: a / 2,
                          likely: a,
                          pessimistic: a * 2,
                        },
                        {
                          id: "review",
                          dependencies: ["draft"],
                          optimistic: b / 2,
                          likely: b,
                          pessimistic: b * 2,
                        },
                      ],
                      deadline_days: Number(d.deadline),
                      draws: 2000,
                      seed: 42,
                    }),
                  );
                } catch {}
              }}
            />
          </div>
        </div>
      </div>
    );
  }
  function Account() {
    if (!user) return Auth();
    return (
      <div className="columns">
        <div className="panel">
          <h2>Your profile</h2>
          <p className="muted">
            {user.email} · {user.role}
          </p>
          <Editor
            busy={busy}
            fields={[
              { key: "name", label: "Name", value: user.name },
              {
                key: "interests",
                label: "What are you interested in building?",
                type: "textarea",
                required: false,
                value: user.interests,
              },
              {
                key: "shared",
                label:
                  "Share my name and interests in the public builder directory. Shared projects appear only when I also opt in here.",
                type: "checkbox",
                value: !!user.shared,
              },
            ]}
            onSubmit={async (d) => {
              try {
                await action("profile", d);
                setNotice("Profile updated.");
              } catch {}
            }}
          />
          <div className="actions" style={{ marginTop: 22 }}>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => run("auth/logout", {})}
            >
              <SignOut size={18} /> Sign out
            </button>
            <a href="/api/cec/export" className="button secondary">
              Export accessible record
            </a>
            <Link className="link" href={cecRoutes.directory}>
              View directory ↗
            </Link>
          </div>
        </div>
        <div>
          <div className="panel">
            <h2>Connections</h2>
            {[
              [
                "Calendar",
                "Download published events as an ICS file.",
                "/api/cec/calendar",
              ],
              [
                "Google Docs",
                "Link documents. Source permissions still apply.",
                cecRoutes.work,
              ],
            ].map(([name, detail, href]) => (
              <div className="row" key={name}>
                <div>
                  <strong>{name}</strong>
                  <small>{detail}</small>
                </div>
                <a className="link" href={href}>
                  Open ↗
                </a>
              </div>
            ))}
            {[
              "Google OAuth sync",
              "Slack synchronization",
              "Canvas",
              "University sign-in",
            ].map((name) => (
              <div className="row" key={name}>
                <strong>{name}</strong>
                {tag("not configured")}
              </div>
            ))}
            <p className="source-note">
              Live synchronization requires account credentials and
              authorization.
            </p>
          </div>
          <div className="panel">
            <h2>Data in context</h2>
            <p className="muted">
              Recruitment reviews and messages never appear in the public
              directory. Disabling profile sharing removes your directory entry
              and shared projects.
            </p>
          </div>
        </div>
      </div>
    );
  }
  function Directory() {
    return (
      <>
        <div className="notice">
          Only explicitly shared member profiles and projects appear here. No
          inferred scores or private recruitment notes are shared.
        </div>
        {!directory ? (
          empty("Loading shared projects…")
        ) : (
          <>
            <div className="cards">
              {directory.projects?.map((p: any) => (
                <div className="panel" key={p.id}>
                  {tag(p.stage)}
                  <h2 style={{ marginTop: 12 }}>{p.title}</h2>
                  <p>{p.description}</p>
                  <p className="muted">
                    {directory.people.find((u: any) => u.id === p.owner)?.name}
                  </p>
                  {p.url && (
                    <a
                      className="link"
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View project ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
            <div className="panel">
              <h2>Builders</h2>
              {directory.people?.map((p: any) => (
                <div className="row" key={p.id}>
                  <div>
                    <strong>{p.name}</strong>
                    <p className="muted">
                      {p.interests || "No interests shared yet."}
                    </p>
                  </div>
                </div>
              ))}
              {!directory.people?.length &&
                empty(
                  "No profiles shared yet. Members can opt in from Account.",
                )}
            </div>
          </>
        )}
      </>
    );
  }
  return (
    <div className={embedded ? "cec embedded" : "cec"}>
      {!embedded && (
        <aside className="rail">
          <Link href={cecRoutes.home} className="brand">
            <span className="monogram">C</span> Club OS
          </Link>
          <div className="club-label">
            <div className="eyebrow">Cornell University</div>
            <strong>
              Entrepreneurship
              <br />
              Club
            </strong>
          </div>
          <nav aria-label="Club workspace">
            {navigation.map(([key, label, Icon]) => (
              <Link
                key={key}
                href={cecRoutes[key] || cecRoutes.home}
                className={section === key ? "active" : ""}
              >
                <Icon size={19} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="rail-foot">
            <strong style={{ fontSize: 14 }}>
              {user?.name || "Welcome to CEC"}
            </strong>
            <small>{user?.role || "Explore the community"}</small>
            <Link href={cecRoutes.account} className="link">
              {user ? "Account & connections" : "Sign in"}
            </Link>
          </div>
        </aside>
      )}
      <div className="surface">
        <header className="topbar">
          <div>
            CEC <span>/ {titles[section] || "Workspace"}</span>
          </div>
          <div className="actions">
            <Link href={cecRoutes.account} className="link">
              {user ? "Account" : "Sign in"}
            </Link>
            <Link href={cecRoutes.directory} className="link">
              Builder directory
            </Link>
            {user && (
              <button
                className="button secondary small"
                aria-label="Sign out"
                onClick={() => run("auth/logout", {})}
              >
                <SignOut size={18} />
              </button>
            )}
          </div>
        </header>
        <Content
          className="main-area"
          key={`${user?.id || "guest"}:${user?.role || "visitor"}`}
        >
          <div className="page-head">
            <div>
              <div className="eyebrow">Cornell Entrepreneurship Club</div>
              <h1>{titles[section] || "Workspace"}</h1>
              <p className="muted">{subtitles[section]}</p>
            </div>
            {isOfficer && section === "home" && (
              <button className="button" onClick={() => create("event")}>
                <Plus size={17} />
                Create event
              </button>
            )}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              {notice}
            </div>
          )}
          {!data ? (
            error ? (
              <button
                className="button"
                onClick={() =>
                  load()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                Try again
              </button>
            ) : (
              empty("Loading the workspace…")
            )
          ) : section === "intake" ? (
            user ? (
              <AdaptiveIntake key={user.id} />
            ) : (
              Auth()
            )
          ) : section === "schedule" ? (
            isMember ? (
              <ChatScheduler people={people} userId={user.id} />
            ) : user ? (
              empty("Meetings are available after membership approval.")
            ) : (
              Auth()
            )
          ) : section === "home" ? (
            Home()
          ) : section === "events" ? (
            Events()
          ) : section === "work" ? (
            Work()
          ) : section === "people" ? (
            People()
          ) : section === "crm" ? (
            CRM()
          ) : section === "record" ? (
            <>
              {isMember && (
                <EpisodeRecord
                  userId={user.id}
                  officer={isOfficer}
                  personalOnly={personal}
                />
              )}
              {isOfficer && !personal
                ? Record()
                : !isMember
                  ? user
                    ? empty(
                        "Your work record becomes available after membership approval.",
                      )
                    : Auth()
                  : null}
            </>
          ) : section === "directory" ? (
            Directory()
          ) : (
            Account()
          )}
          {embedded && (
            <nav className="connected-links" aria-label="CEC shortcuts">
              <Link href={cecRoutes.record}>The record</Link>
              <Link href={cecRoutes.schedule}>Meetings & calendar</Link>
              <Link href={cecRoutes.intake}>Weekly update</Link>
              <Link href={cecRoutes.directory}>Shared projects</Link>
            </nav>
          )}
          {!embedded && isMember && (
            <p>
              <Link className="link" href={cecRoutes.schedule}>
                Meetings & calendar subscription →
              </Link>
            </p>
          )}
          <div className="footer-note">
            Club OS · Cornell Entrepreneurship Club pilot · Event times shown in
            Eastern Time
          </div>
        </Content>
      </div>
      {dialog && (
        <Modal title={dialog.title} close={() => setDialog(null)}>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <Editor
            fields={dialog.fields}
            busy={busy}
            label={dialog.label}
            onSubmit={async (d) => {
              try {
                await dialog.submit(d);
              } catch {}
            }}
          />
        </Modal>
      )}
      {insight && (
        <Modal
          title={
            insight.forecast
              ? "Attendance forecast"
              : insight.mean_days !== undefined
                ? "Project scenario"
                : insight.title || "Record details"
          }
          close={() => setInsight(null)}
        >
          {insight.forecast ? (
            <>
              <div className="metrics">
                <div>
                  <b>{insight.forecast.expected.toFixed(1)}</b>
                  <span>Expected RSVP attendees</span>
                </div>
                <div>
                  <b>{insight.forecast.interval_90.join("–")}</b>
                  <span>90% model interval</span>
                </div>
              </div>
              <p className="muted">
                Based on {insight.features.labeled_history} labeled historical
                RSVPs. {insight.features.missing_labels} missing outcomes
                excluded.
              </p>
              {tag(insight.status)}
              <p className="source-note">
                Current affirmative RSVPs only, not walk-ins. This baseline has
                not been validated on real club outcomes.
              </p>
            </>
          ) : insight.mean_days !== undefined ? (
            <>
              <div className="metrics">
                <div>
                  <b>{Math.round(insight.probability_by_deadline * 100)}%</b>
                  <span>Within declared deadline</span>
                </div>
                <div>
                  <b>{insight.mean_days.toFixed(1)}</b>
                  <span>Mean elapsed days</span>
                </div>
              </div>
              <p>
                90% scenario range:{" "}
                {insight.interval_90_days
                  .map((v: number) => v.toFixed(1))
                  .join("–")}{" "}
                days
              </p>
              <p className="source-note">
                Independent durations, unlimited parallel capacity. Not
                empirically calibrated.
              </p>
            </>
          ) : (
            <pre>{JSON.stringify(insight, null, 2)}</pre>
          )}
        </Modal>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState, FormEvent } from "react";

// One screen. Name, Cornell email, done.
//
// No password, no application, no officer approval in the way. Someone already
// in the club should not have to apply to it. The invite link is the proof they
// belong, which is the same trust model as the group chat it was shared in.

export default function JoinWithInvite({ code }: { code: string }) {
  const [entered, setEntered] = useState(code);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  async function check(c: string) {
    if (!c.trim()) return setInfo(null);
    try {
      const r = await fetch("/api/cec/invite?code=" + encodeURIComponent(c));
      setInfo(await r.json());
    } catch {
      setInfo(null);
    }
  }
  useEffect(() => {
    check(code);
  }, [code]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/cec/invite/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: entered,
          name: form.get("name"),
          email: form.get("email"),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error);
      setDone(j.name);
      window.location.href = "/clubs/cec";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const domain = info?.email_domain || "cornell.edu";

  return (
    <main className="join-page">
      <section className="card" style={{ maxWidth: 420, margin: "48px auto" }}>
        <p className="text-micro">Cornell Entrepreneurship Club</p>
        <h1 className="text-display" style={{ marginTop: 4 }}>
          {done ? `Welcome, ${done}` : "Join the club workspace"}
        </h1>

        {!code && (
          <label className="field" style={{ marginTop: 16 }}>
            <span className="text-label">Invite code</span>
            <input
              value={entered}
              onChange={(e) => {
                setEntered(e.target.value.toUpperCase());
                check(e.target.value);
              }}
              placeholder="ABCD-EFGH"
              autoComplete="off"
            />
          </label>
        )}

        {info && !info.valid && entered && (
          <div className="inline-alert" style={{ marginTop: 12 }}>
            {info.reason}
          </div>
        )}

        {info?.valid && (
          <form onSubmit={submit} style={{ marginTop: 16 }}>
            <label className="field">
              <span className="text-label">Your name</span>
              <input name="name" required autoFocus autoComplete="name" />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span className="text-label">Cornell email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={`netid@${domain}`}
              />
            </label>
            {error && (
              <div className="inline-alert" style={{ marginTop: 12 }}>
                {error}
              </div>
            )}
            <button
              className="btn primary"
              type="submit"
              disabled={busy}
              style={{ marginTop: 16, width: "100%" }}
            >
              {busy ? "One moment…" : "Join"}
            </button>
            <p className="text-caption" style={{ marginTop: 12 }}>
              No password needed. You can add one later from settings.
            </p>
          </form>
        )}

        {!info && entered && <p className="text-caption">Checking…</p>}
        {!entered && !code && (
          <p className="text-caption" style={{ marginTop: 12 }}>
            Paste the code an officer shared in the group chat.
          </p>
        )}
      </section>
    </main>
  );
}

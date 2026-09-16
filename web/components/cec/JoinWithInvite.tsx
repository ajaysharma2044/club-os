"use client";
import { useEffect, useRef, useState, FormEvent } from "react";

export default function JoinWithInvite({ code }: { code: string }) {
  const [entered, setEntered] = useState(code);
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");

  const checkSequence = useRef(0);
  const [checkError, setCheckError] = useState("");
  async function check(c: string) {
    const sequence = ++checkSequence.current;
    setCheckError("");
    setInfo(null);
    if (!c.trim()) return setInfo(null);
    try {
      const r = await fetch("/api/cec/invite?code=" + encodeURIComponent(c));
      const result = await r.json();
      if (sequence !== checkSequence.current) return;
      if (!r.ok) throw Error("Unable to check the invitation.");
      setInfo(result);
    } catch {
      if (sequence !== checkSequence.current) return;
      setCheckError("Unable to check this invitation. Check your connection and try again.");
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
          password: form.get("password"),
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
          <div className="inline-alert" role="alert" style={{ marginTop: 12 }}>
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
              <span className="text-label">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={`netid@${domain}`}
              />
            </label>
            <label className="field" style={{ marginTop: 12 }}>
              <span className="text-label">Password</span>
              <input name="password" type="password" required minLength={12} maxLength={256} autoComplete="current-password" />
              <small>Already have an account? Use its password. Otherwise choose at least 12 characters.</small>
            </label>
            {error && (
              <div className="inline-alert" role="alert" style={{ marginTop: 12 }}>
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
              An invitation grants club access. Email ownership and university affiliation are not yet verified.
            </p>
          </form>
        )}

        {checkError && <div className="inline-alert" role="alert">{checkError} <button type="button" onClick={() => check(entered)}>Try again</button></div>}
        {!info && !checkError && entered && <p className="text-caption" role="status">Checking invitation…</p>}
        {!entered && !code && (
          <p className="text-caption" style={{ marginTop: 12 }}>
            Paste the code an officer shared in the group chat.
          </p>
        )}
      </section>
    </main>
  );
}

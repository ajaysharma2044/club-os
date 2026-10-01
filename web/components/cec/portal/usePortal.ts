"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function usePortal() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const r = await fetch("/api/cec/portal/state", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "Unable to load the club portal.");
      if (request === sequence.current) {
        setData(j);
        setError("");
      }
    } catch (e: any) {
      if (request === sequence.current) setError(e.message);
      throw e;
    }
  }, []);
  useEffect(() => {
    void refresh().catch(() => {});
    const sync = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", sync);
    window.addEventListener("cec:changed", sync);
    return () => {
      sequence.current++;
      window.removeEventListener("focus", sync);
      window.removeEventListener("cec:changed", sync);
    };
  }, [refresh]);
  async function save(action: string, body: any) {
    const r = await fetch("/api/cec/portal/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_id: data?.user?.id, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw Error(j.error || "Unable to save.");
    setNotice("Saved.");
    await refresh().catch(() =>
      setNotice(
        "Saved, but the latest view could not load. Refresh to see your change.",
      ),
    );
    return j;
  }
  return { data, error, notice, refresh, save };
}

export type Portal = ReturnType<typeof usePortal>;

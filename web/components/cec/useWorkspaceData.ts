"use client";
import { useCallback, useEffect, useRef, useState } from "react";
/** Owns the legacy workspace contract. Server authorization remains authoritative. */
export function useWorkspaceData(section: string) {
    const [data, setData] = useState<any>(null);
    const [directory, setDirectory] = useState<any>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const loadSequence = useRef(0);
    const load = useCallback(async () => {
        const current = ++loadSequence.current;
        try {
            const r = await fetch("/api/cec/state", { cache: "no-store" });
            if (!r.ok)
                throw new Error("Unable to load the club workspace. Please try again.");
            const j = await r.json();
            if (current !== loadSequence.current)
                return;
            setData(j);
            setError("");
            if (section === "directory") {
                const response = await fetch("/api/cec/directory", {
                    cache: "no-store",
                });
                if (!response.ok)
                    throw new Error("Unable to load the shared directory.");
                const shared = await response.json();
                if (current === loadSequence.current)
                    setDirectory(shared);
            }
        }
        catch (e) {
            if (current !== loadSequence.current)
                return;
            // Preserve an in-progress form on a transient refresh failure.
            // Initial failures still have null data; successful signed-out state replaces it.
            throw e;
        }
    }, [section]);
    useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === "visible")
                load().catch((e) => setError(e.message));
        };
        window.addEventListener("focus", refresh);
        window.addEventListener("cec:changed", refresh);
        document.addEventListener("visibilitychange", refresh);
        const timer = section === "work" ? window.setInterval(refresh, 15000) : null;
        return () => {
            loadSequence.current++;
            window.removeEventListener("focus", refresh);
            window.removeEventListener("cec:changed", refresh);
            document.removeEventListener("visibilitychange", refresh);
            if (timer)
                clearInterval(timer);
        };
    }, [section, load]);
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
            if (!r.ok)
                throw new Error(result.error || "Unable to save.");
            window.dispatchEvent(new Event("cec:changed"));
            await load();
            return result;
        }
        catch (e: any) {
            setError(e.message);
            throw e;
        }
        finally {
            setBusy(false);
        }
    }
    async function run(path: string, body: any) {
        try {
            await action(path, body);
            setNotice("Saved to the club record.");
        }
        catch { }
    }
    return { data, directory, error, setError, notice, setNotice, busy, load, action, run };
}

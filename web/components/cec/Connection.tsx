"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
type Connection = {
  data: any;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};
const Context = createContext<Connection>({
  data: null,
  loading: true,
  error: "",
  refresh: async () => {},
});
export function CECConnection({ children }: { children: ReactNode }) {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    try {
      const r = await fetch("/api/cec/state", { cache: "no-store" });
      if (!r.ok)
        throw Error("The club workspace is unavailable. Please try again.");
      const j = await r.json();
      if (current === sequence.current) {
        setData(j);
        setError("");
      }
    } catch (e: any) {
      if (current === sequence.current) {
        setData(null);
        setError(e.message);
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const sync = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("cec:changed", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      sequence.current++;
      window.removeEventListener("cec:changed", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [refresh]);
  return (
    <Context.Provider value={{ data, loading, error, refresh }}>
      {children}
    </Context.Provider>
  );
}
export function useCEC() {
  return useContext(Context);
}

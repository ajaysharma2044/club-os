"use client";

import { useEffect, useState } from "react";
import { JOIN_EVENT, readJoin, writeJoin, type JoinState } from "@/lib/join";

export function useJoinState() {
  const [state, setState] = useState<JoinState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function sync() {
      setState(readJoin());
      setReady(true);
    }
    sync();
    window.addEventListener(JOIN_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(JOIN_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function save(next: JoinState) {
    writeJoin(next);
    setState(next);
  }

  return { state, ready, save };
}

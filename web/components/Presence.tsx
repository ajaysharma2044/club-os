"use client";

import { useEffect, useState } from "react";

function prefersReduce() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LiveStamp() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    function tick() {
      const now = new Date();
      setLabel(
        now.toLocaleString("en-US", {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      );
    }
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (!label) return null;
  return <span className="live-stamp">{label}</span>;
}

export function WriteIn({ text }: { text: string }) {
  const [n, setN] = useState(text.length);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (prefersReduce()) {
      setN(text.length);
      setOn(false);
      return;
    }
    setN(0);
    setOn(true);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [text]);

  useEffect(() => {
    if (n < text.length) return;
    const id = window.setTimeout(() => setOn(false), 900);
    return () => window.clearTimeout(id);
  }, [n, text.length]);

  return (
    <h2 className="text-title-2 write-in" aria-label={text}>
      {text.slice(0, n)}
      {on && <span className="ink-caret" aria-hidden />}
    </h2>
  );
}

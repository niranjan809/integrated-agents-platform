import { useEffect, useRef, useState } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const IS_LOCAL = BASE.includes("localhost") || BASE.includes("127.0.0.1");

export default function BackendWakeup() {
  const [warming, setWarming] = useState(false);
  const wasWarmingRef = useRef(false);

  useEffect(() => {
    // No cold-start problem on localhost — skip entirely
    if (IS_LOCAL) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function ping() {
      try {
        const res = await fetch(`${BASE}/health`, { cache: "no-store" });
        if (res.ok) {
          if (!cancelled) {
            if (wasWarmingRef.current) window.location.reload();
            setWarming(false);
          }
          return;
        }
      } catch {}
      if (!cancelled) {
        wasWarmingRef.current = true;
        setWarming(true);
        timer = setTimeout(ping, 2500);
      }
    }

    ping();
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (!warming) return null;

  return (
    <div className="bg-amber-950/70 border-b border-amber-800/60 px-4 py-2.5 text-center text-sm text-amber-300 flex items-center justify-center gap-2.5">
      <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      Backend warming up (Render free-tier cold start) — data loads automatically in ~30 s
    </div>
  );
}

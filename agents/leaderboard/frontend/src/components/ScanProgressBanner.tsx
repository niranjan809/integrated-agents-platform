import { useEffect, useState } from "react";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ScanState {
  active: boolean;
  current_name: string | null;
  index: number;
  total: number;
  triggered_by: string | null;
}

export default function ScanProgressBanner() {
  const [state, setState] = useState<ScanState | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;

    async function poll() {
      try {
        const res = await fetch(`${BASE}/scan-status`);
        if (res.ok) setState(await res.json());
      } catch {
        // silently ignore — backend may be waking up
      }
    }

    poll();
    timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, []);

  if (!state?.active || !state.current_name) return null;

  const trigger =
    state.triggered_by === "scheduler"
      ? "Auto-update"
      : state.triggered_by === "rescan"
      ? "Manual rescan"
      : "Updating";

  return (
    <div className="bg-indigo-900/80 border-b border-indigo-700 px-4 py-2 flex items-center gap-3 text-sm">
      {/* Spinner */}
      <svg
        className="animate-spin h-4 w-4 text-indigo-300 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12" cy="12" r="10"
          stroke="currentColor" strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8H4z"
        />
      </svg>

      <span className="text-indigo-200 font-medium">{trigger}:</span>
      <span className="text-white font-semibold truncate">{state.current_name}</span>

      {state.total > 1 && (
        <>
          <span className="text-indigo-400 ml-auto shrink-0">
            {state.index} / {state.total}
          </span>
          {/* Progress bar */}
          <div className="w-24 h-1.5 bg-indigo-800 rounded-full overflow-hidden shrink-0">
            <div
              className="h-full bg-indigo-400 rounded-full transition-all duration-500"
              style={{ width: `${(state.index / state.total) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}

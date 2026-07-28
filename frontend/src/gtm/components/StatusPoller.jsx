import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PIPELINE_STEPS } from "../lib/status";

export default function StatusPoller({ companyId, onDone }) {
  const [job, setJob] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function poll() {
      try {
        const latest = await api.getJobStatus(companyId);
        if (cancelled) return;
        setJob(latest);
        if (latest.status === "done" || latest.status === "failed") {
          onDone?.();
          return;
        }
      } catch {
        // no job yet — keep polling, it may not have been created yet
      }
      timer = setTimeout(poll, 2000);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyId, onDone]);

  if (!job) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink">
        Starting analysis…
      </div>
    );
  }

  if (job.status === "failed") {
    return (
      <div className="rounded-2xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
        Analysis failed: {job.errorMsg}
      </div>
    );
  }

  const currentIndex = PIPELINE_STEPS.findIndex((s) => s.key === job.currentStep);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-1">
        {PIPELINE_STEPS.map((step, i) => {
          const isDone = currentIndex > i || job.status === "done";
          const isActive = i === currentIndex && job.status !== "done";
          return (
            <div key={step.key} className="flex flex-1 items-center gap-1">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold ${
                    isDone
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-400"
                      : isActive
                        ? "animate-pulse border-amber-400 bg-amber-400/10 text-amber-400"
                        : "border-line text-ink"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[11px] ${
                    isDone ? "text-emerald-400" : isActive ? "text-amber-400" : "text-ink"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className={`mb-4 h-px flex-1 ${isDone ? "bg-emerald-400/50" : "bg-line"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

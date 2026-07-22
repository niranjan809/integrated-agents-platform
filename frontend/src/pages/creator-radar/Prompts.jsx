import { useEffect, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";

// Read-only view of the exact LLM prompt files + metadata (GET /api/prompts).
// Static content — fetched once on mount (platform-agnostic; the ?platform= that api.js
// appends is ignored by the endpoint).
function PromptsSkeleton() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Classifier prompts</h2>
      <div className="mt-4 space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5">
            <Skeleton width="12rem" height="1rem" />
            <div className="mt-3">
              <Skeleton width="100%" height="10rem" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Prompts() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/prompts").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-sm text-red-600">Failed to load prompts: {error}</div>;
  if (!data) return <PromptsSkeleton />;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Classifier prompts</h2>
      <p className="mt-1 text-sm text-slate-500">
        The exact prompts sent to the LLM, read live from disk. Read-only.
      </p>

      <div className="mt-4 space-y-6">
        {data.prompts.map((p) => (
          <section key={p.file_path} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-600">{p.file_path}</span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">version {p.version}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">{p.model}</span>
              </div>
            </div>
            {p.purpose && <p className="mt-2 text-sm text-slate-500">{p.purpose}</p>}
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
              {p.content}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}

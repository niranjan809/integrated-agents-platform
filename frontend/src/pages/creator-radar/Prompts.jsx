import { useEffect, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";

// Read-only view of the exact LLM prompt files + metadata (GET /api/prompts).
// Static content — fetched once on mount (platform-agnostic; the ?platform= that api.js
// appends is ignored by the endpoint).
function PromptsSkeleton() {
  return (
    <div className="cr-page u-mx-auto u-max-w-4xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Classifier prompts</h2>
      <div className="u-mt-4 u-space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
            <Skeleton width="12rem" height="1rem" />
            <div className="u-mt-3">
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

  if (error) return <div className="u-p-8 u-text-sm u-text-red-600">Failed to load prompts: {error}</div>;
  if (!data) return <PromptsSkeleton />;

  return (
    <div className="cr-page u-mx-auto u-max-w-4xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Classifier prompts</h2>
      <p className="u-mt-1 u-text-sm u-text-slate-500">
        The exact prompts sent to the LLM, read live from disk. Read-only.
      </p>

      <div className="u-mt-4 u-space-y-6">
        {data.prompts.map((p) => (
          <section key={p.file_path} className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
            <div className="u-flex u-flex-wrap u-items-baseline u-justify-between u-gap-2">
              <h3 className="u-text-base u-font-semibold u-text-slate-900">{p.name}</h3>
              <div className="u-flex u-flex-wrap u-gap-2 u-text-xs">
                <span className="u-rounded-full u-bg-slate-100 u-px-2 u-py-0_5 u-font-mono u-text-slate-600">{p.file_path}</span>
                <span className="u-rounded-full u-bg-indigo-50 u-px-2 u-py-0_5 u-text-indigo-700">version {p.version}</span>
                <span className="u-rounded-full u-bg-emerald-50 u-px-2 u-py-0_5 u-text-emerald-700">{p.model}</span>
              </div>
            </div>
            {p.purpose && <p className="u-mt-2 u-text-sm u-text-slate-500">{p.purpose}</p>}
            <pre className="u-mt-3 u-max-h-28rem u-overflow-auto u-whitespace-pre-wrap u-rounded-lg u-bg-slate-900 u-p-4 u-text-xs u-leading-relaxed u-text-slate-100">
              {p.content}
            </pre>
          </section>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";

const int = (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-US"));

// External services + live monthly usage vs cap (GET /api/services). Platform-agnostic;
// the ?platform= api.js appends is ignored by the endpoint.
const STATUS_STYLES = {
  healthy: "bg-emerald-50 text-emerald-700",
  throttled: "bg-amber-50 text-amber-700",
  capped: "bg-red-50 text-red-700",
};

function StatusPill({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

function ServicesSkeleton() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Services</h2>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="2rem" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Services() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/services").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="p-8 text-sm text-red-600">Failed to load services: {error}</div>;
  if (!data) return <ServicesSkeleton />;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Services</h2>
      <p className="mt-1 text-sm text-slate-500">
        External data & LLM providers with this month&apos;s usage against the budget cap.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Endpoints</th>
              <th className="px-4 py-3 font-medium text-right">Monthly usage</th>
              <th className="px-4 py-3 font-medium text-right">Cap</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <tr key={s.name} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{s.name}</div>
                  <div className="mt-0.5 text-xs text-slate-400">{s.purpose}</div>
                </td>
                <td className="px-4 py-3 text-slate-600">{s.provider}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.endpoints.map((e) => (
                      <span key={e} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">{e}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-900">{int(s.usage)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-500">{int(s.cap)}</td>
                <td className="px-4 py-3"><StatusPill status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

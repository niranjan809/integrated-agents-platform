import { useEffect, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";

const int = (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-US"));

// External services + live monthly usage vs cap (GET /api/services). Platform-agnostic;
// the ?platform= api.js appends is ignored by the endpoint.
const STATUS_STYLES = {
  healthy: "u-bg-emerald-50 u-text-emerald-700",
  throttled: "u-bg-amber-50 u-text-amber-700",
  capped: "u-bg-red-50 u-text-red-700",
};

function StatusPill({ status }) {
  return (
    <span className={`u-rounded-full u-px-2 u-py-0_5 u-text-xs u-font-medium u-capitalize ${STATUS_STYLES[status] || "u-bg-slate-100 u-text-slate-600"}`}>
      {status}
    </span>
  );
}

function ServicesSkeleton() {
  return (
    <div className="cr-page u-mx-auto u-max-w-5xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Services</h2>
      <div className="u-mt-4 u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
        <div className="u-space-y-3">
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

  if (error) return <div className="u-p-8 u-text-sm u-text-red-600">Failed to load services: {error}</div>;
  if (!data) return <ServicesSkeleton />;

  return (
    <div className="cr-page u-mx-auto u-max-w-5xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Services</h2>
      <p className="u-mt-1 u-text-sm u-text-slate-500">
        External data & LLM providers with this month&apos;s usage against the budget cap.
      </p>

      <div className="u-mt-4 u-overflow-x-auto u-rounded-xl u-border u-border-slate-200 u-bg-white">
        <table className="u-w-full u-text-sm">
          <thead>
            <tr className="u-border-b u-border-slate-200 u-text-left u-text-xs u-uppercase u-tracking-wide u-text-slate-500">
              <th className="u-px-4 u-py-3 u-font-medium">Service</th>
              <th className="u-px-4 u-py-3 u-font-medium">Provider</th>
              <th className="u-px-4 u-py-3 u-font-medium">Endpoints</th>
              <th className="u-px-4 u-py-3 u-font-medium u-text-right">Monthly usage</th>
              <th className="u-px-4 u-py-3 u-font-medium u-text-right">Cap</th>
              <th className="u-px-4 u-py-3 u-font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.services.map((s) => (
              <tr key={s.name} className="u-border-b u-border-slate-100 u-last-border-0 u-align-top">
                <td className="u-px-4 u-py-3">
                  <div className="u-font-medium u-text-slate-900">{s.name}</div>
                  <div className="u-mt-0_5 u-text-xs u-text-slate-400">{s.purpose}</div>
                </td>
                <td className="u-px-4 u-py-3 u-text-slate-600">{s.provider}</td>
                <td className="u-px-4 u-py-3">
                  <div className="u-flex u-flex-wrap u-gap-1">
                    {s.endpoints.map((e) => (
                      <span key={e} className="u-rounded u-bg-slate-100 u-px-1_5 u-py-0_5 u-font-mono u-text-xs u-text-slate-600">{e}</span>
                    ))}
                  </div>
                </td>
                <td className="u-px-4 u-py-3 u-text-right u-tabular-nums u-text-slate-900">{int(s.usage)}</td>
                <td className="u-px-4 u-py-3 u-text-right u-tabular-nums u-text-slate-500">{int(s.cap)}</td>
                <td className="u-px-4 u-py-3"><StatusPill status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

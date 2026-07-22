import { useEffect, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";
import { usePlatform } from "./platform/PlatformContext";

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function RuleList({ title, fired }) {
  const entries = Object.entries(fired || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-sm font-medium text-slate-700">{title}</div>
      <ul className="mt-3 space-y-1.5">
        {entries.length === 0 && <li className="text-xs text-slate-400">none</li>}
        {entries.map(([id, n]) => (
          <li key={id} className="flex items-center justify-between text-sm">
            <span className="font-mono text-xs text-slate-600">{id}</span>
            <span className="tabular-nums text-slate-900">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
      {segments.map((s) => (
        <div key={s.label} className={s.color} style={{ width: `${(100 * s.value) / total}%` }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}

// Mirrors the real Overview layout (4 stat cards, 2 mid cards, 2 rule lists) with pulsing
// placeholders so a platform switch / first load doesn't flash a blank panel.
function SkeletonCard({ children }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5">{children}</div>;
}

function OverviewSkeleton() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="6rem" height="0.8rem" />
            <div className="mt-3"><Skeleton width="4rem" height="1.75rem" /></div>
          </SkeletonCard>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="7rem" height="0.8rem" />
            <div className="mt-3"><Skeleton width="100%" height="0.75rem" rounded="rounded-full" /></div>
          </SkeletonCard>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="8rem" height="0.8rem" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} width="100%" height="0.8rem" />
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    </div>
  );
}

export default function Overview() {
  const { platform } = usePlatform();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");

  // Refetch whenever the platform changes. api.js appends ?platform= so the response is
  // always the flat single-platform shape.
  useEffect(() => {
    setReport(null);
    setError("");
    api.get("/api/report").then(setReport).catch((e) => setError(e.message));
  }, [platform]);

  if (error) return <div className="p-8 text-sm text-red-600">Failed to load report: {error}</div>;
  if (!report) return <OverviewSkeleton />;

  const cat = report.category_agreement;
  const gen = report.genuineness_agreement;
  const mb = report.method_breakdown;
  const b = report.budget;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Overview</h2>

      {/* 4 large stat cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total accounts" value={report.total_accounts} />
        <StatCard label="Category agreement" value={`${cat.percent}%`} sub={`${cat.correct} / ${cat.total} vs curator`} />
        <StatCard label="Genuineness agreement" value={`${gen.percent}%`} sub={`${gen.correct} / ${gen.total} vs curator`} />
        <StatCard label="Flagged non-genuine" value={report.flagged_non_genuine} sub="Low-effort / Uncertain" />
      </div>

      {/* 2 smaller cards: method breakdown + budget */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-medium text-slate-700">Category method</div>
          <Bar segments={[
            { label: "rule", value: mb.rule, color: "bg-slate-400" },
            { label: "llm", value: mb.llm, color: "bg-indigo-400" },
            { label: "gate", value: mb.gate || 0, color: "bg-amber-400" },
          ]} />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />rule {mb.rule}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-indigo-400" />llm {mb.llm}</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />gate {mb.gate || 0}</span>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-medium text-slate-700">API budget (this month)</div>
          <div className="mt-3 space-y-3">
            {/* Generic over budget keys: Instagram has rapidapi+openrouter, TikTok has tiktok_rapidapi+openrouter. */}
            {Object.entries(b).map(([name, u]) => (
              <div key={name}>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{name}</span><span className="tabular-nums">{u.used} / {u.cap}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, (100 * u.used) / u.cap)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2 rule-fire lists */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RuleList title="Category rules fired" fired={report.category_rules_fired} />
        <RuleList title="Genuineness rules fired" fired={report.genuineness_rules_fired} />
      </div>
    </div>
  );
}

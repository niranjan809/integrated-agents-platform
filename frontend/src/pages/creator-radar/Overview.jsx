import { useEffect, useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";
import { usePlatform } from "./platform/PlatformContext";

function StatCard({ label, value, sub }) {
  return (
    <div className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
      <div className="u-text-sm u-text-slate-500">{label}</div>
      <div className="u-mt-2 u-text-3xl u-font-semibold u-text-slate-900">{value}</div>
      {sub && <div className="u-mt-1 u-text-xs u-text-slate-400">{sub}</div>}
    </div>
  );
}

function RuleList({ title, fired }) {
  const entries = Object.entries(fired || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
      <div className="u-text-sm u-font-medium u-text-slate-700">{title}</div>
      <ul className="u-mt-3 u-space-y-1_5">
        {entries.length === 0 && <li className="u-text-xs u-text-slate-400">none</li>}
        {entries.map(([id, n]) => (
          <li key={id} className="u-flex u-items-center u-justify-between u-text-sm">
            <span className="u-font-mono u-text-xs u-text-slate-600">{id}</span>
            <span className="u-tabular-nums u-text-slate-900">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="u-mt-3 u-flex u-h-3 u-w-full u-overflow-hidden u-rounded-full u-bg-slate-100">
      {segments.map((s) => (
        <div key={s.label} className={s.color} style={{ width: `${(100 * s.value) / total}%` }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}

// Mirrors the real Overview layout (4 stat cards, 2 mid cards, 2 rule lists) with pulsing
// placeholders so a platform switch / first load doesn't flash a blank panel.
function SkeletonCard({ children }) {
  return <div className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">{children}</div>;
}

function OverviewSkeleton() {
  return (
    <div className="cr-page u-mx-auto u-max-w-6xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Overview</h2>
      <div className="u-mt-4 u-grid u-grid-cols-1 u-gap-4 u-sm-grid-cols-2 u-lg-grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="6rem" height="0.8rem" />
            <div className="u-mt-3"><Skeleton width="4rem" height="1.75rem" /></div>
          </SkeletonCard>
        ))}
      </div>
      <div className="u-mt-4 u-grid u-grid-cols-1 u-gap-4 u-lg-grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="7rem" height="0.8rem" />
            <div className="u-mt-3"><Skeleton width="100%" height="0.75rem" rounded="u-rounded-full" /></div>
          </SkeletonCard>
        ))}
      </div>
      <div className="u-mt-4 u-grid u-grid-cols-1 u-gap-4 u-lg-grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton width="8rem" height="0.8rem" />
            <div className="u-mt-3 u-space-y-2">
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

  if (error) return <div className="u-p-8 u-text-sm u-text-red-600">Failed to load report: {error}</div>;
  if (!report) return <OverviewSkeleton />;

  const cat = report.category_agreement;
  const gen = report.genuineness_agreement;
  const mb = report.method_breakdown;
  const b = report.budget;

  return (
    <div className="cr-page u-mx-auto u-max-w-6xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Overview</h2>

      {/* 4 large stat cards */}
      <div className="u-mt-4 u-grid u-grid-cols-1 u-gap-4 u-sm-grid-cols-2 u-lg-grid-cols-4">
        <StatCard label="Total accounts" value={report.total_accounts} />
        <StatCard label="Category agreement" value={`${cat.percent}%`} sub={`${cat.correct} / ${cat.total} vs curator`} />
        <StatCard label="Genuineness agreement" value={`${gen.percent}%`} sub={`${gen.correct} / ${gen.total} vs curator`} />
        <StatCard label="Flagged non-genuine" value={report.flagged_non_genuine} sub="Low-effort / Uncertain" />
      </div>

      {/* 2 smaller cards: method breakdown + budget */}
      <div className="u-mt-4 u-grid u-grid-cols-1 u-gap-4 u-lg-grid-cols-2">
        <div className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
          <div className="u-text-sm u-font-medium u-text-slate-700">Category method</div>
          <Bar segments={[
            { label: "rule", value: mb.rule, color: "u-bg-slate-400" },
            { label: "llm", value: mb.llm, color: "u-bg-indigo-400" },
            { label: "gate", value: mb.gate || 0, color: "u-bg-amber-400" },
          ]} />
          <div className="u-mt-2 u-flex u-justify-between u-text-xs u-text-slate-500">
            <span><span className="u-mr-1 u-inline-block u-h-2 u-w-2 u-rounded-full u-bg-slate-400" />rule {mb.rule}</span>
            <span><span className="u-mr-1 u-inline-block u-h-2 u-w-2 u-rounded-full u-bg-indigo-400" />llm {mb.llm}</span>
            <span><span className="u-mr-1 u-inline-block u-h-2 u-w-2 u-rounded-full u-bg-amber-400" />gate {mb.gate || 0}</span>
          </div>
        </div>
        <div className="u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-5">
          <div className="u-text-sm u-font-medium u-text-slate-700">API budget (this month)</div>
          <div className="u-mt-3 u-space-y-3">
            {/* Generic over budget keys: Instagram has rapidapi+openrouter, TikTok has tiktok_rapidapi+openrouter. */}
            {Object.entries(b).map(([name, u]) => (
              <div key={name}>
                <div className="u-flex u-justify-between u-text-xs u-text-slate-500">
                  <span>{name}</span><span className="u-tabular-nums">{u.used} / {u.cap}</span>
                </div>
                <div className="u-mt-1 u-h-2 u-w-full u-overflow-hidden u-rounded-full u-bg-slate-100">
                  <div className="u-h-full u-bg-emerald-400" style={{ width: `${Math.min(100, (100 * u.used) / u.cap)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2 rule-fire lists */}
      <div className="u-mt-4 u-grid u-grid-cols-1 u-gap-4 u-lg-grid-cols-2">
        <RuleList title="Category rules fired" fired={report.category_rules_fired} />
        <RuleList title="Genuineness rules fired" fired={report.genuineness_rules_fired} />
      </div>
    </div>
  );
}

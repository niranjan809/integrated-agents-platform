import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { CategoryChip, GenuinenessChip } from "../../components/creator-radar/chips";
import { formatCount, formatPct } from "../../lib/creator-radar/format";
import AccountDrawer from "../../components/creator-radar/AccountDrawer";
import AddAccountModal from "../../components/creator-radar/AddAccountModal";
import { Skeleton } from "../../components/creator-radar/Skeleton";
import { usePlatform } from "./platform/PlatformContext";

const EMPTY_FILTERS = { predicted_category: "", predicted_genuineness: "", category_method: "", discovered_via: "" };

const COLUMNS = [
  { key: "handle", label: "Handle" },
  { key: "display_name", label: "Name" },
  { key: "follower_count", label: "Followers", numeric: true, align: "right" },
  { key: "engagement_rate", label: "Engagement", numeric: true, align: "right" },
  { key: "predicted_category", label: "Category" },
  { key: "predicted_genuineness", label: "Genuineness" },
  { key: "category_method", label: "Method" },
];

// Distinct sorted values of a field across rows (for filter dropdowns).
function distinct(rows, key) {
  return [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="u-flex u-flex-col u-text-xs u-text-slate-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="u-mt-1 u-rounded-md u-border u-border-slate-300 u-bg-white u-px-2 u-py-1_5 u-text-sm u-text-slate-800 u-focus-border-slate-500 u-focus-outline-none"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

export default function Accounts() {
  const { platform } = usePlatform();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: "follower_count", dir: "desc" });
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState("");

  function flashToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  // Fetch the accounts list. Reused for the initial load, platform switches, and refreshes
  // after a curator add/remove.
  function load() {
    setLoading(true);
    setError("");
    return api.get("/api/accounts?limit=200")
      .then((data) => setRows(data.results))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  // Refetch on platform change. Reset filters + close the drawer, since the prior
  // platform's filter values / selected handle don't apply to the new dataset.
  useEffect(() => {
    setSelected(null);
    setFilters(EMPTY_FILTERS);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform]);

  const options = useMemo(() => ({
    predicted_category: distinct(rows, "predicted_category"),
    predicted_genuineness: distinct(rows, "predicted_genuineness"),
    category_method: distinct(rows, "category_method"),
    discovered_via: distinct(rows, "discovered_via"),
  }), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      Object.entries(filters).every(([k, v]) => !v || r[k] === v)
    );
  }, [rows, filters]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, a2) => {
      const x = a[key], y = a2[key];
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * mul;
      return String(x).localeCompare(String(y)) * mul;
    });
  }, [filtered, sort]);

  function toggleSort(key) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }

  return (
    <div className="cr-page u-mx-auto u-max-w-6xl u-p-8">
      <div className="u-flex u-items-center u-justify-between">
        <h2 className="u-text-lg u-font-semibold u-text-slate-900">Accounts</h2>
        <div className="u-flex u-items-center u-gap-4">
          <span className="u-text-sm u-text-slate-400">{loading ? "…" : `${sorted.length} of ${rows.length}`}</span>
          <button
            onClick={() => setShowAdd(true)}
            className="u-rounded-md u-bg-slate-900 u-px-3 u-py-1_5 u-text-sm u-font-medium u-hover-bg-slate-700"
          >
            + Add account
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="u-mt-4 u-flex u-flex-wrap u-gap-3">
        <Select label="Category" value={filters.predicted_category} options={options.predicted_category}
          onChange={(v) => setFilters((f) => ({ ...f, predicted_category: v }))} />
        <Select label="Genuineness" value={filters.predicted_genuineness} options={options.predicted_genuineness}
          onChange={(v) => setFilters((f) => ({ ...f, predicted_genuineness: v }))} />
        <Select label="Method" value={filters.category_method} options={options.category_method}
          onChange={(v) => setFilters((f) => ({ ...f, category_method: v }))} />
        <Select label="Discovered via" value={filters.discovered_via} options={options.discovered_via}
          onChange={(v) => setFilters((f) => ({ ...f, discovered_via: v }))} />
      </div>

      {error && <div className="u-mt-6 u-text-sm u-text-red-600">Failed to load: {error}</div>}

      {!error && (
        <div className="u-mt-4 u-overflow-x-auto u-rounded-xl u-border u-border-slate-200 u-bg-white">
          <table className="u-w-full u-text-sm">
            <thead>
              <tr className="u-border-b u-border-slate-200 u-text-left u-text-xs u-uppercase u-tracking-wide u-text-slate-400">
                {COLUMNS.map((col) => (
                  <th key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`u-cursor-pointer u-select-none u-px-4 u-py-3 u-font-medium u-hover-text-slate-600 ${col.align === "right" ? "u-text-right" : ""}`}>
                    {col.label}
                    {sort.key === col.key && <span className="u-ml-1">{sort.dir === "asc" ? "▲" : "▼"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="u-border-b u-border-slate-100 u-last-border-0">
                    <td className="u-px-4 u-py-2_5"><Skeleton width="7rem" /></td>
                    <td className="u-px-4 u-py-2_5"><Skeleton width="9rem" /></td>
                    <td className="u-px-4 u-py-2_5 u-text-right"><Skeleton width="3rem" /></td>
                    <td className="u-px-4 u-py-2_5 u-text-right"><Skeleton width="3rem" /></td>
                    <td className="u-px-4 u-py-2_5"><Skeleton width="5rem" height="1.25rem" rounded="u-rounded-full" /></td>
                    <td className="u-px-4 u-py-2_5"><Skeleton width="4rem" height="1.25rem" rounded="u-rounded-full" /></td>
                    <td className="u-px-4 u-py-2_5"><Skeleton width="2.5rem" /></td>
                  </tr>
                ))}
              {!loading && sorted.map((r) => (
                <tr key={r.handle}
                  onClick={() => setSelected(r.handle)}
                  className="u-cursor-pointer u-border-b u-border-slate-100 u-last-border-0 u-hover-bg-slate-50">
                  <td className="u-px-4 u-py-2_5 u-font-medium u-text-slate-900">@{r.handle}</td>
                  <td className="u-max-w-12rem u-truncate u-px-4 u-py-2_5 u-text-slate-600">{r.display_name || "—"}</td>
                  <td className="u-px-4 u-py-2_5 u-text-right u-tabular-nums u-text-slate-700">{formatCount(r.follower_count)}</td>
                  <td className="u-px-4 u-py-2_5 u-text-right u-tabular-nums u-text-slate-700">{formatPct(r.engagement_rate)}</td>
                  <td className="u-px-4 u-py-2_5"><CategoryChip value={r.predicted_category} /></td>
                  <td className="u-px-4 u-py-2_5"><GenuinenessChip value={r.predicted_genuineness} /></td>
                  <td className="u-px-4 u-py-2_5 u-text-left u-font-mono u-text-10px u-uppercase u-tracking-wide u-text-gray-400">{r.category_method}</td>
                </tr>
              ))}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={COLUMNS.length} className="u-px-4 u-py-8 u-text-center u-text-slate-400">No accounts match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <AccountDrawer
        handle={selected}
        onClose={() => setSelected(null)}
        onRemoved={() => { setSelected(null); load(); flashToast("Account removed"); }}
      />

      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onAdded={load} />}

      {toast && (
        <div className="u-fixed u-bottom-6 u-left-1-2 u-z-80 u-neg-translate-x-1-2 u-rounded-lg u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

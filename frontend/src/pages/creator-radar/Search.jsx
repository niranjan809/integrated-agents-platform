import { useState } from "react";
import { api } from "./api";
import { Skeleton } from "../../components/creator-radar/Skeleton";

const int = (n) => (n == null || Number.isNaN(n) ? "—" : Number(n).toLocaleString("en-US"));

// Extract the server's friendly { message } from an api.request error whose message is
// "<status>: <json body>". Falls back to the raw string.
function friendlyError(err) {
  const raw = err?.message || "Search failed.";
  const idx = raw.indexOf(": ");
  if (idx === -1) return raw;
  try {
    const parsed = JSON.parse(raw.slice(idx + 2));
    return parsed.message || parsed.error || raw;
  } catch {
    return raw;
  }
}

const LIMITS = [10, 20, 30];

export default function Search() {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("instagram");
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null); // { query, raw_count, survivors_count, candidates }

  const canSubmit = query.trim().length > 0 && !loading;

  async function runSearch() {
    if (!query.trim()) {
      setError("Enter a keyword to search.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/api/search", { query: query.trim(), platform, limit });
      setData(res);
    } catch (e) {
      setError(friendlyError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") runSearch();
  }

  const rejected = data ? data.raw_count - data.survivors_count : 0;

  return (
    <div className="cr-page u-mx-auto u-max-w-5xl u-p-8">
      <h2 className="u-text-lg u-font-semibold u-text-slate-900">Search</h2>
      <p className="u-mt-1 u-text-sm u-text-slate-500">
        One-off keyword search with prefilter. Exploration only — nothing is added to the catalog. Each search spends one RapidAPI call and is logged to the audit trail.
      </p>

      {/* Controls */}
      <div className="u-mt-4 u-flex u-flex-wrap u-items-end u-gap-3 u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-4">
        <div className="u-flex-1 u-min-w-240px">
          <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Keyword</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. aiethics"
            className="u-w-full u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500"
          />
        </div>

        <div>
          <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Platform</label>
          <div className="u-flex u-overflow-hidden u-rounded-md u-border u-border-slate-300">
            <button
              onClick={() => setPlatform("instagram")}
              className={`u-px-3 u-py-2 u-text-sm ${platform === "instagram" ? "u-bg-slate-900" : "u-bg-white u-text-slate-600 u-hover-bg-slate-50"}`}
            >
              Instagram
            </button>
            <button
              disabled
              title="Not yet wired — TikTok search adapter isn't integrated into discovery."
              className="u-cursor-not-allowed u-border-l u-border-slate-300 u-bg-slate-50 u-px-3 u-py-2 u-text-sm u-text-slate-300"
            >
              TikTok
            </button>
          </div>
        </div>

        <div>
          <label className="u-mb-1 u-block u-text-xs u-font-medium u-uppercase u-tracking-wide u-text-slate-500">Limit</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="u-rounded-md u-border u-border-slate-300 u-px-3 u-py-2 u-text-sm u-outline-none u-focus-border-slate-500"
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <button
          onClick={runSearch}
          disabled={!canSubmit}
          className="u-rounded-md u-bg-slate-900 u-px-4 u-py-2 u-text-sm u-font-medium u-hover-bg-slate-700 u-disabled-cursor-not-allowed u-disabled-bg-slate-300"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="u-mt-4 u-rounded-lg u-border u-border-red-200 u-bg-red-50 u-px-4 u-py-3 u-text-sm u-text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="u-mt-4 u-rounded-xl u-border u-border-slate-200 u-bg-white u-p-4">
          <div className="u-space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="1.75rem" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state (no search yet, no error, not loading) */}
      {!loading && !error && !data && (
        <div className="u-mt-4 u-rounded-xl u-border u-border-dashed u-border-slate-300 u-bg-white u-p-8 u-text-center u-text-sm u-text-slate-400">
          No results yet — enter a keyword to search.
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="u-mt-4">
          <div className="u-mb-2 u-text-sm u-text-slate-600">
            Showing <span className="u-font-medium u-text-slate-900">{data.survivors_count}</span> candidate{data.survivors_count === 1 ? "" : "s"}{" "}
            ({data.raw_count} raw, {rejected} rejected by prefilter) for{" "}
            <span className="u-font-medium u-text-slate-900">&ldquo;{data.query}&rdquo;</span>
          </div>

          {data.candidates.length === 0 ? (
            <div className="u-rounded-xl u-border u-border-dashed u-border-slate-300 u-bg-white u-p-8 u-text-center u-text-sm u-text-slate-400">
              No candidates survived prefilter for this query.
            </div>
          ) : (
            <div className="u-overflow-x-auto u-rounded-xl u-border u-border-slate-200 u-bg-white">
              <table className="u-w-full u-text-sm">
                <thead>
                  <tr className="u-border-b u-border-slate-200 u-text-left u-text-xs u-uppercase u-tracking-wide u-text-slate-500">
                    <th className="u-px-4 u-py-3 u-font-medium">Handle</th>
                    <th className="u-px-4 u-py-3 u-font-medium">Full Name</th>
                    <th className="u-px-4 u-py-3 u-font-medium u-text-right">Follower Count</th>
                    <th className="u-px-4 u-py-3 u-font-medium">Prefilter Verdict</th>
                    <th className="u-px-4 u-py-3 u-font-medium u-text-right">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => (
                    <tr key={c.handle} className="u-border-b u-border-slate-100 u-last-border-0">
                      <td className="u-px-4 u-py-3">
                        <a
                          href={`https://instagram.com/${c.handle}`}
                          target="_blank"
                          rel="noreferrer"
                          className="u-font-medium u-text-slate-900 u-hover-underline"
                        >
                          @{c.handle}
                        </a>
                      </td>
                      <td className="u-px-4 u-py-3 u-text-slate-600">{c.full_name || <span className="u-text-slate-300">—</span>}</td>
                      <td className="u-px-4 u-py-3 u-text-right u-tabular-nums u-text-slate-400" title="Follower count is only available after a full profile fetch">
                        {int(c.follower_count)}
                      </td>
                      <td className="u-px-4 u-py-3">
                        <span className="u-rounded-full u-bg-emerald-50 u-px-2 u-py-0_5 u-text-xs u-font-medium u-text-emerald-700">
                          {c.prefilter_reason === "accept" ? "accept" : c.prefilter_reason}
                        </span>
                      </td>
                      <td className="u-px-4 u-py-3 u-text-right u-tabular-nums u-text-slate-500">{c.position ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

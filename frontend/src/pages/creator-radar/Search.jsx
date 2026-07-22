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
    <div className="mx-auto max-w-5xl p-8">
      <h2 className="text-lg font-semibold text-slate-900">Search</h2>
      <p className="mt-1 text-sm text-slate-500">
        One-off keyword search with prefilter. Exploration only — nothing is added to the catalog. Each search spends one RapidAPI call and is logged to the audit trail.
      </p>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex-1 min-w-[240px]">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Keyword</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="e.g. aiethics"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Platform</label>
          <div className="flex overflow-hidden rounded-md border border-slate-300">
            <button
              onClick={() => setPlatform("instagram")}
              className={`px-3 py-2 text-sm ${platform === "instagram" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Instagram
            </button>
            <button
              disabled
              title="Not yet wired — TikTok search adapter isn't integrated into discovery."
              className="cursor-not-allowed border-l border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-300"
            >
              TikTok
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Limit</label>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          >
            {LIMITS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <button
          onClick={runSearch}
          disabled={!canSubmit}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="1.75rem" />
            ))}
          </div>
        </div>
      )}

      {/* Empty state (no search yet, no error, not loading) */}
      {!loading && !error && !data && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
          No results yet — enter a keyword to search.
        </div>
      )}

      {/* Results */}
      {!loading && data && (
        <div className="mt-4">
          <div className="mb-2 text-sm text-slate-600">
            Showing <span className="font-medium text-slate-900">{data.survivors_count}</span> candidate{data.survivors_count === 1 ? "" : "s"}{" "}
            ({data.raw_count} raw, {rejected} rejected by prefilter) for{" "}
            <span className="font-medium text-slate-900">&ldquo;{data.query}&rdquo;</span>
          </div>

          {data.candidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
              No candidates survived prefilter for this query.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Handle</th>
                    <th className="px-4 py-3 font-medium">Full Name</th>
                    <th className="px-4 py-3 font-medium text-right">Follower Count</th>
                    <th className="px-4 py-3 font-medium">Prefilter Verdict</th>
                    <th className="px-4 py-3 font-medium text-right">Position</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => (
                    <tr key={c.handle} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3">
                        <a
                          href={`https://instagram.com/${c.handle}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-900 hover:underline"
                        >
                          @{c.handle}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.full_name || <span className="text-slate-300">—</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400" title="Follower count is only available after a full profile fetch">
                        {int(c.follower_count)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          {c.prefilter_reason === "accept" ? "accept" : c.prefilter_reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{c.position ?? "—"}</td>
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

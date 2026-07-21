import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api, Leaderboard, RankingEntry, ScanLog, getCached, invalidateCache } from "@/lib/api";
import { statusDot, statusColor } from "@/lib/utils";

// Same base + endpoint the ScanProgressBanner polls; rescan is now a background
// task, so we watch /scan-status to know when the scrape has actually finished.
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function LeaderboardPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lbId = parseInt(id!);
  // Optional ?highlight=<model name> — set when arriving from the Analytics tab.
  // The matching ranking row is highlighted and scrolled into view.
  const highlight = (searchParams.get("highlight") || "").trim();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const [lb, setLb] = useState<Leaderboard | null>(
    () => getCached<Leaderboard>(`/leaderboards/${lbId}`) ?? null
  );
  const [entries, setEntries] = useState<RankingEntry[]>(() => {
    const r = getCached<{ entries: RankingEntry[] }>(`/leaderboards/${lbId}/rankings`);
    return r?.entries ?? [];
  });
  const [scanLogs, setScanLogs] = useState<ScanLog[]>([]);
  const [isStale, setIsStale] = useState(false);
  const [initialLoading, setInitialLoading] = useState(
    () => !(getCached(`/leaderboards/${lbId}`) && getCached(`/leaderboards/${lbId}/rankings`))
  );
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    // Fetch metadata + rankings + logs in parallel; only rankings is slow (may scrape live)
    Promise.all([
      api.getLeaderboard(lbId),
      api.getScanLogs(lbId).catch(() => [] as ScanLog[]),
    ]).then(([data, logs]) => {
      setLb(data);
      setScanLogs(logs);
    }).catch(() => {
      setError("Leaderboard not found");
      setInitialLoading(false);
    });

    api.getRankings(lbId, false)
      .then((r) => {
        setEntries(r.entries);
        setIsStale(r.is_stale ?? false);
      })
      .catch((e: unknown) => setError((e as Error).message || "Failed to load rankings"))
      .finally(() => setInitialLoading(false));
  }, [lbId]);

  async function handleRescan() {
    setRescanning(true);
    setError(null);

    // The rescan endpoint now returns 202 immediately (the scrape runs as a
    // background task), so there are no results to read from this response —
    // we poll /scan-status until the scrape clears, then refetch fresh data.
    try {
      await api.rescan(lbId);
    } catch (e: unknown) {
      setError((e as Error).message || "Rescan failed");
      setRescanning(false);
      return;
    }

    const startedAt = Date.now();
    const MAX_POLL_MS = 5 * 60 * 1000; // failsafe: refetch anyway after 5 min

    async function refresh() {
      try {
        // rankings/leaderboard caches were invalidated by api.rescan() at
        // trigger time and never refetched during polling, so these hit network.
        const [data, updatedLb, logs] = await Promise.all([
          api.getRankings(lbId, false),
          api.getLeaderboard(lbId),
          api.getScanLogs(lbId),
        ]);
        setEntries(data.entries);
        setIsStale(data.is_stale ?? false);
        setLb(updatedLb);
        setScanLogs(logs);
        // scraper_note/scope enrichment runs server-side a few seconds after the
        // scan clears; pick it up with one delayed, cache-busting metadata refetch.
        setTimeout(async () => {
          try {
            invalidateCache(`/leaderboards/${lbId}`);
            setLb(await api.getLeaderboard(lbId));
          } catch { /* ignore — enrichment is best-effort */ }
        }, 30000);
      } catch (e: unknown) {
        setError((e as Error).message || "Failed to refresh after rescan");
      } finally {
        setRescanning(false);
      }
    }

    // Poll on the same 3s cadence as ScanProgressBanner. The endpoint sets
    // scan_state.start() synchronously before returning 202, so a running scan
    // is already reflected; a fast (cached) scrape that finishes first simply
    // means the first poll sees active=false and we refetch right away.
    const timer = setInterval(async () => {
      let cleared = false;
      try {
        const res = await fetch(`${BASE}/scan-status`);
        if (res.ok) {
          const st = await res.json();
          cleared = !st.active; // only trust a successful response
        }
      } catch {
        // transient (e.g. backend waking) — keep polling; the failsafe still fires
      }
      if (cleared || Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(timer);
        refresh();
      }
    }, 3000);
  }

  // Prefer explicit column_order from scraper; fall back to score keys from first entry
  const colOrder: string[] =
    lb?.column_order && lb.column_order.length > 0
      ? lb.column_order
      : entries.length > 0
      ? Object.keys(entries[0].scores)
      : [];

  const displayEntries = [...entries].sort((a, b) => {
    if (!sortCol) {
      return sortDir === "asc" ? (a.rank ?? 0) - (b.rank ?? 0) : (b.rank ?? 0) - (a.rank ?? 0);
    }
    const av = a.scores[sortCol] ?? "";
    const bv = b.scores[sortCol] ?? "";
    const an = parseFloat(String(av).replace(/[^0-9.-]/g, ""));
    const bn = parseFloat(String(bv).replace(/[^0-9.-]/g, ""));
    if (!isNaN(an) && !isNaN(bn)) return sortDir === "asc" ? an - bn : bn - an;
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  function SortIcon({ col }: { col: string }) {
    if (!sortCol && col === "") return <span className="text-indigo-400 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
    if (sortCol !== col) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-indigo-400 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const hasAbout = lb && (lb.description || lb.methodology || lb.benchmark_datasets?.length || lb.update_frequency || lb.notes);

  // Scroll the highlighted row into view once rankings are loaded.
  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlight, entries]);

  if (error && !lb) {
    return <div className="p-12 text-center text-red-400">{error}</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-gray-100">{lb?.name ?? "Loading..."}</h1>
              {lb && (
                <>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400">{lb.type}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-950 text-indigo-400">{lb.domain}</span>
                  {lb.scope && (
                    <span className={`px-2 py-0.5 rounded-full text-xs ${lb.scope === "Regional" ? "bg-orange-950 text-orange-400" : "bg-blue-950 text-blue-400"}`}>
                      {lb.scope}
                    </span>
                  )}
                  {lb.models_count != null && lb.models_count > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-400">
                      {lb.models_count} models
                    </span>
                  )}
                </>
              )}
            </div>
            {lb && (
              <p className="text-sm text-gray-500">
                {lb.publisher}
                {lb.primary_metrics?.length > 0 && (
                  <> &middot; <span className="text-gray-400">{lb.primary_metrics.join(", ")}</span></>
                )}
                {lb.official_url && (
                  <> &middot; <a href={lb.official_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Visit Official ↗</a></>
                )}
              </p>
            )}
            {isStale && !rescanning && entries.length > 0 && (
              <p className="text-xs text-amber-400 mt-1">
                Rankings may be outdated — click Re-scan to refresh
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleRescan}
              disabled={rescanning || initialLoading}
              className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {rescanning ? "Scanning..." : "↻ Re-scan"}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>

      {/* Ranking Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-100">Rankings</h2>
            {entries.length > 0 && <span className="text-sm text-gray-500">{entries.length} entries</span>}
            {rescanning && (
              <span className="text-xs text-indigo-400 animate-pulse ml-auto">Updating rankings...</span>
            )}
          </div>
          {lb?.scraper_note && (
            <p className="mt-1.5 text-xs text-amber-400/80 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5">&#9432;</span>
              {lb.scraper_note}
            </p>
          )}
        </div>

        {initialLoading ? (
          <div className="p-12 text-center text-indigo-400 animate-pulse">Loading rankings...</div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-gray-500">No ranking data available.</p>
            {lb?.last_scan_status === "error" && scanLogs[0]?.error_message && (
              <p className="text-xs text-gray-600 max-w-sm mx-auto break-all">{scanLogs[0].error_message}</p>
            )}
            <button onClick={handleRescan} className="text-indigo-400 hover:underline text-sm">Run scan</button>
          </div>
        ) : (
          <>
            {lb?.last_scan_status === "error" && (
              <div className="px-4 py-2 flex items-center justify-between bg-red-950/30 border-b border-red-900/40">
                <span className="text-xs text-red-400">Last scan failed — showing cached data</span>
                <button onClick={handleRescan} className="text-xs text-indigo-400 hover:underline">Re-scan</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 border-b border-gray-700 sticky top-0">
                  <tr>
                    {colOrder.length > 0 ? (
                      colOrder.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-3 text-left cursor-pointer text-gray-400 hover:text-indigo-400 whitespace-nowrap"
                          onClick={() => toggleSort(col)}
                        >
                          {col} <SortIcon col={col} />
                        </th>
                      ))
                    ) : (
                      <th className="px-3 py-3 text-left text-gray-500">No column data</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {displayEntries.map((entry, idx) => {
                    const isHi = !!highlight && (entry.model_name || "").trim() === highlight;
                    return (
                    <tr
                      key={idx}
                      ref={isHi ? highlightRef : undefined}
                      className={`hover:bg-gray-800 ${isHi ? "bg-indigo-900/40 ring-2 ring-inset ring-indigo-500" : entry.rank === 1 ? "bg-amber-900/20" : ""}`}
                    >
                      {colOrder.length > 0 ? (
                        colOrder.map((col) => (
                          <td key={col} className="px-3 py-2.5 text-gray-300 tabular-nums whitespace-nowrap">
                            {entry.scores[col] != null && entry.scores[col] !== ""
                              ? String(entry.scores[col])
                              : "—"}
                          </td>
                        ))
                      ) : (
                        <td className="px-3 py-2.5 text-gray-500">—</td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* About (collapsible) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <button
          onClick={() => setAboutOpen((o) => !o)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800 transition-colors"
        >
          <span className="font-semibold text-gray-100">About this leaderboard</span>
          <span className="text-gray-500 text-lg">{aboutOpen ? "▲" : "▼"}</span>
        </button>
        {aboutOpen && lb && (
          <div className="px-4 pb-4 space-y-3 text-sm text-gray-300 border-t border-gray-800">
            {lb.description && (
              <div className="pt-3">
                <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Description</p>
                <p className="leading-relaxed">{lb.description}</p>
              </div>
            )}
            {lb.methodology && (
              <div>
                <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Methodology</p>
                <p className="leading-relaxed">{lb.methodology}</p>
              </div>
            )}
            {lb.benchmark_datasets && lb.benchmark_datasets.length > 0 && (
              <div>
                <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Benchmark Datasets</p>
                <p>{lb.benchmark_datasets.join(", ")}</p>
              </div>
            )}
            {lb.update_frequency && (
              <div>
                <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Update Frequency</p>
                <p>{lb.update_frequency}</p>
              </div>
            )}
            {lb.notes && (
              <div>
                <p className="text-gray-500 uppercase text-xs font-semibold mb-1">Notes</p>
                <p className="leading-relaxed">{lb.notes}</p>
              </div>
            )}
            {!hasAbout && (
              <p className="pt-3 text-gray-500 italic">
                About information will appear here after the leaderboard is normalized.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Last Scan (collapsible) */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800 transition-colors"
        >
          <span className="font-semibold text-gray-100">Last Scan</span>
          <span className="text-gray-500 text-lg">{historyOpen ? "▲" : "▼"}</span>
        </button>
        {historyOpen && (
          <div className="border-t border-gray-800 px-4 py-4">
            {scanLogs.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-4">No scan history yet.</p>
            ) : (() => {
              const log = scanLogs[0];
              return (
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">Date / Time</p>
                    <p className="text-gray-300">{new Date(log.timestamp + "Z").toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">Status</p>
                    <p className={`font-medium ${statusColor(log.status)}`}>
                      {statusDot(log.status)} {log.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">Records Updated</p>
                    <p className="text-gray-300">{log.records_updated ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">Duration</p>
                    <p className="text-gray-300">{log.duration_ms != null ? `${log.duration_ms}ms` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">HTTP Status</p>
                    <p className="text-gray-300">{log.http_status ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">Triggered By</p>
                    <p className="text-gray-300 capitalize">{log.triggered_by}</p>
                  </div>
                  {log.error_message && (
                    <div className="col-span-full">
                      <p className="text-gray-500 text-xs uppercase font-semibold mb-0.5">Error</p>
                      <p className="text-red-400 text-xs break-all">{log.error_message}</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

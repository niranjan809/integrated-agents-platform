import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, RankingChange } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

// ── Change-log analytics ──────────────────────────────────────────────────────
// Shows ranking movements captured at scan time (manual or scheduled), grouped
// Domain → Leaderboard → scan event. The very first scan of a leaderboard is a
// baseline and records nothing; every rescan after that surfaces only what changed.

type Event = { recordedAt: string; prevScannedAt: string | null; triggeredBy: string | null; changes: RankingChange[] };
type Board = { id: number; name: string; domain: string; events: Event[] };
type CategoryGroup = { category: string; boards: Board[] };

function groupChanges(rows: RankingChange[]): CategoryGroup[] {
  // Group by the category-grid domain (e.g. "Voice AI Leaderboards"), NOT the raw
  // type (e.g. "TTS"). The raw type is kept per-board as a small tag.
  const cats = new Map<string, Map<number, Board>>();

  for (const r of rows) {
    const catKey = r.category || "Uncategorized";
    if (!cats.has(catKey)) cats.set(catKey, new Map());
    const boards = cats.get(catKey)!;

    if (!boards.has(r.leaderboard_id)) {
      boards.set(r.leaderboard_id, { id: r.leaderboard_id, name: r.leaderboard_name, domain: r.domain, events: [] });
    }
    const board = boards.get(r.leaderboard_id)!;

    const evKey = r.recorded_at ?? "unknown";
    let ev = board.events.find((e) => e.recordedAt === evKey);
    if (!ev) {
      ev = { recordedAt: evKey, prevScannedAt: r.prev_scanned_at, triggeredBy: r.triggered_by, changes: [] };
      board.events.push(ev);
    }
    ev.changes.push(r);
  }

  // rows already arrive newest-first, so insertion order is chronological desc
  return Array.from(cats.entries()).map(([category, boards]) => ({
    category,
    boards: Array.from(boards.values()),
  }));
}

const TYPE_STYLE: Record<RankingChange["change_type"], { icon: string; cls: string }> = {
  up:      { icon: "▲", cls: "text-emerald-400" },
  down:    { icon: "▼", cls: "text-red-400" },
  new:     { icon: "＋", cls: "text-sky-400" },
  dropped: { icon: "✕", cls: "text-gray-500" },
};

function ChangeRow({ c }: { c: RankingChange }) {
  const s = TYPE_STYLE[c.change_type];
  let detail: string;
  if (c.change_type === "new") detail = `new entry at #${c.new_rank}`;
  else if (c.change_type === "dropped") detail = `dropped (was #${c.old_rank})`;
  else detail = `#${c.old_rank} → #${c.new_rank}`;

  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className={`${s.cls} w-4 shrink-0 text-center font-bold`}>{s.icon}</span>
      <Link
        to={`/leaderboard/${c.leaderboard_id}?highlight=${encodeURIComponent(c.model_name)}`}
        className="text-gray-200 font-medium truncate hover:text-indigo-400 hover:underline"
        title="View this model in the leaderboard"
      >
        {c.model_name}
      </Link>
      <span className={`${s.cls} shrink-0`}>{detail}</span>
    </div>
  );
}

function fmt(ts: string | null): string {
  if (!ts || ts === "unknown") return "—";
  return new Date(ts + "Z").toLocaleString();
}

export default function AnalyticsPage() {
  const [rows, setRows] = useState<RankingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    api.getChanges()
      .then(setRows)
      .catch((e: unknown) => setError((e as Error).message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const groups = groupChanges(rows);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Analytics</h1>
          <p className="text-gray-500 mt-1">
            Ranking change log — how model positions shifted after each rescan
            (manual or scheduled), grouped by domain and leaderboard.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 px-4 py-2 text-sm font-medium border border-gray-700 text-gray-400 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-2.5 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">{error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="p-12 text-center text-gray-500">Loading change log…</div>
      ) : !loading && rows.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-10 text-center space-y-2">
          <p className="text-gray-400">No ranking changes recorded yet.</p>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            The first scan of each leaderboard sets a baseline. Changes appear here
            after the next rescan detects a model moving, entering, or dropping out.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.category}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-indigo-400 mb-3">{g.category}</h2>
              <div className="space-y-4">
                {g.boards.map((b) => (
                  <div key={b.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link to={`/leaderboard/${b.id}`} className="font-semibold text-gray-100 hover:text-indigo-400 transition-colors truncate">
                          {b.name}
                        </Link>
                        {b.domain && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 shrink-0">{b.domain}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-600 shrink-0">
                        {b.events.length} update{b.events.length !== 1 ? "s" : ""} with changes
                      </span>
                    </div>
                    <div className="divide-y divide-gray-800">
                      {b.events.map((ev, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="text-xs text-gray-500">
                              {ev.prevScannedAt ? <>from <span className="text-gray-400">{fmt(ev.prevScannedAt)}</span> → </> : <>updated </>}
                              <span className="text-gray-300">{fmt(ev.recordedAt)}</span>
                            </span>
                            <span className="text-xs text-gray-600">· {timeAgo(ev.recordedAt !== "unknown" ? ev.recordedAt : null)}</span>
                            {ev.triggeredBy && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                {ev.triggeredBy}
                              </span>
                            )}
                            <span className="text-xs text-gray-600 ml-auto">{ev.changes.length} change{ev.changes.length !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="pl-1">
                            {ev.changes.map((c) => <ChangeRow key={c.id} c={c} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

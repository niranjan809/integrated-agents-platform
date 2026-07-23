import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, RankingChange } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

// ── Change-log analytics ──────────────────────────────────────────────────────
// Shows ranking movements captured at scan time (manual or scheduled) as a flat,
// most-recently-changed-first list of leaderboards (with an optional category
// filter). The very first scan of a leaderboard is a baseline and records nothing;
// every rescan after that surfaces only what changed.

type Event = { recordedAt: string; prevScannedAt: string | null; triggeredBy: string | null; changes: RankingChange[] };
type Board = { id: number; name: string; domain: string; category: string; events: Event[] };

function groupChanges(rows: RankingChange[]): Board[] {
  // Flat list of leaderboards, most-recently-changed first — no category grouping.
  // Each board carries its category-grid domain (e.g. "Voice AI Leaderboards") as
  // a title, and the raw type (e.g. "TTS") as a small tag for context.
  const boards = new Map<number, Board>();

  for (const r of rows) {
    if (!boards.has(r.leaderboard_id)) {
      boards.set(r.leaderboard_id, {
        id: r.leaderboard_id, name: r.leaderboard_name, domain: r.domain,
        category: r.category || "Uncategorized", events: [],
      });
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

  // Most-recently-changed first. recordedAt is an ISO string, so lexicographic
  // comparison is chronological; ignore "unknown" placeholders.
  const latestTs = (b: Board): string =>
    b.events.reduce((m, e) => (e.recordedAt !== "unknown" && e.recordedAt > m ? e.recordedAt : m), "");

  const list = Array.from(boards.values());
  // sort each board's events newest-first (defensive), then boards by latest change
  const rankOf = (c: RankingChange) => c.new_rank ?? c.old_rank ?? Number.POSITIVE_INFINITY;
  for (const b of list) {
    b.events.sort((a, c) => c.recordedAt.localeCompare(a.recordedAt));
    // within each scan event, list rank changes by resulting position ascending —
    // top positions (#1, #2, …) first.
    for (const ev of b.events) ev.changes.sort((x, y) => rankOf(x) - rankOf(y));
  }
  list.sort((a, c) => latestTs(c).localeCompare(latestTs(a)));
  return list;
}

const TYPE_STYLE: Record<RankingChange["change_type"], { icon: string; text: string; badge: string }> = {
  up:      { icon: "▲", text: "text-green-400", badge: "bg-green-500/10 text-green-300 ring-1 ring-inset ring-green-500/30" },
  down:    { icon: "▼", text: "text-red-500",   badge: "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/40" },
  new:     { icon: "＋", text: "text-sky-400",     badge: "bg-sky-500/10 text-sky-300 ring-1 ring-inset ring-sky-500/30" },
  dropped: { icon: "✕", text: "text-gray-400",    badge: "bg-gray-500/10 text-gray-400 ring-1 ring-inset ring-gray-500/30" },
};

function ChangeRow({ c }: { c: RankingChange }) {
  const s = TYPE_STYLE[c.change_type];
  let detail: string;
  if (c.change_type === "new") detail = `new @ #${c.new_rank}`;
  else if (c.change_type === "dropped") detail = `dropped · was #${c.old_rank}`;
  else detail = `#${c.old_rank} → #${c.new_rank}`;

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <span className={`${s.text} w-4 shrink-0 text-center text-xs font-bold`}>{s.icon}</span>
      <Link
        to={`/leaderboard/${c.leaderboard_id}?highlight=${encodeURIComponent(c.model_name)}`}
        className="text-sm text-gray-100 font-medium truncate hover:text-indigo-300 hover:underline"
        title="View this model in the leaderboard"
      >
        {c.model_name}
      </Link>
      <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${s.badge}`}>{detail}</span>
    </div>
  );
}

function fmt(ts: string | null): string {
  if (!ts || ts === "unknown") return "—";
  return new Date(ts + "Z").toLocaleString();
}

// Colored badge for what triggered the scan (rescan / scheduler / admin …).
function TriggerBadge({ by }: { by: string | null }) {
  if (!by) return null;
  const map: Record<string, string> = {
    rescan:    "bg-indigo-500/15 text-indigo-300 ring-indigo-500/30",
    scheduler: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
    admin:     "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  };
  const cls = map[by.toLowerCase()] || "bg-gray-500/15 text-gray-300 ring-gray-500/30";
  return (
    <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ring-1 ${cls}`}>{by}</span>
  );
}

// The "from … → … · Nago · TRIGGER" line above a scan event's changes.
function EventMeta({ prevScannedAt, recordedAt, triggeredBy, count }: {
  prevScannedAt: string | null; recordedAt: string; triggeredBy: string | null; count?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
      <span className="text-xs text-gray-400">
        {prevScannedAt
          ? <>from <span className="text-gray-200 font-medium">{fmt(prevScannedAt)}</span> <span className="text-gray-600">→</span> </>
          : <>updated </>}
        <span className="text-gray-100 font-medium">{fmt(recordedAt)}</span>
      </span>
      <span className="text-xs text-gray-500">· {timeAgo(recordedAt !== "unknown" ? recordedAt : null)}</span>
      <TriggerBadge by={triggeredBy} />
      {count != null && (
        <span className="text-xs text-gray-500 ml-auto">{count} change{count !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

const PREVIEW_COUNT = 2;

export default function AnalyticsPage() {
  const [rows, setRows] = useState<RankingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [activeCat, setActiveCat] = useState<string | null>(null);

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function load() {
    setLoading(true);
    setError(null);
    api.getChanges()
      .then(setRows)
      .catch((e: unknown) => setError((e as Error).message || "Failed to load analytics"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const allBoards = groupChanges(rows);
  // Categories in recency order (allBoards is already most-recent-first, so
  // first-occurrence order puts the category with the newest change first).
  const categories = Array.from(new Set(allBoards.map((b) => b.category)));
  // Drop a stale filter if its category no longer has any changes.
  const effectiveCat = activeCat && categories.includes(activeCat) ? activeCat : null;
  const boards = effectiveCat ? allBoards.filter((b) => b.category === effectiveCat) : allBoards;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Analytics</h1>
          <p className="text-zinc-400 mt-1">
            Ranking change log — how model positions shifted after each rescan
            (manual or scheduled).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="shrink-0 px-4 py-2 text-sm font-medium border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 hover:border-gray-600 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCat(null)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              !effectiveCat
                ? "bg-indigo-600/25 border-indigo-500/60 text-indigo-200 shadow-sm shadow-indigo-950/50"
                : "border-gray-700/70 text-gray-400 hover:bg-gray-800/70 hover:text-gray-200 hover:border-gray-600"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
                effectiveCat === cat
                  ? "bg-indigo-600/25 border-indigo-500/60 text-indigo-200 shadow-sm shadow-indigo-950/50"
                  : "border-gray-700/70 text-gray-400 hover:bg-gray-800/70 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

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
        <div className="space-y-4">
          {boards.map((b) => {
                  const isOpen = expanded.has(b.id);
                  const allChanges = b.events.flatMap((e) => e.changes);
                  const total = allChanges.length;
                  const latest = b.events[0];
                  // Show the full event-grouped history only when there's more than the
                  // preview (extra changes, or more than one scan event to break out).
                  const hasMore = total > PREVIEW_COUNT || b.events.length > 1;
                  return (
                    <div key={b.id} className="rounded-xl border border-gray-800/80 bg-linear-to-b from-gray-900 to-gray-900/40 overflow-hidden shadow-sm hover:border-gray-700 transition-colors">
                      {/* main details */}
                      <div className="px-4 py-3 border-b border-gray-800/80 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {b.category && (
                            <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-indigo-300 mb-1">{b.category}</div>
                          )}
                          <div className="flex items-center gap-2 min-w-0">
                            <Link to={`/leaderboard/${b.id}`} className="font-semibold text-gray-50 hover:text-indigo-300 transition-colors truncate">
                              {b.name}
                            </Link>
                            {b.domain && (
                              <span className="font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 ring-1 ring-gray-700 shrink-0">{b.domain}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 shrink-0 mt-0.5 whitespace-nowrap">
                          {total} change{total !== 1 ? "s" : ""} · {b.events.length} update{b.events.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {!isOpen ? (
                        // Collapsed: latest-update line + first 2 changes + Show more
                        <div className="px-4 py-3">
                          <EventMeta prevScannedAt={latest.prevScannedAt} recordedAt={latest.recordedAt} triggeredBy={latest.triggeredBy} />
                          <div className="divide-y divide-gray-800/50">
                            {allChanges.slice(0, PREVIEW_COUNT).map((c) => <ChangeRow key={c.id} c={c} />)}
                          </div>
                          {hasMore && (
                            <button
                              onClick={() => toggle(b.id)}
                              className="mt-2.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors"
                            >
                              Show all {total} change{total !== 1 ? "s" : ""} ▾
                            </button>
                          )}
                        </div>
                      ) : (
                        // Expanded: full event-grouped history + Show less
                        <>
                          <div className="divide-y divide-gray-800">
                            {b.events.map((ev, i) => (
                              <div key={i} className="px-4 py-3">
                                <EventMeta prevScannedAt={ev.prevScannedAt} recordedAt={ev.recordedAt} triggeredBy={ev.triggeredBy} count={ev.changes.length} />
                                <div className="divide-y divide-gray-800/50">
                                  {ev.changes.map((c) => <ChangeRow key={c.id} c={c} />)}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="px-4 py-2 border-t border-gray-800">
                            <button
                              onClick={() => toggle(b.id)}
                              className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition-colors"
                            >
                              Show less ▲
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
          })}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';

// Node proxy (JWT + brand-visibility section gated). Returns
// { runs, total, limit, offset }; each run carries the raw summary_json string.
const RUNS_PATH = '/api/brand-visibility/config/x/runs';

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const STATUS_OPTIONS = ['all', 'running', 'completed', 'completed_partial', 'failed'];

// ── formatting helpers ────────────────────────────────────────────────────────
function parseTs(ts) {
  // Postgres/FastAPI timestamps may arrive with a space instead of 'T', or as a
  // bare date. Return a Date or null.
  if (!ts) return null;
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function timeAgo(ts) {
  const d = parseTs(ts);
  if (!d) return '—';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 0) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function isoTitle(ts) {
  const d = parseTs(ts);
  return d ? d.toISOString() : (ts ?? '');
}

function fmtDuration(startTs, endTs) {
  const s = parseTs(startTs);
  const e = parseTs(endTs);
  if (!s || !e) return '—';
  const totalSec = Math.max(0, Math.round((e.getTime() - s.getTime()) / 1000));
  const m = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// Parse the raw summary_json string with null-safety. Returns the object, or
// null if absent/unparseable (callers render a "Data unavailable" placeholder).
function parseSummary(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw; // already parsed (defensive)
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function fmtCost(summary) {
  const c = summary?.classify?.total_cost_usd;
  if (c == null || Number.isNaN(Number(c))) return '—';
  return `$${Number(c).toFixed(4)}`;
}

// Records "new" for the table: prefer the DB column, fall back to summing the
// summary phases when the column is null (older rows).
function recordsNew(run, summary) {
  if (run.records_new != null) return run.records_new;
  if (!summary) return '—';
  const kw = Number(summary?.keywords?.new ?? 0);
  const inf = Number(summary?.influencers?.new ?? 0);
  return kw + inf;
}
function recordsUpdated(run, summary) {
  if (run.records_updated != null) return run.records_updated;
  const u = summary?.keywords?.updated;
  return u == null ? '—' : u;
}

const statusClass = (status) =>
  `status-badge status-${String(status || 'unknown').replace(/_/g, '-')}`;

// ── run detail modal ────────────────────────────────────────────────────────
function PhaseSection({ title, rows }) {
  const present = rows.filter(([, v]) => v != null);
  if (present.length === 0) return null;
  return (
    <div className="run-phase-section">
      <h4>{title}</h4>
      <div className="run-phase-grid">
        {present.map(([k, v]) => (
          <div key={k} className="run-phase-item">
            <span className="run-phase-label">{k}</span>
            <span className="run-phase-value">{String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunDetailModal({ run, onClose }) {
  const [showRaw, setShowRaw] = useState(false);
  const summary = useMemo(() => parseSummary(run.summary_json), [run.summary_json]);

  const config = summary?.config;
  const kw = summary?.keywords || {};
  const inf = summary?.influencers || {};
  const rt = summary?.reply_trees || {};
  const cls = summary?.classify || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card run-detail-modal" onClick={e => e.stopPropagation()}>
        <div className="run-detail-head">
          <h2>Run #{run.id}</h2>
          <span className={statusClass(run.status)}>{String(run.status || '—').replace(/_/g, ' ')}</span>
        </div>
        <p className="run-detail-sub">
          <span title={isoTitle(run.started_at)}>Started {timeAgo(run.started_at)}</span>
          {' · '}Duration {fmtDuration(run.started_at, run.ended_at)}
          {run.triggered_by ? ` · ${run.triggered_by}` : ''}
        </p>

        {run.error_message && (
          <div className="page-error" style={{ margin: '0 0 16px' }}>{run.error_message}</div>
        )}

        {!summary ? (
          <div className="empty-state">Data unavailable — this run has no parseable summary.</div>
        ) : (
          <>
            {config && (
              <div className="run-phase-section">
                <h4>Config used</h4>
                <div className="run-phase-grid">
                  {Object.entries(config).map(([k, v]) => (
                    <div key={k} className="run-phase-item">
                      <span className="run-phase-label">{k}</span>
                      <span className="run-phase-value">{v == null ? '—' : String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <PhaseSection title="Keywords phase" rows={[
              ['new', kw.new], ['updated', kw.updated], ['api_calls', kw.api_calls],
            ]} />
            <PhaseSection title="Influencers phase" rows={[
              ['new', inf.new], ['api_calls', inf.api_calls],
            ]} />
            <PhaseSection title="Reply trees phase" rows={[
              ['reply_tweets', rt.reply_tweets], ['api_calls', rt.api_calls],
            ]} />
            <PhaseSection title="Classify phase" rows={[
              ['classified', cls.classified], ['skipped', cls.skipped], ['noise', cls.noise],
              ['promoters_added', cls.promoters_added], ['reputation_updated', cls.reputation_updated],
              ['total_cost_usd', cls.total_cost_usd != null ? `$${Number(cls.total_cost_usd).toFixed(4)}` : null],
            ]} />

            <button className="btn-ghost sm" onClick={() => setShowRaw(s => !s)} style={{ marginTop: 8 }}>
              {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>
            {showRaw && <pre className="run-raw-json">{JSON.stringify(summary, null, 2)}</pre>}
          </>
        )}

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function History() {
  const { apiFetch } = useAuth();

  const [runs, setRuns] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const [pageSize, setPageSize] = useState(20);
  const [offset, setOffset] = useState(0);

  // Client-side filters (applied to the fetched page — Python only paginates).
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let alive = true;
    apiFetch(`${RUNS_PATH}?limit=${pageSize}&offset=${offset}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`runs ${r.status}`)))
      .then(data => {
        if (!alive) return;
        setRuns(Array.isArray(data.runs) ? data.runs : []);
        setTotal(Number.isFinite(data.total) ? data.total : (data.runs?.length || 0));
        setLoading(false);
      })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [apiFetch, pageSize, offset]);

  useEffect(() => load(), [load]);

  // Apply client-side filters to the current page.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate + 'T00:00:00') : null;
    const to = toDate ? new Date(toDate + 'T23:59:59') : null;
    return runs.filter(run => {
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (q) {
        const hay = `${run.id} ${run.triggered_by || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const started = parseTs(run.started_at);
      if (from && (!started || started < from)) return false;
      if (to && (!started || started > to)) return false;
      return true;
    });
  }, [runs, search, statusFilter, fromDate, toDate]);

  const anyFilter = search.trim() || statusFilter !== 'all' || fromDate || toDate;
  const start = total === 0 ? 0 : offset + 1;
  const end = offset + runs.length;
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  function changePageSize(n) { setPageSize(n); setOffset(0); }

  return (
    <div className="page history-page">
      <div className="page-header">
        <h1>History</h1>
        <p className="page-sub">X · sweep run history</p>
      </div>

      {/* Toolbar */}
      <div className="history-toolbar">
        <input
          className="search-input"
          placeholder="Search run # or trigger…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'all' ? 'Status: All' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <label className="history-date">
          <span>From</span>
          <input className="search-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </label>
        <label className="history-date">
          <span>To</span>
          <input className="search-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </label>
        <select className="filter-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
          {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      </div>

      {/* States */}
      {loading ? (
        <div className="page-loader"><div className="spinner" /></div>
      ) : error ? (
        <div className="history-error">
          <div className="page-error" style={{ margin: 0 }}>Failed to load runs: {error}</div>
          <button className="btn-primary" style={{ marginTop: 12 }} onClick={load}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No runs match your filters.</div>
      ) : (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Run</th><th>Started</th><th>Ended</th><th>Status</th>
                <th>New</th><th>Updated</th><th>Duration</th><th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(run => {
                const summary = parseSummary(run.summary_json);
                return (
                  <tr key={run.id} className="history-row" onClick={() => setSelected(run)}>
                    <td className="mono">#{run.id}</td>
                    <td title={isoTitle(run.started_at)}>{timeAgo(run.started_at)}</td>
                    <td title={isoTitle(run.ended_at)}>{run.ended_at ? timeAgo(run.ended_at) : '—'}</td>
                    <td><span className={statusClass(run.status)}>{String(run.status || '—').replace(/_/g, ' ')}</span></td>
                    <td>{recordsNew(run, summary)}</td>
                    <td>{recordsUpdated(run, summary)}</td>
                    <td>{fmtDuration(run.started_at, run.ended_at)}</td>
                    <td className="mono">{fmtCost(summary)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && (
        <div className="pagination-controls">
          <button className="page-btn" disabled={!canPrev} onClick={() => setOffset(o => Math.max(0, o - pageSize))}>
            ← Prev
          </button>
          <span className="page-info">
            {anyFilter
              ? `${filtered.length} match on this page · ${total} total`
              : (total === 0 ? '0 runs' : `Showing ${start}–${end} of ${total}`)}
          </span>
          <button className="page-btn" disabled={!canNext} onClick={() => setOffset(o => o + pageSize)}>
            Next →
          </button>
        </div>
      )}

      {selected && <RunDetailModal run={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

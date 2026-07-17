import { useEffect, useMemo, useRef, useState } from 'react';
import { pythonFetch } from '../../../utils/pythonApi';
import { useAuth } from '../../../context/AuthContext';

// Editable subset of x_schedule — same fields the Scheduler edits and the Python
// RunNowRequest accepts as per-run overrides. Kept identical to Scheduler.jsx.
const EDITABLE = ['mode', 'sweep_type', 'max_pages', 'max_keywords', 'class_filter', 'since_hours', 'max_api_calls'];
const NUMERIC = new Set(['max_pages', 'max_keywords', 'max_api_calls']);

const MODE_OPTIONS = ['all', 'keywords', 'influencers', 'reply_trees', 'classify', 'cluster', 'draft'];
const SWEEP_TYPE_OPTIONS = ['Latest', 'Top'];

// Ranges mirror the backend validator (db._validate_schedule_field) exactly.
const RANGES = { max_pages: [1, 10], max_keywords: [1, 1000], max_api_calls: [1, 1000] };
const SINCE_RANGE = [1, 720];
const CLASS_CODES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'NOISE', 'GOVT_PROMOTION']);

const TERMINAL = new Set(['completed', 'completed_partial', 'failed']);

// Node proxy (JWT-authed) — Stage 2 mounted the router under /config.
const RUN_NOW_PATH = '/api/brand-visibility/config/x/run-now';
const runStatusPath = (id) => `/api/brand-visibility/config/x/run-status/${id}`;

const asStr = (v) => (v == null ? '' : String(v));

function parseTs(ts) {
  // Postgres/FastAPI timestamps may arrive with a space instead of 'T'.
  if (!ts) return null;
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtTime(ts) {
  const d = parseTs(ts);
  return d ? d.toLocaleString() : (ts ?? '—');
}
function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// Validate one field; returns an error string or null. Selects are always valid.
function fieldError(f, value) {
  const raw = asStr(value).trim();
  if (NUMERIC.has(f)) {
    if (raw === '') return 'Required.';
    const n = Number(raw);
    if (!Number.isInteger(n)) return 'Must be a whole number.';
    const [lo, hi] = RANGES[f];
    if (n < lo || n > hi) return `Must be between ${lo} and ${hi}.`;
    return null;
  }
  if (f === 'since_hours') {
    if (raw === '') return null; // blank = no limit
    const n = Number(raw);
    if (!Number.isInteger(n)) return 'Must be a whole number, or blank.';
    if (n < SINCE_RANGE[0] || n > SINCE_RANGE[1]) return `Must be between ${SINCE_RANGE[0]} and ${SINCE_RANGE[1]}, or blank.`;
    return null;
  }
  if (f === 'class_filter') {
    if (raw === '') return null; // blank = all classes
    const bad = raw.split(',').map((t) => t.trim()).filter(Boolean).filter((t) => !CLASS_CODES.has(t));
    return bad.length ? `Unknown class code(s): ${bad.join(', ')}` : null;
  }
  return null;
}

export default function ManualRun() {
  const { apiFetch } = useAuth();

  const [loaded, setLoaded] = useState(null);   // full GET /schedule row
  const [form, setForm] = useState({});          // editable working copy (strings)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);      // page-load error
  const [triggering, setTriggering] = useState(false);
  const [trigger, setTrigger] = useState(null);  // { type, message, trackRunId? }

  const [runId, setRunId] = useState(null);
  const [run, setRun] = useState(null);          // latest run-status row
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef(null);

  function hydrate(row) {
    setLoaded(row);
    setForm(Object.fromEntries(EDITABLE.map((f) => [f, asStr(row[f])])));
  }

  function load({ initial } = {}) {
    if (initial) setLoading(true);
    setError(null);
    pythonFetch('/api/x/schedule')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`schedule ${r.status}`))))
      .then((d) => { hydrate(d); if (initial) setLoading(false); })
      .catch((e) => { setError(e.message); if (initial) setLoading(false); });
  }

  useEffect(() => { load({ initial: true }); }, []);

  const errors = useMemo(
    () => Object.fromEntries(EDITABLE.map((f) => [f, fieldError(f, form[f])])),
    [form]
  );
  const hasErrors = Object.values(errors).some(Boolean);
  const dirty = useMemo(
    () => loaded != null && EDITABLE.some((f) => form[f] !== asStr(loaded[f])),
    [form, loaded]
  );
  const runActive = runId != null && (!run || !TERMINAL.has(run.status));

  function setField(f, v) { setForm((prev) => ({ ...prev, [f]: v })); }

  // Mirror Scheduler.buildPayload: numerics -> int, since_hours '' -> null,
  // strings (mode/sweep_type/class_filter) verbatim. Sent as per-run override.
  function buildPayload() {
    const p = {};
    for (const f of EDITABLE) {
      const raw = asStr(form[f]).trim();
      if (f === 'since_hours') p.since_hours = raw === '' ? null : Number.parseInt(raw, 10);
      else if (NUMERIC.has(f)) p[f] = Number.parseInt(raw, 10);
      else p[f] = form[f];
    }
    return p;
  }

  // ── Polling: GET run-status every 2s until a terminal state ────────────────
  useEffect(() => {
    if (runId == null) return undefined;
    let alive = true;

    async function poll() {
      try {
        const res = await apiFetch(runStatusPath(runId));
        if (!alive) return;
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          clearInterval(pollRef.current);
          setTrigger({ type: 'error', message: `Could not read run status (HTTP ${res.status}). ${d.error || d.detail || ''}`.trim() });
          return;
        }
        const data = await res.json();
        if (!alive) return;
        setRun(data);
        if (TERMINAL.has(data.status)) clearInterval(pollRef.current);
      } catch (e) {
        if (!alive) return;
        clearInterval(pollRef.current);
        setTrigger({
          type: 'error',
          message: e.message === 'Session expired'
            ? 'Auth expired, please log in again.'
            : `Lost connection while polling: ${e.message}.`,
        });
      }
    }

    poll(); // immediate, then every 2s
    pollRef.current = setInterval(poll, 2000);
    return () => { alive = false; clearInterval(pollRef.current); };
  }, [runId, apiFetch]);

  // ── Live elapsed ticker while a run is in flight ───────────────────────────
  useEffect(() => {
    if (!run || TERMINAL.has(run.status)) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run?.id, run?.status]);

  async function runNow() {
    if (hasErrors || runActive) return;
    setTriggering(true);
    setTrigger(null);
    try {
      const res = await apiFetch(RUN_NOW_PATH, { method: 'POST', body: JSON.stringify(buildPayload()) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        setRun(null);
        setNow(Date.now());
        setRunId(data.run_id);
        setTrigger({ type: 'success', message: `Run #${data.run_id} started.` });
      } else if (res.status === 409) {
        const d = data.detail || data;
        setTrigger({
          type: 'error',
          message: `A sweep is already running (run #${d.run_id}, started ${fmtTime(d.started_at)}).`,
          trackRunId: d.run_id,
        });
      } else if (res.status === 429) {
        const d = data.detail || data;
        setTrigger({
          type: 'error',
          message: `Monthly API budget would be exceeded — ${d.current_calls} used + up to ${d.requested_max} requested exceeds the ${d.monthly_budget} cap. Lower "Max API calls" or wait for next month.`,
        });
      } else {
        // 500 (gateway/server misconfig), 502 (Python down), 400, etc.
        const d = data.detail;
        const msg = data.error
          || (d && typeof d === 'object' ? (d.message || JSON.stringify(d)) : d)
          || `Request failed (HTTP ${res.status}).`;
        setTrigger({ type: 'error', message: msg });
      }
    } catch (e) {
      setTrigger({
        type: 'error',
        message: e.message === 'Session expired'
          ? 'Auth expired, please log in again.'
          : `Network error: ${e.message}. Check your connection and try again.`,
      });
    } finally {
      setTriggering(false);
    }
  }

  function trackRun(id) {
    setTrigger(null);
    setRun(null);
    setNow(Date.now());
    setRunId(id);
  }

  function reset() {
    setTrigger(null);
    load(); // reload from the saved schedule
  }

  function anotherRun() {
    clearInterval(pollRef.current);
    setRunId(null);
    setRun(null);
    setTrigger(null);
  }

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error) return <div className="page-error">Failed to load: {error}</div>;

  const summary = run && (run.summary_json ?? run.summary);
  const summaryText = summary
    ? (typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2))
    : null;
  const startMs = run ? parseTs(run.started_at)?.getTime() : null;
  const endMs = run?.ended_at ? parseTs(run.ended_at)?.getTime() : now;
  const elapsedMs = startMs != null && endMs != null ? Math.max(0, endMs - startMs) : null;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Manual Run</h1>
        <p className="page-sub">Trigger a sweep with custom config (this run only, doesn't save to Scheduler)</p>
      </div>

      {trigger && (
        <div className={trigger.type === 'success' ? 'page-success' : 'page-error'}>
          {trigger.message}
          {trigger.trackRunId != null && (
            <> <button className="btn-ghost sm" style={{ marginLeft: 12 }} onClick={() => trackRun(trigger.trackRunId)}>Track this run</button></>
          )}
        </div>
      )}

      {/* ── Progress (visible once a run is triggered/tracked) ── */}
      {runId != null && (
        <div className="run-progress-card">
          <div className="run-progress-head">
            <h3>Run #{runId}</h3>
            <span className={`status-pill ${asStr(run?.status).replace(/_/g, '-') || 'running'}`}>
              <span className="dot" />{(run?.status || 'starting').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="run-metrics">
            <div>
              <div className="run-metric-value">{run?.records_new ?? '—'}</div>
              <div className="run-metric-label">records new</div>
            </div>
            <div>
              <div className="run-metric-value">{run?.records_updated ?? '—'}</div>
              <div className="run-metric-label">records updated</div>
            </div>
            <div>
              <div className="run-metric-value">{run?.calls_used ?? '—'}</div>
              <div className="run-metric-label">API calls used</div>
            </div>
          </div>

          <div className="run-elapsed">
            {run?.started_at ? <>Started {fmtTime(run.started_at)} · </> : null}
            {elapsedMs != null ? <>Elapsed {fmtElapsed(elapsedMs)}</> : 'Starting…'}
            {runActive ? ' · polling every 2s' : ''}
          </div>

          {run?.status === 'failed' && run?.error_message && (
            <p className="field-error" style={{ marginTop: 12 }}>Error: {run.error_message}</p>
          )}

          {run && TERMINAL.has(run.status) && summaryText && (
            <pre className="run-summary">{summaryText}</pre>
          )}

          {run && TERMINAL.has(run.status) && (
            <div className="config-actions" style={{ marginTop: 16 }}>
              <button className="btn-primary" onClick={anotherRun}>Trigger another run</button>
            </div>
          )}
        </div>
      )}

      {loaded && (
        <p className="config-updated">
          ✓ Config loaded from Scheduler{dirty ? ' · modified for this run' : ''}
          {loaded.updated_at ? ` · saved ${fmtTime(loaded.updated_at)}` : ''}
        </p>
      )}

      {/* ── Sweep behavior ── */}
      <div className="config-section">
        <h3>Sweep behavior</h3>
        <div className="config-field">
          <label>Mode</label>
          <select className="filter-select" value={form.mode} onChange={(e) => setField('mode', e.target.value)}>
            {MODE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="config-field">
          <label>Sweep type</label>
          <select className="filter-select" value={form.sweep_type} onChange={(e) => setField('sweep_type', e.target.value)}>
            {SWEEP_TYPE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="config-field">
          <label>Class filter <span className="config-hint">blank = all · comma-separated codes (A–K, NOISE, GOVT_PROMOTION)</span></label>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <input className="search-input" style={{ width: '100%' }} value={form.class_filter}
              onChange={(e) => setField('class_filter', e.target.value)} placeholder="e.g. C,A,K" />
            {errors.class_filter && <div className="field-error">{errors.class_filter}</div>}
          </div>
        </div>
        <div className="config-field">
          <label>Since hours <span className="config-hint">blank = no limit · 1–720</span></label>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <input className="search-input" style={{ width: '100%' }} type="number" min="1" max="720" value={form.since_hours}
              onChange={(e) => setField('since_hours', e.target.value)} placeholder="(none)" />
            {errors.since_hours && <div className="field-error">{errors.since_hours}</div>}
          </div>
        </div>
      </div>

      {/* ── Budget caps ── */}
      <div className="config-section">
        <h3>Budget caps</h3>
        <div className="config-field">
          <label>Max pages / query <span className="config-hint">1–10</span></label>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <input className="search-input" style={{ width: '100%' }} type="number" min="1" max="10" value={form.max_pages}
              onChange={(e) => setField('max_pages', e.target.value)} />
            {errors.max_pages && <div className="field-error">{errors.max_pages}</div>}
          </div>
        </div>
        <div className="config-field">
          <label>Max keywords <span className="config-hint">queries per sweep · 1–1000</span></label>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <input className="search-input" style={{ width: '100%' }} type="number" min="1" max="1000" value={form.max_keywords}
              onChange={(e) => setField('max_keywords', e.target.value)} />
            {errors.max_keywords && <div className="field-error">{errors.max_keywords}</div>}
          </div>
        </div>
        <div className="config-field">
          <label>Max API calls <span className="config-hint">per-sweep RapidAPI budget · 1–1000</span></label>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <input className="search-input" style={{ width: '100%' }} type="number" min="1" max="1000" value={form.max_api_calls}
              onChange={(e) => setField('max_api_calls', e.target.value)} />
            {errors.max_api_calls && <div className="field-error">{errors.max_api_calls}</div>}
          </div>
        </div>
      </div>

      <div className="config-actions">
        <button className="btn-ghost" onClick={reset} disabled={triggering}>Reset to Scheduler config</button>
        <button className="btn-primary" onClick={runNow} disabled={triggering || hasErrors || runActive}>
          {triggering ? 'Starting…' : runActive ? 'Run in progress…' : 'Run Now'}
        </button>
      </div>
    </div>
  );
}

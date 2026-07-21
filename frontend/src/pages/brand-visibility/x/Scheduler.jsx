import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { schedulerHelp } from '../../../constants/agentInfo';

// Small "?" hint next to a field label. Shows a hover/focus bubble; the native
// title attribute is the fallback when CSS isn't applied. Renders nothing when
// there's no help text for the field.
function FieldHelp({ text }) {
  if (!text) return null;
  return (
    <span className="info-tooltip" tabIndex={0} title={text} aria-label={text}>
      ?
      <span className="info-tooltip-bubble" role="tooltip">{text}</span>
    </span>
  );
}

// Editable subset of x_schedule (matches UpdateScheduleRequest).
const EDITABLE = ['mode', 'sweep_type', 'max_pages', 'max_keywords', 'class_filter', 'since_hours', 'max_api_calls'];
const NUMERIC = new Set(['max_pages', 'max_keywords', 'max_api_calls']);

// mode values from the backend scheduler form template.
const MODE_OPTIONS = ['all', 'keywords', 'influencers', 'reply_trees', 'classify', 'cluster', 'draft'];
const SWEEP_TYPE_OPTIONS = ['Latest', 'Top'];

// Normalize a loaded value to a string for controlled inputs (null -> '').
const asStr = (v) => (v == null ? '' : String(v));

export default function Scheduler() {
  const { apiFetch } = useAuth();
  const [loaded, setLoaded] = useState(null);   // full GET row (incl. read-only fields)
  const [form, setForm] = useState({});          // editable working copy (strings)
  const [help, setHelp] = useState(schedulerHelp); // field -> description (endpoint, falls back to constant)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);    // { type, message }

  function hydrate(row) {
    setLoaded(row);
    setForm(Object.fromEntries(EDITABLE.map(f => [f, asStr(row[f])])));
  }

  function load() {
    setLoading(true);
    setError(null);
    apiFetch('/api/brand-visibility/config/x/schedule')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`schedule ${r.status}`)))
      .then(d => { hydrate(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  // Field help text (question-mark tooltips). Endpoint is section-level; if it
  // fails we keep the bundled constant so tooltips still render.
  useEffect(() => {
    let alive = true;
    apiFetch('/api/brand-visibility/config/x/scheduler-help')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`scheduler-help ${r.status}`)))
      .then(d => {
        if (!alive || !d?.fields) return;
        setHelp(Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.description])));
      })
      .catch(() => { /* keep constant fallback */ });
    return () => { alive = false; };
  }, []);

  const dirty = useMemo(
    () => loaded != null && EDITABLE.some(f => form[f] !== asStr(loaded[f])),
    [form, loaded]
  );

  function setField(f, v) { setForm(prev => ({ ...prev, [f]: v })); }

  function buildPayload() {
    const p = {};
    for (const f of EDITABLE) {
      const raw = (form[f] ?? '').trim?.() ?? form[f];
      if (f === 'since_hours') {
        p.since_hours = raw === '' ? null : Number.parseInt(raw, 10);
      } else if (NUMERIC.has(f)) {
        p[f] = Number.parseInt(raw, 10);
      } else {
        p[f] = form[f]; // mode, sweep_type, class_filter (class_filter may be '')
      }
    }
    return p;
  }

  async function save() {
    // Client-side guard: numeric fields must be valid positive integers.
    for (const f of NUMERIC) {
      const n = Number.parseInt((form[f] ?? '').trim(), 10);
      if (!Number.isInteger(n) || n < 1) {
        setStatus({ type: 'error', message: `${f.replace(/_/g, ' ')} must be a positive integer.` });
        return;
      }
    }
    if (form.since_hours.trim() !== '' && !(Number.parseInt(form.since_hours, 10) >= 0)) {
      setStatus({ type: 'error', message: 'Since hours must be a non-negative integer or blank.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      // Write goes through the JWT-authed Node gateway (which injects X-Cron-Secret).
      // Python's PUT /api/x/schedule is locked down (P0); direct pythonFetch would 401.
      const r = await apiFetch('/api/brand-visibility/config/x/schedule', { method: 'PUT', body: JSON.stringify(buildPayload()) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || `save failed (${r.status})`);
      hydrate(d);
      setStatus({ type: 'success', message: 'Schedule saved.' });
    } catch (e) {
      setStatus({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  }

  function discard() { if (loaded) hydrate(loaded); setStatus(null); }

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error) return <div className="page-error">Failed to load: {error}</div>;

  return (
    <div className="page scheduler-page">
      <div className="page-header">
        <h1>Sweep Scheduler</h1>
        <p className="page-sub">
          X · sweep configuration
          {loaded?.last_run_at ? ` · last run ${new Date(loaded.last_run_at).toLocaleString()} (${loaded.last_run_status || '—'})` : ''}
        </p>
      </div>

      {status && <div className={status.type === 'success' ? 'page-success' : 'page-error'}>{status.message}</div>}

      {/* Sweep behavior */}
      <div className="config-section">
        <h3>Sweep behavior</h3>
        <div className="config-field">
          <label>Mode <FieldHelp text={help.mode} /></label>
          <select className="filter-select" value={form.mode} onChange={e => setField('mode', e.target.value)}>
            {MODE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="config-field">
          <label>Sweep type</label>
          <select className="filter-select" value={form.sweep_type} onChange={e => setField('sweep_type', e.target.value)}>
            {SWEEP_TYPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="config-field">
          <label>Class filter <FieldHelp text={help.class_filter} /> <span className="config-hint">blank = all · comma-separated codes (A–K, NOISE)</span></label>
          <input className="search-input" value={form.class_filter}
            onChange={e => setField('class_filter', e.target.value)} placeholder="e.g. C,A,K" />
        </div>
        <div className="config-field">
          <label>Since hours <FieldHelp text={help.since_hours} /> <span className="config-hint">blank = no limit · 1–720</span></label>
          <input className="search-input" type="number" min="1" max="720" value={form.since_hours}
            onChange={e => setField('since_hours', e.target.value)} placeholder="(none)" />
        </div>
      </div>

      {/* Budget caps */}
      <div className="config-section">
        <h3>Budget caps</h3>
        <div className="config-field">
          <label>Max pages / query <FieldHelp text={help.max_pages} /> <span className="config-hint">1–10</span></label>
          <input className="search-input" type="number" min="1" max="10" value={form.max_pages}
            onChange={e => setField('max_pages', e.target.value)} />
        </div>
        <div className="config-field">
          <label>Max keywords <FieldHelp text={help.max_keywords} /> <span className="config-hint">queries per sweep · 1–1000</span></label>
          <input className="search-input" type="number" min="1" max="1000" value={form.max_keywords}
            onChange={e => setField('max_keywords', e.target.value)} />
        </div>
        <div className="config-field">
          <label>Max API calls <FieldHelp text={help.max_api_calls} /> <span className="config-hint">per-sweep RapidAPI budget · 1–1000</span></label>
          <input className="search-input" type="number" min="1" max="1000" value={form.max_api_calls}
            onChange={e => setField('max_api_calls', e.target.value)} />
        </div>
      </div>

      {loaded?.updated_at && (
        <p className="config-updated">Last updated: {new Date(loaded.updated_at).toLocaleString()}</p>
      )}

      <div className="config-actions">
        <button className="btn-ghost" onClick={discard} disabled={!dirty || saving}>Discard</button>
        <button className="btn-primary" onClick={save} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';

const LIMIT = 100;

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

// Admin-only audit trail viewer. Server-side filtering + offset pagination via
// GET /api/admin/audit-log. Action/actor dropdowns are built from the currently
// loaded page (per the Phase 2 spec).
export default function AuditLogTab() {
  const { apiFetch } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);

  // filters
  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // meta expansion
  const [open, setOpen] = useState(() => new Set());

  function buildQuery(off) {
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(off) });
    if (action)  p.set('action', action);
    if (actorId) p.set('actor_id', actorId);
    if (from)    p.set('from', from);
    if (to)      p.set('to', to);
    return p.toString();
  }

  function load(off) {
    setLoading(true);
    setError(null);
    apiFetch(`/api/admin/audit-log?${buildQuery(off)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`audit-log ${r.status}`))))
      .then(d => { setEntries(d.entries || []); setOffset(off); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  // Reload from page 0 whenever a filter changes.
  useEffect(() => { load(0); /* eslint-disable-next-line */ }, [action, actorId, from, to]);

  // Dropdown options from the loaded page.
  const actionOptions = useMemo(() => [...new Set(entries.map(e => e.action))].sort(), [entries]);
  const actorOptions = useMemo(() => {
    const m = new Map();
    for (const e of entries) if (!m.has(e.actor_id)) m.set(e.actor_id, e.actor_email);
    return [...m.entries()];
  }, [entries]);

  function toggleMeta(id) {
    setOpen(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const hasPrev = offset > 0;
  const hasNext = entries.length === LIMIT;

  return (
    <div className="account-tabpane">
      <div className="kw-toolbar">
        <select className="filter-select" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All actions</option>
          {actionOptions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="filter-select" value={actorId} onChange={e => setActorId(e.target.value)}>
          <option value="">All actors</option>
          {actorOptions.map(([id, email]) => <option key={id} value={id}>{email}</option>)}
        </select>
        <input className="search-input" type="date" value={from} onChange={e => setFrom(e.target.value)} title="From date" />
        <input className="search-input" type="date" value={to} onChange={e => setTo(e.target.value)} title="To date" />
      </div>

      {error && <div className="page-error">{error}</div>}
      {loading ? <div className="empty-state">Loading audit log…</div> : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Timestamp</th><th>Actor</th><th>Action</th>
                  <th>Target Type</th><th>Target ID</th><th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr><td colSpan={6}><div className="empty-state">No audit entries match these filters.</div></td></tr>
                )}
                {entries.map(e => (
                  <tr key={e.id}>
                    <td>{fmtTs(e.created_at)}</td>
                    <td>{e.actor_email}</td>
                    <td><code>{e.action}</code></td>
                    <td>{e.target_type || '—'}</td>
                    <td>{e.target_id || '—'}</td>
                    <td>
                      {e.meta ? (
                        <>
                          <button className="btn-ghost sm" onClick={() => toggleMeta(e.id)}>
                            {open.has(e.id) ? 'Hide' : 'View'}
                          </button>
                          {open.has(e.id) && (
                            <pre className="audit-meta-expanded">{JSON.stringify(e.meta, null, 2)}</pre>
                          )}
                        </>
                      ) : <span className="audit-meta-collapsed">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="config-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="page-sub" style={{ margin: 0 }}>
              Showing {entries.length ? offset + 1 : 0}–{offset + entries.length}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" disabled={!hasPrev} onClick={() => load(Math.max(0, offset - LIMIT))}>← Prev</button>
              <button className="btn-ghost" disabled={!hasNext} onClick={() => load(offset + LIMIT)}>Next →</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

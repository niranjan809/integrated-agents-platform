import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

// Format an ISO/Postgres timestamp for display; '—' when absent/unparseable.
function fmt(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

// Hero card at the top of the Overview page.
//
// Props:
//   about        — GET /x/about payload (name, status, creator, version, section,
//                  last_run_at, total_runs, description, description_override).
//                  admin_notes is NOT here — it moved to the admin-only
//                  /x/integrations endpoint (see adminNotes below).
//   integrations — array of integration names (admin-only; null/undefined hides
//                  the chips row for non-admins)
//   onUpdated    — called with the PATCH /x/about response after a successful save
export default function AgentAboutCard({ about, integrations, onUpdated }) {
  const { user, apiFetch } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [editing, setEditing] = useState(false);
  // admin_notes now comes from GET /x/integrations (admin-only on both endpoint
  // and client). Non-admins never fetch it, so they never see internal notes.
  const [adminNotes, setAdminNotes] = useState(null);
  const [notes, setNotes] = useState('');
  const [override, setOverride] = useState(about.description_override || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const description = about.description_override || about.description;
  const status = about.status || 'soon';

  // Read admin_notes from the admin-only integrations endpoint. Gated on isAdmin
  // so a non-admin never issues the request (and the endpoint would 403 anyway).
  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    apiFetch('/api/brand-visibility/config/x/integrations')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`integrations ${r.status}`)))
      .then(d => { if (alive) setAdminNotes(d.admin_notes ?? null); })
      .catch(() => { if (alive) setAdminNotes(null); });
    return () => { alive = false; };
  }, [isAdmin]);

  function openEdit() {
    setNotes(adminNotes || '');
    setOverride(about.description_override || '');
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch('/api/brand-visibility/config/x/about', {
        method: 'PATCH',
        body: JSON.stringify({
          admin_notes: notes.trim() || null,
          description_override: override.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || d.detail || `save failed (${r.status})`);
      // PATCH returns the merged row; adopt its admin_notes locally (the read
      // path is /x/integrations, but the write response is authoritative here).
      setAdminNotes(d.admin_notes ?? null);
      setEditing(false);
      onUpdated?.(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="agent-about-card">
      {/* Header — name + status */}
      <div className="agent-about-head">
        <div className="agent-about-title">
          {about.icon && <span className="agent-about-icon">{about.icon}</span>}
          <h2>{about.name}</h2>
        </div>
        <span className={`agent-status-badge status-${status}`}>{status}</span>
      </div>

      {/* Metadata grid */}
      <div className="agent-meta-grid">
        <div className="agent-meta-item">
          <span className="agent-meta-label">Creator</span>
          <span className="agent-meta-value">{about.creator || '—'}</span>
        </div>
        <div className="agent-meta-item">
          <span className="agent-meta-label">Version</span>
          <span className="agent-meta-value">v{about.version ?? '—'}</span>
        </div>
        <div className="agent-meta-item">
          <span className="agent-meta-label">Section</span>
          <span className="agent-meta-value">{about.section || '—'}</span>
        </div>
        <div className="agent-meta-item">
          <span className="agent-meta-label">Last run</span>
          <span className="agent-meta-value">
            {fmt(about.last_run_at)}
            {about.last_run_status ? ` · ${about.last_run_status}` : ''}
          </span>
        </div>
        <div className="agent-meta-item">
          <span className="agent-meta-label">Total runs</span>
          <span className="agent-meta-value">{about.total_runs ?? '—'}</span>
        </div>
      </div>

      {/* Description */}
      <p className="agent-about-desc">{description}</p>

      {/* Integrations chips — admin only (parent passes integrations only for admins) */}
      {isAdmin && Array.isArray(integrations) && integrations.length > 0 && (
        <div className="agent-integrations">
          <span className="agent-meta-label">Integrations</span>
          <div className="integration-chips">
            {integrations.map(name => (
              <span key={name} className="integration-chip">{name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Admin notes + edit affordance — admin only. Non-admins never fetch the
          notes (they come from the admin-gated /x/integrations), so the whole
          block is hidden for them. */}
      {isAdmin && (
        <div className="admin-notes-block">
          <div className="admin-notes-head">
            <span className="agent-meta-label">Admin notes</span>
            <button className="btn-ghost sm" onClick={openEdit}>Edit</button>
          </div>
          {adminNotes
            ? <div className="admin-notes">{adminNotes}</div>
            : <div className="admin-notes empty">No notes yet — click Edit to add context for the team.</div>}
        </div>
      )}

      {/* Edit modal — admin only */}
      {editing && isAdmin && (
        <div className="modal-overlay" onClick={() => !saving && setEditing(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2>Edit agent info</h2>
            {error && <div className="page-error" style={{ margin: '0 0 16px' }}>{error}</div>}

            <label className="modal-field">
              <span>Description override <span className="config-hint">blank = use the registry description</span></span>
              <textarea
                className="modal-textarea"
                rows={4}
                value={override}
                onChange={e => setOverride(e.target.value)}
                placeholder={about.description}
              />
            </label>

            <label className="modal-field">
              <span>Admin notes <span className="config-hint">internal context shown on this page</span></span>
              <textarea
                className="modal-textarea"
                rows={4}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. sweep cadence, known gaps, who to ping…"
              />
            </label>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';

// Add / edit a dynamic agent. `fetcher` carries the panel-admin token.
// Props: { mode: 'add'|'edit', row?, sections: [{id,name}], onClose, onSaved, fetcher }
const SLUG_RE = /^[a-z0-9-]+$/;
const SURFACES = [
  { value: 'app', label: 'App (in-platform React route)' },
  { value: 'iframe', label: 'Iframe (embedded dashboard)' },
  { value: 'http', label: 'HTTP (gateway-proxied run API)' },
];
const STATUSES = ['active', 'coming_soon', 'disabled'];

export default function AgentFormModal({ mode, row, sections, onClose, onSaved, fetcher }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    id: row?.id || '',
    section_id: row?.section_id || sections[0]?.id || '',
    name: row?.name || '',
    description: row?.description || '',
    creator: row?.creator || '',
    version: row?.version || '0.1.0',
    surface: row?.surface || 'app',
    path: row?.path || '',
    embed_url: row?.embed_url || '',
    run_url: row?.run_url || '',
    status_url: row?.status_url || '',
    icon: row?.icon || '',
    integrations: Array.isArray(row?.integrations) ? row.integrations.join(', ') : (row?.integrations || ''),
    status: row?.status || 'active',
    display_order: row?.display_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  function clientValidate() {
    if (form.name.trim().length < 2) return 'Name must be at least 2 characters.';
    if (!isEdit && form.id && !SLUG_RE.test(form.id)) return 'ID must contain only lowercase letters, digits and hyphens.';
    if (!isEdit && !form.section_id) return 'Section is required.';
    if (form.surface === 'app' && !form.path.trim()) return "App surface requires a path (e.g. /my-agent).";
    if (form.surface === 'iframe' && !form.embed_url.trim()) return 'Iframe surface requires an embed URL.';
    if (form.surface === 'http' && !form.run_url.trim()) return 'HTTP surface requires a run URL.';
    return null;
  }

  async function submit(e) {
    e.preventDefault();
    const v = clientValidate();
    if (v) { setError(v); return; }
    setSaving(true); setError(null);

    const integrations = form.integrations.split(',').map((s) => s.trim()).filter(Boolean);
    const common = {
      name: form.name.trim(), description: form.description, creator: form.creator,
      version: form.version || '0.1.0', surface: form.surface,
      path: form.path || null, embed_url: form.embed_url || null,
      run_url: form.run_url || null, status_url: form.status_url || null,
      icon: form.icon || null, integrations, status: form.status,
      display_order: Number(form.display_order) || 0,
    };
    const body = isEdit ? common : { ...common, id: form.id || undefined, section_id: form.section_id };

    try {
      const r = await fetcher(isEdit ? `/api/admin/agents/${row.id}` : '/api/admin/agents', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || `Save failed (${r.status}).`); return; }
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{isEdit ? 'Edit agent' : 'Add agent'}</h2>
        {error && <div className="page-error">{error}</div>}

        <div className="modal-field-row">
          <label className="modal-field">
            <span>Name</span>
            <input className="search-input" value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
          </label>
          <label className="modal-field">
            <span>ID {isEdit ? '(immutable)' : <span className="config-hint">auto from name if blank</span>}</span>
            <input className="search-input" value={form.id} onChange={(e) => set('id', e.target.value)}
              placeholder="e.g. creator-radar-instagram" readOnly={isEdit} disabled={isEdit} />
          </label>
        </div>

        <label className="modal-field">
          <span>Section {isEdit && '(immutable — delete & recreate to move)'}</span>
          <select className="filter-select" value={form.section_id} onChange={(e) => set('section_id', e.target.value)} disabled={isEdit}>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}
          </select>
        </label>

        <label className="modal-field">
          <span>Description</span>
          <textarea className="modal-textarea" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="modal-field-row">
          <label className="modal-field">
            <span>Creator</span>
            <input className="search-input" value={form.creator} onChange={(e) => set('creator', e.target.value)} />
          </label>
          <label className="modal-field">
            <span>Version</span>
            <input className="search-input" value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="0.1.0" />
          </label>
        </div>

        <div className="modal-field">
          <span>Surface</span>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {SURFACES.map((s) => (
              <label key={s.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" name="surface" checked={form.surface === s.value} onChange={() => set('surface', s.value)} />
                {s.label}
              </label>
            ))}
          </div>
        </div>

        {form.surface === 'app' && (
          <label className="modal-field">
            <span>Path <span className="config-hint">in-app React route</span></span>
            <input className="search-input" value={form.path} onChange={(e) => set('path', e.target.value)} placeholder="/creator-radar" />
          </label>
        )}
        {form.surface === 'iframe' && (
          <label className="modal-field">
            <span>Embed URL</span>
            <input className="search-input" value={form.embed_url} onChange={(e) => set('embed_url', e.target.value)} placeholder="https://example.com" />
          </label>
        )}
        {form.surface === 'http' && (
          <div className="modal-field-row">
            <label className="modal-field">
              <span>Run URL</span>
              <input className="search-input" value={form.run_url} onChange={(e) => set('run_url', e.target.value)} placeholder="https://svc/run" />
            </label>
            <label className="modal-field">
              <span>Status URL <span className="config-hint">optional</span></span>
              <input className="search-input" value={form.status_url} onChange={(e) => set('status_url', e.target.value)} />
            </label>
          </div>
        )}

        <label className="modal-field">
          <span>Integrations <span className="config-hint">comma-separated</span></span>
          <input className="search-input" value={form.integrations} onChange={(e) => set('integrations', e.target.value)} placeholder="Postgres, OpenRouter" />
        </label>

        <div className="modal-field-row">
          <label className="modal-field">
            <span>Icon <span className="config-hint">emoji</span></span>
            <input className="search-input" value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="◆" />
          </label>
          <label className="modal-field">
            <span>Status</span>
            <select className="filter-select" value={form.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label className="modal-field">
            <span>Display order</span>
            <input className="search-input" type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create agent')}</button>
        </div>
      </form>
    </div>
  );
}

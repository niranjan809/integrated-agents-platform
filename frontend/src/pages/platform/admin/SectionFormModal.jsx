import { useState } from 'react';

// Add / edit a dynamic section. `fetcher` carries the panel-admin token.
// Props: { mode: 'add'|'edit', row?, onClose, onSaved, fetcher }
const SLUG_RE = /^[a-z0-9-]+$/;

export default function SectionFormModal({ mode, row, onClose, onSaved, fetcher }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState({
    id: row?.id || '',
    name: row?.name || '',
    description: row?.description || '',
    icon: row?.icon || '',
    display_order: row?.display_order ?? 0,
    is_active: row?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (form.name.trim().length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (!isEdit && form.id && !SLUG_RE.test(form.id)) {
      setError('ID must contain only lowercase letters, digits and hyphens.');
      return;
    }
    setSaving(true); setError(null);
    try {
      const body = isEdit
        ? { name: form.name.trim(), description: form.description, icon: form.icon, display_order: Number(form.display_order) || 0, is_active: form.is_active }
        : { id: form.id || undefined, name: form.name.trim(), description: form.description, icon: form.icon, display_order: Number(form.display_order) || 0 };
      const r = await fetcher(isEdit ? `/api/admin/sections/${row.id}` : '/api/admin/sections', {
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
        <h2>{isEdit ? 'Edit section' : 'Add section'}</h2>
        {error && <div className="page-error">{error}</div>}

        <label className="modal-field">
          <span>Name</span>
          <input className="search-input" value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
        </label>

        <label className="modal-field">
          <span>ID {isEdit ? '(immutable)' : <span className="config-hint">optional — auto-generated from name if blank</span>}</span>
          <input className="search-input" value={form.id} onChange={(e) => set('id', e.target.value)}
            placeholder="e.g. creator-radar" readOnly={isEdit} disabled={isEdit} />
        </label>

        <label className="modal-field">
          <span>Description</span>
          <textarea className="modal-textarea" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="modal-field-row">
          <label className="modal-field">
            <span>Icon <span className="config-hint">emoji</span></span>
            <input className="search-input" value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="📡" />
          </label>
          <label className="modal-field">
            <span>Display order</span>
            <input className="search-input" type="number" value={form.display_order} onChange={(e) => set('display_order', e.target.value)} />
          </label>
        </div>

        {isEdit && (
          <label className="modal-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={!!form.is_active} onChange={(e) => set('is_active', e.target.checked)} />
            <span style={{ margin: 0 }}>Active (visible on the landing page)</span>
          </label>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create section')}</button>
        </div>
      </form>
    </div>
  );
}

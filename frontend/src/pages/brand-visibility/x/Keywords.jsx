import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getClassLabel } from '../../../utils/classLabels';
import InfoPanel from '../../../components/brand-visibility/InfoPanel';
import { keywordClasses } from '../../../constants/agentInfo';

// All keyword CRUD flows through the JWT-guarded Node proxy (Phase 1c),
// which forwards to the Python config API (/api/config/*).
const BASE = '/api/brand-visibility/config';

const EMPTY_FORM = {
  id: null,
  keyword: '',
  class_key: '',
  search_query: '',
  priority: '',
  sub_category: '',
  intent: '',
  signal_type: '',
  notes: '',
};

// Optional fields sent only when non-empty (API treats missing as "unchanged"/default).
const OPTIONAL_FIELDS = ['search_query', 'priority', 'sub_category', 'intent', 'signal_type', 'notes'];

export default function Keywords() {
  const { apiFetch } = useAuth();

  const [classes, setClasses] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [classHelp, setClassHelp] = useState(keywordClasses); // [{id,name,description}] — endpoint w/ constant fallback
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [expanded, setExpanded] = useState(() => new Set());
  const [classFilter, setClassFilter] = useState('');
  const [enabledFilter, setEnabledFilter] = useState('all');
  const [search, setSearch] = useState('');

  const [modalMode, setModalMode] = useState(null); // null | 'add' | 'edit'
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // keyword row pending delete

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`${BASE}/classes`).then(r => r.ok ? r.json() : Promise.reject(new Error(`classes ${r.status}`))),
      apiFetch(`${BASE}/keywords?limit=500`).then(r => r.ok ? r.json() : Promise.reject(new Error(`keywords ${r.status}`))),
    ])
      .then(([cls, kw]) => {
        const clsList = cls.classes || [];
        setClasses(clsList);
        setKeywords(kw.keywords || []);
        // Expand the first class (C — voice AI) by default for immediate content.
        if (clsList.length) setExpanded(new Set([clsList[0].class_key]));
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyword-class descriptions for the info panel. Section-level endpoint; falls
  // back to the bundled constant if it fails.
  useEffect(() => {
    let alive = true;
    apiFetch(`${BASE}/x/keywords-help`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`keywords-help ${r.status}`)))
      .then(d => { if (alive && Array.isArray(d?.classes)) setClassHelp(d.classes); })
      .catch(() => { /* keep constant fallback */ });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply toolbar filters, then group by class_key.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = keywords.filter(k => {
      if (classFilter && k.class_key !== classFilter) return false;
      if (enabledFilter === 'yes' && !k.enabled) return false;
      if (enabledFilter === 'no' && k.enabled) return false;
      if (q && !(k.keyword?.toLowerCase().includes(q) || k.search_query?.toLowerCase().includes(q))) return false;
      return true;
    });
    const by = {};
    for (const k of filtered) (by[k.class_key] ||= []).push(k);
    return by;
  }, [keywords, classFilter, enabledFilter, search]);

  function toggleExpand(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function openAdd() {
    setModalError(null);
    setForm({ ...EMPTY_FORM, class_key: classes[0]?.class_key || '' });
    setModalMode('add');
  }
  function openEdit(kw) {
    setModalError(null);
    setForm({
      id: kw.id, keyword: kw.keyword || '', class_key: kw.class_key || '',
      search_query: kw.search_query || '', priority: kw.priority || '',
      sub_category: kw.sub_category || '', intent: kw.intent || '',
      signal_type: kw.signal_type || '', notes: kw.notes || '',
    });
    setModalMode('edit');
  }
  function closeModal() { setModalMode(null); setForm(EMPTY_FORM); setModalError(null); }

  function buildPayload() {
    const p = { keyword: form.keyword.trim(), class_key: form.class_key };
    for (const f of OPTIONAL_FIELDS) {
      const v = (form[f] ?? '').trim();
      if (v) p[f] = v;
    }
    return p;
  }

  async function saveKeyword(e) {
    e.preventDefault();
    if (!form.keyword.trim() || !form.class_key) {
      setModalError('Keyword and class are required.');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const payload = buildPayload();
      const isEdit = modalMode === 'edit';
      const r = await apiFetch(`${BASE}/keywords${isEdit ? `/${form.id}` : ''}`, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || d.error || `save failed (${r.status})`);
      setKeywords(prev => isEdit ? prev.map(k => k.id === d.id ? d : k) : [...prev, d]);
      closeModal();
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  async function toggleKeyword(kw) {
    // optimistic
    setKeywords(prev => prev.map(k => k.id === kw.id ? { ...k, enabled: k.enabled ? 0 : 1 } : k));
    try {
      const r = await apiFetch(`${BASE}/keywords/${kw.id}/toggle`, { method: 'PATCH' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || 'toggle failed');
      setKeywords(prev => prev.map(k => k.id === d.id ? d : k));
    } catch (err) {
      // revert on failure
      setKeywords(prev => prev.map(k => k.id === kw.id ? { ...k, enabled: kw.enabled } : k));
      setError(err.message);
    }
  }

  async function doDelete(kw) {
    try {
      const r = await apiFetch(`${BASE}/keywords/${kw.id}`, { method: 'DELETE' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `delete failed (${r.status})`); }
      setKeywords(prev => prev.filter(k => k.id !== kw.id));
      setConfirmDelete(null);
    } catch (err) { setError(err.message); setConfirmDelete(null); }
  }

  const totalActive = keywords.filter(k => k.enabled).length;

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <div className="page keywords-page">
      <div className="page-header keywords-header">
        <div>
          <h1>Keywords</h1>
          <p className="page-sub">{totalActive}/{keywords.length} enabled · {classes.length} classes</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>+ Add Query</button>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* Keyword Classes reference — what each lexicon class means */}
      <InfoPanel title="Keyword Classes" collapsible>
        <table className="info-table">
          <thead>
            <tr><th>Class</th><th>Name</th><th>Description</th></tr>
          </thead>
          <tbody>
            {classHelp.map(c => {
              const label = getClassLabel(c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <span className="kw-class-dot" style={{ background: label.color }} /> {c.id}
                  </td>
                  <td>{c.name}</td>
                  <td className="info-table-desc">{c.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </InfoPanel>

      {/* Toolbar */}
      <div className="kw-toolbar">
        <select className="filter-select" value={classFilter} onChange={e => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          {classes.map(c => <option key={c.class_key} value={c.class_key}>{c.class_key} · {c.name}</option>)}
        </select>
        <select className="filter-select" value={enabledFilter} onChange={e => setEnabledFilter(e.target.value)}>
          <option value="all">Enabled: All</option>
          <option value="yes">Enabled: Yes</option>
          <option value="no">Enabled: No</option>
        </select>
        <input className="search-input" placeholder="Search queries…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Class cards */}
      {classes.map(c => {
        const label = getClassLabel(c.class_key);
        const rows = grouped[c.class_key] || [];
        const isOpen = expanded.has(c.class_key);
        // Hide a class card entirely when a class filter excludes it.
        if (classFilter && classFilter !== c.class_key) return null;
        return (
          <div key={c.class_key} className="keyword-class-card">
            <button className="keyword-class-header" onClick={() => toggleExpand(c.class_key)}>
              <span className="kw-class-dot" style={{ background: label.color }} />
              <span className="kw-class-name">{c.class_key} · {c.name}</span>
              <span className="kw-class-meta">{rows.length} queries · {c.priority || '—'}</span>
              <span className="kw-class-caret">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="keyword-list">
                {rows.length === 0 ? (
                  <div className="empty-state" style={{ padding: 16 }}>No queries in this class match filters.</div>
                ) : rows.map(k => (
                  <div key={k.id} className={`keyword-row${k.enabled ? '' : ' disabled'}`}>
                    <code className="keyword-query-text" title={k.keyword}>{k.keyword}</code>
                    <div className="keyword-row-actions">
                      <button className="kw-icon-btn" title={k.enabled ? 'Disable' : 'Enable'} onClick={() => toggleKeyword(k)}>
                        {k.enabled ? '●' : '○'}
                      </button>
                      <button className="kw-icon-btn" title="Edit" onClick={() => openEdit(k)}>✏️</button>
                      <button className="kw-icon-btn danger" title="Delete" onClick={() => setConfirmDelete(k)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Add / Edit modal */}
      {modalMode && (
        <div className="modal-overlay" onClick={closeModal}>
          <form className="modal-card keyword-modal" onClick={e => e.stopPropagation()} onSubmit={saveKeyword}>
            <h2>{modalMode === 'add' ? 'Add query' : 'Edit query'}</h2>
            {modalError && <div className="page-error">{modalError}</div>}

            <label className="modal-field">
              <span>Class *</span>
              <select className="filter-select" value={form.class_key}
                onChange={e => setForm(f => ({ ...f, class_key: e.target.value }))} required>
                <option value="" disabled>Select a class…</option>
                {classes.map(c => <option key={c.class_key} value={c.class_key}>{c.class_key} · {c.name}</option>)}
              </select>
            </label>

            <label className="modal-field">
              <span>Keyword / query *</span>
              <textarea className="modal-textarea" rows={3} value={form.keyword}
                onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
                placeholder="Raw keyword term, or a fully-formed query string" required />
            </label>

            <label className="modal-field">
              <span>search_query (optional — fully-formed query, bypasses chunking)</span>
              <textarea className="modal-textarea" rows={3} value={form.search_query}
                onChange={e => setForm(f => ({ ...f, search_query: e.target.value }))} />
            </label>

            <div className="modal-field-row">
              <label className="modal-field">
                <span>Priority</span>
                <input className="search-input" value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} placeholder="P0 / P1 / high…" />
              </label>
              <label className="modal-field">
                <span>Sub-category</span>
                <input className="search-input" value={form.sub_category}
                  onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} />
              </label>
            </div>

            <div className="modal-field-row">
              <label className="modal-field">
                <span>Intent</span>
                <input className="search-input" value={form.intent}
                  onChange={e => setForm(f => ({ ...f, intent: e.target.value }))} />
              </label>
              <label className="modal-field">
                <span>Signal type</span>
                <input className="search-input" value={form.signal_type}
                  onChange={e => setForm(f => ({ ...f, signal_type: e.target.value }))} />
              </label>
            </div>

            <label className="modal-field">
              <span>Notes</span>
              <textarea className="modal-textarea" rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </label>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={closeModal} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving…' : modalMode === 'add' ? 'Add query' : 'Save changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-card keyword-confirm" onClick={e => e.stopPropagation()}>
            <h2>Delete query?</h2>
            <p>This permanently removes the query from class <strong>{confirmDelete.class_key}</strong>. It stops being swept on the next run.</p>
            <code className="keyword-query-text">{confirmDelete.keyword}</code>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => doDelete(confirmDelete)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

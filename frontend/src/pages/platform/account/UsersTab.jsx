import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ROLES, ROLE_LABELS, SECTIONS, SECTION_LABELS } from '../../../constants/rbac';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function timeAgo(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return ts;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}

const BLANK_CREATE = { email: '', password: '', role: 'viewer', sections: [...SECTIONS] };

export default function UsersTab() {
  const { apiFetch, user } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);

  // toolbar
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');

  // modal: { mode: 'add'|'edit'|'reset'|'delete', row }
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_CREATE);
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  function load() {
    setLoading(true); setError(null);
    apiFetch('/api/admin/users')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`users ${r.status}`))))
      .then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const emailById = useMemo(() => Object.fromEntries(users.map(u => [u.id, u.email])), [users]);
  const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return users.filter(u => {
      if (s && !u.email.toLowerCase().includes(s)) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (sectionFilter !== 'all' && !(u.sections_allowed || []).includes(sectionFilter)) return false;
      return true;
    });
  }, [users, q, roleFilter, sectionFilter]);

  // ── modal open helpers ──
  function openAdd()   { setModalError(null); setForm({ ...BLANK_CREATE, sections: [...SECTIONS] }); setModal({ mode: 'add' }); }
  function openEdit(u) { setModalError(null); setForm({ email: u.email, password: '', role: u.role, sections: [...(u.sections_allowed || [])] }); setModal({ mode: 'edit', row: u }); }
  function openReset(u){ setModalError(null); setPw1(''); setPw2(''); setModal({ mode: 'reset', row: u }); }
  function openDelete(u){ setModalError(null); setModal({ mode: 'delete', row: u }); }
  function closeModal() { setModal(null); setSaving(false); setModalError(null); }

  function toggleSection(sec) {
    setForm(f => ({ ...f, sections: f.sections.includes(sec) ? f.sections.filter(x => x !== sec) : [...f.sections, sec] }));
  }

  async function submitCreate(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(form.email)) { setModalError('Enter a valid email.'); return; }
    if (form.password.length < 8)   { setModalError('Password must be at least 8 characters.'); return; }
    setSaving(true); setModalError(null);
    try {
      const r = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.trim(), password: form.password, role: form.role, sections_allowed: form.sections }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModalError(d.error || `Create failed (${r.status}).`); return; }
      setBanner('User created.'); closeModal(); load();
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  async function submitEdit(e) {
    e.preventDefault();
    setSaving(true); setModalError(null);
    try {
      const r = await apiFetch(`/api/admin/users/${modal.row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: form.role, sections_allowed: form.sections }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModalError(d.error || `Update failed (${r.status}).`); return; }
      setBanner('User updated.'); closeModal(); load();
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (pw1.length < 8) { setModalError('Password must be at least 8 characters.'); return; }
    if (pw1 !== pw2)    { setModalError('Passwords do not match.'); return; }
    setSaving(true); setModalError(null);
    try {
      const r = await apiFetch(`/api/admin/users/${modal.row.id}/reset-password`, {
        method: 'POST', body: JSON.stringify({ new_password: pw1 }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModalError(d.error || `Reset failed (${r.status}).`); return; }
      setBanner(`Password reset for ${modal.row.email}.`); closeModal();
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  async function submitDelete() {
    setSaving(true); setModalError(null);
    try {
      const r = await apiFetch(`/api/admin/users/${modal.row.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setModalError(d.error || `Delete failed (${r.status}).`); return; }
      setBanner('User deleted.'); closeModal(); load();
    } catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="empty-state">Loading users…</div>;

  return (
    <div className="account-tabpane">
      {banner && <div className="page-success" onClick={() => setBanner(null)}>{banner}</div>}
      {error && <div className="page-error">{error}</div>}

      <div className="kw-toolbar">
        <input className="search-input" placeholder="Search email…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <select className="filter-select" value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
          <option value="all">All sections</option>
          {SECTIONS.map(s => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
        </select>
        <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}>+ Add User</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Sections</th><th>Last Login</th><th>Created By</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={6}><div className="empty-state">No users match.</div></td></tr>}
            {filtered.map(u => {
              const isSelf = u.id === user?.id;
              const isLastAdmin = u.role === 'admin' && adminCount <= 1;
              return (
                <tr key={u.id} className={isSelf ? 'user-row self' : ''}>
                  <td>{u.email}{isSelf && <span className="user-chip" style={{ marginLeft: 8 }}>you</span>}</td>
                  <td>{ROLE_LABELS[u.role] || u.role}</td>
                  <td>{(u.sections_allowed || []).map(s => <span key={s} className="user-chip">{SECTION_LABELS[s] || s}</span>)}</td>
                  <td title={u.last_login_at || ''}>{timeAgo(u.last_login_at)}</td>
                  <td>{u.created_by ? (emailById[u.created_by] || `#${u.created_by}`) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn-ghost sm" disabled={isSelf} title={isSelf ? "You can't change your own role" : 'Edit'} onClick={() => openEdit(u)}>Edit</button>
                      {!isSelf && <button className="btn-ghost sm" onClick={() => openReset(u)}>Reset PW</button>}
                      {!isSelf && <button className="btn-danger sm" onClick={() => openDelete(u)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create / Edit modal */}
      {(modal?.mode === 'add' || modal?.mode === 'edit') && (
        <div className="modal-overlay" onClick={closeModal}>
          <form className="modal-card" onClick={e => e.stopPropagation()} onSubmit={modal.mode === 'add' ? submitCreate : submitEdit}>
            <h2>{modal.mode === 'add' ? 'Add user' : 'Edit user'}</h2>
            {modalError && <div className="page-error">{modalError}</div>}

            <label className="modal-field">
              <span>Email {modal.mode === 'edit' && '(immutable)'}</span>
              {modal.mode === 'add'
                ? <input className="search-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                : <input className="search-input" value={form.email} readOnly disabled />}
            </label>

            {modal.mode === 'add' && (
              <label className="modal-field">
                <span>Password <span className="config-hint">min 8 characters</span></span>
                <input className="search-input" type="password" autoComplete="new-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
              </label>
            )}

            <label className="modal-field">
              <span>Role</span>
              <select className="filter-select" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>

            <div className="modal-field">
              <span>Sections allowed</span>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {SECTIONS.map(s => (
                  <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={form.sections.includes(s)} onChange={() => toggleSection(s)} />
                    {SECTION_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={closeModal} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : (modal.mode === 'add' ? 'Create user' : 'Save changes')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Reset password modal */}
      {modal?.mode === 'reset' && (
        <div className="modal-overlay" onClick={closeModal}>
          <form className="modal-card" onClick={e => e.stopPropagation()} onSubmit={submitReset}>
            <h2>Reset password</h2>
            <p className="page-sub" style={{ marginTop: 0 }}>Set a new password for <strong>{modal.row.email}</strong>.</p>
            {modalError && <div className="page-error">{modalError}</div>}
            <label className="modal-field">
              <span>New password <span className="config-hint">min 8 characters</span></span>
              <input className="search-input" type="password" autoComplete="new-password" value={pw1} onChange={e => setPw1(e.target.value)} required />
            </label>
            <label className="modal-field">
              <span>Confirm password</span>
              <input className="search-input" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} required />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={closeModal} disabled={saving}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Reset password'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation */}
      {modal?.mode === 'delete' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h2>Delete user?</h2>
            {modalError && <div className="page-error">{modalError}</div>}
            {modal.row.role === 'admin' && adminCount <= 1 ? (
              <>
                <p>This is the <strong>last admin</strong> ({modal.row.email}). Deleting it would leave no admins — the server will refuse.</p>
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={closeModal}>Close</button>
                  <button className="btn-danger" disabled title="Cannot delete the last admin">Delete</button>
                </div>
              </>
            ) : (
              <>
                <p>Permanently delete <strong>{modal.row.email}</strong>? Their audit-trail entries are preserved.</p>
                <div className="modal-actions">
                  <button className="btn-ghost" onClick={closeModal} disabled={saving}>Cancel</button>
                  <button className="btn-danger" onClick={submitDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete user'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

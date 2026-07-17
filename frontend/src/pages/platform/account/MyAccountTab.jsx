import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ROLE_LABELS, SECTION_LABELS } from '../../../constants/rbac';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Self-service account view + change password. Reads identity from AuthContext
// (JWT/me payload: email, role, sections_allowed). last_login_at /
// password_updated_at are not exposed by /api/auth/me, so they render as "—"
// (would need a backend /me enhancement — out of Phase 2 scope).
export default function MyAccountTab() {
  const { user } = useAuth();

  const [cur, setCur]   = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [ok, setOk]         = useState(null);

  const sections = user?.sections_allowed || [];

  async function changePassword(e) {
    e.preventDefault();
    setError(null); setOk(null);
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (next !== conf)   { setError('New password and confirmation do not match.'); return; }
    setSaving(true);
    try {
      // Raw fetch (not apiFetch): a wrong current-password returns 401, which
      // apiFetch would treat as session-expiry and log the user out. Here we
      // surface it as an inline error instead.
      const res = await fetch(`${API}/api/auth/me/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('kiteai_token')}` },
        body: JSON.stringify({ current_password: cur, new_password: next }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { setError('Current password is incorrect.'); return; }
      if (!res.ok) { setError(d.error || `Failed to change password (${res.status}).`); return; }
      setOk('Password changed.');
      setCur(''); setNext(''); setConf('');
    } catch (err) {
      setError(`Network error: ${err.message}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="account-tabpane">
      <div className="config-section">
        <h3>Your account</h3>
        <div className="config-field"><label>Email</label><span>{user?.email || '—'}</span></div>
        <div className="config-field"><label>Role</label><span>{ROLE_LABELS[user?.role] || user?.role || '—'}</span></div>
        <div className="config-field">
          <label>Sections</label>
          <span>
            {sections.length
              ? sections.map(s => <span key={s} className="user-chip">{SECTION_LABELS[s] || s}</span>)
              : <span className="empty-state" style={{ padding: 0 }}>none</span>}
          </span>
        </div>
        <div className="config-field"><label>Last login</label><span>{user?.last_login_at || '—'}</span></div>
        <div className="config-field"><label>Password updated</label><span>{user?.password_updated_at || '—'}</span></div>
      </div>

      <form className="config-section" onSubmit={changePassword}>
        <h3>Change password</h3>
        {error && <div className="page-error">{error}</div>}
        {ok && <div className="page-success">{ok}</div>}
        <label className="modal-field">
          <span>Current password</span>
          <input className="search-input" type="password" autoComplete="current-password"
            value={cur} onChange={e => setCur(e.target.value)} required />
        </label>
        <label className="modal-field">
          <span>New password <span className="config-hint">min 8 characters</span></span>
          <input className="search-input" type="password" autoComplete="new-password"
            value={next} onChange={e => setNext(e.target.value)} required />
        </label>
        <label className="modal-field">
          <span>Confirm new password</span>
          <input className="search-input" type="password" autoComplete="new-password"
            value={conf} onChange={e => setConf(e.target.value)} required />
        </label>
        <div className="config-actions">
          <button type="submit" className="btn-primary" disabled={saving || !cur || !next || !conf}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}

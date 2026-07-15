import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AmbientCanvas from '../../components/platform/AmbientCanvas';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Common login: one form for everyone. It tries the normal user login first
// (email + password → landing page); if that doesn't match, it tries the admin
// login (username + password → admin console). Wrong for both → error.
export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password,   setPassword]   = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // 1) Normal user (email + password) → landing page
      try {
        await login(identifier, password);
        navigate('/');
        return;
      } catch { /* not a user account — try admin next */ }

      // 2) Admin (username + password) → admin console
      const res = await fetch(`${API}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identifier, password }),
      });
      if (!res.ok) throw new Error('invalid');
      const d = await res.json();
      sessionStorage.setItem('kiteai_admin_token', d.token);
      navigate('/admin');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <AmbientCanvas />
      <div className="login-card">
        <div className="login-logo">
          <span className="logo-kite">Kite</span><span className="logo-ai">AI</span>
          <div className="login-subtitle">Intelligent Agent Platform</div>
          <span className="status-pill login-status"><span className="dot" />System online</span>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field-group">
            <label>Email or username</label>
            <input
              type="text"
              value={identifier}
              autoComplete="username"
              required
              placeholder="Email or admin username"
              onChange={e => setIdentifier(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

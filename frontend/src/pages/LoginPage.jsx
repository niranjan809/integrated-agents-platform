import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AmbientCanvas from '../components/AmbientCanvas';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const { login } = useAuth();
  const navigate  = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
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
            <label>Email</label>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              placeholder="Enter your email"
              onChange={e => setEmail(e.target.value)}
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

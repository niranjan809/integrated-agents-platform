import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AmbientCanvas from './AmbientCanvas';

// Full-screen platform shell (ambient bg + topbar + content) used by the
// landing + agent-section pages.
export default function PlatformShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="platform-shell">
      <AmbientCanvas />
      <div className="ambient-grid" aria-hidden="true" />

      <div className="shell-topbar">
        <Link to="/" className="shell-brand" style={{ textDecoration: 'none' }}>
          <span className="k">Kite</span><span className="ai">AI</span>
          <span className="tag">Intelligent Agent Platform</span>
        </Link>
        <div className="shell-userbox">
          <span className="status-pill"><span className="dot" />All systems operational</span>
          {user?.email && <Link to="/account" className="shell-account-link">{user.email}</Link>}
          <button className="shell-logout" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </div>

      <div className="shell-main">{children}</div>
    </div>
  );
}

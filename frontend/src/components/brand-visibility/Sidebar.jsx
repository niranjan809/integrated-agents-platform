import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: 'overview',  icon: '▦',  label: 'Overview'   },
  { to: 'tweets',    icon: '✦',  label: 'Tweets'     },
  { to: 'keywords',  icon: '🔑', label: 'Keywords'   },
  { to: 'prompts',   icon: '📝', label: 'Prompts'    },
  { to: 'scheduler', icon: '⏱',  label: 'Scheduler'  },
  { to: 'manual',    icon: '⚡', label: 'Manual Run' },
  { to: 'history',   icon: '📜', label: 'History'    },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Section links preserve the active platform (x / linkedin), which lives in the
  // URL query (?platform=). Sidebar items are platform-agnostic paths now.
  const platform = searchParams.get('platform') || 'x';

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-kite">Kite</span><span className="logo-ai">AI</span>
        <span className="logo-tag">Brand Visibility</span>
      </div>

      <NavLink to="/" className="sidebar-back" title="Back to all agents">
        <span className="nav-icon">←</span>
        <span className="nav-label">All agents</span>
      </NavLink>

      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={{ pathname: `/brand-visibility/${to}`, search: `?platform=${platform}` }}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">{user?.email?.[0]?.toUpperCase()}</div>
          <div className="user-info">
            <div className="user-email">{user?.email}</div>
            <div className="user-role">{user?.role}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={handleLogout}>Sign out</button>
      </div>
    </aside>
  );
}

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Mirrors components/brand-visibility/Sidebar.jsx (same kite-frontend .sidebar /
// .sidebar-nav / .nav-item classes). Unlike Brand Visibility, creator-radar's
// platform selection (instagram | tiktok) lives in sessionStorage
// (cr_selected_platform, managed by PlatformContext) rather than a ?platform=
// URL query, so these nav links are plain paths with no query to preserve.
const NAV = [
  { to: 'overview',  icon: '📊', label: 'Overview'  },
  { to: 'accounts',  icon: '👤', label: 'Accounts'  },
  { to: 'search',    icon: '🔍', label: 'Search'    },
  { to: 'keywords',  icon: '#',  label: 'Keywords'  },
  { to: 'prompts',   icon: '💬', label: 'Prompts'   },
  { to: 'services',  icon: '⚙',  label: 'Services'  },
  { to: 'scheduler', icon: '⏰', label: 'Scheduler' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-kite">Kite</span><span className="logo-ai">AI</span>
        <span className="logo-tag">Creator Radar</span>
      </div>

      <NavLink to="/" className="sidebar-back" title="Back to all agents">
        <span className="nav-icon">←</span>
        <span className="nav-label">All agents</span>
      </NavLink>

      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={`/creator-radar/${to}`}
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

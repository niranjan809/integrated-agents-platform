import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth }  from '../context/AuthContext';
import { useAgent } from '../context/AgentContext';

const NAV = [
  { to: '/',            icon: '▦',  label: 'Dashboard'   },
  { to: '/agent',       icon: '⚡', label: 'Run Agent'   },
  { to: '/accounts',    icon: '◉',  label: 'All Accounts' },
  { to: '/influencers', icon: '★',  label: 'Track A'      },
  { to: '/pr-pages',    icon: '📢', label: 'Track B'      },
  { to: '/keywords',    icon: '🔑', label: 'Keywords'    },
  { to: '/settings',    icon: '⚙',  label: 'Settings'    },
  { to: '/workflow',    icon: '⬡',  label: 'Workflow'    },
  { to: '/prompts',     icon: '✦',  label: 'Prompts'     },
];

export default function Sidebar() {
  const { user, logout }   = useAuth();
  const { running, stats } = useAgent();
  const navigate = useNavigate();

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-kite">Kite</span><span className="logo-ai">AI</span>
        <span className="logo-tag">X Agent</span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => {
          const isAgentLink = to === '/agent';
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
              {isAgentLink && running && (
                <span className="nav-running-badge" title={`Running — ${stats.added} new`}>
                  <span className="nav-pulse" />
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Live run status strip */}
      {running && (
        <div className="sidebar-run-strip">
          <span className="live-dot" />
          <span>Agent running</span>
          <span className="strip-stat">+{stats.added}</span>
        </div>
      )}

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

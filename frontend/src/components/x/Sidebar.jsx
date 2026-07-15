import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth }  from '../../context/AuthContext';
import { useAgent } from '../../context/AgentContext';

const NAV = [
  { to: '/dashboard',   icon: '▦',  label: 'Dashboard'   },
  { to: '/agent',       icon: '⚡', label: 'Run Agent'   },
  { to: '/tasks',       icon: '🎯', label: 'Tasks'       },
  { to: '/accounts',    icon: '◉',  label: 'All Accounts' },
  { to: '/influencers', icon: '★',  label: 'Track A'      },
  { to: '/pr-pages',    icon: '📢', label: 'Track B'      },
  { to: '/keywords',    icon: '🔑', label: 'Keywords'    },
  { to: '/settings',    icon: '⚙',  label: 'Settings'    },
  { to: '/workflow',    icon: '⬡',  label: 'Workflow'    },
  { to: '/prompts',     icon: '✦',  label: 'Prompts'     },
];

const PHASE_LABEL = {
  search:   'Searching keywords',
  profiles: 'Fetching profiles',
  friends:  'Friend-list pass',
  done:     'Finishing up',
};

export default function Sidebar() {
  const { user, logout }   = useAuth();
  const { running, serverActive, runProgress, stats } = useAgent();
  const navigate = useNavigate();

  const active = running || serverActive;           // show for runs started anywhere
  const pct    = runProgress?.overallPct ?? 0;
  const qDone  = runProgress?.queriesDone ?? 0;
  const qTotal = runProgress?.totalQueries ?? 0;
  const phase  = PHASE_LABEL[runProgress?.phase] ?? 'Running';

  function handleLogout() { logout(); navigate('/login'); }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-kite">Kite</span><span className="logo-ai">AI</span>
        <span className="logo-tag">X Agent</span>
      </div>

      <NavLink to="/" className="sidebar-back" title="Back to all agents">
        <span className="nav-icon">←</span>
        <span className="nav-label">All agents</span>
      </NavLink>

      <nav className="sidebar-nav">
        {NAV.map(({ to, icon, label }) => {
          const isAgentLink = to === '/agent';
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/dashboard'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              <span className="nav-label">{label}</span>
              {isAgentLink && active && (
                <span className="nav-running-badge" title={`Running — ${pct}% · query ${qDone}/${qTotal}`}>
                  <span className="nav-pulse" />
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Live run status strip — overall progress, visible on every page */}
      {active && (
        <div className="sidebar-run-strip" onClick={() => navigate('/agent')} title="Open Run Agent">
          <div className="strip-top">
            <span className="live-dot" />
            <span>Agent running</span>
            <span className="strip-pct">{pct}%</span>
          </div>
          <div className="strip-progress">
            <div className="strip-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="strip-sub">
            {phase}{qTotal > 0 ? ` · query ${qDone}/${qTotal}` : ''} · +{stats.added} new
          </div>
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

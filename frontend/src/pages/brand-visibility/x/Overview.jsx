import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getClassLabel } from '../../../utils/classLabels';
import AgentAboutCard from '../../../components/brand-visibility/AgentAboutCard';

export default function BvOverview() {
  const { apiFetch, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState(null);
  const [costs, setCosts] = useState(null);
  const [about, setAbout] = useState(null);
  const [integrations, setIntegrations] = useState(null); // admin-only chips
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      apiFetch('/api/brand-visibility/config/x/stats').then(r => r.ok ? r.json() : Promise.reject(new Error(`stats ${r.status}`))),
      apiFetch('/api/brand-visibility/config/x/cost-summary').then(r => r.ok ? r.json() : Promise.reject(new Error(`costs ${r.status}`))),
      apiFetch('/api/brand-visibility/config/x/about').then(r => r.ok ? r.json() : Promise.reject(new Error(`about ${r.status}`))),
    ])
      .then(([s, c, a]) => { if (alive) { setStats(s); setCosts(c); setAbout(a); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  // Integrations panel is admin-only — never fetched for non-admins (RBAC: the
  // endpoint itself is requireRole('admin'), this just avoids a guaranteed 403).
  useEffect(() => {
    if (!isAdmin) return undefined;
    let alive = true;
    apiFetch('/api/brand-visibility/config/x/integrations')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`integrations ${r.status}`)))
      .then(d => { if (alive) setIntegrations(d.integrations || []); })
      .catch(() => { if (alive) setIntegrations([]); });
    return () => { alive = false; };
  }, [isAdmin]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error) return <div className="page-error">Failed to load: {error}</div>;

  const voiceAI = stats.by_class?.C ?? 0;
  const sortedClasses = Object.entries(stats.by_class || {})
    .sort(([, a], [, b]) => b - a);
  const maxCount = sortedClasses.length ? sortedClasses[0][1] : 1;
  const lastScraped = stats.last_scraped_at
    ? new Date(stats.last_scraped_at).toLocaleString()
    : 'never';

  return (
    <div className="page">
      <div className="page-header">
        <h1>Overview</h1>
        <p className="page-sub">X · Voice AI signal intelligence</p>
      </div>

      {/* Agent about card — description/status/meta, admin integrations + notes */}
      {about && (
        <AgentAboutCard
          about={about}
          integrations={integrations}
          onUpdated={d => setAbout(prev => ({ ...prev, ...d }))}
        />
      )}

      {/* 4 KPI cards */}
      <div className="stat-grid" style={{ marginBottom: 32 }}>
        <div className="stat-card">
          <div className="stat-value">{stats.total_posts}</div>
          <div className="stat-label">Total tweets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.classified}</div>
          <div className="stat-label">Classified</div>
          <div className="stat-sub">{stats.total_posts > 0
            ? `${Math.round((stats.classified / stats.total_posts) * 100)}%`
            : ''}</div>
        </div>
        <div className="stat-card" style={{ borderTopColor: '#00F5D4' }}>
          <div className="stat-value" style={{ color: '#00F5D4' }}>{voiceAI}</div>
          <div className="stat-label">Voice AI signal</div>
          <div className="stat-sub">Class C</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.unclassified}</div>
          <div className="stat-label">Pending</div>
        </div>
      </div>

      {/* Classification breakdown bar chart */}
      <div className="dash-card" style={{ marginBottom: 32 }}>
        <h3>Classification breakdown</h3>
        {sortedClasses.length === 0 ? (
          <div className="empty-state">No classified tweets yet.</div>
        ) : (
          <div>
            {sortedClasses.map(([cls, count]) => {
              const label = getClassLabel(cls);
              const pct = (count / maxCount) * 100;
              return (
                <div key={cls} className="bar-row" style={{ marginBottom: 8 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                    fontSize: 13,
                  }}>
                    <span style={{ color: label.color, fontWeight: 500 }}>
                      {label.short}
                    </span>
                    <span style={{ color: 'var(--text2)' }}>{count}</span>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${pct}%`, background: label.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2 supplementary cards */}
      <div className="dash-grid">
        <div className="dash-card">
          <h3>Last sweep</h3>
          <div className="stat-value" style={{ fontSize: 20 }}>{lastScraped}</div>
        </div>
        <div className="dash-card">
          <h3>This month</h3>
          <div className="stat-value" style={{ fontSize: 20 }}>
            ${costs.total_this_month_usd?.toFixed(4) || '0.0000'}
          </div>
          <div className="stat-sub">
            {costs.posts_classified || 0} classifications
          </div>
        </div>
      </div>
    </div>
  );
}

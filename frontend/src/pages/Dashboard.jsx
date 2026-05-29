import { useEffect, useState, useRef } from 'react';
import { useAuth }  from '../context/AuthContext';
import { useAgent } from '../context/AgentContext';
import { Link } from 'react-router-dom';

function StatCard({ label, value, sub, color }) {
  return (
    <div className="stat-card" style={{ borderColor: color }}>
      <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function RunRow({ run }) {
  const status = run.status === 'completed' ? '#00C896' : run.status === 'running' ? '#1D9BF0' : '#FF4444';
  return (
    <div className="run-row">
      <span className="run-status" style={{ color: status }}>● {run.status}</span>
      <span className="run-by">{run.triggered_by}</span>
      <span className="run-added">+{run.accounts_added ?? 0} added</span>
      <span className="run-skip">{run.duplicates_skipped ?? 0} dupes skipped</span>
      <span className="run-date">{run.started_at ? new Date(run.started_at).toLocaleDateString() : '—'}</span>
    </div>
  );
}

export default function Dashboard() {
  const { apiFetch }     = useAuth();
  const { running, onRunComplete } = useAgent();
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [error,     setError]     = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [liveNew,   setLiveNew]   = useState(0); // new accounts from the current run

  function loadStats(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    apiFetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(d => {
        setStats(d);
        setLastFetch(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(err => {
        const msg = err.message === 'Failed to fetch'
          ? 'Cannot reach backend — make sure the server is running on port 3001.'
          : err.message;
        setError(msg);
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => { loadStats(); }, []);

  // Auto-refresh when the agent finishes a run
  useEffect(() => {
    const unsub = onRunComplete((summary) => {
      setLiveNew(summary.accountsAdded ?? 0);
      loadStats(true);
    });
    return unsub;
  }, [onRunComplete]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error)   return (
    <div className="page" style={{ padding: 32 }}>
      <div className="page-error">{error}</div>
      <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => loadStats()}>
        Retry
      </button>
    </div>
  );

  const t = stats?.totals || {};

  return (
    <div className="page dashboard-page">
      {/* Live agent running banner */}
      {running && (
        <div className="dash-live-banner">
          <span className="live-dot" />
          Agent is running — dashboard will refresh automatically when complete
        </div>
      )}
      {liveNew > 0 && !running && (
        <div className="dash-new-banner">
          ✅ Last run added <strong>{liveNew} new accounts</strong> — data below is updated
        </div>
      )}
      <div className="page-header">
        <div>
          {lastFetch && (
            <div className="last-fetch">
              Updated {lastFetch.toLocaleTimeString()}
            </div>
          )}
          <h1>Dashboard</h1>
          <p className="page-sub">Monthly influencer & PR discovery overview</p>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button
            className="btn-ghost"
            onClick={() => loadStats(true)}
            disabled={refreshing}
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          <Link to="/agent" className="btn-primary">⚡ Run Agent</Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="stat-grid">
        <StatCard label="Total Accounts"    value={t.total}     color="#1D9BF0" />
        <StatCard label="Avg Score"         value={t.avg_score} color="#00C896" sub="/ 100" />
        <StatCard label="DM Open"           value={t.dm_open}   color="#F9A825" />
        <StatCard label="Has Email"         value={t.has_email} color="#C084FC" />
      </div>

      <div className="dash-grid">
        {/* By Type */}
        <div className="dash-card">
          <h3>Account Types</h3>
          {stats?.byType?.map(r => (
            <div key={r.type} className="bar-row">
              <span className="bar-label">{r.type || 'Unknown'}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100, (r.count / (t.total || 1)) * 100)}%` }} />
              </div>
              <span className="bar-count">{r.count}</span>
            </div>
          ))}
        </div>

        {/* By Tier */}
        <div className="dash-card">
          <h3>Reach Tiers</h3>
          {stats?.byTier?.map(r => (
            <div key={r.tier} className="bar-row">
              <span className="bar-label">{r.tier || 'Unknown'}</span>
              <div className="bar-track">
                <div className="bar-fill teal" style={{ width: `${Math.min(100, (r.count / (t.total || 1)) * 100)}%` }} />
              </div>
              <span className="bar-count">{r.count}</span>
            </div>
          ))}
        </div>

        {/* Track split */}
        <div className="dash-card">
          <h3>Pipeline Tracks</h3>
          {stats?.byTrack?.map(r => (
            <div key={r.track} className="track-pill">
              <span className={`track-badge track-${r.track}`}>Track {r.track}</span>
              <span>{r.track === 'A' ? 'Pro Collab Pipeline' : 'Ads Audience Only'}</span>
              <span className="track-cnt">{r.count}</span>
            </div>
          ))}
        </div>

        {/* Top accounts */}
        <div className="dash-card top-accounts-card">
          <h3>Top Accounts by Score</h3>
          {stats?.topAccounts?.map(a => (
            <div key={a.handle} className="top-account-row">
              <img src={a.avatar} alt="" className="ta-avatar" onError={e => e.target.style.display='none'} />
              <div className="ta-info">
                <div className="ta-name">{a.name}</div>
                <div className="ta-handle">@{a.handle} · {a.tier}</div>
              </div>
              <div className="ta-score" style={{ color: a.overall >= 65 ? '#00C896' : a.overall >= 45 ? '#F9A825' : '#888' }}>
                {a.overall}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Run history */}
      <div className="dash-card runs-card">
        <h3>Recent Agent Runs</h3>
        {stats?.recentRuns?.length ? (
          stats.recentRuns.map(r => <RunRow key={r.id} run={r} />)
        ) : (
          <div className="empty-state">No runs yet — <Link to="/agent">run the agent</Link></div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAuth }  from '../../context/AuthContext';
import { useAgent } from '../../context/AgentContext';
import { Link }     from 'react-router-dom';

function scoreColor(s) {
  return s >= 65 ? '#00C896' : s >= 45 ? '#F9A825' : '#888';
}

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="stat-card" style={{ borderColor: color }}>
      <div className="stat-card-top">
        {icon && <span className="stat-icon">{icon}</span>}
        <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
      </div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function RunRow({ run }) {
  const statusColor = run.status === 'completed' ? '#00C896'
    : run.status === 'running'  ? '#00F5D4'
    : run.status === 'quota_exhausted' ? '#F9A825'
    : '#FF4444';
  const date = run.started_at ? new Date(run.started_at) : null;
  return (
    <div className="run-row">
      <div className="run-row-status">
        <span className="run-dot" style={{ background: statusColor }} />
        <span className="run-status-text" style={{ color: statusColor }}>
          {run.status === 'quota_exhausted' ? 'quota exhausted' : run.status}
        </span>
      </div>
      <span className="run-by">{run.triggered_by}</span>
      <div className="run-counts">
        <span className="run-added">+{run.accounts_added ?? 0} new</span>
        <span className="run-skip">{run.duplicates_skipped ?? 0} updated</span>
      </div>
      <span className="run-date">
        {date ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : '—'}
      </span>
    </div>
  );
}

function LastRunCard({ run }) {
  if (!run) return null;
  const statusColor = run.status === 'completed' ? 'var(--green)'
    : run.status === 'running' ? 'var(--blue)'
    : run.status === 'quota_exhausted' ? 'var(--gold)' : 'var(--red)';
  const statusLabel = run.status === 'quota_exhausted' ? 'quota exhausted' : run.status;
  const date = run.startedAt ? new Date(run.startedAt) : null;
  const dateStr = date
    ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '';

  return (
    <div className="dash-card" style={{ marginBottom: 16 }}>
      <div className="dash-card-header">
        <h3>Last Run Summary</h3>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
          #{run.runId} · {run.triggeredBy} ·{' '}
          <span style={{ color: statusColor, textTransform: 'capitalize' }}>{statusLabel}</span>
          {dateStr ? ` · ${dateStr}` : ''}
        </span>
      </div>

      {/* What was fetched this run */}
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <StatCard label="Fetched this run" value={run.totalFetched}    color="var(--blue)"  icon="◉" />
        <StatCard label="New accounts"     value={run.newAccounts}     color="var(--green)" icon="＋" />
        <StatCard label="Re-checked"       value={run.updatedAccounts} color="#888"         icon="↻" />
      </div>

      {/* How they were classified into the pipeline */}
      <div style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>
        Classified into pipeline
      </div>
      <div className="stat-grid">
        <StatCard label="A1 · confirmed paid" value={run.a1}     color="var(--green)" icon="✓" />
        <StatCard label="A2 · likely paid"    value={run.a2}     color="var(--gold)"  icon="◐" />
        <StatCard label="Track B · ads"       value={run.trackB} color="#C084FC"      icon="◎" />
        <StatCard label="Other · unbadged"    value={run.other}  color="#888"         icon="·" />
      </div>

      {run.totalFetched === 0 && (
        <div className="track-note" style={{ marginTop: 12 }}>
          No accounts saved this run — most candidates were skipped (refreshed within the last 6 days)
          or the run stopped before finishing.
        </div>
      )}
    </div>
  );
}

function TopAccountCard({ account }) {
  const handle = (account.handle || '').replace(/^@/, '');
  return (
    <a
      href={`https://x.com/${handle}`}
      target="_blank"
      rel="noreferrer"
      className="top-account-card"
    >
      <img
        src={account.avatar}
        alt={account.name}
        className="tac-avatar"
        onError={e => { e.target.style.display = 'none'; }}
      />
      <div className="tac-body">
        <div className="tac-name">
          {account.name}
          {account.verified ? <span className="verified-badge"> ✓</span> : null}
        </div>
        <div className="tac-handle">@{handle}</div>
        <div className="tac-meta">
          <span className={`track-badge track-${account.track}`}>Track {account.track}</span>
          <span className="tac-tier">{account.tier}</span>
          <span className="tac-type">{account.account_type}</span>
        </div>
        <div className="tac-followers">
          {(account.followers || 0).toLocaleString()} followers
        </div>
      </div>
      <div className="tac-score" style={{ color: scoreColor(account.overall) }}>
        <div className="tac-score-num">{account.overall}</div>
        <div className="tac-score-label">score</div>
      </div>
    </a>
  );
}

export default function Dashboard() {
  const { apiFetch }             = useAuth();
  const { running, serverActive, runProgress, stopRun, onRunComplete } = useAgent();
  const [stats,      setStats]      = useState(null);
  const [lastRun,    setLastRun]    = useState(null);
  const [quota,      setQuota]      = useState(null);   // { remaining, limit, used, pct_used, reserve }
  const [monthly,    setMonthly]    = useState(null);   // { used, budget, remaining, pct_used }
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState('');
  const [lastFetch,  setLastFetch]  = useState(null);
  const [liveNew,    setLiveNew]    = useState(0);
  const [stopping,   setStopping]   = useState(false);

  const liveRun = running || serverActive;   // truly active per the status poll
  const pct     = runProgress?.overallPct ?? 0;

  async function handleStop() {
    setStopping(true);
    try { await stopRun(); } finally { setStopping(false); loadStats(true); }
  }

  function loadStats(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError('');
    Promise.all([
      apiFetch('/api/pr/dashboard/stats').then(r => r.json()),
      apiFetch('/api/pr/dashboard/last-run').then(r => r.json()).catch(() => ({ lastRun: null })),
      apiFetch('/api/health').then(r => r.json()).catch(() => null),
    ])
      .then(([d, lr, h]) => {
        setStats(d);
        setLastRun(lr?.lastRun || null);
        setQuota(h?.rapid_quota || null);
        setMonthly(h?.monthly_calls || null);
        setLastFetch(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(err => {
        setError(err.message === 'Failed to fetch'
          ? 'Cannot reach backend — make sure the server is running.'
          : err.message);
        setLoading(false);
        setRefreshing(false);
      });
  }

  useEffect(() => { loadStats(); }, []);
  useEffect(() => {
    const unsub = onRunComplete(summary => {
      setLiveNew(summary.accountsAdded ?? 0);
      loadStats(true);
    });
    return unsub;
  }, [onRunComplete]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error)   return (
    <div className="page" style={{ padding: 32 }}>
      <div className="page-error">{error}</div>
      <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => loadStats()}>Retry</button>
    </div>
  );

  const t = stats?.totals || {};

  return (
    <div className="page dashboard-page">

      {/* Banners */}
      {liveRun && (
        <div className="dash-live-banner dash-run-active">
          <div className="dra-top">
            <span className="live-dot" />
            <span className="dra-label">
              Agent running
              {runProgress?.totalQueries > 0 && ` · query ${runProgress.queriesDone}/${runProgress.totalQueries}`}
            </span>
            <span className="dra-pct">{pct}%</span>
            <button className="btn-danger dra-stop" onClick={handleStop} disabled={stopping}>
              {stopping ? 'Stopping…' : '■ Stop all fetching'}
            </button>
          </div>
          <div className="dra-bar"><div className="dra-bar-fill" style={{ width: `${pct}%` }} /></div>
          <div className="dra-sub">
            {runProgress?.phase ? `Phase: ${runProgress.phase}` : 'Working…'}
            {runProgress?.currentQuery ? ` · ${runProgress.currentQuery}` : ''}
            {' '}· refreshes automatically when complete
          </div>
        </div>
      )}
      {liveNew > 0 && !liveRun && (
        <div className="dash-new-banner">
          ✅ Last run added <strong>{liveNew} new accounts</strong> — data updated
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          {lastFetch && <div className="last-fetch">Updated {lastFetch.toLocaleTimeString()}</div>}
          <h1>Dashboard</h1>
          <p className="page-sub">Monthly influencer & PR discovery overview</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-ghost" onClick={() => loadStats(true)} disabled={refreshing}>
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          <Link to="/agent" className="btn-primary">⚡ Run Agent</Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="stat-grid">
        <StatCard label="Total Accounts" value={t.total}     color="#00F5D4" icon="◉" />
        <StatCard label="Avg Score"      value={t.avg_score} color="#00C896" icon="★" sub="/ 100" />
        <StatCard label="DM Open"        value={t.dm_open}   color="#F9A825" icon="💬" />
        <StatCard label="Has Email"      value={t.has_email} color="#C084FC" icon="✉" />
      </div>

      {/* App monthly budget — our own hard cap (the binding limit) */}
      {monthly && monthly.budget != null && (() => {
        const pct      = monthly.pct_used ?? Math.round((monthly.used / monthly.budget) * 100);
        const barColor = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--gold)' : 'var(--green)';
        return (
          <div className="dash-card quota-card" style={{ marginBottom: 16 }}>
            <div className="dash-card-header">
              <h3>App API Budget <span className="quota-shared">· this month (hard cap)</span></h3>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                {monthly.used.toLocaleString()} / {monthly.budget.toLocaleString()} calls
                <span style={{ color: barColor, fontWeight: 700 }}> · {pct}%</span>
              </span>
            </div>
            <div className="quota-bar">
              <div className="quota-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
            </div>
            <div className="quota-legend">
              <span><strong style={{ color: barColor }}>{(monthly.remaining ?? (monthly.budget - monthly.used)).toLocaleString()}</strong> calls left this month</span>
              <span>auto-stops every run at {monthly.budget.toLocaleString()}</span>
            </div>
          </div>
        );
      })()}

      {/* Monthly API quota — how much of the shared RapidAPI plan is used */}
      {quota && quota.limit != null && (() => {
        const used      = quota.used      ?? (quota.limit - (quota.remaining ?? 0));
        const pctUsed   = quota.pct_used  ?? Math.round((used / quota.limit) * 100);
        const remaining = quota.remaining ?? (quota.limit - used);
        const barColor  = pctUsed >= 90 ? 'var(--red)' : pctUsed >= 70 ? 'var(--gold)' : 'var(--green)';
        return (
          <div className="dash-card quota-card" style={{ marginBottom: 16 }}>
            <div className="dash-card-header">
              <h3>Monthly API Quota <span className="quota-shared">· shared plan</span></h3>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                {used.toLocaleString()} / {quota.limit.toLocaleString()} used
                <span style={{ color: barColor, fontWeight: 700 }}> · {pctUsed}%</span>
              </span>
            </div>
            <div className="quota-bar">
              <div className="quota-bar-fill" style={{ width: `${Math.min(100, pctUsed)}%`, background: barColor }} />
              {quota.reserve != null && quota.limit && (
                <div className="quota-reserve-mark"
                     style={{ left: `${Math.min(100, ((quota.limit - quota.reserve) / quota.limit) * 100)}%` }}
                     title={`Auto-stop reserve: ${quota.reserve.toLocaleString()} left`} />
              )}
            </div>
            <div className="quota-legend">
              <span><strong style={{ color: barColor }}>{remaining.toLocaleString()}</strong> remaining</span>
              {quota.reserve != null && <span>auto-stops with <strong>{quota.reserve.toLocaleString()}</strong> in reserve</span>}
            </div>
          </div>
        );
      })()}

      {/* Last run breakdown — total fetched + A1/A2/B split */}
      <LastRunCard run={lastRun} />

      {/* Charts row */}
      <div className="dash-grid">
        {/* Account Types */}
        <div className="dash-card">
          <h3>Account Types</h3>
          {(stats?.byType || []).map(r => (
            <div key={r.type} className="bar-row">
              <span className="bar-label">{r.type || 'Unknown'}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100,(r.count/(t.total||1))*100)}%` }} />
              </div>
              <span className="bar-count">{r.count}</span>
            </div>
          ))}
        </div>

        {/* Reach Tiers */}
        <div className="dash-card">
          <h3>Reach Tiers</h3>
          {(stats?.byTier || []).map(r => (
            <div key={r.tier} className="bar-row">
              <span className="bar-label">{r.tier || 'Unknown'}</span>
              <div className="bar-track">
                <div className="bar-fill teal" style={{ width: `${Math.min(100,(r.count/(t.total||1))*100)}%` }} />
              </div>
              <span className="bar-count">{r.count}</span>
            </div>
          ))}
        </div>

        {/* Pipeline Tracks */}
        <div className="dash-card">
          <h3>Pipeline Tracks</h3>
          {(stats?.byTrack || []).map(r => (
            <div key={r.track} className="track-pill">
              <span className={`track-badge track-${r.track}`}>Track {r.track}</span>
              <span>{r.track === 'A' ? 'Pro Collab Pipeline' : 'Ads Audience Only'}</span>
              <span className="track-cnt">{r.count}</span>
            </div>
          ))}
          <div className="track-note">
            Track A = contact directly · Track B = use for ads targeting
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="dash-card">
          <h3>Score Distribution</h3>
          {[
            { label: 'Tier 1 (≥65)', color: '#00C896', count: (stats?.topAccounts || []).filter(a => a.overall >= 65).length },
            { label: 'Tier 2 (45–64)', color: '#F9A825', count: (stats?.topAccounts || []).filter(a => a.overall >= 45 && a.overall < 65).length },
            { label: 'Archive (<45)', color: '#888', count: (stats?.topAccounts || []).filter(a => a.overall < 45).length },
          ].map(s => (
            <div key={s.label} className="bar-row">
              <span className="bar-label" style={{ color: s.color }}>{s.label}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${Math.min(100,(s.count/((stats?.topAccounts||[]).length||1))*100)}%`, background: s.color }} />
              </div>
              <span className="bar-count">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Accounts — clickable cards linking to X profiles */}
      <div className="dash-card top-accounts-card" style={{ marginBottom: 16 }}>
        <div className="dash-card-header">
          <h3>Top Accounts by Score</h3>
          <Link to="/accounts" className="dash-see-all">See all →</Link>
        </div>
        {(stats?.topAccounts || []).length === 0 ? (
          <div className="empty-state">No accounts yet — <Link to="/agent">run the agent</Link></div>
        ) : (
          <div className="top-accounts-grid">
            {(stats?.topAccounts || []).map(a => (
              <TopAccountCard key={a.handle} account={a} />
            ))}
          </div>
        )}
      </div>

      {/* Run history */}
      <div className="dash-card runs-card">
        <div className="dash-card-header">
          <h3>Recent Agent Runs</h3>
          <span className="dash-run-count">{stats?.recentRuns?.length ?? 0} runs</span>
        </div>
        {(stats?.recentRuns || []).length ? (
          stats.recentRuns.map(r => <RunRow key={r.id} run={r} />)
        ) : (
          <div className="empty-state">No runs yet — <Link to="/agent">run the agent</Link></div>
        )}
      </div>
    </div>
  );
}

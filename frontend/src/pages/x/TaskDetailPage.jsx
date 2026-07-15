import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth }  from '../../context/AuthContext';
import { useAgent } from '../../context/AgentContext';

const scoreColor = s => s >= 65 ? '#00C896' : s >= 45 ? '#F9A825' : '#888';

// The four primary buckets + two secondary, with display meta
const BUCKETS = [
  { key: 'a1',          icon: '💰', label: 'A1 — Confirmed paid',  cls: 'b-green',  desc: 'Openly does paid work (#ad, code, "DM for collab")' },
  { key: 'a2_genuine',  icon: '✦',  label: 'A2 — Genuine',         cls: 'b-purple', desc: 'Likely paid + authentic content (authenticity ≥ 60)' },
  { key: 'a2_salesy',   icon: '⚠',  label: 'Salesy / Low',         cls: 'b-gold',   desc: 'Likely paid but hype/templated (authenticity < 60)' },
  { key: 'a2_unscored', icon: '◷',  label: 'A2 — Unscored',        cls: 'b-dim',    desc: 'Tagged A2, authenticity not scored yet' },
  { key: 'reposters',   icon: '🔁', label: 'Reposters / Amplifiers', cls: 'b-orange', desc: 'Mostly retweet others — pulled out of A1/A2' },
  { key: 'trackB',      icon: '◎',  label: 'Track B — Ads',        cls: 'b-blue',   desc: 'PR / brand pages — ads audience only' },
  { key: 'other',       icon: '·',  label: 'Other — Unbadged',     cls: 'b-grey',   desc: 'Track A but no paid-promo evidence' },
];

function AccountMini({ a }) {
  const handle = (a.handle || '').replace(/^@/, '');
  return (
    <a className="acct-mini" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer">
      <img className="am-avatar" src={a.avatar} alt="" onError={e => { e.target.style.display = 'none'; }} />
      <div className="am-body">
        <div className="am-name">{a.name}{a.verified ? <span className="verified-badge"> ✓</span> : null}</div>
        <div className="am-handle">@{handle}</div>
        <div className="am-meta">
          <span>{(a.followers || 0).toLocaleString()} followers</span>
          {a.dm_open ? <span className="badge green">DM</span> : null}
          {a.has_email ? <span className="badge blue">Email</span> : null}
          {a.authenticity_score != null && <span className="badge purple">auth {a.authenticity_score}</span>}
          {a.repost_ratio != null && a.repost_ratio >= 60 && <span className="badge orange">🔁 {a.repost_ratio}% reposts</span>}
        </div>
        {a.authenticity_reason && <div className="am-reason">{a.authenticity_reason}</div>}
      </div>
      <div className="am-score" style={{ color: scoreColor(a.overall) }}>{a.overall}</div>
    </a>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const { apiFetch } = useAuth();
  const { startTaskRun, running, serverActive, runProgress, onRunComplete } = useAgent();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(() => {
    apiFetch(`/api/tasks/${id}`).then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Reload this task's results whenever any run completes
  useEffect(() => onRunComplete(() => load()), [onRunComplete, load]);

  const thisRunning = (running || serverActive) && Number(runProgress?.taskId) === Number(id);
  const pct = runProgress?.overallPct ?? 0;

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error)   return <div className="page" style={{ padding: 32 }}><div className="page-error">{error}</div><Link to="/tasks" className="btn-ghost" style={{ marginTop: 12 }}>← Back to Tasks</Link></div>;

  const { task, buckets, counts } = data;

  return (
    <div className="page task-detail-page">
      <div className="page-header">
        <div>
          <Link to="/tasks" className="back-link">← Tasks</Link>
          <h1>{task.name}</h1>
          <p className="page-sub">{task.company ? `${task.company} · ` : ''}{counts.total} accounts found · {task.keywords.length} keywords</p>
        </div>
        <button className="btn-primary" onClick={() => startTaskRun(id)} disabled={running || serverActive}>
          {thisRunning ? 'Running…' : (running || serverActive) ? 'Agent busy…' : '⚡ Run this task'}
        </button>
      </div>

      <div className="task-kw" style={{ marginBottom: 12 }}>
        {task.keywords.map(k => <span key={k} className="kw-chip">{k}</span>)}
      </div>

      {thisRunning && (
        <div className="dash-live-banner dash-run-active" style={{ marginBottom: 16 }}>
          <div className="dra-top">
            <span className="live-dot" />
            <span className="dra-label">Fetching for this task{runProgress?.totalQueries > 0 ? ` · query ${runProgress.queriesDone}/${runProgress.totalQueries}` : ''}</span>
            <span className="dra-pct">{pct}%</span>
          </div>
          <div className="dra-bar"><div className="dra-bar-fill" style={{ width: `${pct}%` }} /></div>
          <div className="dra-sub">Results below refresh automatically when it finishes.</div>
        </div>
      )}

      {counts.total === 0 && !thisRunning && (
        <div className="empty-state">No accounts yet for this task — click <b>Run this task</b> to fetch and sort them.</div>
      )}

      {BUCKETS.map(b => {
        const list = buckets[b.key] || [];
        if (!list.length) return null;
        return (
          <div key={b.key} className={`bucket-section ${b.cls}`}>
            <div className="bucket-head">
              <span className="bucket-title">{b.icon} {b.label}</span>
              <span className="bucket-count">{list.length}</span>
              <span className="bucket-desc">{b.desc}</span>
            </div>
            <div className="bucket-grid">
              {list.map(a => <AccountMini key={a.handle} a={a} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgent } from '../context/AgentContext';

function AccountCard({ account }) {
  const scoreColor = s => s >= 65 ? '#00C896' : s >= 45 ? '#F9A825' : '#888';
  return (
    <div className={`account-card${account.isDuplicate ? ' duplicate' : ''}`}>
      <div className="ac-header">
        <img src={account.avatar} alt="" className="ac-avatar"
          onError={e => { e.target.style.display = 'none'; }} />
        <div className="ac-identity">
          <div className="ac-name">
            {account.name}
            {account.verified && <span className="verified-badge"> ✓</span>}
          </div>
          <div className="ac-handle">@{account.handle}</div>
          <div className="ac-meta">{account.tier} · {account.account_type} · Track {account.track}</div>
          {account.ai_reason && <div className="ac-ai-reason">🤖 {account.ai_reason}</div>}
        </div>
        <div className="ac-score" style={{ color: scoreColor(account.overall) }}>
          {account.overall}
        </div>
        {account.isDuplicate && <div className="dup-badge">Updated</div>}
      </div>
      {account.bio && <div className="ac-bio">{account.bio}</div>}
      <div className="ac-dims">
        {[
          ['D2', 'Collab',   account.d2, true],
          ['D3', 'AI Rel.',  account.d3, true],
          ['D4', 'Auth.',    account.d4, false],
          ['D5', 'Reach',    account.d5, false],
        ].map(([k, l, v, ai]) => (
          <div key={k} className="dim">
            <div className="dim-label">{k} {l}{ai && <span className="dim-ai">AI</span>}</div>
            <div className="dim-bar">
              <div className="dim-fill" style={{ width: `${v}%`, background: scoreColor(v) }} />
            </div>
            <div className="dim-val" style={{ color: scoreColor(v) }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="ac-footer">
        <span>{(account.followers || 0).toLocaleString()} followers</span>
        {account.dmOpen   && <span className="badge green">DM Open</span>}
        {account.hasEmail && <span className="badge blue">Has Email</span>}
        {account.website  && <a href={account.website} target="_blank" rel="noreferrer" className="badge link">Website ↗</a>}
        {account.ai_model && (
          <span className="badge purple" title={account.ai_model}>
            {account.ai_model.split('/')[1]?.split('-').slice(0, 2).join('-') || 'AI'}
          </span>
        )}
      </div>
    </div>
  );
}

const PRESETS = [
  'ai voice assistant', 'vapi developer', 'elevenlabs creator',
  'ai agent builder', 'voice ai startup', 'ai automation founder',
  'conversational ai', 'ai saas founder',
];

export default function AgentRunner() {
  const { running, accounts, stepLog, progress, summary, connErr, stats, startRun, stopRun } = useAgent();
  const navigate  = useNavigate();
  const [query, setQuery] = useState('');
  const logRef = useRef(null);

  // Auto-scroll log
  const scrollLog = () => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  };

  return (
    <div className="page agent-page">
      <div className="page-header">
        <div>
          <h1>Run Agent</h1>
          <p className="page-sub">
            Fetches all active keywords — results saved to database.
            {running && <span className="running-note"> You can navigate away — the run continues in the background.</span>}
          </p>
        </div>
        {running && (
          <div className="run-live-stats">
            <span className="live-dot" />
            <span className="live-label">Live</span>
            <span className="live-stat green">+{stats.added} new</span>
            <span className="live-stat gold">{stats.updated} updated</span>
            {stats.errors > 0 && <span className="live-stat red">{stats.errors} err</span>}
          </div>
        )}
      </div>

      {connErr && <div className="conn-error">⚠️ {connErr}</div>}

      {/* Controls */}
      <div className="agent-controls">
        <div className="search-row">
          <input
            className="search-input"
            placeholder="Custom query — or leave blank to run all 61 active keywords"
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={running}
            onKeyDown={e => e.key === 'Enter' && !running && startRun(query)}
          />
          {running
            ? <button className="btn-danger" onClick={stopRun}>■ Stop</button>
            : <button className="btn-primary" onClick={() => startRun(query)}>⚡ Run Agent</button>
          }
        </div>
        <div className="presets">
          {PRESETS.map(p => (
            <button key={p}
              className={`preset-chip${query === p ? ' active' : ''}`}
              onClick={() => setQuery(p)}
              disabled={running}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Progress */}
      {(running || progress > 0) && (
        <div className="progress-bar-wrap">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span className="progress-pct">{progress}%</span>
        </div>
      )}

      {/* Summary */}
      {summary && !running && (
        <div className="summary-banner">
          ✅ Run complete —{' '}
          <strong>{summary.accountsAdded ?? 0} new accounts</strong> added,{' '}
          <strong>{summary.duplicatesSkipped ?? 0} updated</strong> in database.{' '}
          <button className="link-btn" onClick={() => navigate('/')}>View Dashboard →</button>
        </div>
      )}

      <div className="agent-body">
        {/* Live log — persists even after navigation */}
        <div className="step-log" ref={logRef} onScroll={() => {}}>
          <div className="log-title">
            Agent Log
            {stepLog.length > 0 && (
              <button className="log-scroll-btn" onClick={scrollLog}>↓ Latest</button>
            )}
          </div>
          {stepLog.length === 0 && (
            <div className="log-empty">
              {running ? 'Starting…' : 'Ready — click Run Agent to start'}
            </div>
          )}
          {stepLog.map((l, i) => (
            <div key={i} className={`log-line log-${l.type}`}>{l.msg}</div>
          ))}
        </div>

        {/* Results */}
        <div className="results-col">
          {accounts.length > 0 && (
            <div className="results-header">
              <span>{accounts.length} accounts this run</span>
              {stats.errors > 0 && <span className="err-cnt">{stats.errors} errors</span>}
            </div>
          )}
          {[...accounts].sort((a, b) => b.overall - a.overall).map(a => (
            <AccountCard key={a.handle} account={a} />
          ))}
          {!running && accounts.length === 0 && stepLog.length > 0 && (
            <div className="empty-state">
              No new accounts found — all results were already in the database.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

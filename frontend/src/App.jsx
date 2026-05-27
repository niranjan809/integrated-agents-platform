import { useState, useRef, useEffect } from 'react';

// Backend URL — set VITE_BACKEND_URL in Vercel env vars → https://your-app.onrender.com
const BACKEND = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

function fmt(n) {
  if (n === undefined || n === null) return '—';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000)     return (num / 1_000).toFixed(1) + 'K';
  return String(num);
}
function ts() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function scoreColor(v) {
  if (v >= 70) return 'green';
  if (v >= 45) return 'gold';
  return 'red';
}

// ── Presets — targeting PR pages + influencers in AI/voice space ──────────
const PRESETS = [
  'AI voice API developer',
  'ElevenLabs alternative',
  'Arabic AI developer',
  'voice AI startup',
  'AI tools review',
  'multilingual AI',
  'conversational AI',
  'AI product launch',
];

// ── Type config ───────────────────────────────────────────────────────────
const TYPE_META = {
  'Influencer':  { color: '#00C896', bg: 'rgba(0,200,150,.12)',  border: 'rgba(0,200,150,.35)'  },
  'AI Media':    { color: '#CE93D8', bg: 'rgba(206,147,216,.1)', border: 'rgba(206,147,216,.35)' },
  'PR Page':     { color: '#1D9BF0', bg: 'rgba(29,155,240,.1)', border: 'rgba(29,155,240,.35)'  },
  'Brand Page':  { color: '#F9A825', bg: 'rgba(249,168,37,.1)', border: 'rgba(249,168,37,.35)'  },
  'Account':     { color: '#7090A8', bg: 'rgba(112,144,168,.08)', border: 'var(--border)' },
};
function typeMeta(t) { return TYPE_META[t] || TYPE_META['Account']; }

// ═══════════════════════════════════════════════════════════════════════════
// ScoreBar — mini labeled score indicator
// ═══════════════════════════════════════════════════════════════════════════
function ScoreBar({ label, value }) {
  const col = scoreColor(value);
  const colorMap = { green: 'var(--green)', gold: 'var(--gold)', red: 'var(--red)' };
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: .4 }}>{label}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: colorMap[col] }}>{value}</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: colorMap[col], borderRadius: 2, transition: 'width .5s' }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HealthMeter
// ═══════════════════════════════════════════════════════════════════════════
function HealthMeter({ health }) {
  const {
    status = '—', strength = 0, color = 'var(--text-muted)',
    avgMs = 0, successRate = 100, calls = 0, errors = 0,
    durations = [],
  } = health || {};
  const rtMax = Math.max(...durations, 1);

  return (
    <div className="health-card">
      <div className="health-title">API Signal Strength</div>

      {/* 5-bar meter */}
      <div className="signal-row">
        {[1, 2, 3, 4, 5].map(b => (
          <div key={b} className="signal-bar" style={{
            width:      14,
            height:     8 + b * 7,
            background: b <= strength ? color : 'var(--bg3)',
            border:     `1px solid ${b <= strength ? color : 'var(--border)'}`,
          }} />
        ))}
      </div>

      <div className="health-status" style={{ color }}>{status}</div>

      <div className="health-stats">
        {[
          [avgMs ? `${avgMs}ms` : '—', 'Avg Response'],
          [`${successRate}%`,           'Success Rate'],
          [String(calls),               'Total Calls'],
          [String(errors),              'Errors'],
        ].map(([val, lbl]) => (
          <div key={lbl} className="hstat">
            <div className="val">{val}</div>
            <div className="lbl">{lbl}</div>
          </div>
        ))}
      </div>

      {/* Response-time chart */}
      {durations.length > 0 && (
        <div className="rt-chart">
          <div className="rt-chart-title">Response Times (ms)</div>
          <div className="rt-bars">
            {durations.slice(-12).map((d, i) => (
              <div key={i} className="rt-bar" style={{
                height:     `${Math.max(8, Math.round((d / rtMax) * 100))}%`,
                background: d > 3500 ? 'var(--red)' : d > 1800 ? 'var(--gold)' : 'var(--green)',
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// AccountCard — full influencer/PR page details
// ═══════════════════════════════════════════════════════════════════════════
function AccountCard({ account: a }) {
  const tierClass = {
    'Macro':     'badge-tier-macro',
    'Mid-Tier':  'badge-tier-mid',
    'Micro':     'badge-tier-micro',
    'Nano':      'badge-tier-nano',
    'Below bar': 'badge-tier-below',
  }[a.tier] || 'badge-tier-below';

  const tm    = typeMeta(a.type);
  const ratio = Number(a.ratio);
  const ratioColor = ratio >= 10 ? 'green' : ratio >= 3 ? 'gold' : 'blue';

  return (
    <div className="acc-card">
      {/* Avatar + name + badges */}
      <div className="acc-top">
        <div className="acc-avatar">
          {a.avatar
            ? <img src={a.avatar} alt="" onError={e => { e.target.style.display = 'none'; }} />
            : <div className="acc-avatar-ph">{(a.name || a.handle || '?')[0].toUpperCase()}</div>
          }
        </div>
        <div className="acc-meta">
          <div className="acc-name">{a.name || a.handle}</div>
          <div className="acc-handle">@{a.handle}</div>
          <div className="acc-badges">
            {/* Type badge */}
            <span className="badge" style={{
              background: tm.bg, color: tm.color, borderColor: tm.border,
            }}>{a.type}</span>
            {/* Tier badge */}
            <span className={`badge ${tierClass}`}>{a.tier}</span>
            {/* Verified */}
            {a.verified && <span className="badge badge-verified">&#10003;</span>}
            {/* Min bar */}
            <span className={`badge ${a.pass_min_bar ? 'badge-pass' : 'badge-fail'}`}>
              {a.pass_min_bar ? 'PASS' : 'FAIL'}
            </span>
          </div>
        </div>
        {/* Overall score bubble */}
        <div style={{
          flexShrink: 0, width: 46, height: 46, borderRadius: '50%',
          background: a.overall >= 70 ? 'rgba(0,200,150,.15)' : a.overall >= 45 ? 'rgba(249,168,37,.12)' : 'rgba(112,144,168,.1)',
          border: `2px solid ${a.overall >= 70 ? 'var(--green)' : a.overall >= 45 ? 'var(--gold)' : 'var(--border)'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--mono)',
            color: a.overall >= 70 ? 'var(--green)' : a.overall >= 45 ? 'var(--gold)' : 'var(--text-dim)',
          }}>{a.overall}</div>
          <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>score</div>
        </div>
      </div>

      {/* Bio */}
      {a.bio && <div className="acc-bio">{a.bio}</div>}

      {/* Stats */}
      <div className="acc-stats">
        <div className="acc-stat">
          <div className="v">{fmt(a.followers)}</div>
          <div className="l">Followers</div>
        </div>
        <div className="acc-stat">
          <div className="v">{fmt(a.following)}</div>
          <div className="l">Following</div>
        </div>
        <div className="acc-stat">
          <div className="v">{fmt(a.tweets)}</div>
          <div className="l">Tweets</div>
        </div>
      </div>

      {/* Score bars — D2 D3 D4 D5 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <ScoreBar label="Collab (D2)" value={a.d2} />
        <ScoreBar label="AI Rel (D3)" value={a.d3} />
        <ScoreBar label="Authority (D4)" value={a.d4} />
        <ScoreBar label="Reach (D5)" value={a.d5} />
      </div>

      {/* Score details row */}
      <div className="acc-scores">
        <div className="score-row">
          <span className="score-lbl">F/F Ratio</span>
          <span className={`score-val ${ratioColor}`}>{a.ratio ?? '—'}</span>
        </div>
        <div className="score-row">
          <span className="score-lbl">Overall</span>
          <span className={`score-val ${scoreColor(a.overall)}`}>{a.overall}/100</span>
        </div>
      </div>

      {/* Outreach indicators */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {a.dmOpen && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
            background: 'rgba(0,200,150,.1)', color: 'var(--green)', border: '1px solid rgba(0,200,150,.3)' }}>
            DM Open
          </span>
        )}
        {a.website && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
            background: 'rgba(29,155,240,.1)', color: 'var(--blue)', border: '1px solid rgba(29,155,240,.3)',
            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.website.replace(/^https?:\/\/(www\.)?/, '')}
          </span>
        )}
        {a.hasEmail && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
            background: 'rgba(249,168,37,.1)', color: 'var(--gold)', border: '1px solid rgba(249,168,37,.3)' }}>
            Email in Bio
          </span>
        )}
        {a.location && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20,
            background: 'var(--bg3)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {a.location.slice(0, 20)}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="acc-footer">
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          #{a.index} of {a.total}
        </span>
        <span className="ms" style={{ color: 'var(--text-muted)' }}>{a.duration_ms}ms</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ResultsSummary — breakdown bar across types
// ═══════════════════════════════════════════════════════════════════════════
function ResultsSummary({ accounts }) {
  const counts = accounts.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});
  const avgScore = accounts.length
    ? Math.round(accounts.reduce((s, a) => s + a.overall, 0) / accounts.length)
    : 0;
  const passCount = accounts.filter(a => a.pass_min_bar).length;
  const dmCount   = accounts.filter(a => a.dmOpen).length;

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 18px', marginBottom: 16,
      display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>

      {/* Type breakdown */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
        {Object.entries(counts).map(([type, count]) => {
          const tm = typeMeta(type);
          return (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: tm.color }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                <span style={{ fontWeight: 700, color: tm.color }}>{count}</span> {type}
              </span>
            </div>
          );
        })}
      </div>

      {/* Key stats */}
      <div style={{ display: 'flex', gap: 16 }}>
        {[
          ['Avg Score',    avgScore,   avgScore >= 60 ? 'var(--green)' : 'var(--gold)'],
          ['Min Bar Pass', passCount,  'var(--blue)'],
          ['DM Open',      dmCount,    'var(--green)'],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: col }}>{val}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [query,     setQuery]     = useState('AI voice API developer');
  const [running,   setRunning]   = useState(false);
  const [done,      setDone]      = useState(false);
  const [health,    setHealth]    = useState(null);
  const [progress,  setProgress]  = useState({ current: 0, total: 10, pct: 0, message: '', handles: [] });
  const [stepLog,   setStepLog]   = useState([]);
  const [accounts,  setAccounts]  = useState([]);
  const [errCards,  setErrCards]  = useState([]);
  const [backendOk, setBackendOk] = useState(null);

  const esRef       = useRef(null);
  const activeQuery = useRef('');

  // Backend health check on mount
  useEffect(() => {
    fetch(`${BACKEND}/api/health`)
      .then(r => r.json())
      .then(d => setBackendOk(!!d.key_set))
      .catch(() => setBackendOk(false));
  }, []);

  function addLog(msg, type = '') {
    setStepLog(prev => [...prev.slice(-79), { time: ts(), msg, type }]);
  }

  function mergeHealth(hData, durs) {
    setHealth(prev => {
      const prevDurs = prev?.durations || [];
      const newDurs  = durs !== null
        ? durs
        : [...prevDurs, ...(hData.durations || [])].slice(-20);
      return { ...hData, durations: newDurs };
    });
  }

  function stop() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
    addLog('Run stopped by user.', 'warn');
  }

  function run() {
    if (running || !query.trim()) return;

    // Reset state
    setDone(false);
    setAccounts([]);
    setErrCards([]);
    setStepLog([]);
    setHealth(null);
    setProgress({ current: 0, total: 10, pct: 0, message: 'Starting…', handles: [] });
    setRunning(true);
    activeQuery.current = query;

    addLog(`Agent started — query: "${query}"`);

    // Connect directly to backend (bypasses Vite proxy for SSE streaming)
    const url = `${BACKEND}/api/run-demo?query=${encodeURIComponent(query)}`;
    const es  = new EventSource(url);
    esRef.current = es;

    es.addEventListener('status', e => {
      const d = JSON.parse(e.data);
      setProgress(prev => ({
        ...prev,
        message: d.message,
        pct:     d.progress ?? prev.pct,
        current: d.current  ?? prev.current,
        total:   d.total    ?? prev.total,
      }));
      addLog(d.message, d.step === 'delay' ? 'warn' : '');
    });

    es.addEventListener('search_done', e => {
      const d = JSON.parse(e.data);
      addLog(`Search: ${d.found} unique handles found — fetching top ${d.fetching}`, 'ok');
      setProgress(prev => ({ ...prev, handles: d.handles || [], total: d.fetching || 10 }));
    });

    es.addEventListener('account', e => {
      const d   = JSON.parse(e.data);
      const acc = d.account;
      setAccounts(prev => [...prev, acc]);
      setProgress(prev => ({
        ...prev,
        current: acc.index,
        pct:     Math.round((acc.index / (acc.total || 10)) * 100),
        message: `Fetched @${acc.handle} (${acc.type})`,
      }));
      if (d.health) mergeHealth({ ...d.health }, d.durations || null);
      addLog(
        `@${acc.handle} — ${acc.type} · ${acc.tier} · Score ${acc.overall}/100 · ${fmt(acc.followers)} followers`,
        'ok',
      );
    });

    es.addEventListener('fetch_error', e => {
      const d = JSON.parse(e.data);
      setErrCards(prev => [...prev, d]);
      if (d.health) mergeHealth(d.health, d.durations || null);
      const errMsg = typeof d.error === 'object'
        ? (d.error?.message || JSON.stringify(d.error))
        : String(d.error ?? 'unknown');
      addLog(`Error @${d.handle}: HTTP ${d.status || '?'} — ${errMsg}`, 'err');
    });

    es.addEventListener('health', e => {
      const d = JSON.parse(e.data);
      mergeHealth(d, d.durations || null);
    });

    // Named 'error' event from server (search step failed)
    es.addEventListener('error', e => {
      if (e.data) {
        try {
          const d = JSON.parse(e.data);
          addLog(`Search failed: ${d.message}`, 'err');
          if (d.health) mergeHealth(d.health, null);
        } catch {}
        setRunning(false);
        es.close();
        esRef.current = null;
      }
    });

    es.addEventListener('complete', e => {
      const d = JSON.parse(e.data);
      if (d.health) mergeHealth(d.health, d.durations || null);
      setProgress(prev => ({ ...prev, pct: 100, current: d.fetched, message: 'Run complete!' }));
      addLog(`Done — ${d.fetched} fetched, ${d.errors} errors`, 'ok');
      setDone(true);
      setRunning(false);
      es.close();
      esRef.current = null;
    });

    es.onerror = e => {
      if (!e.data) {
        addLog('Connection error — is the backend running?', 'err');
        setRunning(false);
        es.close();
        esRef.current = null;
      }
    };
  }

  function clearResults() {
    setDone(false); setAccounts([]); setErrCards([]);
    setStepLog([]); setHealth(null);
    setProgress({ current: 0, total: 10, pct: 0, message: '', handles: [] });
  }

  const totalCards = accounts.length + errCards.length;

  // Sort accounts: higher overall score first
  const sortedAccounts = [...accounts].sort((a, b) => b.overall - a.overall);

  return (
    <div className="app">
      {/* ── Topbar ───────────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="logo">
          KiteAI <span>X Influencer &amp; PR Page Agent</span>
        </div>
        <div className="hd">
          <div className={`hd-dot ${backendOk === null ? '' : backendOk ? 'ok' : 'err'}`} />
          <span className="hd-lbl">
            {backendOk === null ? 'Checking backend…'
            : backendOk         ? 'Backend live · RapidAPI connected'
            :                     'Backend offline'}
          </span>
          <span className="api-badge">twitter-api45</span>
        </div>
      </header>

      {/* ── Page ─────────────────────────────────────────────────────────── */}
      <div className="page">

        {/* Query bar */}
        <div className="query-bar">
          <input
            className="query-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder='e.g. "AI voice API developer" or "Arabic AI startup"'
            onKeyDown={e => !running && e.key === 'Enter' && run()}
            disabled={running}
          />
          {running
            ? <button className="btn btn-stop" onClick={stop}>Stop</button>
            : <button className="btn btn-run"  onClick={run}
                disabled={!query.trim() || backendOk === false}>
                Run Agent
              </button>
          }
        </div>

        {/* Preset chips */}
        <div className="preset-row">
          {PRESETS.map(q => (
            <span key={q}
              className={`preset-chip ${query === q ? 'active' : ''}`}
              onClick={() => !running && setQuery(q)}>
              {q}
            </span>
          ))}
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────── */}
        <div className="run-layout">

          {/* LEFT: progress + results */}
          <div>

            {/* Progress card */}
            {(running || done || totalCards > 0) && (
              <div className="prog-card">
                <div className="prog-title">Agent Progress</div>
                <div className="prog-bar-track">
                  <div className="prog-bar-fill" style={{ width: `${progress.pct}%` }} />
                </div>
                <div className="prog-nums">
                  <span className="current">{progress.current} / {progress.total} accounts</span>
                  <span>{progress.pct}%</span>
                </div>
                <div className="prog-status">
                  {progress.message && (
                    <span className={progress.message.toLowerCase().includes('delay') || progress.message.toLowerCase().includes('anti-block') ? 'delay' : 'handle'}>
                      {progress.message}
                    </span>
                  )}
                </div>

                {/* Step log */}
                {stepLog.length > 0 && (
                  <div className="step-log">
                    {[...stepLog].reverse().map((s, i) => (
                      <div key={i} className="step-row">
                        <span className="step-time">{s.time}</span>
                        <span className={`step-msg ${s.type}`}>{s.msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Done banner */}
            {done && (
              <div className="done-banner">
                <div className="done-icon">&#10003;</div>
                <div style={{ flex: 1 }}>
                  <div className="done-text">
                    {accounts.length} account{accounts.length !== 1 ? 's' : ''} fetched
                    {errCards.length > 0 && ` · ${errCards.length} error${errCards.length > 1 ? 's' : ''}`}
                  </div>
                  <div className="done-sub">
                    Query: &ldquo;{activeQuery.current}&rdquo;
                    &nbsp;&mdash;&nbsp;
                    {errCards.length === 0 ? 'All calls successful' : 'See error cards'}
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={clearResults}>
                  Clear
                </button>
              </div>
            )}

            {/* Results */}
            {totalCards > 0 && (
              <>
                {/* Summary bar */}
                {accounts.length > 0 && <ResultsSummary accounts={accounts} />}

                <div className="results-header">
                  <div className="results-count">
                    <strong>{accounts.length}</strong> profile{accounts.length !== 1 ? 's' : ''}{' '}
                    {running && <span style={{ color: 'var(--gold)', fontStyle: 'italic' }}>fetching…</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>sorted by overall score</div>
                </div>

                <div className="results-grid">
                  {sortedAccounts.map((a, i) => <AccountCard key={i} account={a} />)}
                  {errCards.map((e, i) => (
                    <div key={`err-${i}`} className="acc-error">
                      <div className="err-handle">@{e.handle}</div>
                      <div className="err-msg">
                        HTTP {e.status || '?'} —{' '}
                        {typeof e.error === 'object'
                          ? (e.error?.message || JSON.stringify(e.error).slice(0, 80))
                          : String(e.error ?? 'unknown error')}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Idle state */}
            {!running && !done && totalCards === 0 && (
              <div className="idle-state">
                <div className="idle-icon" style={{ fontSize: 36, fontWeight: 700, color: 'var(--blue)', opacity: .4 }}>X</div>
                <div className="idle-title">KiteAI Influencer &amp; PR Page Agent</div>
                <div className="idle-sub">
                  Searches X, fetches up to <strong>10 profiles</strong>, scores each one
                  across <strong>D2–D5 dimensions</strong> (collab evidence, AI relevance,
                  X authority, reach quality), and classifies as{' '}
                  <span style={{ color: 'var(--green)' }}>Influencer</span>,{' '}
                  <span style={{ color: 'var(--blue)' }}>PR Page</span>,{' '}
                  <span style={{ color: 'var(--purple)' }}>AI Media</span>, or{' '}
                  <span style={{ color: 'var(--gold)' }}>Brand Page</span>.
                  <br /><br />
                  Pick a preset above or type a custom query, then click{' '}
                  <strong style={{ color: 'var(--blue)' }}>Run Agent</strong>.
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: health meter */}
          <HealthMeter health={health} />

        </div>
      </div>
    </div>
  );
}

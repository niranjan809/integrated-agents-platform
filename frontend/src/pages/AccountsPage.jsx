import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

const SCORE_TIERS = [
  { key: 'all',     label: 'All',     color: '#7DA4BE', min: 0,  max: 100 },
  { key: 'top',     label: 'Tier 1',  color: '#00C896', min: 65, max: 100 },
  { key: 'mid',     label: 'Tier 2',  color: '#F9A825', min: 45, max: 64  },
  { key: 'archive', label: 'Archive', color: '#888',    min: 0,  max: 44  },
];
const REACH_TIERS  = ['Macro', 'Mid-Tier', 'Micro', 'Nano', 'Below bar'];
const SORT_OPTIONS = [
  { value: 'score',     label: 'Score ↓'     },
  { value: 'followers', label: 'Followers ↓' },
  { value: 'name',      label: 'Name A–Z'    },
];

function scoreColor(s) {
  return s >= 65 ? '#00C896' : s >= 45 ? '#F9A825' : '#888';
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ accounts }) {
  const total    = accounts.length;
  const avgScore = total ? Math.round(accounts.reduce((s, a) => s + (a.overall || 0), 0) / total) : 0;
  const dmOpen   = accounts.filter(a => a.dm_open).length;
  const hasEmail = accounts.filter(a => a.has_email).length;
  const trackA   = accounts.filter(a => a.track === 'A').length;
  const trackB   = accounts.filter(a => a.track === 'B').length;
  return (
    <div className="stats-bar">
      <div className="stats-bar-cats">
        {SCORE_TIERS.filter(t => t.key !== 'all').map(t => ({
          ...t, count: accounts.filter(a => a.overall >= t.min && a.overall <= t.max).length,
        })).map(t => (
          <div key={t.key} className="stats-cat">
            <span className="stats-cat-count" style={{ color: t.color }}>{t.count}</span>
            <span className="stats-cat-label">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="stats-bar-divider" />
      <div className="stats-bar-meta">
        <span>Avg <strong style={{ color: scoreColor(avgScore) }}>{avgScore}</strong></span>
        <span>DM <strong className="green">{dmOpen}</strong></span>
        <span>Email <strong className="blue">{hasEmail}</strong></span>
        <span>Track A <strong style={{ color:'#00C896' }}>{trackA}</strong></span>
        <span>Track B <strong style={{ color:'#F9A825' }}>{trackB}</strong></span>
      </div>
    </div>
  );
}

// ── Contact details panel (shown when expanded) ───────────────────────────────
function ContactPanel({ account }) {
  const handle = (account.handle || '').replace(/^@/, '');
  const xProfileUrl = `https://x.com/${handle}`;

  return (
    <div className="contact-panel">

      {/* Header row — avatar + summary */}
      <div className="cp-header">
        <img src={account.avatar} alt={account.name} className="cp-avatar"
          onError={e => { e.target.style.display = 'none'; }} />
        <div className="cp-summary">
          <div className="cp-name">
            {account.name}
            {!!account.verified && <span className="verified-badge"> ✓</span>}
          </div>
          <a href={xProfileUrl} target="_blank" rel="noreferrer" className="cp-handle-link">
            @{handle} ↗
          </a>
          <div className="cp-meta-chips">
            <span className={`track-badge track-${account.track}`}>Track {account.track}</span>
            <span className={`type-badge type-${(account.account_type||'').replace(/\s+/g,'-').toLowerCase()}`}>
              {account.account_type}
            </span>
            <span className="cp-tier">{account.tier}</span>
            <span className="cp-followers">{(account.followers||0).toLocaleString()} followers</span>
          </div>
        </div>
        <div className="cp-overall" style={{ color: scoreColor(account.overall) }}>
          <div className="cp-overall-num">{account.overall}</div>
          <div className="cp-overall-label">overall score</div>
        </div>
      </div>

      {/* Bio */}
      {account.bio && (
        <div className="cp-section">
          <div className="cp-section-label">Bio</div>
          <div className="cp-bio-text">{account.bio}</div>
        </div>
      )}

      {/* Contact row */}
      <div className="cp-section">
        <div className="cp-section-label">Contact</div>
        <div className="cp-contacts">

          {/* X Profile — always shown */}
          <a href={xProfileUrl} target="_blank" rel="noreferrer" className="cp-contact-btn cp-x">
            𝕏 View Profile
          </a>

          {/* DM — only if open (!! converts DB integer 0/1 to boolean) */}
          {!!account.dm_open && (
            <a href={xProfileUrl} target="_blank" rel="noreferrer" className="cp-contact-btn cp-dm">
              💬 Send DM
            </a>
          )}

          {/* Email */}
          {!!account.contact_email && (
            <a href={`mailto:${account.contact_email}`} className="cp-contact-btn cp-email">
              ✉ {account.contact_email}
            </a>
          )}
          {!account.contact_email && !!account.has_email && (
            <span className="cp-contact-hint">✉ Email in bio — check profile</span>
          )}

          {/* Website */}
          {!!account.website && (
            <a href={account.website} target="_blank" rel="noreferrer" className="cp-contact-btn cp-web">
              🌐 Website
            </a>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      <div className="cp-section">
        <div className="cp-section-label">Score Breakdown</div>
        <div className="cp-scores">
          {[
            { key: 'D2', label: 'Collab Intent', value: account.d2,  ai: true,  desc: 'How open to partnerships/DMs' },
            { key: 'D3', label: 'AI Relevance',  value: account.d3,  ai: true,  desc: 'How AI/voice focused' },
            { key: 'D4', label: 'Authority',      value: account.d4,  ai: false, desc: 'Verified + follower ratio' },
            { key: 'D5', label: 'Reach Quality',  value: account.d5,  ai: false, desc: 'Follower tier' },
          ].map(d => (
            <div key={d.key} className="cp-score-item">
              <div className="cp-score-top">
                <span className="cp-score-key">{d.key}</span>
                <span className="cp-score-label">{d.label}</span>
                {d.ai && <span className="dim-ai">AI</span>}
                <span className="cp-score-val" style={{ color: scoreColor(d.value) }}>{d.value}</span>
              </div>
              <div className="cp-score-bar">
                <div style={{ width:`${d.value}%`, background: scoreColor(d.value), height:'100%', borderRadius:3 }} />
              </div>
              <div className="cp-score-desc">{d.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Assessment */}
      {account.ai_reason && (
        <div className="cp-section">
          <div className="cp-section-label">AI Assessment</div>
          <div className="cp-ai-reason">🤖 {account.ai_reason}</div>
        </div>
      )}

      {/* Promotion Type */}
      {account.promotion_type && account.promotion_type !== 'unknown' && (
        <div className="cp-section">
          <div className="cp-section-label">Paid Promotion Status</div>
          <div className="cp-promo-row">
            <span className={`promo-badge promo-${account.promotion_type}`}>
              {account.promotion_type === 'explicit'  ? '✅ Confirmed Paid Promoter'  :
               account.promotion_type === 'inferred'  ? '~ Likely Paid Promoter'      :
               account.promotion_type === 'none'      ? '✗ Not a Paid Promoter'       : '? Unknown'}
            </span>
            {account.promotion_confidence > 0 && (
              <span className="promo-conf">{account.promotion_confidence}% confidence</span>
            )}
          </div>
          {account.promotion_signals && (() => {
            try {
              const signals = typeof account.promotion_signals === 'string'
                ? JSON.parse(account.promotion_signals) : account.promotion_signals;
              return signals?.length > 0 ? (
                <div className="promo-signals">
                  {signals.map((s, i) => <span key={i} className="promo-signal">• {s}</span>)}
                </div>
              ) : null;
            } catch { return null; }
          })()}
        </div>
      )}

    </div>
  );
}

// ── Account row ───────────────────────────────────────────────────────────────
function AccountRow({ account, rank }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`account-row-full${expanded ? ' expanded' : ''}`}>
      {/* Main row — click to expand */}
      <div className="arf-main-row" onClick={() => setExpanded(e => !e)}>
        <div className="arf-rank">#{rank}</div>
        <img src={account.avatar} alt="" className="arf-avatar"
          onError={e => { e.target.style.display = 'none'; }} />

        <div className="arf-identity">
          <div className="arf-name">
            {account.name}
            {!!account.verified && <span className="verified-badge"> ✓</span>}
          </div>
          <div className="arf-handle">@{account.handle}</div>
          <div className="arf-meta-row">
            <span className={`track-badge track-${account.track}`}>Track {account.track}</span>
            <span className={`type-badge type-${(account.account_type||'').replace(/\s+/g,'-').toLowerCase()}`}>
              {account.account_type}
            </span>
          </div>
        </div>

        <div className="arf-reach">
          <div className="arf-reach-tier">{account.tier}</div>
          <div className="arf-followers">{(account.followers||0).toLocaleString()}</div>
        </div>

        <div className="arf-dims">
          {[['D2',account.d2],['D3',account.d3],['D4',account.d4],['D5',account.d5]].map(([k,v])=>(
            <div key={k} className="arf-dim">
              <div className="arf-dim-label">{k}</div>
              <div className="arf-dim-bar">
                <div style={{ width:`${v}%`, background:scoreColor(v), height:'100%', borderRadius:2 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="arf-score" style={{ color: scoreColor(account.overall) }}>
          {account.overall}
        </div>

        <div className="arf-tags">
          {!!account.dm_open    && <span className="badge green" title="DM Open">DM</span>}
          {!!account.has_email  && <span className="badge blue"  title="Has Email">✉</span>}
          {!!account.website    && (
            <a href={account.website} target="_blank" rel="noreferrer"
              className="badge link" onClick={e => e.stopPropagation()}>↗</a>
          )}
          {!!account.contact_email && <span className="badge blue" title={account.contact_email}>@</span>}
          {/* Promotion type badge */}
          {account.promotion_type === 'explicit'  && <span className="badge promo-tag-exp" title="Confirmed paid promoter">💰 A1</span>}
          {account.promotion_type === 'inferred'  && <span className="badge promo-tag-inf" title={`Likely paid promoter (${account.promotion_confidence}%)`}>~ A2</span>}
        </div>

        <div className="arf-expand-btn">{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded contact panel */}
      {expanded && <ContactPanel account={account} />}
    </div>
  );
}

// ── Resolve Unknowns panel ─────────────────────────────────────────────────────
// Re-analyses unbadged Track A accounts (unknown / not-paid) with the evidence-
// based paid-pattern detector, promoting real promoters into A1/A2. Streams live.
function ResolveUnknownsPanel({ onDone }) {
  const { apiFetch } = useAuth();
  const [stats,    setStats]    = useState(null);
  const [running,  setRunning]  = useState(false);
  const [tally,    setTally]    = useState({ toA1: 0, toA2: 0, toNone: 0, stillUnknown: 0, processed: 0, total: 0 });
  const [current,  setCurrent]  = useState('');
  const [progress, setProgress] = useState(0);
  const [done,     setDone]     = useState(null);
  const [err,      setErr]      = useState('');
  const esRef = useRef(null);

  const loadStats = useCallback(() => {
    apiFetch('/api/accounts/promotion-stats').then(r => r.json()).then(setStats).catch(() => {});
  }, [apiFetch]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => () => esRef.current?.close(), []);

  function start() {
    const n = stats?.resolvable || 0;
    if (running || !n) return;
    if (!confirm(
      `Analyse ${n} unbadged Track A accounts (unknown + not-paid)?\n\n` +
      `This reads each account's recent posts and promotes the real paid promoters ` +
      `into A1 / A2. It uses up to ~${n} API calls at the safe anti-bot rate, so it ` +
      `can take a while. You can leave this page — progress is saved as it goes.`
    )) return;

    const token = localStorage.getItem('kiteai_token');
    if (!token) { setErr('Not authenticated — please log in again.'); return; }

    setRunning(true); setDone(null); setErr('');
    setTally({ toA1: 0, toA2: 0, toNone: 0, stillUnknown: 0, processed: 0, total: n });
    setProgress(0); setCurrent('Starting…');

    const es = new EventSource(`${API}/api/resolve-unknowns?scope=all&_token=${encodeURIComponent(token)}`);
    esRef.current = es;
    let completed = false;

    es.addEventListener('start',  e => { try { const d = JSON.parse(e.data); setTally(t => ({ ...t, total: d.total })); } catch {} });
    es.addEventListener('status', e => { try { const d = JSON.parse(e.data); if (d.message) setCurrent(d.message); if (d.progress != null) setProgress(d.progress); } catch {} });
    es.addEventListener('account', e => { try { const d = JSON.parse(e.data); if (d.tally) setTally(d.tally); } catch {} });
    es.addEventListener('quota_exhausted', e => { try { const d = JSON.parse(e.data); setErr(d.message); } catch {} });
    es.addEventListener('complete', e => {
      try { const d = JSON.parse(e.data); setDone(d); } catch {}
      completed = true; setRunning(false); setProgress(100);
      esRef.current = null; es.close();
      loadStats(); onDone?.();
    });
    es.onerror = () => {
      if (completed) { es.close(); return; }
      if (esRef.current === es) { setErr('Connection lost — backend stopped responding.'); setRunning(false); esRef.current = null; }
      es.close();
    };
  }

  function stop() { esRef.current?.close(); esRef.current = null; setRunning(false); setCurrent('Stopped'); }

  if (!stats) return null;
  const resolvable = stats.resolvable || 0;
  const tile = (label, value, color) => (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{label}</div>
    </div>
  );

  return (
    <div className="dash-card" style={{ marginBottom: 16, borderColor: 'rgba(192,132,252,.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>✦ Resolve Unbadged Accounts</h3>
          <p className="page-sub" style={{ margin: '4px 0 0' }}>
            Re-read recent posts of the <strong style={{ color: '#C084FC' }}>{resolvable}</strong> unbadged Track A accounts
            ({stats.unknown} unknown + {stats.none} not-paid) and promote real promoters into A1/A2.
            Current: <span style={{ color: '#00C896' }}>A1 {stats.a1}</span> · <span style={{ color: '#F9A825' }}>A2 {stats.a2}</span>.
          </p>
        </div>
        {!running
          ? <button className="btn-primary" disabled={!resolvable} onClick={start}
              style={{ background: '#C084FC' }}>
              {resolvable ? `Resolve ${resolvable} accounts` : 'Nothing to resolve 🎉'}
            </button>
          : <button className="btn-ghost" onClick={stop}>■ Stop</button>}
      </div>

      {(running || done) && (
        <div style={{ marginTop: 14 }}>
          <div className="progress-bar-wrap" style={{ height: 6 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#C084FC', borderRadius: 3, transition: 'width .3s' }} />
          </div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            {tile('→ A1', tally.toA1, '#00C896')}
            {tile('→ A2', tally.toA2, '#F9A825')}
            {tile('→ Not paid', tally.toNone, '#888')}
            {tile('Still unknown', tally.stillUnknown, '#666')}
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
            {tile('Processed', `${tally.processed}/${tally.total}`, 'var(--blue)')}
          </div>
          {running && <div className="page-sub" style={{ marginTop: 8 }}>⏳ {current}</div>}
          {done && !err && (
            <div className="dash-new-banner" style={{ margin: '12px 0 0' }}>
              ✅ Done — promoted <strong>{done.toA1} → A1</strong>, <strong>{done.toA2} → A2</strong>,
              {' '}{done.toNone} marked not-paid, {done.stillUnknown} still unknown (of {done.processed} analysed).
            </div>
          )}
        </div>
      )}
      {err && <div className="conn-error" style={{ marginTop: 12, marginBottom: 0 }}>⛔ {err}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountsPage({ mode }) {
  const { apiFetch } = useAuth();
  const [accounts,   setAccounts]  = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState('');
  const [search,     setSearch]    = useState('');
  const [scoreTier,  setScoreTier] = useState('all');
  const [reachTier,  setReachTier] = useState('');
  const [typeFilter, setTypeFilter]= useState('');
  const [dmFilter,    setDmFilter]    = useState(false);
  const [emailFilter, setEmailFilter] = useState(false);
  const [promoFilter, setPromoFilter] = useState(''); // '' | 'explicit' | 'inferred' | 'none' | 'unknown'
  const [sortBy,      setSortBy]      = useState('score');
  const [cleaning,    setCleaning]    = useState(false);

  const endpoint = mode === 'all'
    ? '/api/accounts?limit=1000'
    : mode === 'influencers'
    ? '/api/accounts/influencers'
    : '/api/accounts/pr-pages';

  const title = mode === 'all'
    ? 'All Accounts'
    : mode === 'influencers'
    ? 'Track A — Collab Pipeline'
    : 'Track B — Ads Audience';

  useEffect(() => {
    setLoading(true);
    setSearch(''); setScoreTier('all'); setReachTier('');
    setTypeFilter(''); setDmFilter(false); setEmailFilter(false);
    apiFetch(endpoint)
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts || []); setLoading(false); })
      .catch(err => {
        setError(err.message === 'Failed to fetch'
          ? 'Cannot reach backend — is the server running?'
          : err.message);
        setLoading(false);
      });
  }, [mode]);

  const tierCounts = useMemo(() => {
    const out = { all: accounts.length };
    SCORE_TIERS.filter(t => t.key !== 'all').forEach(t => {
      out[t.key] = accounts.filter(a => a.overall >= t.min && a.overall <= t.max).length;
    });
    return out;
  }, [accounts]);

  const types = useMemo(() => [...new Set(accounts.map(a => a.account_type).filter(Boolean))], [accounts]);

  const filtered = useMemo(() => {
    const st = SCORE_TIERS.find(t => t.key === scoreTier) || SCORE_TIERS[0];
    const q  = search.toLowerCase();
    let out = accounts.filter(a => {
      if (q && !(a.name?.toLowerCase().includes(q)||a.handle?.toLowerCase().includes(q)||a.bio?.toLowerCase().includes(q))) return false;
      if (st.key !== 'all' && (a.overall < st.min || a.overall > st.max)) return false;
      if (reachTier  && a.tier !== reachTier)         return false;
      if (typeFilter && a.account_type !== typeFilter) return false;
      if (dmFilter    && !a.dm_open)                          return false;
      if (emailFilter && !a.has_email)                        return false;
      // treat null/undefined as 'unknown' for filter matching
      const pt = a.promotion_type || 'unknown';
      if (promoFilter && pt !== promoFilter) return false;
      return true;
    });
    // Sort: explicit promoters first, then inferred, then others — within each group by score
    if (sortBy === 'score') {
      const promoOrder = { explicit: 0, inferred: 1, none: 2, unknown: 3 };
      out = [...out].sort((a, b) => {
        const pa = promoOrder[a.promotion_type || 'unknown'] ?? 3;
        const pb = promoOrder[b.promotion_type || 'unknown'] ?? 3;
        if (pa !== pb) return pa - pb;
        return (b.overall || 0) - (a.overall || 0);
      });
    }
    if (sortBy === 'followers') out = [...out].sort((a,b)=>(b.followers||0)-(a.followers||0));
    if (sortBy === 'name')      out = [...out].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    return out;
  }, [accounts, search, scoreTier, reachTier, typeFilter, dmFilter, emailFilter, promoFilter, sortBy]);

  const dmCount       = accounts.filter(a => a.dm_open).length;
  const emailCount    = accounts.filter(a => a.has_email).length;
  const confirmedPaid = accounts.filter(a => a.promotion_type === 'explicit').length;
  const likelyPaid    = accounts.filter(a => a.promotion_type === 'inferred').length;

  const reloadAccounts = useCallback(() => {
    apiFetch(endpoint).then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {});
  }, [apiFetch, endpoint]);

  async function runCleanup() {
    if (!confirm('Delete all accounts with overall < 20 AND AI relevance < 15 (non-relevant accounts)?')) return;
    setCleaning(true);
    try {
      const r = await apiFetch('/api/accounts/cleanup', { method: 'DELETE' });
      const d = await r.json();
      alert(`Deleted ${d.deleted} non-relevant accounts. ${d.remaining} remaining.`);
      // Reload
      const fresh = await apiFetch(endpoint).then(x => x.json());
      setAccounts(fresh.accounts || []);
    } catch (err) { alert('Cleanup failed: ' + err.message); }
    setCleaning(false);
  }

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error)   return <div className="page" style={{padding:32}}><div className="page-error">{error}</div><button className="btn-primary" style={{marginTop:16}} onClick={()=>{ setLoading(true); setError(''); apiFetch(endpoint).then(r=>r.json()).then(d=>{setAccounts(d.accounts||[]);setLoading(false);}).catch(e=>{setError(e.message);setLoading(false);}); }}>Retry</button></div>;

  return (
    <div className="page accounts-page">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="page-sub">
            {filtered.length} of {accounts.length} accounts
            {mode === 'influencers' && confirmedPaid > 0 && (
              <> · <span style={{color:'#00C896'}}>💰 {confirmedPaid} confirmed paid</span>
                 · <span style={{color:'#F9A825'}}>~ {likelyPaid} likely paid</span></>
            )}
          </p>
        </div>
        <button className="btn-ghost" onClick={runCleanup} disabled={cleaning}
          title="Delete accounts with overall &lt; 20 AND AI relevance &lt; 15">
          {cleaning ? '🗑 Cleaning…' : '🗑 Clean Non-Relevant'}
        </button>
      </div>

      {mode === 'influencers' && <ResolveUnknownsPanel onDone={reloadAccounts} />}

      {accounts.length > 0 && <StatsBar accounts={accounts} />}


      {/* Score tier tabs */}
      <div className="score-tier-tabs">
        {SCORE_TIERS.map(t => (
          <button key={t.key}
            className={`score-tier-tab${scoreTier===t.key?' active':''}`}
            style={scoreTier===t.key?{borderColor:t.color,color:t.color}:{}}
            onClick={() => setScoreTier(t.key)}>
            {t.label}
            <span className="tier-tab-count" style={scoreTier===t.key?{background:t.color}:{}}>
              {tierCounts[t.key]??0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-panel">
        {/* Promotion filter — A1 Confirmed / A2 Likely only (no Not Paid / Unknown) */}
        {mode === 'influencers' && (confirmedPaid > 0 || likelyPaid > 0) && (
          <div className="filter-row">
            <span className="filter-group-label">Paid Status</span>
            <div className="filter-chips">
              <button className={`filter-chip${!promoFilter?' active':''}`} onClick={() => setPromoFilter('')}>
                All <span className="chip-count">{accounts.length}</span>
              </button>
              <button className={`filter-chip${promoFilter==='explicit'?' active':''}`}
                style={promoFilter==='explicit'?{borderColor:'#00C896',color:'#00C896',background:'rgba(0,200,150,.08)'}:{}}
                onClick={() => setPromoFilter(p => p==='explicit'?'':'explicit')}>
                💰 A1 — Confirmed Paid <span className="chip-count" style={{background: promoFilter==='explicit'?'#00C896':''}}>{confirmedPaid}</span>
              </button>
              <button className={`filter-chip${promoFilter==='inferred'?' active':''}`}
                style={promoFilter==='inferred'?{borderColor:'#F9A825',color:'#F9A825',background:'rgba(249,168,37,.08)'}:{}}
                onClick={() => setPromoFilter(p => p==='inferred'?'':'inferred')}>
                ~ A2 — Likely Paid <span className="chip-count" style={{background: promoFilter==='inferred'?'#F9A825':''}}>{likelyPaid}</span>
              </button>
            </div>
          </div>
        )}

        {/* Contact quick filters */}
        <div className="filter-row">
          <span className="filter-group-label">Contact</span>
          <div className="filter-chips">
            <button
              className={`filter-chip contact-chip${dmFilter?' active-dm':''}`}
              onClick={() => setDmFilter(f => !f)}>
              💬 DM Open <span className="chip-count">{dmCount}</span>
            </button>
            <button
              className={`filter-chip contact-chip${emailFilter?' active-email':''}`}
              onClick={() => setEmailFilter(f => !f)}>
              ✉ Has Email <span className="chip-count">{emailCount}</span>
            </button>
          </div>
        </div>

        {/* Reach */}
        <div className="filter-row">
          <span className="filter-group-label">Reach</span>
          <div className="filter-chips">
            <button className={`filter-chip${!reachTier?' active':''}`} onClick={() => setReachTier('')}>All</button>
            {REACH_TIERS.map(rt => (
              <button key={rt} className={`filter-chip${reachTier===rt?' active':''}`}
                onClick={() => setReachTier(reachTier===rt?'':rt)}>
                {rt} <span className="chip-count">{accounts.filter(a=>a.tier===rt).length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Type */}
        {types.length > 1 && (
          <div className="filter-row">
            <span className="filter-group-label">Type</span>
            <div className="filter-chips">
              <button className={`filter-chip${!typeFilter?' active':''}`} onClick={() => setTypeFilter('')}>All</button>
              {types.map(t => (
                <button key={t} className={`filter-chip${typeFilter===t?' active':''}`}
                  onClick={() => setTypeFilter(typeFilter===t?'':t)}>
                  {t} <span className="chip-count">{accounts.filter(a=>a.account_type===t).length}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search + sort */}
        <div className="filter-row">
          <input className="filter-input" placeholder="Search name, handle, bio, email…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="sort-row">
            <span className="filter-group-label">Sort</span>
            {SORT_OPTIONS.map(s => (
              <button key={s.value} className={`sort-btn${sortBy===s.value?' active':''}`}
                onClick={() => setSortBy(s.value)}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          {accounts.length === 0
            ? 'No data yet — run the agent to discover accounts'
            : 'No accounts match your filters'}
        </div>
      ) : (
        <div className="accounts-list-full">
          <div className="arf-hint">Click any row to expand contact details</div>
          {filtered.map((a, i) => (
            <AccountRow key={a.id ?? a.handle} account={a} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

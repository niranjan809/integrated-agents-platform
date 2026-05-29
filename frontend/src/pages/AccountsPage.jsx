import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

// ── Score tier definitions ────────────────────────────────────────────────────
const SCORE_TIERS = [
  { key: 'all',     label: 'All',       color: '#7DA4BE', min: 0,   max: 100 },
  { key: 'top',     label: 'Tier 1',    color: '#00C896', min: 65,  max: 100 },
  { key: 'mid',     label: 'Tier 2',    color: '#F9A825', min: 45,  max: 64  },
  { key: 'archive', label: 'Archive',   color: '#888',    min: 0,   max: 44  },
];

const REACH_TIERS = ['Macro', 'Mid-Tier', 'Micro', 'Nano', 'Below bar'];

const SORT_OPTIONS = [
  { value: 'score',     label: 'Score ↓' },
  { value: 'followers', label: 'Followers ↓' },
  { value: 'name',      label: 'Name A–Z' },
];

function scoreColor(s) {
  return s >= 65 ? '#00C896' : s >= 45 ? '#F9A825' : '#888';
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ accounts }) {
  const total   = accounts.length;
  const avgScore = total ? Math.round(accounts.reduce((s, a) => s + (a.overall || 0), 0) / total) : 0;
  const dmOpen   = accounts.filter(a => a.dm_open).length;
  const hasEmail = accounts.filter(a => a.has_email).length;
  const verified = accounts.filter(a => a.verified).length;

  const byCat = SCORE_TIERS.filter(t => t.key !== 'all').map(t => ({
    ...t,
    count: accounts.filter(a => a.overall >= t.min && a.overall <= t.max).length,
  }));

  return (
    <div className="stats-bar">
      <div className="stats-bar-cats">
        {byCat.map(t => (
          <div key={t.key} className="stats-cat">
            <span className="stats-cat-count" style={{ color: t.color }}>{t.count}</span>
            <span className="stats-cat-label">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="stats-bar-divider" />
      <div className="stats-bar-meta">
        <span>Avg score <strong style={{ color: scoreColor(avgScore) }}>{avgScore}</strong></span>
        <span>DM open <strong className="green">{dmOpen}</strong></span>
        <span>Has email <strong className="blue">{hasEmail}</strong></span>
        <span>Verified <strong className="gold">{verified}</strong></span>
      </div>
    </div>
  );
}

// ── Account row ───────────────────────────────────────────────────────────────
function AccountRow({ account, rank }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`account-row-full${expanded ? ' expanded' : ''}`}
      onClick={() => setExpanded(e => !e)}>
      <div className="arf-rank">#{rank}</div>
      <img src={account.avatar} alt="" className="arf-avatar"
        onError={e => { e.target.style.display = 'none'; }} />

      <div className="arf-identity">
        <div className="arf-name">
          {account.name}
          {account.verified && <span className="verified-badge"> ✓</span>}
        </div>
        <div className="arf-handle">@{account.handle}</div>
        {expanded && account.bio && (
          <div className="arf-bio">{account.bio}</div>
        )}
        {expanded && account.ai_reason && (
          <div className="arf-ai-reason">🤖 {account.ai_reason}</div>
        )}
      </div>

      <div className="arf-reach">
        <div className="arf-reach-tier">{account.tier}</div>
        <div className="arf-followers">{(account.followers || 0).toLocaleString()}</div>
      </div>

      <div className="arf-type">
        <span className={`type-badge type-${(account.account_type || '').replace(/\s+/g, '-').toLowerCase()}`}>
          {account.account_type}
        </span>
        <span className={`track-badge track-${account.track}`}>Track {account.track}</span>
      </div>

      {/* D-score mini bars */}
      <div className="arf-dims">
        {[['D2', account.d2], ['D3', account.d3], ['D4', account.d4], ['D5', account.d5]].map(([k, v]) => (
          <div key={k} className="arf-dim">
            <div className="arf-dim-label">{k}</div>
            <div className="arf-dim-bar">
              <div style={{ width: `${v}%`, background: scoreColor(v), height: '100%', borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </div>

      <div className="arf-score" style={{ color: scoreColor(account.overall) }}>
        {account.overall}
      </div>

      <div className="arf-tags">
        {account.dm_open   && <span className="badge green">DM</span>}
        {account.has_email && <span className="badge blue">✉</span>}
        {account.website   && <a href={account.website} target="_blank" rel="noreferrer"
            className="badge link" onClick={e => e.stopPropagation()}>↗</a>}
        {account.ai_model  && <span className="badge purple" title={account.ai_model}>AI</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AccountsPage({ mode }) {
  const { apiFetch } = useAuth();
  const [accounts,   setAccounts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [scoreTier,  setScoreTier]  = useState('all');
  const [reachTier,  setReachTier]  = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy,     setSortBy]     = useState('score');

  const endpoint = mode === 'influencers' ? '/api/accounts/influencers' : '/api/accounts/pr-pages';
  const title    = mode === 'influencers' ? 'Influencers'              : 'PR Pages';

  useEffect(() => {
    setLoading(true);
    setSearch(''); setScoreTier('all'); setReachTier(''); setTypeFilter('');
    apiFetch(endpoint)
      .then(r => r.json())
      .then(d => { setAccounts(d.accounts || []); setLoading(false); })
      .catch(err => {
        const msg = err.message === 'Failed to fetch'
          ? 'Cannot reach backend — is the server running on port 3001?'
          : err.message;
        setError(msg);
        setLoading(false);
      });
  }, [mode]);

  // Count per score-tier for tab badges
  const tierCounts = useMemo(() => {
    const out = { all: accounts.length };
    SCORE_TIERS.filter(t => t.key !== 'all').forEach(t => {
      out[t.key] = accounts.filter(a => a.overall >= t.min && a.overall <= t.max).length;
    });
    return out;
  }, [accounts]);

  // Unique types present in the data
  const types = useMemo(() => [...new Set(accounts.map(a => a.account_type).filter(Boolean))], [accounts]);

  // Apply all filters + sort
  const filtered = useMemo(() => {
    const st  = SCORE_TIERS.find(t => t.key === scoreTier) || SCORE_TIERS[0];
    const q   = search.toLowerCase();

    let out = accounts.filter(a => {
      if (q && !(a.name?.toLowerCase().includes(q) || a.handle?.toLowerCase().includes(q) || a.bio?.toLowerCase().includes(q))) return false;
      if (st.key !== 'all' && (a.overall < st.min || a.overall > st.max)) return false;
      if (reachTier  && a.tier !== reachTier)          return false;
      if (typeFilter && a.account_type !== typeFilter)  return false;
      return true;
    });

    if (sortBy === 'score')     out = [...out].sort((a, b) => (b.overall || 0) - (a.overall || 0));
    if (sortBy === 'followers') out = [...out].sort((a, b) => (b.followers || 0) - (a.followers || 0));
    if (sortBy === 'name')      out = [...out].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return out;
  }, [accounts, search, scoreTier, reachTier, typeFilter, sortBy]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (error)   return (
    <div className="page" style={{ padding: 32 }}>
      <div className="page-error">{error}</div>
    </div>
  );

  return (
    <div className="page accounts-page">
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="page-sub">{filtered.length} of {accounts.length} accounts</p>
        </div>
      </div>

      {accounts.length > 0 && <StatsBar accounts={accounts} />}

      {/* ── Score tier tabs ── */}
      <div className="score-tier-tabs">
        {SCORE_TIERS.map(t => (
          <button
            key={t.key}
            className={`score-tier-tab${scoreTier === t.key ? ' active' : ''}`}
            style={scoreTier === t.key ? { borderColor: t.color, color: t.color } : {}}
            onClick={() => setScoreTier(t.key)}
          >
            {t.label}
            <span className="tier-tab-count"
              style={scoreTier === t.key ? { background: t.color } : {}}>
              {tierCounts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Secondary filters ── */}
      <div className="filter-panel">
        <div className="filter-row">
          <span className="filter-group-label">Reach</span>
          <div className="filter-chips">
            <button className={`filter-chip${!reachTier ? ' active' : ''}`}
              onClick={() => setReachTier('')}>All</button>
            {REACH_TIERS.map(rt => (
              <button key={rt}
                className={`filter-chip${reachTier === rt ? ' active' : ''}`}
                onClick={() => setReachTier(reachTier === rt ? '' : rt)}>
                {rt}
                <span className="chip-count">
                  {accounts.filter(a => a.tier === rt).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {types.length > 1 && (
          <div className="filter-row">
            <span className="filter-group-label">Type</span>
            <div className="filter-chips">
              <button className={`filter-chip${!typeFilter ? ' active' : ''}`}
                onClick={() => setTypeFilter('')}>All</button>
              {types.map(t => (
                <button key={t}
                  className={`filter-chip${typeFilter === t ? ' active' : ''}`}
                  onClick={() => setTypeFilter(typeFilter === t ? '' : t)}>
                  {t}
                  <span className="chip-count">
                    {accounts.filter(a => a.account_type === t).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="filter-row">
          <input className="filter-input" placeholder="Search name, handle, bio…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="sort-row">
            <span className="filter-group-label">Sort</span>
            {SORT_OPTIONS.map(s => (
              <button key={s.value}
                className={`sort-btn${sortBy === s.value ? ' active' : ''}`}
                onClick={() => setSortBy(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          {accounts.length === 0
            ? 'No data yet — run the agent to start discovering accounts'
            : 'No accounts match your filters'}
        </div>
      ) : (
        <div className="accounts-list-full">
          {filtered.map((a, i) => (
            <AccountRow key={a.id ?? a.handle} account={a} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

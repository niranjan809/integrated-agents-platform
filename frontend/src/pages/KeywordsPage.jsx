import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

const CLASS_COLORS = {
  A: '#58A6FF', B: '#58A6FF', C: '#3FB950', D: '#F9A825',
  E: '#F9A825', F: '#FB923C', G: '#888', H: '#F472B6',
  K: '#60A5FA',
};

// ── Own keyword chip ──────────────────────────────────────────────────────────
function OwnChip({ kw, onToggle, onDelete }) {
  return (
    <div className={`kw-chip${kw.active ? ' active' : ' inactive'}`}>
      <span className="kw-text">{kw.keyword}</span>
      <button className="kw-toggle" onClick={() => onToggle(kw.id, kw.active)}
        title={kw.active ? 'Deactivate' : 'Activate'}>
        {kw.active ? '●' : '○'}
      </button>
      <button className="kw-delete" onClick={() => onDelete(kw.id)} title="Delete">✕</button>
    </div>
  );
}

// ── Friend keyword chip (read-only) ───────────────────────────────────────────
function FriendChip({ kw }) {
  const used = kw.search_query && kw.search_query !== kw.keyword;
  return (
    <div className={`kw-chip friend-chip${kw.enabled ? ' active' : ' inactive'}`}
      title={used ? `Search query: "${kw.search_query}"` : ''}>
      <span className="kw-text">{kw.keyword}</span>
      {used && <span className="kw-sq" title={`Uses: "${kw.search_query}"`}>↗</span>}
    </div>
  );
}

export default function KeywordsPage() {
  const { apiFetch } = useAuth();

  // Own keywords state
  const [ownKw,    setOwnKw]    = useState([]);
  const [ownLoad,  setOwnLoad]  = useState(true);

  // Friend keywords state
  const [friendData, setFriendData] = useState(null);
  const [friendLoad, setFriendLoad] = useState(true);

  // Add form
  const [newKw,  setNewKw]  = useState('');
  const [newCat, setNewCat] = useState('general');
  const [newCls, setNewCls] = useState('K');
  const [adding, setAdding] = useState(false);

  // Filters
  const [search,      setSearch]      = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [activeTab,   setActiveTab]   = useState('own'); // 'own' | 'friend' | 'influencers'
  const [error,       setError]       = useState('');

  function loadOwn() {
    apiFetch('/api/keywords')
      .then(r => r.json())
      .then(d => { setOwnKw(d.keywords || []); setOwnLoad(false); })
      .catch(err => { setError(err.message || 'Failed to load keywords'); setOwnLoad(false); });
  }

  function loadFriend() {
    apiFetch('/api/keywords/friend')
      .then(r => r.json())
      .then(d => { setFriendData(d); setFriendLoad(false); })
      .catch(() => setFriendLoad(false)); // friend DB errors are non-blocking
  }

  useEffect(() => { loadOwn(); loadFriend(); }, []);

  async function addKeyword(e) {
    e.preventDefault();
    if (!newKw.trim()) return;
    setAdding(true);
    try {
      const r = await apiFetch('/api/keywords', {
        method: 'POST',
        body: JSON.stringify({ keyword: newKw.trim(), category: newCat, class: newCls }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setOwnKw(prev => [...prev, d.keyword]);
      setNewKw('');
    } catch (err) { setError(err.message); }
    finally { setAdding(false); }
  }

  async function toggleKw(id, currentActive) {
    try {
      await apiFetch(`/api/keywords/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !currentActive }) });
      setOwnKw(prev => prev.map(k => k.id === id ? { ...k, active: currentActive ? 0 : 1 } : k));
    } catch (err) { setError(err.message || 'Failed to update keyword'); }
  }

  async function deleteKw(id) {
    if (!confirm('Delete this keyword?')) return;
    try {
      await apiFetch(`/api/keywords/${id}`, { method: 'DELETE' });
      setOwnKw(prev => prev.filter(k => k.id !== id));
    } catch (err) { setError(err.message || 'Failed to delete keyword'); }
  }

  // Build class list from whichever tab is active
  const ownClasses = [...new Set(ownKw.map(k => k.class).filter(Boolean))].sort();
  const friendClasses = friendData?.classes || [];
  const allClasses = activeTab === 'own' ? ownClasses : friendClasses.map(c => c.class_key);

  // Filtered own keywords
  const filteredOwn = useMemo(() => {
    const q = search.toLowerCase();
    return ownKw.filter(k =>
      (!q || k.keyword.toLowerCase().includes(q)) &&
      (!classFilter || k.class === classFilter)
    );
  }, [ownKw, search, classFilter]);

  // Filtered friend keywords
  const filteredFriend = useMemo(() => {
    if (!friendData?.keywords) return [];
    const q = search.toLowerCase();
    return friendData.keywords.filter(k =>
      (!q || k.keyword?.toLowerCase().includes(q) || k.search_query?.toLowerCase().includes(q)) &&
      (!classFilter || k.class_key === classFilter)
    );
  }, [friendData, search, classFilter]);

  // Filtered influencers
  const filteredInfluencers = useMemo(() => {
    if (!friendData?.influencers) return [];
    const q = search.toLowerCase();
    return friendData.influencers.filter(i =>
      !q || i.handle?.toLowerCase().includes(q) || i.display_name?.toLowerCase().includes(q)
    );
  }, [friendData, search]);

  const ownActive = ownKw.filter(k => k.active).length;

  return (
    <div className="page keywords-page">
      <div className="page-header">
        <div>
          <h1>Keywords</h1>
          <p className="page-sub">
            Own: <strong>{ownActive}/{ownKw.length}</strong> active ·
            Friend's DB: <strong>{friendData?.totals?.active ?? '…'}/{friendData?.totals?.keywords ?? '…'}</strong> keywords ·{' '}
            <strong>{friendData?.totals?.influencers ?? '…'}</strong> influencer handles
          </p>
        </div>
      </div>

      {error && <div className="page-error">{error}</div>}

      {/* ── Tabs ── */}
      <div className="kw-tabs">
        <button className={`kw-tab${activeTab === 'own' ? ' active' : ''}`}
          onClick={() => { setActiveTab('own'); setClassFilter(''); }}>
          Own Keywords
          <span className="kw-tab-count">{ownKw.length}</span>
        </button>
        <button className={`kw-tab${activeTab === 'friend' ? ' active' : ''}`}
          onClick={() => { setActiveTab('friend'); setClassFilter(''); }}>
          Friend's Keywords
          <span className="kw-tab-count">{friendData?.totals?.keywords ?? '…'}</span>
        </button>
        <button className={`kw-tab${activeTab === 'influencers' ? ' active' : ''}`}
          onClick={() => { setActiveTab('influencers'); setClassFilter(''); }}>
          Known Influencers
          <span className="kw-tab-count">{friendData?.totals?.influencers ?? '…'}</span>
        </button>
      </div>

      {/* ── Add form (own tab only) ── */}
      {activeTab === 'own' && (
        <form className="add-keyword-form" onSubmit={addKeyword}>
          <input className="kw-input" placeholder="Add keyword…" value={newKw}
            onChange={e => setNewKw(e.target.value)} required />
          <input className="kw-input small" placeholder="Category" value={newCat}
            onChange={e => setNewCat(e.target.value)} />
          <select className="filter-select" value={newCls} onChange={e => setNewCls(e.target.value)}>
            {['A','B','C','D','E','F','G','H','K'].map(c => (
              <option key={c} value={c}>Class {c}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary" disabled={adding}>
            {adding ? 'Adding…' : '+ Add'}
          </button>
        </form>
      )}

      {/* ── Search + class filter ── */}
      <div className="filters-row" style={{ marginBottom: 20 }}>
        <input className="filter-input"
          placeholder={activeTab === 'influencers' ? 'Search handle or name…' : 'Search keywords…'}
          value={search} onChange={e => setSearch(e.target.value)} />
        {activeTab !== 'influencers' && (
          <select className="filter-select" value={classFilter}
            onChange={e => setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {(activeTab === 'own' ? ownClasses : friendClasses.map(c => c.class_key)).map(c => (
              <option key={c} value={c}>Class {c}</option>
            ))}
          </select>
        )}
      </div>

      {/* ══ OWN KEYWORDS TAB ══ */}
      {activeTab === 'own' && (
        ownLoad ? <div className="page-loader"><div className="spinner" /></div> :
        ownClasses.length === 0 ? <div className="empty-state">No keywords yet — add one above</div> :
        ownClasses
          .filter(cls => !classFilter || cls === classFilter)
          .map(cls => {
            const kws = filteredOwn.filter(k => k.class === cls);
            if (!kws.length) return null;
            const color = CLASS_COLORS[cls] || '#888';
            return (
              <div key={cls} className="kw-group">
                <div className="kw-group-header" style={{ borderColor: color }}>
                  <span className="kw-class-badge" style={{ background: color }}>Class {cls}</span>
                  <span className="kw-class-label">
                    {kws[0]?.category || cls}
                  </span>
                  <span className="kw-class-count">
                    {kws.filter(k => k.active).length}/{kws.length} active
                  </span>
                </div>
                <div className="kw-chips">
                  {kws.map(k => (
                    <OwnChip key={k.id} kw={k} onToggle={toggleKw} onDelete={deleteKw} />
                  ))}
                </div>
              </div>
            );
          })
      )}

      {/* ══ FRIEND'S KEYWORDS TAB ══ */}
      {activeTab === 'friend' && (
        friendLoad ? <div className="page-loader"><div className="spinner" /></div> :
        !friendData?.configured ? (
          <div className="empty-state">Friend's DB not configured — add credentials to backend/.env</div>
        ) : (
          <>
            <div className="friend-db-notice">
              🔒 Read-only — from friend's Turso DB. These are used for X searches but never modified here.
              Keywords with ↗ use a different search query than the keyword text.
            </div>
            {friendClasses
              .filter(cls => !classFilter || cls.class_key === classFilter)
              .map(cls => {
                const kws = filteredFriend.filter(k => k.class_key === cls.class_key);
                const color = CLASS_COLORS[cls.class_key] || cls.color_hex || '#888';
                const activeCount = kws.filter(k => k.enabled).length;
                return (
                  <div key={cls.class_key} className="kw-group">
                    <div className="kw-group-header" style={{ borderColor: color }}>
                      <span className="kw-class-badge" style={{ background: color }}>
                        Class {cls.class_key}
                      </span>
                      <span className="kw-class-label">{cls.name}</span>
                      <span className="kw-class-count friend-count">
                        {activeCount}/{kws.length} active · read-only
                      </span>
                    </div>
                    {cls.description && (
                      <div className="kw-class-desc">{cls.description}</div>
                    )}
                    <div className="kw-chips">
                      {kws.length === 0
                        ? <span className="kw-empty">No keywords match filter</span>
                        : kws.map(k => <FriendChip key={k.id} kw={k} />)
                      }
                    </div>
                  </div>
                );
              })
            }
          </>
        )
      )}

      {/* ══ INFLUENCERS TAB ══ */}
      {activeTab === 'influencers' && (
        friendLoad ? <div className="page-loader"><div className="spinner" /></div> :
        !friendData?.configured ? (
          <div className="empty-state">Friend's DB not configured</div>
        ) : (
          <>
            <div className="friend-db-notice">
              🔒 Read-only — 42 known influencers fetched directly by handle on each agent run.
            </div>
            <div className="influencer-grid">
              {filteredInfluencers.map((inf, i) => (
                <div key={i} className={`inf-card${inf.enabled ? '' : ' disabled'}`}>
                  <div className="inf-handle">@{inf.handle.replace(/^@/, '')}</div>
                  <div className="inf-name">{inf.display_name}</div>
                  <div className="inf-meta">
                    <span className="inf-tier">{inf.follower_tier}</span>
                    <span className={`inf-priority p${inf.priority?.toLowerCase()}`}>
                      {inf.priority}
                    </span>
                  </div>
                  {inf.specialty && <div className="inf-spec">{inf.specialty}</div>}
                </div>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { getClassLabel } from '../../../utils/classLabels';

const PAGE_SIZE = 50;

// Active lexicon classes only — H/I/J are dead and never offered.
const CLASS_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'K', 'NOISE'];

const SORT_OPTIONS = [
  { value: 'priority_then_quality',  label: 'Priority + Quality' },
  { value: 'posted_desc',            label: 'Most recent' },
  { value: 'recent_classifications', label: 'Recently classified' },
];

// priority_flag enum — filtered server-side via repeated ?priority_flag= params.
const PRIORITY_OPTIONS = [
  { value: 'URGENT_VIRAL',            label: 'Viral',      color: '#EF4444' },
  { value: 'URGENT_INFLUENCER_REPLY', label: 'Influencer', color: '#F59E0B' },
  { value: 'STANDARD',                label: 'Standard',   color: '#60A5FA' },
  { value: 'LOW_PRIORITY_CONTENT',    label: 'Low',        color: '#A1A1AA' },
];

function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function tweetUrl(p) {
  return `https://x.com/${p.author_handle}/status/${p.tweet_id}`;
}

// ── Compact list row ──────────────────────────────────────────────────────────
function TweetListRow({ post, selected, onSelect }) {
  const label = getClassLabel(post.classification);
  const preview = (post.content || '').replace(/\s+/g, ' ').trim();
  return (
    <button
      type="button"
      className={`tweet-list-row${selected ? ' selected' : ''}`}
      style={{ borderLeftColor: label.color }}
      onClick={() => onSelect(post)}
    >
      <div className="tweet-list-row-head">
        <span className="tweet-list-author">@{post.author_handle}</span>
        <span className="tweet-list-time">{relativeTime(post.posted_at)}</span>
      </div>
      <div className="tweet-list-preview">{preview.slice(0, 90)}{preview.length > 90 ? '…' : ''}</div>
      <div className="tweet-list-tags">
        <span className="class-badge" style={{ background: label.color }} title={label.short}>
          {post.classification || '—'}
        </span>
        {post.priority_flag && post.priority_flag !== 'STANDARD' && (
          <span className="tweet-list-prio">{post.priority_flag.replace(/_/g, ' ').toLowerCase()}</span>
        )}
      </div>
    </button>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function TweetDetailPanel({ post }) {
  if (!post) {
    return (
      <div className="tweet-detail-panel">
        <div className="tweet-detail-empty">Select a tweet on the left to view details.</div>
      </div>
    );
  }
  const label = getClassLabel(post.classification);
  const meta = [
    { k: 'Class', v: `${post.classification || '—'} · ${label.short}` },
    { k: 'Priority', v: post.priority_flag || '—' },
    { k: 'Quality', v: post.quality_score ?? '—' },
    { k: 'Velocity', v: post.velocity != null ? Number(post.velocity).toFixed(2) : '—' },
    { k: 'Engagement', v: post.engagement ?? 0 },
    { k: 'Builder', v: post.is_builder ? 'yes' : 'no' },
  ];
  return (
    <div className="tweet-detail-panel">
      <div className="tweet-detail-author">
        <span className="tweet-detail-name">{post.author_name || post.author_handle}</span>
        <span className="tweet-detail-handle">@{post.author_handle}</span>
        <span className="tweet-detail-dot">·</span>
        <span className="tweet-detail-time" title={post.posted_at || ''}>{relativeTime(post.posted_at)}</span>
      </div>

      <div className="tweet-content">{post.content}</div>

      <div className="tweet-metadata-row">
        {meta.map(m => (
          <div key={m.k} className="tweet-meta-item">
            <span className="tweet-meta-label">{m.k}</span>
            <span className="tweet-meta-value">{m.v}</span>
          </div>
        ))}
      </div>

      <a className="view-on-x" href={tweetUrl(post)} target="_blank" rel="noreferrer">
        View on X ↗
      </a>
    </div>
  );
}

export default function Tweets() {
  const { apiFetch } = useAuth();
  const [posts, setPosts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedClasses, setSelectedClasses] = useState([]);
  const [selectedPriorities, setSelectedPriorities] = useState([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('priority_then_quality');
  const [offset, setOffset] = useState(0);

  // Debounce the search box; reset to page 1 when the term changes.
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearchTerm(search); setOffset(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    selectedClasses.forEach(c => params.append('class', c));
    selectedPriorities.forEach(p => params.append('priority_flag', p));
    if (searchTerm.trim()) params.set('search', searchTerm.trim());
    params.set('sort_by', sortBy);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    let alive = true;
    apiFetch(`/api/brand-visibility/config/x/posts?${params.toString()}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`posts ${r.status}`)))
      .then(data => {
        if (!alive) return;
        const rows = Array.isArray(data) ? data : [];
        setPosts(rows);
        setSelected(rows[0] || null); // auto-select first; resets on filter/page change
        setLoading(false);
      })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [selectedClasses, selectedPriorities, searchTerm, sortBy, offset]);

  useEffect(() => load(), [load]);

  function toggleClass(c) {
    setOffset(0);
    setSelectedClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  }
  function togglePriority(p) {
    setOffset(0);
    setSelectedPriorities(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Tweets</h1>
        <p className="page-sub">X · Voice AI signal feed</p>
      </div>

      {/* Class filter chips */}
      <div className="filters-row">
        <span className="filter-label">Class</span>
        {CLASS_OPTIONS.map(c => {
          const label = getClassLabel(c);
          const on = selectedClasses.includes(c);
          return (
            <button
              key={c}
              className={`class-chip${on ? ' active' : ''}`}
              onClick={() => toggleClass(c)}
              style={on
                ? { background: label.color, borderColor: label.color, color: '#0b0f14' }
                : { borderColor: label.color, color: label.color }}
              title={label.short}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Priority filter chips */}
      <div className="filters-row">
        <span className="filter-label">Priority</span>
        {PRIORITY_OPTIONS.map(o => {
          const on = selectedPriorities.includes(o.value);
          return (
            <button
              key={o.value}
              className={`class-chip${on ? ' active' : ''}`}
              onClick={() => togglePriority(o.value)}
              style={on
                ? { background: o.color, borderColor: o.color, color: '#0b0f14' }
                : { borderColor: o.color, color: o.color }}
              title={o.value}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {/* Search + sort */}
      <div className="filters-row">
        <input
          className="search-input"
          placeholder="Search tweets or handles…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="filter-select" value={sortBy} onChange={e => { setSortBy(e.target.value); setOffset(0); }}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Two-panel layout */}
      {loading ? (
        <div className="page-loader"><div className="spinner" /></div>
      ) : error ? (
        <div className="page-error">Failed to load: {error}</div>
      ) : posts.length === 0 ? (
        <div className="empty-state">No tweets match current filters.</div>
      ) : (
        <div className="tweets-layout">
          <div className="tweets-list">
            {posts.map(p => (
              <TweetListRow
                key={p.tweet_id}
                post={p}
                selected={selected?.tweet_id === p.tweet_id}
                onSelect={setSelected}
              />
            ))}
          </div>
          <TweetDetailPanel post={selected} />
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && (
        <div className="pagination">
          <button
            className="page-btn"
            disabled={offset === 0}
            onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
          >
            ← Prev
          </button>
          <span className="page-info">
            {posts.length === 0 ? '0 results' : `Showing ${offset + 1}–${offset + posts.length}`}
          </span>
          <button
            className="page-btn"
            disabled={posts.length < PAGE_SIZE}
            onClick={() => setOffset(o => o + PAGE_SIZE)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

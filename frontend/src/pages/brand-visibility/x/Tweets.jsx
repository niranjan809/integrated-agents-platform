import { useCallback, useEffect, useState } from 'react';
import { pythonFetch } from '../../../utils/pythonApi';
import { getClassLabel } from '../../../utils/classLabels';

const PAGE_SIZE = 50;

// Active lexicon classes only — H/I/J are dead and never offered.
const CLASS_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'K', 'NOISE'];

const SORT_OPTIONS = [
  { value: 'priority_then_quality',  label: 'Priority + Quality' },
  { value: 'posted_desc',            label: 'Most recent' },
  { value: 'recent_classifications', label: 'Recently classified' },
];

// priority_flag enum (from assign_priority + classification_rules). Filtered
// server-side via repeated ?priority_flag= params.
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

export default function Tweets() {
  const [posts, setPosts] = useState([]);
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
    pythonFetch(`/api/x/posts?${params.toString()}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`posts ${r.status}`)))
      .then(data => { if (alive) { setPosts(Array.isArray(data) ? data : []); setLoading(false); } })
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

      {/* Class filter chips (multi-select) */}
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

      {/* Priority filter chips (multi-select, server-side) */}
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

      {/* Table */}
      {loading ? (
        <div className="page-loader"><div className="spinner" /></div>
      ) : error ? (
        <div className="page-error">Failed to load: {error}</div>
      ) : posts.length === 0 ? (
        <div className="empty-state">No tweets match current filters.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="bv-table">
            <thead>
              <tr>
                <th>Author</th>
                <th>Class</th>
                <th>Priority</th>
                <th>Quality</th>
                <th>Engagement</th>
                <th>Posted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => {
                const label = getClassLabel(p.classification);
                return (
                  <tr key={p.tweet_id}>
                    <td>@{p.author_handle}</td>
                    <td>
                      <span className="class-badge" style={{ background: label.color }} title={label.short}>
                        {p.classification || '—'}
                      </span>
                    </td>
                    <td>{p.priority_flag || '—'}</td>
                    <td>{p.quality_score ?? '—'}</td>
                    <td>{p.engagement ?? 0}</td>
                    <td title={p.posted_at || ''}>{relativeTime(p.posted_at)}</td>
                    <td>
                      <a
                        href={`https://x.com/${p.author_handle}/status/${p.tweet_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="bv-link"
                      >
                        View ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Read-only view of the friend's KA017 market-intelligence agent (separate Turso DB,
// surfaced via /api/ka/* on our backend).
const TABS = [
  { key: 'promoters', label: 'Useful Promoters' },
  { key: 'signals',   label: 'Signal Feed' },
  { key: 'drafts',    label: 'Post Drafts' },
  { key: 'runs',      label: 'Agent Runs' },
];

function Stat({ label, value, color }) {
  return (
    <div className="stat-card" style={{ borderColor: color }}>
      <div className="stat-value" style={{ color }}>{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const tierColor = t => t === 'high' ? '#00C896' : t === 'medium' ? '#F9A825' : '#888';

export default function MarketIntelPage() {
  const { apiFetch } = useAuth();
  const [ov,       setOv]       = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('promoters');
  const [tabData,  setTabData]  = useState({});
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    apiFetch('/api/ka/overview').then(r => r.json())
      .then(d => { setOv(d); setLoading(false); })
      .catch(() => { setOv({ configured: false, error: 'unreachable' }); setLoading(false); });
  }, []);

  const loadTab = useCallback((key) => {
    if (tabData[key]) return;
    setTabLoading(true);
    apiFetch(`/api/ka/${key}`).then(r => r.json())
      .then(d => setTabData(prev => ({ ...prev, [key]: d })))
      .catch(() => setTabData(prev => ({ ...prev, [key]: { error: 'failed' } })))
      .finally(() => setTabLoading(false));
  }, [apiFetch, tabData]);

  useEffect(() => { if (ov?.configured) loadTab(tab); }, [tab, ov, loadTab]);

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

  // Not connected yet — show setup instructions
  if (!ov?.configured) {
    return (
      <div className="page">
        <div className="page-header"><div><h1>Market Intel <span className="quota-shared">· KA017 (friend's agent)</span></h1>
          <p className="page-sub">Voice-AI builder signals, promoter classification & post drafts.</p></div></div>
        <div className="dash-card" style={{ borderColor: 'rgba(249,168,37,.4)' }}>
          <h3>⚙️ Not connected yet</h3>
          <p className="page-sub" style={{ marginTop: 8 }}>
            This reads your friend's KA017 Turso database (a separate DB). To connect it, add these to the
            <b> backend (Render) environment</b>, then redeploy:
          </p>
          <pre style={{ background: 'var(--bg3)', padding: 12, borderRadius: 6, fontSize: 12 }}>
KA_TURSO_URL   = libsql://&lt;his-db&gt;.turso.io
KA_TURSO_TOKEN = &lt;his read-only auth token&gt;</pre>
          <p className="page-sub">Ask your friend for his <code>TURSO_DATABASE_URL</code> and a <b>read-only</b> auth token.</p>
        </div>
      </div>
    );
  }

  const p = ov.promoters || {};
  const cur = tabData[tab];

  return (
    <div className="page">
      <div className="page-header">
        <div><h1>Market Intel <span className="quota-shared">· KA017 (friend's agent)</span></h1>
          <p className="page-sub">Live read of his voice-AI builder signals & promoter classification.</p></div>
      </div>

      {ov.error ? <div className="conn-error">⚠ {ov.error}</div> : (
        <>
          {/* Overview */}
          <div className="stat-grid">
            <Stat label="Scraped tweets"  value={ov.tweets?.toLocaleString()}     color="#1D9BF0" />
            <Stat label="Classified"      value={ov.classified?.toLocaleString()} color="#00C896" />
            <Stat label="Builders"        value={ov.builders?.toLocaleString()}   color="#C084FC" />
            <Stat label="Useful promoters" value={p.total}                        color="#F9A825" />
          </div>
          <div className="dash-card" style={{ margin: '14px 0' }}>
            <div className="bucket-head">
              <span className="bucket-title">Promoter tiers</span>
              <span className="tc" style={{ color: tierColor('high') }}>high {p.high ?? 0}</span>
              <span className="tc" style={{ color: tierColor('medium') }}>medium {p.medium ?? 0}</span>
              <span className="tc" style={{ color: tierColor('low') }}>low {p.low ?? 0}</span>
              {ov.lastRun && <span className="bucket-desc">last run: {ov.lastRun.status} · {ov.lastRun.records_new ?? 0} new · {ov.lastRun.calls_used ?? 0} calls</span>}
              {ov.llmCost30d != null && <span className="bucket-desc">LLM cost 30d: ${ov.llmCost30d}</span>}
            </div>
          </div>

          {/* Tabs */}
          <div className="score-tier-tabs">
            {TABS.map(t => (
              <button key={t.key} className={`score-tier-tab${tab===t.key?' active':''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>

          {tabLoading && !cur ? <div className="page-loader"><div className="spinner" /></div> :
           cur?.error ? <div className="conn-error">⚠ {cur.error}</div> :
           <div className="dash-card" style={{ overflowX: 'auto' }}>

            {tab === 'promoters' && (
              <table className="ka-table"><thead><tr>
                <th>Handle</th><th>Followers</th><th>Class</th><th>Kind</th><th>Tier</th><th>Reputation</th><th>Promo ratio</th>
              </tr></thead><tbody>
                {(cur?.promoters || []).map((r, i) => (
                  <tr key={i}>
                    <td><a href={`https://x.com/${(r.author_handle||'').replace(/^@/,'')}`} target="_blank" rel="noreferrer">@{(r.author_handle||'').replace(/^@/,'')}</a></td>
                    <td>{(r.author_followers||0).toLocaleString()}</td>
                    <td>{r.matched_class}</td>
                    <td>{r.promotion_kind}</td>
                    <td style={{ color: tierColor(r.tier), fontWeight: 700 }}>{r.tier}</td>
                    <td>{r.reputation_label || '—'}</td>
                    <td>{r.promotional_ratio != null ? Math.round(r.promotional_ratio*100)+'%' : '—'}</td>
                  </tr>
                ))}
                {!(cur?.promoters||[]).length && <tr><td colSpan={7}>No promoters yet.</td></tr>}
              </tbody></table>
            )}

            {tab === 'signals' && (
              <table className="ka-table"><thead><tr>
                <th>Handle</th><th>Class</th><th>Intent</th><th>Score</th><th>Summary</th>
              </tr></thead><tbody>
                {(cur?.signals || []).map((r, i) => (
                  <tr key={i}>
                    <td><a href={`https://x.com/${(r.author_handle||'').replace(/^@/,'')}`} target="_blank" rel="noreferrer">@{(r.author_handle||'').replace(/^@/,'')}</a></td>
                    <td>{r.confirmed_class}</td>
                    <td>{r.intent_signal}</td>
                    <td>{r.relevance_score ?? r.quality_score}</td>
                    <td style={{ maxWidth: 380 }}>{r.summary_one_line || (r.text||'').slice(0,120)}</td>
                  </tr>
                ))}
                {!(cur?.signals||[]).length && <tr><td colSpan={5}>No signals yet.</td></tr>}
              </tbody></table>
            )}

            {tab === 'drafts' && (
              <div>
                {(cur?.drafts || []).map((d, i) => (
                  <div key={i} className="bucket-section b-purple" style={{ marginBottom: 10 }}>
                    <div className="bucket-head">
                      <span className="bucket-title">{d.theme_class}</span>
                      <span className="bucket-count">{d.status}</span>
                      <span className="bucket-desc">{d.tweet_count} tweets · {d.draft_format || ''}</span>
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)' }}>{d.draft_post || d.summary}</div>
                    {d.draft_rationale && <div className="am-reason" style={{ marginTop: 6 }}>{d.draft_rationale}</div>}
                  </div>
                ))}
                {!(cur?.drafts||[]).length && <div className="empty-state">No drafts yet.</div>}
              </div>
            )}

            {tab === 'runs' && (
              <table className="ka-table"><thead><tr>
                <th>Started</th><th>Status</th><th>Trigger</th><th>Calls</th><th>New</th><th>Updated</th>
              </tr></thead><tbody>
                {(cur?.runs || []).map((r, i) => (
                  <tr key={i}>
                    <td>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                    <td>{r.status}</td><td>{r.triggered_by}</td>
                    <td>{r.calls_used ?? 0}</td><td>{r.records_new ?? 0}</td><td>{r.records_updated ?? 0}</td>
                  </tr>
                ))}
                {!(cur?.runs||[]).length && <tr><td colSpan={6}>No runs yet.</td></tr>}
              </tbody></table>
            )}
           </div>}
        </>
      )}
    </div>
  );
}

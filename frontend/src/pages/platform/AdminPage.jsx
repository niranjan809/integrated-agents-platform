import { useEffect, useState, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';

const API  = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TKEY = 'kiteai_admin_token';

// Admin console: sidebar (Overview + the 3 sections and their agents) → main pane
// shows the section's agents or a single agent's detail (status, DB, data counts,
// integrations, and a live "Test connection" probe). No API keys are ever shown.
export default function AdminPage() {
  const [token] = useState(() => sessionStorage.getItem(TKEY));
  const [ov, setOv]   = useState(null);
  const [err, setErr] = useState(null);

  const [view, setView]           = useState('overview'); // 'overview' | 'section' | 'agent'
  const [sectionId, setSectionId] = useState(null);
  const [agentId, setAgentId]     = useState(null);
  const [detail, setDetail]       = useState(null);
  const [testing, setTesting]     = useState(false);
  const [kw, setKw]               = useState(null);   // { own, friend }
  const [kwInput, setKwInput]     = useState('');
  const [kwBusy, setKwBusy]       = useState(false);

  const authHeaders = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...authHeaders, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/admin/overview`, { headers: authHeaders })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status === 401 || r.status === 403 ? 'Session expired — sign in again' : 'Failed to load'))))
      .then(setOv)
      .catch(e => { setErr(e.message); if (/expired/i.test(e.message)) sessionStorage.removeItem(TKEY); });
  }, [token]);

  async function loadKeywords(id) {
    try {
      const res = await fetch(`${API}/api/admin/agents/${id}/keywords`, { headers: authHeaders });
      setKw(await res.json());
    } catch { setKw({ error: 'Failed to load keywords' }); }
  }

  const loadAgent = useCallback(async (id) => {
    setTesting(true); setDetail(null); setKw(null);
    try {
      const res = await fetch(`${API}/api/admin/agents/${id}`, { headers: authHeaders });
      const d = await res.json();
      setDetail(d);
      if (d.agent?.manageKeywords) loadKeywords(id);
    } catch { setDetail({ error: 'Probe failed' }); }
    finally { setTesting(false); }
  }, [token]);

  async function addKeyword(e) {
    e.preventDefault();
    const keyword = kwInput.trim();
    if (!keyword) return;
    setKwBusy(true);
    try {
      await fetch(`${API}/api/admin/agents/${agentId}/keywords`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ keyword }) });
      setKwInput('');
      await loadKeywords(agentId);
    } finally { setKwBusy(false); }
  }
  async function delKeyword(id) {
    await fetch(`${API}/api/admin/agents/${agentId}/keywords/${id}`, { method: 'DELETE', headers: authHeaders });
    await loadKeywords(agentId);
  }
  async function toggleKeyword(id, active) {
    await fetch(`${API}/api/admin/agents/${agentId}/keywords/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ active: !active }) });
    await loadKeywords(agentId);
  }

  function openSection(id) { setSectionId(id); setView('section'); }
  function openAgent(id)   { setAgentId(id); setView('agent'); loadAgent(id); }
  function logout() { sessionStorage.removeItem(TKEY); window.location.assign('/login'); }

  if (!token) return <Navigate to="/login" replace />;

  const agentsIn = (sid) => (ov?.agents || []).filter(a => a.sectionId === sid);
  const statusCls = (s) => (s === 'up' || s === 'live' || s === 'connected') ? 'up'
    : (s === 'down' || s === 'error') ? 'down' : 'soon';

  return (
    <div className="admin-shell">
      {/* ── Sidebar ── */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="logo-kite">Kite</span><span className="logo-ai">AI</span>
          <span className="admin-brand-tag">Admin</span>
        </div>
        <nav className="admin-nav">
          <button className={`admin-nav-item${view === 'overview' ? ' active' : ''}`} onClick={() => setView('overview')}>
            <span className="ni">◫</span> Overview
          </button>
          {(ov?.sections || []).map(s => (
            <div key={s.id} className="admin-nav-group">
              <button className={`admin-nav-section${view === 'section' && sectionId === s.id ? ' active' : ''}`} onClick={() => openSection(s.id)}>
                <span className="ni">{s.icon}</span> {s.name}
                <span className="admin-nav-count">{s.liveCount}/{s.agentCount}</span>
              </button>
              {agentsIn(s.id).map(a => (
                <button key={a.id} className={`admin-nav-agent${view === 'agent' && agentId === a.id ? ' active' : ''}`} onClick={() => openAgent(a.id)}>
                  {a.name}
                  <span className={`admin-dot ${statusCls(a.status)}`} />
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Link to="/" className="back-to-platform" style={{ margin: 0 }}>← Platform</Link>
          <button className="shell-logout" onClick={logout}>Sign out</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="admin-main">
        {err && <div className="embed-msg embed-error">{err}</div>}
        {!ov && !err && <div className="embed-msg">Loading…</div>}

        {ov && view === 'overview' && (
          <>
            <h1 className="admin-title">Overview</h1>
            <div className="admin-stats">
              <div className="admin-stat"><span className="n">{ov.counts.agents}</span><span className="l">Agents</span></div>
              <div className="admin-stat"><span className="n">{ov.counts.live}</span><span className="l">Live</span></div>
              <div className="admin-stat"><span className="n">{ov.counts.servicesUp}/{ov.services.length}</span><span className="l">Services up</span></div>
              <div className="admin-stat"><span className="n">{ov.sections.length}</span><span className="l">Sections</span></div>
            </div>
            <h2 className="admin-h">Service health</h2>
            <div className="admin-cards">
              {ov.services.map(s => (
                <div key={s.name} className="admin-card">
                  <span className={`admin-dot ${statusCls(s.status)}`} />
                  <div className="admin-card-main">
                    <div className="admin-card-name">{s.name}</div>
                    <div className="admin-card-sub mono">{s.url}</div>
                  </div>
                  <span className={`admin-status ${statusCls(s.status)}`}>{s.status}</span>
                </div>
              ))}
            </div>
            <h2 className="admin-h">Integrations in use</h2>
            <div>{ov.integrations.map(i => <span key={i} className="admin-chip">{i}</span>)}</div>
            <p className="admin-note">🔒 API keys are never shown — only which integrations are in use and their status.</p>
          </>
        )}

        {ov && view === 'section' && (
          <>
            <div className="admin-crumb"><button onClick={() => setView('overview')}>Overview</button> / {ov.sections.find(s => s.id === sectionId)?.name}</div>
            <h1 className="admin-title">{ov.sections.find(s => s.id === sectionId)?.name}</h1>
            <p className="admin-sub">{ov.sections.find(s => s.id === sectionId)?.description}</p>
            <div className="admin-agent-grid">
              {agentsIn(sectionId).map(a => (
                <button key={a.id} className="admin-agent-card" onClick={() => openAgent(a.id)}>
                  <div className="admin-agent-top">
                    <span className="admin-agent-name">{a.name}</span>
                    <span className={`admin-status ${statusCls(a.status)}`}>{a.status}</span>
                  </div>
                  <div className="admin-agent-desc">{a.description}</div>
                  <div className="admin-agent-meta">Built by {a.creator}</div>
                  <div>{a.integrations.map(i => <span key={i} className="admin-chip">{i}</span>)}</div>
                </button>
              ))}
              {agentsIn(sectionId).length === 0 && <p className="admin-note">No agents in this section yet.</p>}
            </div>
          </>
        )}

        {ov && view === 'agent' && (
          <>
            {(() => { const a = (ov.agents || []).find(x => x.id === agentId); return (
              <>
                <div className="admin-crumb">
                  <button onClick={() => setView('overview')}>Overview</button> / <button onClick={() => openSection(a?.sectionId)}>{a?.section}</button> / {a?.name}
                </div>
                <div className="admin-detail-head">
                  <h1 className="admin-title" style={{ margin: 0 }}>{a?.name}</h1>
                  <span className={`admin-status ${statusCls(a?.status)}`}>{a?.status}</span>
                  <span className="admin-by">Built by {a?.creator}</span>
                  <button className="admin-btn" onClick={() => loadAgent(agentId)} disabled={testing}>
                    {testing ? 'Testing…' : '↻ Test connection'}
                  </button>
                </div>
                <p className="admin-sub">{a?.description}</p>

                {!detail && <div className="embed-msg">Probing…</div>}
                {detail && !detail.error && (
                  <>
                    <div className="admin-cards">
                      <div className="admin-card">
                        <span className={`admin-dot ${statusCls(detail.health?.status)}`} />
                        <div className="admin-card-main">
                          <div className="admin-card-name">Service health</div>
                          <div className="admin-card-sub mono">{detail.health?.url}</div>
                        </div>
                        <span className={`admin-status ${statusCls(detail.health?.status)}`}>{detail.health?.status}</span>
                      </div>
                      <div className="admin-card">
                        <span className={`admin-dot ${statusCls(detail.db?.status)}`} />
                        <div className="admin-card-main">
                          <div className="admin-card-name">Database</div>
                          <div className="admin-card-sub mono">{detail.db?.engine || '—'}{detail.db?.note ? ` · ${detail.db.note}` : ''}</div>
                        </div>
                        <span className={`admin-status ${statusCls(detail.db?.status)}`}>{detail.db?.status}</span>
                      </div>
                    </div>

                    <h2 className="admin-h">Data ({detail.stats?.length ? 'row counts' : 'no counts available'})</h2>
                    <div className="admin-metrics">
                      {(detail.stats || []).map(s => (
                        <div key={s.label} className="admin-metric">
                          <span className="mv">{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</span>
                          <span className="ml">{s.label}</span>
                        </div>
                      ))}
                    </div>

                    <h2 className="admin-h">Integrations (APIs in use)</h2>
                    <div>{(a?.integrations || []).map(i => <span key={i} className="admin-chip">{i}</span>)}</div>

                    {a?.manageUrl && (
                      <>
                        <h2 className="admin-h">Manage</h2>
                        <iframe title={`${a.name} admin console`} src={a.manageUrl} className="admin-embed-frame" />
                      </>
                    )}

                    {a?.manageKeywords && (
                      <>
                        <h2 className="admin-h">Keywords</h2>
                        {!kw && <div className="embed-msg">Loading keywords…</div>}
                        {kw?.error && <div className="embed-msg embed-error">{kw.error}</div>}
                        {kw && !kw.error && (
                          <>
                            <form className="kw-add" onSubmit={addKeyword}>
                              <input value={kwInput} onChange={e => setKwInput(e.target.value)} placeholder="Add a keyword…" />
                              <button className="admin-btn" style={{ margin: 0 }} disabled={kwBusy || !kwInput.trim()}>{kwBusy ? 'Adding…' : '+ Add'}</button>
                            </form>
                            <div className="kw-list">
                              {(kw.own || []).map(k => (
                                <span key={k.id} className={`kw-chip${k.active ? '' : ' off'}`}>
                                  <button className="kw-toggle" title={k.active ? 'Active — click to disable' : 'Disabled — click to enable'} onClick={() => toggleKeyword(k.id, k.active)}>{k.active ? '●' : '○'}</button>
                                  {k.keyword}
                                  <button className="kw-del" title="Delete" onClick={() => delKeyword(k.id)}>×</button>
                                </span>
                              ))}
                              {(kw.own || []).length === 0 && <span className="admin-note">No keywords yet — add one above.</span>}
                            </div>
                            <p className="admin-note">{(kw.own || []).length} keyword(s) in this agent’s own database · ● active / ○ disabled · × deletes.</p>

                            {kw.friend?.configured && (
                              <>
                                <h2 className="admin-h">Friend lexicon <span className="kw-ro">read-only</span></h2>
                                {kw.friend.available === false ? (
                                  <div className="embed-msg embed-error" style={{ padding: '12px 0' }}>
                                    Unavailable — {kw.friend.error?.includes('BLOCKED') || kw.friend.error?.includes('blocked')
                                      ? 'the partner lexicon DB (Turso) has reads blocked (quota/plan). It was superseded by the Brand Visibility agent’s Postgres DB.'
                                      : kw.friend.error}
                                  </div>
                                ) : (
                                  <>
                                    <p className="admin-note">
                                      {kw.friend.total} keyword(s) from the partner lexicon (external DB). Shown for reference —
                                      edits to a separate production DB aren’t enabled here for safety.
                                    </p>
                                    <div className="kw-list">
                                      {(kw.friend.sample || []).map((k, idx) => <span key={idx} className="kw-chip ro">{k}</span>)}
                                      {kw.friend.total > (kw.friend.sample || []).length &&
                                        <span className="admin-note">+{kw.friend.total - (kw.friend.sample || []).length} more…</span>}
                                    </div>
                                  </>
                                )}
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}

                    <p className="admin-note">
                      Surface: <b>{a?.surface}</b>{a?.embedUrl ? ` · ${a.embedUrl}` : a?.path ? ` · ${a.path}` : ''}.
                      {detail.checkedAt ? ` Last tested ${new Date(detail.checkedAt).toLocaleTimeString()}.` : ''} 🔒 No keys shown.
                    </p>
                  </>
                )}
                {detail?.error && <div className="embed-msg embed-error">{detail.error}</div>}
              </>
            ); })()}
          </>
        )}
      </main>
    </div>
  );
}

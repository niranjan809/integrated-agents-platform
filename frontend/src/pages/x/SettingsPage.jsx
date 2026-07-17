import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const MODEL_LABELS = {
  'google/gemini-2.5-flash':  'Primary — fast, cheap, excellent for classification',
  'anthropic/claude-haiku-4-5': 'Fallback — if Gemini unavailable',
};

const STATUS_LABELS = {
  ready:           { text: '✓ Ready',             color: '#00C896' },
  ok:              { text: '✓ Working',            color: '#00C896' },
  cooldown:        { text: '⏳ Quota cooldown',    color: '#F9A825' },
  quota_exhausted: { text: '⛔ Quota exhausted',  color: '#FF4444' },
  not_subscribed:  { text: '✗ Not subscribed',    color: '#FF4444' },
  invalid_key:     { text: '✗ Invalid key',       color: '#FF4444' },
  invalid:         { text: '✗ Invalid key format', color: '#FF4444' },
  error:           { text: '? Unknown error',      color: '#888' },
};

function FriendDbTestButton({ apiFetch }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    try {
      const r = await apiFetch('/api/pr/settings/test-friend-db');
      const d = await r.json();
      setRes(d);
    } catch (e) { setRes({ ok: false, error: e.message }); }
    setBusy(false);
  }
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <button className="btn-ghost" onClick={test} disabled={busy}>
        {busy ? 'Testing…' : '⚡ Test'}
      </button>
      {res && (
        <span style={{ fontSize:12, color: res.ok ? '#00C896' : '#FF4444' }}>
          {res.ok
            ? `✓ ${res.keywordCount} keywords, ${res.influencerCount} influencers`
            : `✗ ${res.error}`}
        </span>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { apiFetch } = useAuth();
  const [config,      setConfig]      = useState(null);
  const [keyStats,    setKeyStats]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [testing,     setTesting]     = useState(false);
  const [testingKeys, setTestingKeys] = useState(false);
  const [keyTestRes,  setKeyTestRes]  = useState(null);
  const [testResult,  setTestResult]  = useState(null);
  const [autoRun,     setAutoRun]     = useState(true);
  const [loadError,   setLoadError]   = useState('');
  const [msg,         setMsg]         = useState('');
  const [msgType,     setMsgType]     = useState('');

  function flash(text, type = 'success') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  }

  function loadSettings() {
    setLoading(true);
    Promise.all([
      apiFetch('/api/pr/settings').then(r => r.json()),
      apiFetch('/api/pr/settings/keys').then(r => r.json()).catch(() => ({ keys: [] })),
    ]).then(([cfg, ks]) => {
      setConfig(cfg.config);
      setKeyStats(ks.keys || []);
      setAutoRun(cfg.config?.auto_run_enabled === '1');
      setLoading(false);
    }).catch(err => { setLoadError(err.message || 'Failed to load settings'); setLoading(false); });
  }

  useEffect(() => { loadSettings(); }, []);

  async function testKeys() {
    setTestingKeys(true);
    setKeyTestRes(null);
    try {
      const r = await apiFetch('/api/pr/settings/keys/test', { method: 'POST', body: '{}' });
      const d = await r.json();
      setKeyTestRes(d.results || []);
      flash(`Key test complete — check results below`, 'success');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setTestingKeys(false);
      // Refresh key stats after test
      apiFetch('/api/pr/settings/keys').then(r => r.json()).then(d => setKeyStats(d.keys || []));
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiFetch('/api/pr/settings/test-openrouter', { method: 'POST', body: '{}' });
      const d = await r.json();
      setTestResult(d);
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function toggleAutoRun(val) {
    setAutoRun(val);
    try {
      await apiFetch('/api/pr/settings/auto_run_enabled', {
        method: 'PATCH',
        body: JSON.stringify({ value: val ? '1' : '0' }),
      });
      flash(`Weekly auto-run ${val ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  const orKeySet = config?.openrouter_env_set;

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;
  if (loadError) return <div className="page" style={{padding:32}}><div className="page-error">{loadError}</div><button className="btn-primary" style={{marginTop:16}} onClick={loadSettings}>Retry</button></div>;

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">API status, AI model chain, and agent schedule</p>
        </div>
      </div>

      {msg && <div className={`flash-msg flash-${msgType}`}>{msg}</div>}

      {/* ── API Keys Status ──────────────────────────────────────────────────── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2>API Keys</h2>
            <p>All keys are set in <code>backend/.env</code> — never exposed to the browser.</p>
          </div>
          <button className="btn-ghost" onClick={testKeys} disabled={testingKeys}>
            {testingKeys ? '⏳ Testing…' : '⚡ Test All Keys'}
          </button>
        </div>

        {/* RapidAPI keys with live status */}
        <div className="api-keys-grid" style={{ marginBottom: 16 }}>
          {keyStats.map(k => {
            const st = STATUS_LABELS[k.status] || STATUS_LABELS.error;
            return (
              <div key={k.label} className="api-key-row">
                <div className="api-key-info">
                  <span className="api-key-name">RapidAPI {k.label} — twitter241</span>
                  <span className="api-key-desc">
                    {k.requests} requests used · {k.rpm_limit ?? 3} RPM · twitter241.p.rapidapi.com
                    {k.cooldown_sec > 0 && ` · resumes in ${k.cooldown_sec}s`}
                  </span>
                </div>
                <div className="key-status-pill" style={{
                  color: st.color,
                  background: `${st.color}18`,
                  border: `1px solid ${st.color}44`,
                }}>
                  {st.text}
                </div>
              </div>
            );
          })}
        </div>

        {/* Key test results */}
        {keyTestRes && (
          <div className="key-test-results">
            {keyTestRes.map(r => {
              const st = STATUS_LABELS[r.status] || STATUS_LABELS.error;
              return (
                <div key={r.label} className="key-test-row">
                  <strong>{r.label}</strong>
                  <span style={{ color: st.color }}>{st.text}</span>
                  {r.status === 'not_subscribed' && (
                    <span className="key-hint">
                      → Subscribe this key to twitter241 on rapidapi.com
                    </span>
                  )}
                  {r.status === 'quota_exhausted' && (
                    <span className="key-hint">→ Daily quota used up — resets at midnight UTC</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="api-keys-grid">
          <div className="api-key-row">
            <div className="api-key-info">
              <span className="api-key-name">OpenRouter API</span>
              <span className="api-key-desc">AI scoring — Gemini 2.5 Flash (primary), Claude Haiku (fallback), batch 6 accounts/call</span>
            </div>
            <div className={`key-status-pill ${orKeySet ? 'set' : 'unset'}`}>
              {orKeySet ? '✓ Set in .env' : '✗ Not set'}
            </div>
            {orKeySet && (
              <button className="btn-ghost" onClick={testConnection} disabled={testing}>
                {testing ? 'Testing…' : '⚡ Test'}
              </button>
            )}
          </div>

          <div className="api-key-row">
            <div className="api-key-info">
              <span className="api-key-name">Turso Database (own)</span>
              <span className="api-key-desc">Persistent storage — accounts, keywords, runs, users</span>
            </div>
            <div className="key-status-pill set">✓ Connected</div>
          </div>

          <div className="api-key-row">
            <div className="api-key-info">
              <span className="api-key-name">Friend's Turso DB</span>
              <span className="api-key-desc">
                Read-only — 1506 keywords + 42 influencer handles. Never written to.
              </span>
            </div>
            <div className={`key-status-pill ${config?.friend_db_set ? 'set' : 'unset'}`}>
              {config?.friend_db_set ? '✓ Configured' : '✗ Not set'}
            </div>
            {config?.friend_db_set && <FriendDbTestButton apiFetch={apiFetch} />}
          </div>
        </div>

        {/* Quota info */}
        <div className="env-hint" style={{ marginTop: 14 }}>
          <strong>Quota plan:</strong> Paid key — 100,000 req/month shared ·
          Cap per run: <strong>{config?.max_requests_per_run ?? 5000}</strong> requests ·
          4 weekly runs ≈ 20,000/month used (20% of shared quota, leaves room for other users) ·
          Anti-bot: ±3s jitter + human breaks every 20–35 requests + shuffled query order
        </div>

        {!orKeySet && (
          <div className="env-hint" style={{ marginTop: 12 }}>
            <strong>To enable AI scoring:</strong> open <code>backend/.env</code> and set<br />
            <code>OPENROUTER_API_KEY=sk-or-v1-your-key-here</code>
          </div>
        )}

        {testResult && (
          <div className={`test-result ${testResult.ok ? 'success' : 'error'}`} style={{ marginTop: 12 }}>
            {testResult.ok ? `✅ OpenRouter OK — ${testResult.model}` : `❌ ${testResult.error}`}
          </div>
        )}
      </div>

      {/* ── Scoring Model ────────────────────────────────────────────────────── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2>AI Scoring Model Chain</h2>
            <p>
              AI rates <strong>D2 (Collab Intent)</strong> and <strong>D3 (AI Relevance)</strong> per account.
              D4 (Authority) and D5 (Reach) are algorithmic. Models are tried in priority order — auto-falls back if one is unavailable.
            </p>
          </div>
        </div>

        <div className="scoring-formula">
          <div className="formula-row">
            <span className="formula-dim ai">D2 Collab Intent</span>
            <span className="formula-weight">× 25%</span>
            <span className="formula-source ai-badge">AI scored</span>
          </div>
          <div className="formula-row">
            <span className="formula-dim ai">D3 AI Relevance</span>
            <span className="formula-weight">× 25%</span>
            <span className="formula-source ai-badge">AI scored</span>
          </div>
          <div className="formula-row">
            <span className="formula-dim">D4 Authority</span>
            <span className="formula-weight">× 20%</span>
            <span className="formula-source algo-badge">Algorithmic</span>
          </div>
          <div className="formula-row">
            <span className="formula-dim">D5 Reach Quality</span>
            <span className="formula-weight">× 30%</span>
            <span className="formula-source algo-badge">Algorithmic</span>
          </div>
          <div className="formula-total">= Overall Score (0–100)</div>
        </div>

        <div className="model-chain">
          {(config?.model_chain || []).map((m, i) => (
            <div key={m} className="model-row">
              <span className="model-rank">#{i + 1}</span>
              <span className="model-id">{m}</span>
              <span className="model-label">{MODEL_LABELS[m] || ''}</span>
              {i === 0 ? <span className="badge gold">Primary</span>
                       : <span className="badge grey">Fallback</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Agent Schedule ───────────────────────────────────────────────────── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div>
            <h2>Weekly Auto-Run</h2>
            <p>Agent runs automatically every Monday at <strong>02:00 AM IST</strong> (Indian Standard Time). Accounts updated within the last 6 days are skipped to protect shared API quota.</p>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={autoRun} onChange={e => toggleAutoRun(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label">{autoRun ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        <div className="schedule-info">
          <div className="sched-row"><span>Last run</span><span>{config?.last_run || 'Never'}</span></div>
          <div className="sched-row"><span>Next run</span><span>{config?.next_run || '—'}</span></div>
          <div className="sched-row"><span>Schedule</span><span>0 2 * * 1 IST — every Monday 02:00 AM IST (Asia/Kolkata)</span></div>
          <div className="sched-row"><span>Request cap</span><span>{config?.max_requests_per_run ?? 5000} calls/run (set MAX_REQUESTS_PER_RUN in .env)</span></div>
          <div className="sched-row"><span>Skip recent</span><span>Accounts updated &lt; 6 days ago are skipped (saves quota on re-runs)</span></div>
          <div className="sched-row"><span>Anti-bot</span><span>±3s jitter · human breaks every 20–35 requests · shuffled query order · varied count 40-50</span></div>
        </div>
      </div>

      {/* ── Security ─────────────────────────────────────────────────────────── */}
      <div className="settings-card security-note">
        <h2>🔒 Security</h2>
        <ul>
          <li><strong>API keys:</strong> All keys in <code>backend/.env</code> only — never in frontend, never in any API response, never logged.</li>
          <li><strong>Auth:</strong> JWT tokens (7-day expiry) required on all data endpoints. Only <code>/auth/login</code> and <code>/health</code> are public. Register endpoint is disabled.</li>
          <li><strong>Passwords:</strong> Hashed with bcrypt-12 before storage — never stored or transmitted as plain text.</li>
          <li><strong>Rate limiting:</strong> 20 auth attempts / 15 min · 120 API calls / min (express-rate-limit).</li>
          <li><strong>CORS:</strong> Restricted to <code>ALLOWED_ORIGINS</code> env var + <code>*.vercel.app</code> preview domains.</li>
          <li><strong>Anti-bot (paid API):</strong> ±3s random jitter, human breaks every 20-35 requests, shuffled query order, varied result count (40-50). Makes traffic look human.</li>
          <li><strong>Quota protection:</strong> Hard cap of {config?.max_requests_per_run ?? 5000} API calls per run. After cap → graceful stop, all data saved.</li>
          <li><strong>Friend DB:</strong> Strict read-only — only SELECT queries run, INSERT/UPDATE/DELETE architecturally impossible.</li>
          <li><strong>Security headers:</strong> Helmet.js — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, COEP disabled for cross-origin API.</li>
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const MODEL_LABELS = {
  'anthropic/claude-haiku-4-5':  'Primary — fast, cheap, perfect for classification',
  'anthropic/claude-sonnet-4-5': 'Fallback — smarter reasoning',
  'openai/gpt-4o-mini':          'Fallback — OpenAI lightweight',
  'anthropic/claude-opus-4-5':   'Last resort — most capable',
  'openai/gpt-4o':               'Last resort — OpenAI flagship',
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
      const r = await apiFetch('/api/settings/test-friend-db');
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
  const [msg,         setMsg]         = useState('');
  const [msgType,     setMsgType]     = useState('');

  function flash(text, type = 'success') {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  }

  function loadSettings() {
    setLoading(true);
    Promise.all([
      apiFetch('/api/settings').then(r => r.json()),
      apiFetch('/api/settings/keys').then(r => r.json()).catch(() => ({ keys: [] })),
    ]).then(([cfg, ks]) => {
      setConfig(cfg.config);
      setKeyStats(ks.keys || []);
      setAutoRun(cfg.config?.auto_run_enabled === '1');
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { loadSettings(); }, []);

  async function testKeys() {
    setTestingKeys(true);
    setKeyTestRes(null);
    try {
      const r = await apiFetch('/api/settings/keys/test', { method: 'POST', body: '{}' });
      const d = await r.json();
      setKeyTestRes(d.results || []);
      flash(`Key test complete — check results below`, 'success');
    } catch (err) {
      flash(err.message, 'error');
    } finally {
      setTestingKeys(false);
      // Refresh key stats after test
      apiFetch('/api/settings/keys').then(r => r.json()).then(d => setKeyStats(d.keys || []));
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiFetch('/api/settings/test-openrouter', { method: 'POST' });
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
      await apiFetch('/api/settings/auto_run_enabled', {
        method: 'PATCH',
        body: JSON.stringify({ value: val ? '1' : '0' }),
      });
      flash(`Monthly auto-run ${val ? 'enabled' : 'disabled'}`, 'success');
    } catch (err) {
      flash(err.message, 'error');
    }
  }

  const orKeySet = config?.openrouter_env_set;

  if (loading) return <div className="page-loader"><div className="spinner" /></div>;

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
                  <span className="api-key-name">RapidAPI {k.label}</span>
                  <span className="api-key-desc">
                    {k.requests} requests used · {SAFE_RPM ?? 6} RPM limit
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
                      → Subscribe this key to twitter-api45 on rapidapi.com
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
              <span className="api-key-desc">Powers AI scoring — D2 & D3 dimensions (Haiku model)</span>
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
              <span className="api-key-desc">Persistent storage — accounts, keywords, runs</span>
            </div>
            <div className="key-status-pill set">✓ Connected</div>
          </div>

          <div className="api-key-row">
            <div className="api-key-info">
              <span className="api-key-name">Friend's Turso DB</span>
              <span className="api-key-desc">
                Read-only keyword source — 1506 keywords + 42 influencer handles
                {config?.friend_db_set && <span style={{ color: '#00C896' }}> · Never written to</span>}
              </span>
            </div>
            <div className={`key-status-pill ${config?.friend_db_set ? 'set' : 'unset'}`}>
              {config?.friend_db_set ? '✓ Configured' : '✗ Not set'}
            </div>
            {config?.friend_db_set && (
              <FriendDbTestButton apiFetch={apiFetch} />
            )}
          </div>
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
            <h2>Monthly Auto-Run</h2>
            <p>Agent runs automatically on the 1st of every month at 02:00 UTC.</p>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={autoRun} onChange={e => toggleAutoRun(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
            <span className="toggle-label">{autoRun ? 'Enabled' : 'Disabled'}</span>
          </label>
        </div>
        <div className="schedule-info">
          <div className="sched-row"><span>Last run</span><span>{config?.last_run || 'Never'}</span></div>
          <div className="sched-row"><span>Schedule</span><span>0 2 1 * * (UTC)</span></div>
          <div className="sched-row"><span>Trigger</span><span>node-cron on backend</span></div>
        </div>
      </div>

      {/* ── Security ─────────────────────────────────────────────────────────── */}
      <div className="settings-card security-note">
        <h2>🔒 Security Summary</h2>
        <ul>
          <li>All API keys live in <code>backend/.env</code> — never in frontend code or any API response.</li>
          <li>Every data endpoint requires a valid JWT (7-day expiry). Only <code>/auth/login</code>, <code>/auth/register</code>, and <code>/health</code> are public.</li>
          <li>RapidAPI auto-switches to backup key on 429/403 — zero manual action needed.</li>
          <li>Rate limiting: 20 auth attempts / 15 min · 120 API calls / min.</li>
          <li>CORS is restricted to configured frontend origins only.</li>
        </ul>
      </div>
    </div>
  );
}

const express            = require('express');
const axios              = require('axios');
const { db }             = require('../db');
const { requireAuth }    = require('../middleware/auth');
const { getKey, callOpenRouter, MODEL_CHAIN } = require('../openrouter');
const { testFriendDb } = require('../friendDb');

const router = express.Router();
router.use(requireAuth);

// GET /api/settings/keys — live status of all RapidAPI keys (no values exposed)
router.get('/keys', (req, res) => {
  // Import keyStats from the main server module (set as app.locals on boot)
  const stats = req.app.locals.keyStats ? req.app.locals.keyStats() : [];
  res.json({ keys: stats });
});

// POST /api/settings/keys/test — test all keys with a minimal API call
router.post('/keys/test', async (req, res) => {
  const apiHost = process.env.RAPIDAPI_HOST || 'twitter241.p.rapidapi.com';
  const rawKeys = [
    { label: 'KeyPaid', key: process.env.RAPIDAPI_KEY_PAID },
  ].filter(k => k.key);

  const results = [];
  for (const k of rawKeys) {
    try {
      // twitter241 search endpoint
      const resp = await axios.get(`https://${apiHost}/search`, {
        params:  { query: 'ai voice', count: 3, type: 'Top' },
        headers: { 'X-RapidAPI-Key': k.key, 'X-RapidAPI-Host': apiHost, 'Content-Type': 'application/json' },
        timeout: 15_000,
      });
      results.push({ label: k.label, status: 'ok', http: resp.status });
    } catch (err) {
      const http = err.response?.status || 0;
      const state = http === 429 ? 'quota_exhausted'
                  : http === 403 ? 'not_subscribed'
                  : http === 401 ? 'invalid_key'
                  : 'error';
      results.push({ label: k.label, status: state, http });
    }
    // gap between test calls
    await new Promise(r => setTimeout(r, 1500));
  }
  res.json({ results });
});

// GET /api/settings — read config (no sensitive values returned)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT key, value, updated_at FROM agent_config');
    const config = {};
    for (const r of rows) {
      // Never return any stored key values to the frontend
      if (r.key.includes('key') || r.key.includes('token') || r.key.includes('secret')) continue;
      config[r.key] = r.value;
    }
    config['openrouter_env_set']   = !!getKey();
    config['model_chain']          = MODEL_CHAIN;
    config['db_url']               = process.env.TURSO_URL ? 'connected' : 'NOT SET';
    config['safe_rpm']             = 6;
    config['paid_key_set']         = !!(process.env.RAPIDAPI_KEY_PAID);
    config['max_requests_per_run'] = Number(process.env.MAX_REQUESTS_PER_RUN) || 5000;
    config['friend_db_set']        = !!(process.env.FRIEND_TURSO_URL?.trim());
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// POST /api/settings/test-openrouter — live connection test
router.post('/test-openrouter', async (req, res) => {
  if (!getKey()) return res.status(400).json({ ok: false, error: 'OPENROUTER_API_KEY not set in .env' });

  const result = await callOpenRouter(
    [{ role: 'user', content: 'Reply with exactly: {"status":"ok"}' }],
    { maxTokens: 20, temperature: 0 }
  );

  if (result.success) {
    res.json({ ok: true, model: result.model, response: result.content });
  } else {
    res.status(502).json({ ok: false, error: result.error });
  }
});

// GET /api/settings/test-friend-db — test read-only connection to friend's DB
router.get('/test-friend-db', async (req, res) => {
  const result = await testFriendDb();
  res.json(result);
});

// PATCH /api/settings/:key — update non-sensitive config values (auto_run_enabled, etc.)
router.patch('/:configKey', async (req, res) => {
  const { configKey } = req.params;
  const { value }     = req.body;
  // Block any attempt to set sensitive keys via this endpoint
  const blocked = ['openrouter_api_key', 'jwt_secret', 'turso_token', 'rapidapi_key'];
  if (blocked.some(b => configKey.toLowerCase().includes(b))) {
    return res.status(400).json({ error: 'Sensitive keys must be set in .env — not via API' });
  }
  try {
    await db.execute({
      sql:  `INSERT INTO agent_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      args: [configKey, String(value)],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

module.exports = router;

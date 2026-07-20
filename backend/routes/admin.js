// ─────────────────────────────────────────────────────────────────────────────
// Admin panel — SEPARATE credentials from the normal platform login.
//   POST /api/admin/login     { username, password } -> { token }   (scope: panel-admin)
//   GET  /api/admin/overview  -> agents (status/creator/integrations) + live service health
// Credentials come from env: PANEL_ADMIN_USERNAME / PANEL_ADMIN_PASSWORD.
// No API keys/secrets are ever returned — only which integrations are in use + status.
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const jwt     = require('jsonwebtoken');
const { adminAgents, listSections } = require('../agentRegistry');
const { db }  = require('../db');

const router     = express.Router();
const JWT_SECRET  = () => process.env.JWT_SECRET;
const ADMIN_USER  = () => process.env.PANEL_ADMIN_USERNAME || 'kiteadmin';
const ADMIN_PASS  = () => process.env.PANEL_ADMIN_PASSWORD || 'Admin@Kite2026';

// Verify a panel-admin JWT (distinct scope from user tokens).
function requirePanelAdmin(req, res, next) {
  const h = req.headers.authorization;
  const token = h && h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET());
    if (payload.scope !== 'panel-admin') return res.status(403).json({ error: 'Not an admin session' });
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

// Best-effort reachability check (never throws).
async function ping(url, timeoutMs = 3000) {
  if (!url) return 'unknown';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? 'up' : 'down';
  } catch { return 'down'; }
}

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username !== ADMIN_USER() || password !== ADMIN_PASS()) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  const token = jwt.sign({ scope: 'panel-admin', username }, JWT_SECRET(), { expiresIn: '1d' });
  res.json({ token, admin: { username } });
});

router.get('/overview', requirePanelAdmin, async (req, res) => {
  const lbUrl = process.env.LEADERBOARD_URL || null;
  const bvUrl = process.env.BRAND_VISIBILITY_URL || null;
  const [lbStatus, bvStatus] = await Promise.all([
    ping(lbUrl),
    ping(bvUrl ? `${bvUrl}/health` : null),
  ]);

  const services = [
    { name: 'Platform API',          url: 'localhost:3001',          status: 'up' },
    { name: 'Leaderboard dashboard', url: lbUrl || 'not configured', status: lbUrl ? lbStatus : 'unknown' },
    { name: 'Brand Visibility API',  url: bvUrl || 'not configured', status: bvUrl ? bvStatus : 'unknown' },
  ];

  const agents = adminAgents();
  const integrations = [...new Set(agents.flatMap(a => a.integrations))].sort();

  res.json({
    sections: listSections(),
    services,
    agents,
    integrations,
    counts: {
      agents: agents.length,
      live:   agents.filter(a => a.status === 'live').length,
      servicesUp: services.filter(s => s.status === 'up').length,
    },
    generatedAt: new Date().toISOString(),
  });
});

// ── per-agent detail probe (health + DB status + data counts) ────────────────
async function fetchJson(url, ms = 15000, headers = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// X Agent — reads the platform's own Turso DB directly.
async function probeX() {
  try {
    const n = async (sql) => Number((await db.execute(sql)).rows[0].n);
    const [accounts, tasks, keywords, runs] = await Promise.all([
      n('SELECT COUNT(*) n FROM accounts').catch(() => 0),
      n('SELECT COUNT(*) n FROM tasks').catch(() => 0),
      n('SELECT COUNT(*) n FROM keywords').catch(() => 0),
      n('SELECT COUNT(*) n FROM runs').catch(() => 0),
    ]);
    return {
      db: { status: 'connected', engine: 'Turso' },
      stats: [
        { label: 'Accounts', value: accounts },
        { label: 'Tasks', value: tasks },
        { label: 'Keywords', value: keywords },
        { label: 'Runs', value: runs },
      ],
    };
  } catch (e) { return { db: { status: 'error', engine: 'Turso', note: e.message }, stats: [] }; }
}

// Leaderboard — public read endpoints on its FastAPI (LEADERBOARD_API_URL).
async function probeLeaderboard() {
  const api = process.env.LEADERBOARD_API_URL;
  if (!api) return { db: { status: 'unknown', note: 'LEADERBOARD_API_URL not set' }, stats: [] };
  try {
    const [lbs, cats] = await Promise.all([
      fetchJson(`${api}/leaderboards`),
      fetchJson(`${api}/domain-categories`).catch(() => []),
    ]);
    return {
      db: { status: 'connected', engine: 'Turso / SQLite' },
      stats: [
        { label: 'Leaderboards', value: Array.isArray(lbs) ? lbs.length : 0 },
        { label: 'Domain categories', value: Array.isArray(cats) ? cats.length : 0 },
      ],
    };
  } catch (e) { return { db: { status: 'error', note: e.message }, stats: [] }; }
}

// Brand Visibility — the FastAPI /api/stats endpoint (Postgres counts).
async function probeBrand(kind) {
  const base = process.env.BRAND_VISIBILITY_URL;
  if (!base) return { db: { status: 'unknown', note: 'BRAND_VISIBILITY_URL not set' }, stats: [] };
  // P0.5: Python's /api/stats is now locked behind X-Cron-Secret. Inject it
  // server-side (never exposed to the browser) so the panel-admin probe works.
  const secretHeaders = process.env.X_CRON_SECRET_BV
    ? { 'X-Cron-Secret': process.env.X_CRON_SECRET_BV }
    : {};
  try {
    const s = await fetchJson(`${base}/api/stats`, 15000, secretHeaders);
    const c = s.counts || {};
    const stats = kind === 'linkedin'
      ? [
          { label: 'LinkedIn posts', value: c.linkedin_posts ?? '—' },
          { label: 'LinkedIn runs', value: c.linkedin_runs ?? '—' },
          { label: 'LinkedIn keywords', value: c.linkedin_keywords ?? '—' },
        ]
      : [
          { label: 'Scraped tweets', value: c.scraped_tweets ?? '—' },
          { label: 'Agent runs', value: c.agent_runs ?? '—' },
          { label: 'Content themes', value: c.content_themes ?? '—' },
          { label: 'Promoters', value: c.useful_promoters ?? '—' },
        ];
    return {
      db: { status: s.db === 'connected' ? 'connected' : 'error', engine: 'Postgres', note: s.error },
      stats,
    };
  } catch (e) { return { db: { status: 'error', engine: 'Postgres', note: e.message }, stats: [] }; }
}

router.get('/agents/:id', requirePanelAdmin, async (req, res) => {
  const agent = adminAgents().find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  let health = { status: 'unknown', url: null };
  let probe  = { db: { status: 'unknown' }, stats: [] };

  if (agent.id === 'x') {
    health = { status: 'up', url: 'in-platform · /dashboard' };
    probe  = await probeX();
  } else if (agent.id === 'leaderboard') {
    const api = process.env.LEADERBOARD_API_URL;
    health = { status: api ? await ping(`${api}/health`) : 'unknown', url: api || 'not configured' };
    probe  = await probeLeaderboard();
  } else if (agent.id === 'brand-visibility') {
    const base = process.env.BRAND_VISIBILITY_URL;
    health = { status: base ? await ping(`${base}/health`) : 'unknown', url: base ? `${base}/health` : 'not configured' };
    // X is the only platform wired to real data; probe its counts.
    probe  = await probeBrand('x');
  }

  res.json({ agent, health, db: probe.db, stats: probe.stats, checkedAt: new Date().toISOString() });
});

// ── X Agent keyword management (platform's own `keywords` table = full CRUD) ──
// The friend lexicon (external Turso) is exposed READ-ONLY on purpose — writing to
// a separate production DB from here is unsafe; edits there happen in its own tool.
router.get('/agents/x/keywords', requirePanelAdmin, async (req, res) => {
  try {
    const own = (await db.execute(
      'SELECT id, keyword, category, class, active FROM keywords ORDER BY id DESC'
    )).rows;
    let friend = { configured: false };
    try {
      const { getFriendKeywordsForUI } = require('../friendDb');
      const f = await getFriendKeywordsForUI();
      if (f && f.configured) {
        friend = {
          configured: true, readOnly: true,
          available: !f.error,
          error: f.error || null,
          total: f.totals?.keywords ?? (f.keywords || []).length,
          active: f.totals?.active ?? null,
          sample: (f.keywords || []).slice(0, 60).map(k => k.keyword || k.search_query).filter(Boolean),
        };
      }
    } catch { /* friend DB optional */ }
    res.json({ own, friend });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/agents/x/keywords', requirePanelAdmin, async (req, res) => {
  const keyword = (req.body?.keyword || '').trim();
  const category = req.body?.category || null;
  const cls = req.body?.class || null;
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });
  try {
    await db.execute({
      sql: 'INSERT INTO keywords (keyword, category, class, source) VALUES (?, ?, ?, ?)',
      args: [keyword, category, cls, 'admin'],
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/agents/x/keywords/:id', requirePanelAdmin, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE keywords SET active = ? WHERE id = ?', args: [req.body?.active ? 1 : 0, req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/agents/x/keywords/:id', requirePanelAdmin, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM keywords WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

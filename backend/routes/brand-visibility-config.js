// Node proxy router for the Brand Visibility agent's lexicon config API.
//
// Forwards /api/brand-visibility/config/* to the Python FastAPI backend's
// /api/config/* endpoints (keyword_classes, keywords, influencers CRUD).
// JWT-guarded at this layer (the Python API has no auth of its own and is only
// reachable on the internal network). Uses native fetch (Node 18+) — no proxy
// libraries. Matches routes/keywords.js conventions: destructured requireAuth,
// { error } envelope, module.exports = router.
const express = require('express');
const { requireAuth, requireSection } = require('../middleware/auth');

const router = express.Router();

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// All config routes require a valid JWT AND access to the brand-visibility
// section (RBAC Phase 3). Panel-admin bypasses via requireSection.
router.use(requireAuth, requireSection('brand-visibility'));

// Generic pass-through to the Python API. Preserves method, query string, and
// JSON body; relays the upstream status + body verbatim (so FastAPI's
// { detail } error envelopes reach the client unchanged). A connection failure
// (Python API down) becomes a 502 with an { error } envelope.
async function proxyRequest(req, res, path) {
  // Forward the query string. req.originalUrl is the full mounted path incl. any
  // ?query; slice from the first '?' (avoids relying on the private _parsedUrl).
  const qIdx = req.originalUrl.indexOf('?');
  const search = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
  const url = `${PYTHON_API_URL}${path}${search}`;

  const options = {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
  };
  // P0 lockdown: the Python API now requires X-Cron-Secret on write endpoints
  // (config CRUD included). Inject it server-side so it's never exposed to the
  // browser. Harmless on GET reads (Python ignores it there). If the gateway
  // secret isn't configured, writes will 401 upstream — set X_CRON_SECRET_BV.
  if (process.env.X_CRON_SECRET_BV) {
    options.headers['X-Cron-Secret'] = process.env.X_CRON_SECRET_BV;
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Object.keys(req.body || {}).length) {
    options.body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(url, options);
    const contentType = upstream.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text();
    res.status(upstream.status).json(body);
  } catch (err) {
    console.error(`[brand-visibility-config] proxy error to ${url}:`, err.message);
    res.status(502).json({ error: 'Upstream Python API unreachable', detail: err.message });
  }
}

// ── Keyword classes ──────────────────────────────────────────────────────────
router.get('/classes', (req, res) => proxyRequest(req, res, '/api/config/classes'));
router.get('/classes/:class_key', (req, res) => proxyRequest(req, res, `/api/config/classes/${encodeURIComponent(req.params.class_key)}`));
router.post('/classes', (req, res) => proxyRequest(req, res, '/api/config/classes'));
router.put('/classes/:class_key', (req, res) => proxyRequest(req, res, `/api/config/classes/${encodeURIComponent(req.params.class_key)}`));
router.delete('/classes/:class_key', (req, res) => proxyRequest(req, res, `/api/config/classes/${encodeURIComponent(req.params.class_key)}`));

// ── Keywords ─────────────────────────────────────────────────────────────────
router.get('/keywords', (req, res) => proxyRequest(req, res, '/api/config/keywords'));
router.get('/keywords/:id', (req, res) => proxyRequest(req, res, `/api/config/keywords/${encodeURIComponent(req.params.id)}`));
router.post('/keywords', (req, res) => proxyRequest(req, res, '/api/config/keywords'));
router.put('/keywords/:id', (req, res) => proxyRequest(req, res, `/api/config/keywords/${encodeURIComponent(req.params.id)}`));
router.delete('/keywords/:id', (req, res) => proxyRequest(req, res, `/api/config/keywords/${encodeURIComponent(req.params.id)}`));
router.patch('/keywords/:id/toggle', (req, res) => proxyRequest(req, res, `/api/config/keywords/${encodeURIComponent(req.params.id)}/toggle`));

// ── Influencers ──────────────────────────────────────────────────────────────
router.get('/influencers', (req, res) => proxyRequest(req, res, '/api/config/influencers'));
router.get('/influencers/:handle', (req, res) => proxyRequest(req, res, `/api/config/influencers/${encodeURIComponent(req.params.handle)}`));
router.post('/influencers', (req, res) => proxyRequest(req, res, '/api/config/influencers'));
router.put('/influencers/:handle', (req, res) => proxyRequest(req, res, `/api/config/influencers/${encodeURIComponent(req.params.handle)}`));
router.delete('/influencers/:handle', (req, res) => proxyRequest(req, res, `/api/config/influencers/${encodeURIComponent(req.params.handle)}`));
router.patch('/influencers/:handle/toggle', (req, res) => proxyRequest(req, res, `/api/config/influencers/${encodeURIComponent(req.params.handle)}/toggle`));

// ── X (KA017) manual sweep trigger + status ──────────────────────────────────
// Both routes are JWT-guarded by the global router.use(requireAuth) above.
//
// run-now can't reuse proxyRequest: it must inject the X-Cron-Secret header that
// Python's /api/x/run-now requires. The secret lives only on the gateway
// (X_CRON_SECRET_BV) and never reaches the browser. Body is optional — an empty
// body runs the saved schedule; a JSON body carries per-run overrides.
router.post('/x/run-now', async (req, res) => {
  const cronSecret = process.env.X_CRON_SECRET_BV;
  if (!cronSecret) {
    return res.status(500).json({ error: 'X_CRON_SECRET_BV not configured on gateway' });
  }
  const url = `${PYTHON_API_URL}/api/x/run-now`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cron-Secret': cronSecret },
  };
  if (Object.keys(req.body || {}).length) {
    options.body = JSON.stringify(req.body);
  }
  try {
    const upstream = await fetch(url, options);
    const contentType = upstream.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await upstream.json()
      : await upstream.text();
    res.status(upstream.status).json(body);
  } catch (err) {
    console.error(`[brand-visibility-config] run-now proxy error to ${url}:`, err.message);
    res.status(502).json({ error: 'Upstream Python API unreachable', detail: err.message });
  }
});

// Status poll for a run started via run-now. Python's run-status is unguarded,
// so a plain pass-through (no cron secret) through the existing helper suffices —
// routed via the gateway so the browser uses one authed origin instead of the
// internal-only Python URL.
router.get('/x/run-status/:runId', (req, res) => proxyRequest(req, res, `/api/x/run-status/${encodeURIComponent(req.params.runId)}`));

// Scheduler save (PUT) + Prompt save (POST). These hit Python WRITE endpoints,
// which now require X-Cron-Secret (P0 lockdown) — proxyRequest injects it
// server-side. JWT + brand-visibility section gating already applied by the
// router.use above; the browser never sees the secret. Body/method pass through.
// (GET reads of schedule/active-prompt still go browser->Python directly for now.)
router.put('/x/schedule', (req, res) => proxyRequest(req, res, '/api/x/schedule'));
router.post('/x/active-prompt', (req, res) => proxyRequest(req, res, '/api/x/active-prompt'));

module.exports = router;

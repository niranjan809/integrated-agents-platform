// Node proxy router for the Brand Visibility agent's lexicon config API.
//
// Forwards /api/brand-visibility/config/* to the Python FastAPI backend's
// /api/config/* endpoints (keyword_classes, keywords, influencers CRUD).
// JWT-guarded at this layer (the Python API has no auth of its own and is only
// reachable on the internal network). Uses native fetch (Node 18+) — no proxy
// libraries. Matches routes/keywords.js conventions: destructured requireAuth,
// { error } envelope, module.exports = router.
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// All config routes require a valid JWT.
router.use(requireAuth);

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

module.exports = router;

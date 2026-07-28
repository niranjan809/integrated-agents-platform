// Node proxy router for the GTM Intelligence agent.
//
// Forwards every /api/gtm/* request from the browser to the GTM Fastify backend,
// which runs as its OWN service (its own deploy, reachable over a public URL like
// Creator Radar). GTM's API has no auth of its own; instead it trusts an
// X-Internal-Secret header (see agents/gtm/backend/src/server.ts), so this layer:
//   1) enforces the platform JWT + RBAC section gate (requireAuth/requireSection)
//   2) injects X-Internal-Secret server-side (never exposed to the browser)
//   3) pipes the upstream response back verbatim (status, content-type, body).
//
// Uses native fetch (Node 20+) — no proxy libraries. Matches routes/creator-radar.js
// conventions: destructured requireAuth, { error } envelope, module.exports = router.
const express = require('express');
const { Readable } = require('stream');
const { requireAuth, requireSection } = require('../middleware/auth');

const router = express.Router();

// This router is mounted at /api/gtm; strip that prefix off req.originalUrl to
// recover the upstream path (query string included).
const MOUNT_PREFIX = '/api/gtm';

// All routes require a valid JWT AND access to the 'gtm' section. Panel-admin
// bypasses the gate.
router.use(requireAuth, requireSection('gtm'));

// Generic pass-through for all methods. Env is read per-request and fails fast
// with a 500 if the gateway isn't configured, so the server still boots without
// these vars set.
async function proxyRequest(req, res) {
  const backendUrl = process.env.GTM_BACKEND_URL;
  const internalSecret = process.env.GTM_INTERNAL_SECRET;
  if (!backendUrl || !internalSecret) {
    return res.status(500).json({ error: 'GTM backend not configured' });
  }

  // req.originalUrl is the full mounted path incl. any ?query. Strip the mount
  // prefix to get the upstream path; keep everything after it verbatim.
  let path = req.originalUrl.slice(MOUNT_PREFIX.length);
  if (!path.startsWith('/')) path = `/${path}`;
  const url = `${backendUrl.replace(/\/$/, '')}${path}`;

  const headers = { 'X-Internal-Secret': internalSecret };
  if (req.headers.accept) headers['Accept'] = req.headers.accept;

  const options = { method: req.method, headers };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Object.keys(req.body || {}).length) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(req.body);
  }

  let upstream;
  try {
    upstream = await fetch(url, options);
  } catch (err) {
    console.error(`[gtm] proxy error to ${url}:`, err.message);
    return res.status(502).json({ error: 'GTM backend unreachable', detail: err.message });
  }

  res.status(upstream.status);
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.set('Content-Type', contentType);

  if (!upstream.body) return res.end();

  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on('error', (err) => {
    console.error(`[gtm] stream error from ${url}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'GTM backend unreachable', detail: err.message });
    } else {
      res.destroy(err);
    }
  });
  nodeStream.pipe(res);
}

router.all('/*', proxyRequest);

module.exports = router;

// Node proxy router for the Creator Radar agent.
//
// Forwards every /api/creator-radar/* request from the browser to the Creator
// Radar Fastify backend, which runs as its OWN Railway service (unlike Brand
// Visibility's Python API, this is a separate deploy reachable over the public
// Railway URL). The upstream trusts an X-Internal-Secret header to bypass its
// own cookie auth and attach the caller as a service user, so this layer:
//   1) enforces the platform JWT + RBAC section gate (requireAuth/requireSection)
//   2) injects X-Internal-Secret server-side (never exposed to the browser)
//   3) pipes the upstream response back verbatim (status, content-type, body),
//      which preserves the backend's NDJSON streaming endpoints.
//
// Uses native fetch (Node 20+) — no proxy libraries. Matches
// routes/brand-visibility-config.js conventions: destructured requireAuth,
// { error } envelope, module.exports = router.
const express = require('express');
const { Readable } = require('stream');
const { requireAuth, requireSection } = require('../middleware/auth');

const router = express.Router();

// This router is mounted at /api/creator-radar; strip that prefix off
// req.originalUrl to recover the upstream path (query string included).
const MOUNT_PREFIX = '/api/creator-radar';

// All routes require a valid JWT AND access to the 'creator-radar' section.
// NOTE: the 'creator-radar' section does not exist in the system sections list
// yet (added in Phase 4) — until a user has it in sections_allowed, every
// request here 403s at requireSection. Panel-admin bypasses the gate.
router.use(requireAuth, requireSection('creator-radar'));

// Generic pass-through for all methods (GET/POST/PUT/PATCH/DELETE). Env is read
// per-request and fails fast with a 500 if the gateway isn't configured, so the
// server still boots without these vars set.
async function proxyRequest(req, res) {
  const backendUrl = process.env.CREATOR_RADAR_BACKEND_URL;
  const internalSecret = process.env.CREATOR_RADAR_INTERNAL_SECRET;
  if (!backendUrl || !internalSecret) {
    return res.status(500).json({ error: 'Creator Radar backend not configured' });
  }

  // req.originalUrl is the full mounted path incl. any ?query. Strip the mount
  // prefix to get the upstream path; keep everything after it verbatim.
  let path = req.originalUrl.slice(MOUNT_PREFIX.length);
  if (!path.startsWith('/')) path = `/${path}`;
  // Trim a trailing slash on the base URL so we don't produce a double slash.
  const url = `${backendUrl.replace(/\/$/, '')}${path}`;

  const headers = { 'X-Internal-Secret': internalSecret };
  // Forward content negotiation so the backend's NDJSON streams stay NDJSON.
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
    console.error(`[creator-radar] proxy error to ${url}:`, err.message);
    return res.status(502).json({ error: 'Creator Radar backend unreachable', detail: err.message });
  }

  // Relay status + content-type verbatim (upstream 5xx pass through unchanged —
  // more informative to the client than a synthetic gateway error), then pipe
  // the body so streaming responses aren't buffered.
  res.status(upstream.status);
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.set('Content-Type', contentType);

  if (!upstream.body) return res.end();

  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on('error', (err) => {
    console.error(`[creator-radar] stream error from ${url}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Creator Radar backend unreachable', detail: err.message });
    } else {
      res.destroy(err);
    }
  });
  nodeStream.pipe(res);
}

router.all('/*', proxyRequest);

module.exports = router;

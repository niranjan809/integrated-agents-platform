// Node proxy router for the Brand Visibility agent's lexicon config API.
//
// Forwards /api/brand-visibility/config/* to the Python FastAPI backend's
// /api/config/* endpoints (keyword_classes, keywords, influencers CRUD).
// JWT-guarded at this layer (the Python API has no auth of its own and is only
// reachable on the internal network). Uses native fetch (Node 18+) — no proxy
// libraries. Matches routes/keywords.js conventions: destructured requireAuth,
// { error } envelope, module.exports = router.
const express = require('express');
const { requireAuth, requireSection, requireRole } = require('../middleware/auth');
const { getAgent, SECTIONS } = require('../agentRegistry');
const { db } = require('../db');

const router = express.Router();

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';

// The registry id for the Brand Visibility agent whose X pages these routes back.
// Static fields (name, description, integrations, version, icon) come from
// agentRegistry.js; per-agent editable overrides live in the Turso agent_meta row
// keyed by this id.
const AGENT_ID = 'brand-visibility';

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

// Status poll for a run started via run-now. Python's run-status is now locked
// down (P0.5), so this routes through proxyRequest — which injects the cron
// secret server-side — and the browser uses one authed origin instead of the
// internal-only Python URL.
router.get('/x/run-status/:runId', (req, res) => proxyRequest(req, res, `/api/x/run-status/${encodeURIComponent(req.params.runId)}`));

// ── X (KA017) reads ───────────────────────────────────────────────────────
// P0.5: reads migrated browser->Python->direct to browser->Node->Python. The
// Python GET endpoints are now locked down (require X-Cron-Secret), so these
// must route through proxyRequest, which injects the secret server-side. The
// helper also forwards the query string verbatim, so pagination (posts:
// limit/offset) and date-range params (cost-summary) pass through unchanged.
router.get('/x/stats', (req, res) => proxyRequest(req, res, '/api/x/stats'));
router.get('/x/cost-summary', (req, res) => proxyRequest(req, res, '/api/x/cost-summary'));
router.get('/x/posts', (req, res) => proxyRequest(req, res, '/api/x/posts'));

// Scheduler save (PUT) + Prompt save (POST). These hit Python WRITE endpoints,
// which now require X-Cron-Secret (P0 lockdown) — proxyRequest injects it
// server-side. JWT + brand-visibility section gating already applied by the
// router.use above; the browser never sees the secret. Body/method pass through.
// GET reads of schedule/active-prompt also route here (P0.5) so the browser hits
// one authed origin and the now-locked Python reads receive the cron secret.
router.get('/x/schedule', (req, res) => proxyRequest(req, res, '/api/x/schedule'));
router.put('/x/schedule', (req, res) => proxyRequest(req, res, '/api/x/schedule'));
router.get('/x/active-prompt', (req, res) => proxyRequest(req, res, '/api/x/active-prompt'));
router.post('/x/active-prompt', (req, res) => proxyRequest(req, res, '/api/x/active-prompt'));

// ── Agent info panels (Full Path 2) ──────────────────────────────────────────
// Multi-endpoint metadata backing the info panels across the Brand Visibility X
// pages. Tiered visibility: /about, /scheduler-help, /keywords-help are
// section-level (any brand-visibility user); /integrations, /prompts-meta and the
// PATCH /about editor are admin-only (requireRole('admin') layered on top of the
// global requireAuth + requireSection('brand-visibility')).

// Static help text served from Node (not proxied). Kept here so it lives next to
// the routes that serve it; the frontend mirrors these in constants/agentInfo.js
// as an offline fallback.
const SCHEDULER_HELP = {
  mode: {
    label: 'Mode',
    description: 'Which stage(s) of the pipeline the sweep runs. "all" does the full ' +
      'keyword→influencer→classify cycle; the others isolate one stage for targeted re-runs.',
  },
  class_filter: {
    label: 'Class filter',
    description: 'Restrict the sweep to specific lexicon classes (comma-separated codes ' +
      'A–K, NOISE). Blank sweeps every enabled class.',
  },
  since_hours: {
    label: 'Since hours',
    description: 'Only fetch posts newer than this many hours. Blank means no recency ' +
      'limit. Lower values keep sweeps cheap and focused on fresh signal.',
  },
  max_pages: {
    label: 'Max pages / query',
    description: 'How many result pages to pull per search query (1–10). Each extra page ' +
      'costs one more RapidAPI call, so raise it only when you need deeper coverage.',
  },
  max_keywords: {
    label: 'Max keywords',
    description: 'Upper bound on how many enabled keyword queries run in a single sweep ' +
      '(1–1000). Caps sweep breadth independent of how many keywords are enabled.',
  },
  max_api_calls: {
    label: 'Max API calls',
    description: 'Hard per-sweep RapidAPI budget (1–1000). Once hit, the run stops ' +
      'scraping and finishes classifying what it already fetched — protects your monthly quota.',
  },
};

// The 7 active lexicon classes surfaced to builders (H/I/J dead classes omitted).
const KEYWORD_CLASSES = [
  { id: 'A', name: 'AI Models',
    description: 'Macro AI signal — foundation models & LLMs (GPT, Claude, Gemini, Llama), ' +
      'inference stacks and LLM developers. Priority P2.' },
  { id: 'B', name: 'Orchestration',
    description: 'Agent frameworks and workflow tooling — LangChain, n8n, vector databases, ' +
      'MCP servers, RAG pipelines and agentic automation. Priority P2.' },
  { id: 'C', name: 'Voice AI Stack',
    description: 'The core target — voice-AI builders and infrastructure: Vapi, ElevenLabs, ' +
      'Deepgram, Cartesia, LiveKit, TTS/STT, conversational and phone agents. Priority P1.' },
  { id: 'E', name: 'Language Moat',
    description: 'Multilingual and regional voice/NLP — Gulf Arabic, Hinglish, SEA languages. ' +
      "KiteAI's language differentiation. Priority P1." },
  { id: 'F', name: 'Vertical AI',
    description: 'Vertical integrators and agencies shipping industry AI — dental, real estate, ' +
      'GoHighLevel, white-label AI SaaS founders. Priority P1.' },
  { id: 'H', name: 'Influencer',
    description: 'Accounts that shape the conversation — AI content creators, reviewers, ' +
      'newsletters and tech YouTubers. Priority P1.' },
  { id: 'K', name: 'Product Keywords',
    description: 'High-intent product & competitor terms — "vapi alternative", "voice ai ' +
      'pricing", "openai voice api" and direct brand mentions. Priority P1.' },
];

const PROMPT_PURPOSE =
  'This prompt drives the classifier that reads each scraped X post and assigns a lexicon ' +
  'class (A–K or NOISE), a relevance score (0–100) and a priority flag. It is the single ' +
  'lever that controls signal quality — tightening it reduces noise, loosening it widens ' +
  'coverage. Edits take effect on the next classification pass.';

const CLASSIFICATION_MODEL = 'OpenRouter · Gemini 2.5 Flash (google/gemini-2.5-flash)';

// GET-only fetch of a Python endpoint returning parsed JSON, injecting the cron
// secret server-side (Python GET reads are locked down — P0.5). Returns the
// parsed body on 2xx, or null on any non-2xx / network / parse failure so callers
// can degrade gracefully instead of failing the whole panel.
async function fetchPythonJson(path) {
  const cronSecret = process.env.X_CRON_SECRET_BV;
  const headers = { 'Content-Type': 'application/json' };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;
  try {
    const upstream = await fetch(`${PYTHON_API_URL}${path}`, { method: 'GET', headers });
    if (!upstream.ok) return null;
    const contentType = upstream.headers.get('content-type') || '';
    return contentType.includes('application/json') ? await upstream.json() : null;
  } catch (err) {
    console.warn(`[brand-visibility-config] optional upstream GET ${path} failed:`, err.message);
    return null;
  }
}

// Read the (possibly absent) agent_meta row for this agent. Returns {} when the
// row hasn't been created yet (rows are lazy — created on first PATCH).
async function getAgentMeta() {
  const { rows } = await db.execute({
    sql: 'SELECT admin_notes, description_override, updated_at, updated_by FROM agent_meta WHERE agent_id = ?',
    args: [AGENT_ID],
  });
  return rows[0] || {};
}

// GET /x/about — section-level agent summary. Static fields from agentRegistry,
// live last_run_at/total_runs best-effort from Python, admin overrides from Turso.
router.get('/x/about', async (req, res) => {
  const agent = getAgent(AGENT_ID);
  if (!agent) return res.status(404).json({ error: 'Agent not found in registry' });
  const sectionName =
    (SECTIONS.find(s => s.id === agent.sectionId) || {}).name || agent.sectionId;

  // Best-effort live metrics. Neither failure blocks the panel.
  const [schedule, runs, meta] = await Promise.all([
    fetchPythonJson('/api/x/schedule'),
    fetchPythonJson('/api/x/runs?limit=100'),
    getAgentMeta().catch(() => ({})),
  ]);

  res.json({
    id: agent.id,
    name: agent.name,
    description: agent.description,
    creator: agent.creator || null,
    status: agent.status,
    version: agent.version,
    section: sectionName,
    icon: agent.icon || null,
    last_run_at: schedule?.last_run_at ?? null,
    last_run_status: schedule?.last_run_status ?? null,
    // total_runs is derived from the recent-runs list (capped at 100 upstream); a
    // full count isn't exposed by Python, so this is a floor, not an exact total.
    total_runs: Array.isArray(runs) ? runs.length : null,
    // NOTE: admin_notes deliberately NOT returned here — internal notes moved to
    // the admin-only GET /x/integrations so non-admin section users can't read
    // them. description_override stays: it's the publicly-shown description
    // override (rendered to every user), not internal context.
    description_override: meta.description_override ?? null,
    meta_updated_at: meta.updated_at ?? null,
  });
});

// GET /x/integrations — admin-only. Static integration list from the registry,
// plus the internal admin_notes (moved here from /x/about so they're admin-gated
// on both endpoint and client). Editing still happens via PATCH /x/about.
router.get('/x/integrations', requireRole('admin'), async (req, res) => {
  const agent = getAgent(AGENT_ID);
  if (!agent) return res.status(404).json({ error: 'Agent not found in registry' });
  const meta = await getAgentMeta().catch(() => ({}));
  res.json({
    integrations: agent.integrations || [],
    admin_notes: meta.admin_notes ?? null,
    meta_updated_at: meta.updated_at ?? null,
  });
});

// GET /x/prompts-meta — admin-only. Proxies Python active-prompt for the live
// version, adds the static classification model + purpose text.
router.get('/x/prompts-meta', requireRole('admin'), async (req, res) => {
  const active = await fetchPythonJson('/api/x/active-prompt');
  res.json({
    prompt_version: active?.version ?? null,
    prompt_updated_at: active?.updated_at ?? null,
    classification_model: CLASSIFICATION_MODEL,
    prompt_purpose: PROMPT_PURPOSE,
  });
});

// GET /x/scheduler-help — section-level. Static field descriptions.
router.get('/x/scheduler-help', (req, res) => {
  res.json({ fields: SCHEDULER_HELP });
});

// GET /x/keywords-help — section-level. Static class descriptions.
router.get('/x/keywords-help', (req, res) => {
  res.json({ classes: KEYWORD_CLASSES });
});

// PATCH /x/about — admin-only. Upserts the agent_meta row (created lazily). Only
// the two editable fields are accepted; each is optional so a caller can update
// one without clobbering the other.
router.patch('/x/about', requireRole('admin'), async (req, res) => {
  const { admin_notes, description_override } = req.body || {};
  if (admin_notes === undefined && description_override === undefined) {
    return res.status(400).json({ error: 'Provide admin_notes and/or description_override' });
  }
  if (admin_notes !== undefined && typeof admin_notes !== 'string' && admin_notes !== null) {
    return res.status(400).json({ error: 'admin_notes must be a string or null' });
  }
  if (description_override !== undefined && typeof description_override !== 'string' && description_override !== null) {
    return res.status(400).json({ error: 'description_override must be a string or null' });
  }

  // Merge onto the existing row so an omitted field is preserved (INSERT OR
  // REPLACE would otherwise null it out). COALESCE keeps the current value when
  // the incoming one is undefined (passed as null via the ?-arg below).
  const current = await getAgentMeta();
  const nextNotes = admin_notes !== undefined ? admin_notes : (current.admin_notes ?? null);
  const nextOverride = description_override !== undefined
    ? description_override
    : (current.description_override ?? null);

  await db.execute({
    sql: `INSERT INTO agent_meta (agent_id, admin_notes, description_override, updated_at, updated_by)
          VALUES (?, ?, ?, datetime('now'), ?)
          ON CONFLICT(agent_id) DO UPDATE SET
            admin_notes          = excluded.admin_notes,
            description_override  = excluded.description_override,
            updated_at           = excluded.updated_at,
            updated_by           = excluded.updated_by`,
    args: [AGENT_ID, nextNotes, nextOverride, req.user?.id ?? null],
  });

  res.json({
    agent_id: AGENT_ID,
    admin_notes: nextNotes,
    description_override: nextOverride,
    updated_by: req.user?.id ?? null,
  });
});

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// Gateway routes — the "thin layer" that sits between the UI and the agents.
// It does NO agent work: it only lists agents (registry) and forwards run
// requests to the right agent service (router). Auth is shared with the rest of
// the API.
//
//   GET  /api/agents               → catalogue for the UI
//   GET  /api/agents/:id           → one agent's details
//   POST /api/agents/:id/run       → start a run (proxied for 'http' agents)
//   GET  /api/agents/:id/status/:jobId
//   GET  /api/agents/:id/result/:jobId
// ─────────────────────────────────────────────────────────────────────────────
const express               = require('express');
const axios                 = require('axios');
const { requireAuth }       = require('../middleware/auth');
const { listAgents, getAgent } = require('../agentRegistry');

const router = express.Router();
router.use(requireAuth);

// Catalogue — the UI builds its cards from this.
router.get('/', (req, res) => {
  res.json({ agents: listAgents() });
});

// One agent.
router.get('/:id', (req, res) => {
  const a = getAgent(req.params.id);
  if (!a || a.status === 'off') return res.status(404).json({ error: 'Agent not found' });
  res.json({ agent: a });
});

// Start a run. For 'http' agents the gateway forwards to the agent service; for
// in-app / embedded agents there is nothing to proxy — the UI opens them directly.
router.post('/:id/run', async (req, res) => {
  const a = getAgent(req.params.id);
  if (!a || a.status === 'off') return res.status(404).json({ error: 'Agent not found' });
  if (a.status !== 'live')      return res.status(409).json({ error: `Agent "${a.id}" is not live yet` });

  if (a.surface !== 'http' || !a.runUrl) {
    return res.status(409).json({
      error: 'This agent runs in the app — open it via its page, not the run API',
      surface: a.surface, open: a.path || a.embedUrl || null,
    });
  }
  try {
    const { data } = await axios.post(`${a.runUrl}/run`, req.body || {}, { timeout: 30000 });
    res.json(data); // expected: { jobId, ... }
  } catch (err) {
    res.status(502).json({ error: `Agent "${a.id}" failed to start`, detail: err.response?.data || err.message });
  }
});

// Proxy job status / result for 'http' agents.
function proxyGet(kind) {
  return async (req, res) => {
    const a = getAgent(req.params.id);
    if (!a || a.status === 'off') return res.status(404).json({ error: 'Agent not found' });
    if (a.surface !== 'http' || !a.runUrl)
      return res.status(409).json({ error: 'This agent has no run API' });
    try {
      const { data } = await axios.get(`${a.runUrl}/${kind}/${req.params.jobId}`, { timeout: 15000 });
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: `Agent "${a.id}" ${kind} check failed`, detail: err.response?.data || err.message });
    }
  };
}
router.get('/:id/status/:jobId', proxyGet('status'));
router.get('/:id/result/:jobId', proxyGet('result'));

module.exports = router;

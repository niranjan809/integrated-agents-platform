// ─────────────────────────────────────────────────────────────────────────────
// Section catalogue — the landing page and section pages render from here.
//   GET /api/sections        → the landing tiles (Brand Visibility, PR, Leaderboard)
//   GET /api/sections/:id     → one section + the agents inside it
// Auth is shared with the rest of the API.
// ─────────────────────────────────────────────────────────────────────────────
const express               = require('express');
const { requireAuth }       = require('../middleware/auth');
const { listSections, getSection } = require('../agentRegistry');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ sections: listSections() });
});

router.get('/:id', (req, res) => {
  const data = getSection(req.params.id);
  if (!data) return res.status(404).json({ error: 'Section not found' });
  res.json(data); // { section, agents }
});

module.exports = router;

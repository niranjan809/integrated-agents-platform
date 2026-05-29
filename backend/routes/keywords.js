const express                   = require('express');
const { db }                    = require('../db');
const { requireAuth }           = require('../middleware/auth');
const { getFriendKeywordsForUI } = require('../friendDb');

const router = express.Router();
router.use(requireAuth);

// GET /api/keywords — list all, grouped by class
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT * FROM keywords ORDER BY class, category, keyword');
    res.json({ keywords: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

// POST /api/keywords — add a keyword
router.post('/', async (req, res) => {
  const { keyword, category = 'general', class: cls = 'K' } = req.body;
  if (!keyword?.trim()) return res.status(400).json({ error: 'Keyword is required' });

  try {
    const result = await db.execute({
      sql:  'INSERT INTO keywords (keyword, category, class, source) VALUES (?, ?, ?, ?)',
      args: [keyword.trim().toLowerCase(), category, cls, 'manual'],
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM keywords WHERE id = ?', args: [result.lastInsertRowid] });
    res.json({ keyword: rows[0] });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Keyword already exists' });
    res.status(500).json({ error: 'Failed to add keyword' });
  }
});

// PATCH /api/keywords/:id — toggle active
router.patch('/:id', async (req, res) => {
  const { active } = req.body;
  try {
    await db.execute({
      sql:  'UPDATE keywords SET active = ? WHERE id = ?',
      args: [active ? 1 : 0, req.params.id],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update keyword' });
  }
});

// DELETE /api/keywords/:id — remove a keyword
router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM keywords WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete keyword' });
  }
});

// GET /api/keywords/friend — all keywords from friend's DB (read-only, uses singleton)
router.get('/friend', async (req, res) => {
  const url = process.env.FRIEND_TURSO_URL?.trim();
  if (!url) return res.json({ configured: false, classes: [], keywords: [], influencers: [], totals: { keywords: 0, active: 0, influencers: 0 } });
  try {
    const data = await getFriendKeywordsForUI();
    res.json(data || { configured: true, classes: [], keywords: [], influencers: [], totals: { keywords: 0, active: 0, influencers: 0 } });
  } catch (err) {
    res.status(500).json({ error: err.message, configured: true });
  }
});

module.exports = router;

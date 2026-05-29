const express         = require('express');
const { db }          = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/accounts — all accounts with filters
router.get('/', async (req, res) => {
  const { track, type, tier, min_score, limit = 1000, offset = 0 } = req.query;
  try {
    let sql = 'SELECT * FROM accounts WHERE 1=1';
    const args = [];
    if (track)     { sql += ' AND track = ?';        args.push(track); }
    if (type)      { sql += ' AND account_type = ?';  args.push(type); }
    if (tier)      { sql += ' AND tier = ?';          args.push(tier); }
    if (min_score) { sql += ' AND overall >= ?';      args.push(Number(min_score)); }
    sql += ' ORDER BY overall DESC LIMIT ? OFFSET ?';
    args.push(Number(limit), Number(offset));

    const { rows } = await db.execute({ sql, args });
    const total    = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM accounts', args: [] });
    res.json({ accounts: rows, total: total.rows[0].cnt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/influencers
// Track A: Influencer, AI Media, and generic "Account" — everything collab-worthy
router.get('/influencers', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT * FROM accounts
       WHERE track = 'A'
       ORDER BY overall DESC LIMIT 1000`
    );
    res.json({ accounts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch influencers' });
  }
});

// GET /api/accounts/pr-pages
// Track B: PR Page, Brand Page, AI Media pages — ads audience
router.get('/pr-pages', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT * FROM accounts
       WHERE track = 'B'
       ORDER BY overall DESC LIMIT 1000`
    );
    res.json({ accounts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch PR pages' });
  }
});

// GET /api/accounts/:handle — single account
router.get('/:handle', async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql:  'SELECT * FROM accounts WHERE handle = ?',
      args: [req.params.handle.toLowerCase()],
    });
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ account: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

module.exports = router;

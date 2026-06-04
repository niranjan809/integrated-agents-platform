const express         = require('express');
const { db }          = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/accounts — all accounts with filters
router.get('/', async (req, res) => {
  const limitRaw  = parseInt(req.query.limit,  10);
  const offsetRaw = parseInt(req.query.offset, 10);
  const limit  = isNaN(limitRaw)  ? 1000 : Math.min(limitRaw, 5000);
  const offset = isNaN(offsetRaw) ? 0    : offsetRaw;
  const { track, type, tier, min_score } = req.query;
  try {
    let sql = 'SELECT * FROM accounts WHERE 1=1';
    const args = [];
    if (track)     { sql += ' AND track = ?';        args.push(track); }
    if (type)      { sql += ' AND account_type = ?';  args.push(type); }
    if (tier)      { sql += ' AND tier = ?';          args.push(tier); }
    if (min_score) { sql += ' AND overall >= ?';      args.push(Number(min_score)); }
    sql += ' ORDER BY overall DESC LIMIT ? OFFSET ?';
    args.push(limit, offset);
    const { rows } = await db.execute({ sql, args });
    const total    = await db.execute({ sql: 'SELECT COUNT(*) as cnt FROM accounts', args: [] });
    res.json({ accounts: rows, total: total.rows[0].cnt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// GET /api/accounts/influencers — Track A (collab pipeline, all types)
router.get('/influencers', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT * FROM accounts WHERE track = 'A' ORDER BY
         CASE promotion_type WHEN 'explicit' THEN 0 WHEN 'inferred' THEN 1 ELSE 2 END,
         overall DESC LIMIT 1000`
    );
    res.json({ accounts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch influencers' });
  }
});

// GET /api/accounts/promotion-stats — Track A breakdown by promotion_type
router.get('/promotion-stats', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT promotion_type, COUNT(*) n FROM accounts WHERE track='A' GROUP BY promotion_type`
    );
    const m = { explicit: 0, inferred: 0, none: 0, unknown: 0 };
    rows.forEach(r => { if (r.promotion_type in m) m[r.promotion_type] = Number(r.n); });
    res.json({
      a1:         m.explicit,
      a2:         m.inferred,
      none:       m.none,
      unknown:    m.unknown,
      resolvable: m.none + m.unknown, // candidates for the resolve-unknowns pass
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch promotion stats' });
  }
});

// GET /api/accounts/pr-pages — Track B (ads audience)
router.get('/pr-pages', async (req, res) => {
  try {
    const { rows } = await db.execute(
      `SELECT * FROM accounts WHERE track = 'B' ORDER BY overall DESC LIMIT 1000`
    );
    res.json({ accounts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch PR pages' });
  }
});

// DELETE /api/accounts/cleanup — remove non-relevant accounts
router.delete('/cleanup', async (req, res) => {
  try {
    const preview = await db.execute(
      `SELECT COUNT(*) as n FROM accounts WHERE overall < 20 AND d3 < 15`
    );
    const count = preview.rows[0].n;
    await db.execute(`DELETE FROM accounts WHERE overall < 20 AND d3 < 15`);
    const remaining = await db.execute('SELECT COUNT(*) as n FROM accounts');
    res.json({ deleted: Number(count), remaining: Number(remaining.rows[0].n) });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// DELETE /api/accounts/:handle — delete specific account
router.delete('/:handle', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM accounts WHERE handle = ?', args: [req.params.handle.toLowerCase()] });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete account' });
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

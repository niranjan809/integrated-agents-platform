const express         = require('express');
const { db }          = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const [totals, byType, byTier, byTrack, topAccounts, recentRuns, config] = await Promise.all([
      db.execute(`SELECT COUNT(*) as total,
                         SUM(CASE WHEN dm_open = 1 THEN 1 ELSE 0 END)   as dm_open,
                         SUM(CASE WHEN has_email = 1 THEN 1 ELSE 0 END) as has_email,
                         ROUND(AVG(overall), 1)                          as avg_score
                  FROM accounts`),
      db.execute(`SELECT account_type as type, COUNT(*) as count FROM accounts GROUP BY account_type ORDER BY count DESC`),
      db.execute(`SELECT tier, COUNT(*) as count FROM accounts GROUP BY tier ORDER BY count DESC`),
      db.execute(`SELECT track, COUNT(*) as count FROM accounts WHERE track IS NOT NULL GROUP BY track`),
      db.execute(`SELECT handle, name, avatar, tier, account_type, overall, followers FROM accounts ORDER BY overall DESC LIMIT 10`),
      db.execute(`SELECT id, started_at, completed_at, accounts_added, duplicates_skipped, status, triggered_by
                  FROM runs ORDER BY started_at DESC LIMIT 10`),
      db.execute(`SELECT key, value FROM agent_config`),
    ]);

    const configMap = {};
    const SENSITIVE = ['key', 'token', 'secret', 'password'];
    for (const row of config.rows) {
      if (SENSITIVE.some(s => row.key.toLowerCase().includes(s))) continue;
      configMap[row.key] = row.value;
    }

    res.json({
      totals:       totals.rows[0],
      byType:       byType.rows,
      byTier:       byTier.rows,
      byTrack:      byTrack.rows,
      topAccounts:  topAccounts.rows,
      recentRuns:   recentRuns.rows,
      config:       configMap,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

// GET /api/dashboard/runs
router.get('/runs', async (req, res) => {
  try {
    const { rows } = await db.execute(
      'SELECT * FROM runs ORDER BY started_at DESC LIMIT 50'
    );
    res.json({ runs: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

module.exports = router;

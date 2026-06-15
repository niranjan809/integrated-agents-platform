const express         = require('express');
const { db }          = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Keep in sync with thresholds in server.js
const GENUINE_THRESHOLD = 60;
const REPOST_THRESHOLD  = Math.max(1, Math.min(100, Number(process.env.REPOST_THRESHOLD) || 60));

// Which bucket an account falls into. Reposters/amplifiers are pulled out FIRST so
// they never dilute A1/A2 (their own section instead).
function bucketOf(a) {
  if (a.repost_ratio != null && a.repost_ratio >= REPOST_THRESHOLD) return 'reposters';
  if (a.track === 'B') return 'trackB';
  if (a.promotion_type === 'explicit') return 'a1';
  if (a.promotion_type === 'inferred') {
    if (a.authenticity_score == null)            return 'a2_unscored';
    return a.authenticity_score >= GENUINE_THRESHOLD ? 'a2_genuine' : 'a2_salesy';
  }
  return 'other'; // Track A but none/unknown
}

const emptyBuckets = () => ({ a1: [], a2_genuine: [], a2_salesy: [], a2_unscored: [], reposters: [], trackB: [], other: [] });
function parseKeywords(raw) { try { const a = JSON.parse(raw); return Array.isArray(a) ? a : []; } catch { return []; } }

// ── GET /api/tasks — list all tasks with per-bucket counts ───────────────────
router.get('/', async (req, res) => {
  try {
    const { rows: tasks } = await db.execute(`SELECT * FROM tasks ORDER BY id DESC`);
    // `nr` = "not a reposter" guard so amplifiers only count in the reposters bucket
    const nr = `(a.repost_ratio IS NULL OR a.repost_ratio < ${REPOST_THRESHOLD})`;
    const { rows: counts } = await db.execute(`
      SELECT ta.task_id,
        SUM(CASE WHEN a.repost_ratio >= ${REPOST_THRESHOLD} THEN 1 ELSE 0 END) reposters,
        SUM(CASE WHEN ${nr} AND a.track='A' AND a.promotion_type='explicit' THEN 1 ELSE 0 END) a1,
        SUM(CASE WHEN ${nr} AND a.track='A' AND a.promotion_type='inferred' AND a.authenticity_score >= ${GENUINE_THRESHOLD} THEN 1 ELSE 0 END) a2_genuine,
        SUM(CASE WHEN ${nr} AND a.track='A' AND a.promotion_type='inferred' AND a.authenticity_score IS NOT NULL AND a.authenticity_score < ${GENUINE_THRESHOLD} THEN 1 ELSE 0 END) a2_salesy,
        SUM(CASE WHEN ${nr} AND a.track='A' AND a.promotion_type='inferred' AND a.authenticity_score IS NULL THEN 1 ELSE 0 END) a2_unscored,
        SUM(CASE WHEN ${nr} AND a.track='B' THEN 1 ELSE 0 END) trackB,
        COUNT(*) total
      FROM task_accounts ta JOIN accounts a ON a.handle = ta.handle
      GROUP BY ta.task_id`);
    const cmap = {};
    for (const c of counts) cmap[c.task_id] = c;
    res.json({
      tasks: tasks.map(t => {
        const c = cmap[t.id] || {};
        return {
          ...t,
          keywords: parseKeywords(t.keywords),
          counts: {
            a1: Number(c.a1)||0, a2_genuine: Number(c.a2_genuine)||0, a2_salesy: Number(c.a2_salesy)||0,
            a2_unscored: Number(c.a2_unscored)||0, reposters: Number(c.reposters)||0,
            trackB: Number(c.trackB)||0, total: Number(c.total)||0,
          },
        };
      }),
    });
  } catch (err) { console.error('tasks list error:', err); res.status(500).json({ error: 'Failed to load tasks' }); }
});

// ── POST /api/tasks — create a task ──────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const name    = (req.body?.name || '').toString().trim();
    const company = (req.body?.company || '').toString().trim();
    let keywords  = req.body?.keywords;
    if (typeof keywords === 'string') keywords = keywords.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(keywords)) keywords = [];
    keywords = [...new Set(keywords.map(k => k.toLowerCase().trim()).filter(Boolean))].slice(0, 60);
    if (!name)            return res.status(400).json({ error: 'Task name is required' });
    if (!keywords.length) return res.status(400).json({ error: 'At least one keyword is required' });

    const r = await db.execute({
      sql:  `INSERT INTO tasks (name, company, keywords) VALUES (?, ?, ?)`,
      args: [name, company || null, JSON.stringify(keywords)],
    });
    res.json({ ok: true, id: Number(r.lastInsertRowid), name, company, keywords });
  } catch (err) { console.error('task create error:', err); res.status(500).json({ error: 'Failed to create task' }); }
});

// ── GET /api/tasks/:id — task detail + accounts grouped into buckets ─────────
router.get('/:id', async (req, res) => {
  try {
    const { rows: trows } = await db.execute({ sql: `SELECT * FROM tasks WHERE id = ?`, args: [req.params.id] });
    if (!trows.length) return res.status(404).json({ error: 'Task not found' });
    const task = { ...trows[0], keywords: parseKeywords(trows[0].keywords) };

    const { rows: accounts } = await db.execute({
      sql: `SELECT a.handle, a.name, a.bio, a.avatar, a.followers, a.verified, a.tier, a.account_type, a.track,
                   a.overall, a.d2, a.d3, a.d4, a.d5, a.dm_open, a.has_email, a.contact_email, a.website,
                   a.promotion_type, a.promotion_confidence, a.authenticity_score, a.authenticity_reason, a.authenticity_example,
                   a.repost_ratio, ta.added_at
            FROM task_accounts ta JOIN accounts a ON a.handle = ta.handle
            WHERE ta.task_id = ?
            ORDER BY CASE a.promotion_type WHEN 'explicit' THEN 0 WHEN 'inferred' THEN 1 ELSE 2 END,
                     COALESCE(a.authenticity_score, -1) DESC, a.overall DESC`,
      args: [req.params.id],
    });

    const buckets = emptyBuckets();
    for (const a of accounts) buckets[bucketOf(a)].push(a);
    const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
    counts.total = accounts.length;

    res.json({ task, buckets, counts });
  } catch (err) { console.error('task detail error:', err); res.status(500).json({ error: 'Failed to load task' }); }
});

// ── DELETE /api/tasks/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: `DELETE FROM task_accounts WHERE task_id = ?`, args: [req.params.id] });
    await db.execute({ sql: `DELETE FROM tasks WHERE id = ?`, args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) { console.error('task delete error:', err); res.status(500).json({ error: 'Failed to delete task' }); }
});

module.exports = router;

// Read-only API over the friend's (KA017) Turso DB — surfaces his market-intel
// agent inside our UI. All endpoints are SELECT-only; we never write to his DB.
const express         = require('express');
const { requireAuth } = require('../middleware/auth');
const { kaDb }        = require('../kaDb');

const router = express.Router();
router.use(requireAuth);

// Guard: every route needs the friend's DB configured
function needDb(res) {
  if (!kaDb) {
    res.json({ configured: false,
      message: 'KA017 (friend\'s) database not connected. Set KA_TURSO_URL + KA_TURSO_TOKEN in the backend env.' });
    return false;
  }
  return true;
}
const num = (rows, i = 0, k = 'n') => Number(rows?.[i]?.[k]) || 0;

// GET /api/ka/overview — headline counts across his pipeline
router.get('/overview', async (req, res) => {
  if (!needDb(res)) return;
  try {
    const [tweets, classified, builders, promoTiers, repLabels, lastRun, cost] = await Promise.all([
      kaDb.execute(`SELECT COUNT(*) n FROM scraped_tweets`),
      kaDb.execute(`SELECT COUNT(*) n FROM scraped_tweets WHERE status='CLASSIFIED'`),
      kaDb.execute(`SELECT COUNT(*) n FROM scraped_tweets WHERE is_builder=1`),
      kaDb.execute(`SELECT tier, COUNT(*) n FROM useful_promoters GROUP BY tier`),
      kaDb.execute(`SELECT reputation_label label, COUNT(*) n FROM author_reputation GROUP BY reputation_label`),
      kaDb.execute(`SELECT started_at, ended_at, status, triggered_by, calls_used, records_new FROM agent_runs ORDER BY id DESC LIMIT 1`),
      kaDb.execute(`SELECT ROUND(SUM(estimated_cost_usd),3) c FROM llm_costs WHERE called_at >= datetime('now','-30 days')`),
    ]);
    const tiers = { high: 0, medium: 0, low: 0 };
    promoTiers.rows.forEach(r => { if (r.tier in tiers) tiers[r.tier] = Number(r.n); });
    const promotersTotal = tiers.high + tiers.medium + tiers.low;
    const labels = {};
    repLabels.rows.forEach(r => { labels[r.label || 'unknown'] = Number(r.n); });
    res.json({
      configured: true,
      tweets: num(tweets.rows), classified: num(classified.rows), builders: num(builders.rows),
      promoters: { total: promotersTotal, ...tiers },
      reputation: labels,
      lastRun: lastRun.rows[0] || null,
      llmCost30d: Number(cost.rows?.[0]?.c) || 0,
    });
  } catch (err) { res.status(500).json({ configured: true, error: err.message }); }
});

// GET /api/ka/promoters — his "useful_promoters" + reputation overlay (most relevant to us)
router.get('/promoters', async (req, res) => {
  if (!needDb(res)) return;
  try {
    const { rows } = await kaDb.execute(`
      SELECT up.author_handle, up.author_followers, up.matched_class, up.promotion_kind,
             up.tier, up.added_at, ar.reputation_label, ar.promotional_ratio, ar.total_tweets,
             ar.marketing_count
      FROM useful_promoters up
      LEFT JOIN author_reputation ar ON ar.author_handle = up.author_handle
      ORDER BY CASE up.tier WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
               up.author_followers DESC
      LIMIT 1000`);
    res.json({ configured: true, promoters: rows });
  } catch (err) { res.status(500).json({ configured: true, error: err.message }); }
});

// GET /api/ka/signals — recent high-relevance classified tweets (his signal feed)
router.get('/signals', async (req, res) => {
  if (!needDb(res)) return;
  try {
    const { rows } = await kaDb.execute(`
      SELECT tweet_id, author_handle, author_followers, text, confirmed_class, intent_signal,
             quality_score, relevance_score, summary_one_line, competitor_mentioned, classified_at
      FROM scraped_tweets
      WHERE status='CLASSIFIED' AND confirmed_class != 'NOISE'
      ORDER BY classified_at DESC LIMIT 100`);
    res.json({ configured: true, signals: rows });
  } catch (err) { res.status(500).json({ configured: true, error: err.message }); }
});

// GET /api/ka/drafts — drafted posts for @KiteAI's own account
router.get('/drafts', async (req, res) => {
  if (!needDb(res)) return;
  try {
    const { rows } = await kaDb.execute(`
      SELECT theme_id, theme_class, summary, draft_post, draft_format, draft_rationale,
             tweet_count, status, created_at, posted_url
      FROM content_themes ORDER BY created_at DESC LIMIT 100`);
    res.json({ configured: true, drafts: rows });
  } catch (err) { res.status(500).json({ configured: true, error: err.message }); }
});

// GET /api/ka/runs — his recent agent runs
router.get('/runs', async (req, res) => {
  if (!needDb(res)) return;
  try {
    const { rows } = await kaDb.execute(`
      SELECT id, started_at, ended_at, status, triggered_by, calls_used, records_new, records_updated
      FROM agent_runs ORDER BY id DESC LIMIT 25`);
    res.json({ configured: true, runs: rows });
  } catch (err) { res.status(500).json({ configured: true, error: err.message }); }
});

module.exports = router;

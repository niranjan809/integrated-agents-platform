const express         = require('express');
const axios           = require('axios');
const { db }          = require('../db');
const { requireAuth } = require('../middleware/auth');
const { classifyFromBio, buildTweetAnalysisPrompt } = require('../promotionClassifier');
const { callOpenRouter } = require('../openrouter');

const router = express.Router();
router.use(requireAuth);

// GET /api/accounts — all accounts with filters
router.get('/', async (req, res) => {
  const limitRaw = parseInt(req.query.limit, 10);
  const offsetRaw = parseInt(req.query.offset, 10);
  const limit = isNaN(limitRaw) ? 1000 : Math.min(limitRaw, 5000);
  const offset = isNaN(offsetRaw) ? 0 : offsetRaw;
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

// GET /api/accounts/classify-unknown — SSE stream: fetch tweets + AI classify unknown Track A accounts
router.get('/classify-unknown', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('retry: 0\n\n');
  res.flushHeaders();

  const emit = (event, data) => { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const apiKey  = process.env.RAPIDAPI_KEY_PAID;
  const apiHost = process.env.RAPIDAPI_HOST || 'twitter241.p.rapidapi.com';
  const DELAY   = 22000; // 3 RPM

  try {
    const { rows } = await db.execute(
      `SELECT handle, name, bio, account_type, followers FROM accounts
       WHERE track='A' AND (promotion_type='unknown' OR promotion_type IS NULL)
       ORDER BY overall DESC LIMIT 200` // cap at 200 per session
    );

    emit('start', { total: rows.length, message: `Classifying ${rows.length} unknown Track A accounts via tweet analysis` });

    let a1=0, a2=0, skip=0;

    for (let i = 0; i < rows.length; i++) {
      const a = rows[i];

      // First try bio (free)
      const bioResult = classifyFromBio(a.bio, a.name, a.account_type);
      if (bioResult && bioResult.promotion_type !== 'unknown' && !bioResult.needs_tweet_check) {
        await db.execute({ sql:`UPDATE accounts SET promotion_type=?,promotion_confidence=?,promotion_signals=? WHERE handle=?`,
          args:[bioResult.promotion_type, bioResult.promotion_confidence, JSON.stringify(bioResult.promotion_signals||[]), a.handle] });
        if (bioResult.promotion_type==='explicit') a1++; else skip++;
        emit('progress', { current: i+1, total: rows.length, handle: a.handle, result: bioResult.promotion_type, a1, a2 });
        continue;
      }

      // Rate limit gap
      if (i > 0) await sleep(DELAY);

      // Fetch tweets
      emit('progress', { current: i+1, total: rows.length, handle: a.handle, result: 'fetching_tweets', a1, a2 });
      let tweets = [];
      try {
        const resp = await axios.get(`https://${apiHost}/search`, {
          params: { query: `from:${a.handle}`, count: 10, type: 'Latest' },
          headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': apiHost },
          timeout: 15000,
        });
        const instructions = resp.data?.result?.timeline?.instructions || [];
        const entries = (instructions.find(i => i.type === 'TimelineAddEntries')?.entries || []);
        for (const e of entries) {
          try { const t = e.content?.itemContent?.tweet_results?.result?.legacy?.full_text;
            if (t && !t.startsWith('RT @')) tweets.push(t.slice(0, 200)); } catch {}
        }
      } catch {}

      if (!tweets.length && (!bioResult || bioResult.promotion_type === 'unknown')) {
        skip++;
        emit('progress', { current: i+1, total: rows.length, handle: a.handle, result: 'no_tweets', a1, a2 });
        continue;
      }

      // AI analysis
      const prompt = buildTweetAnalysisPrompt(a.handle, a.bio, tweets);
      const aiRes = await callOpenRouter([{ role:'user', content: prompt }], { maxTokens: 200, temperature: 0.1 });

      let result = bioResult || { promotion_type:'unknown', promotion_confidence:0, promotion_signals:[] };
      if (aiRes.success) {
        try {
          const parsed = JSON.parse(aiRes.content.replace(/```json|```/g,'').trim());
          const aiType = ['explicit','inferred','none'].includes(parsed.promotion_type) ? parsed.promotion_type : 'unknown';
          // Upgrade: if bio says inferred and tweets say explicit → explicit
          if (result.promotion_type==='inferred' && aiType==='explicit') result.promotion_type='explicit';
          else if (aiType !== 'unknown') result.promotion_type = aiType;
          result.promotion_confidence = Math.max(result.promotion_confidence, Number(parsed.confidence)||0);
          result.promotion_signals    = [...(result.promotion_signals||[]), ...(parsed.signals||[])].slice(0,3);
        } catch {}
      }

      if (result.promotion_type !== 'unknown') {
        await db.execute({ sql:`UPDATE accounts SET promotion_type=?,promotion_confidence=?,promotion_signals=? WHERE handle=?`,
          args:[result.promotion_type, result.promotion_confidence, JSON.stringify(result.promotion_signals||[]), a.handle] });
        if (result.promotion_type==='explicit') a1++;
        else if (result.promotion_type==='inferred') a2++;
        else skip++;
      } else { skip++; }

      emit('progress', { current: i+1, total: rows.length, handle: a.handle, result: result.promotion_type, a1, a2 });
    }

    emit('complete', { a1, a2, skip, total: rows.length,
      message: `Done — ${a1} A1 confirmed, ${a2} A2 likely, ${skip} still unknown` });
  } catch (err) {
    emit('error', { message: err.message });
  }
  res.end();
});

// DELETE /api/accounts/cleanup — remove non-relevant accounts
// Criteria: overall < 20 AND d3 < 15 (no AI relevance + very low overall)
router.delete('/cleanup', async (req, res) => {
  try {
    const preview = await db.execute(
      `SELECT COUNT(*) as n FROM accounts WHERE overall < 20 AND d3 < 15`
    );
    const count = preview.rows[0].n;
    await db.execute(
      `DELETE FROM accounts WHERE overall < 20 AND d3 < 15`
    );
    const remaining = await db.execute('SELECT COUNT(*) as n FROM accounts');
    res.json({ deleted: Number(count), remaining: Number(remaining.rows[0].n) });
  } catch (err) {
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// DELETE /api/accounts/:handle — delete a specific account
router.delete('/:handle', async (req, res) => {
  try {
    await db.execute({
      sql:  'DELETE FROM accounts WHERE handle = ?',
      args: [req.params.handle.toLowerCase()],
    });
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

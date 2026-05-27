require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS — restrictive in production, open in dev ───────────────────────────
const rawOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    // No origin = curl / Postman / server-to-server — allow
    if (!origin) return cb(null, true);
    // No restriction configured = dev mode, allow all
    if (rawOrigins.length === 0) return cb(null, true);
    // Check allow-list
    if (rawOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" not in ALLOWED_ORIGINS`));
  },
  credentials: true,
}));
app.use(express.json());

const RAPIDAPI_KEY  = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST;
const BASE_URL      = `https://${RAPIDAPI_HOST}`;
const DELAY_MS      = 3000; // 3 s anti-blocking gap between calls

const HEADERS = {
  'X-RapidAPI-Key':  RAPIDAPI_KEY,
  'X-RapidAPI-Host': RAPIDAPI_HOST,
  'Content-Type':    'application/json',
};

// ── Raw API call ────────────────────────────────────────────────────────────
async function callAPI(endpoint, params = {}) {
  const start = Date.now();
  try {
    const resp = await axios.get(`${BASE_URL}/${endpoint}`, {
      params, headers: HEADERS, timeout: 12000,
    });
    return { success: true, data: resp.data, status: resp.status, duration_ms: Date.now() - start };
  } catch (err) {
    return {
      success: false,
      error:   err.response?.data || err.message,
      status:  err.response?.status || 0,
      duration_ms: Date.now() - start,
    };
  }
}

// ── Health calculator ───────────────────────────────────────────────────────
function calcHealth(calls, successes, errors, totalMs, flags) {
  const avgMs       = calls > 0 ? Math.round(totalMs / calls) : 0;
  const successRate = calls > 0 ? Math.round((successes / calls) * 100) : 100;

  let status, strength, color;
  if (flags.blocked)      { status = 'BLOCKED';      strength = 0; color = '#FF4444'; }
  else if (flags.limited) { status = 'RATE LIMITED'; strength = 1; color = '#FF6030'; }
  else if (avgMs > 4000)  { status = 'VERY SLOW';    strength = 2; color = '#FF8C42'; }
  else if (avgMs > 2000)  { status = 'SLOW';         strength = 3; color = '#F9A825'; }
  else if (avgMs > 1200)  { status = 'GOOD';         strength = 4; color = '#70C8FF'; }
  else                    { status = 'EXCELLENT';     strength = 5; color = '#00C896'; }

  return { status, strength, color, avgMs, successRate, calls, successes, errors };
}

// ── Score & Classify each account ──────────────────────────────────────────
function scoreAndClassify(u) {
  const bio      = (u.desc  || '').toLowerCase();
  const name     = (u.name  || '').toLowerCase();
  const followers = Number(u.sub_count) || 0;
  const following = Number(u.friends)   || 1;
  const ratio     = followers / Math.max(following, 1);

  // ─ D3: AI Content Relevance (bio + name keywords) ────────────────
  const aiKw = [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt',
    'voice', 'speech', 'nlp', 'deep learning', 'developer', 'engineer', 'founder',
    'startup', 'saas', 'api', 'tech', 'software', 'product', 'build', 'creator',
    'conversational', 'chatbot', 'language model', 'generative',
  ];
  const aiHits = aiKw.filter(k => bio.includes(k) || name.includes(k)).length;
  const d3 = Math.min(95, aiHits * 13 + (bio.length > 30 ? 8 : 0));

  // ─ D4: X Authority Signals ────────────────────────────────────────
  const d4 = Math.min(95,
    (u.blue_verified ? 30 : 0) +
    (ratio >= 30 ? 35 : ratio >= 10 ? 22 : ratio >= 3 ? 12 : 0) +
    (followers >= 100000 ? 30 : followers >= 10000 ? 20 : followers >= 1000 ? 10 : 0)
  );

  // ─ D5: Reach Quality ──────────────────────────────────────────────
  const d5 = followers >= 500000 ? 95
    : followers >= 100000 ? 80
    : followers >= 10000  ? 60
    : followers >= 1000   ? 40
    : followers >= 500    ? 25 : 10;

  // ─ D2: Collab / Outreach Evidence ─────────────────────────────────
  const collabKw = [
    'dm open', 'dms open', 'dm for', 'collab', 'partnership', 'partner',
    'business inquir', 'media kit', 'contact', 'open to', 'work with', 'available for',
  ];
  const collabHit = collabKw.some(k => bio.includes(k));
  const d2 = collabHit ? 82 : (u.website ? 50 : 18);

  // ─ Overall (D1 excluded — needs timeline fetch) ────────────────────
  const overall = Math.round(d2 * 0.25 + d3 * 0.25 + d4 * 0.20 + d5 * 0.30);

  // ─ Type classification ─────────────────────────────────────────────
  const prKw = [
    'official', ' hq', ' team', 'news', 'daily', 'media', 'press',
    'brand', 'product', 'inc', 'corp', 'comms', 'marketing', 'agency',
    'newsletter', 'digest', 'insider', 'hub',
  ];
  const inflKw = [
    'founder', 'ceo', 'cto', 'coo', 'engineer', 'developer', 'researcher',
    'writer', 'investor', 'creator', 'building', 'blogger', 'author', 'speaker',
    'thought leader',
  ];
  const aiPageKw = [
    'ai news', 'ai daily', 'ai insider', 'ai hub', 'ai tools', 'ai weekly',
    'llm news', 'gpt', 'ai digest', 'ai update',
  ];

  const prScore   = prKw.filter(k => bio.includes(k) || name.includes(k)).length;
  const inflScore = inflKw.filter(k => bio.includes(k)).length;
  const aiPageHit = aiPageKw.some(k => name.includes(k));

  let type;
  if      (aiPageHit)                          type = 'AI Media';
  else if (prScore > inflScore && prScore > 0) type = 'PR Page';
  else if (inflScore >= 2)                     type = 'Influencer';
  else if (inflScore >= 1 && ratio >= 5)       type = 'Influencer';
  else if (ratio >= 15)                        type = 'Influencer';
  else if (ratio <= 1.5 && followers >= 1000)  type = 'Brand Page';
  else                                         type = 'Account';

  // ─ Outreach readiness ──────────────────────────────────────────────
  const dmOpen   = bio.includes('dm') || bio.includes('dms open');
  const hasEmail = bio.includes('@') && bio.includes('.') && !bio.includes('twitter') && !bio.includes('x.com');

  return {
    d2: Math.round(d2), d3: Math.round(d3), d4: Math.round(d4), d5: Math.round(d5),
    overall, type, dmOpen, hasEmail,
  };
}

// ── SSE helper ──────────────────────────────────────────────────────────────
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════════
// MAIN AGENT RUN — SSE streaming
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/run-demo', async (req, res) => {
  const { query = 'AI voice developer' } = req.query;

  // SSE headers
  res.setHeader('Content-Type',        'text/event-stream');
  res.setHeader('Cache-Control',       'no-cache');
  res.setHeader('Connection',          'keep-alive');
  res.setHeader('X-Accel-Buffering',   'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const health = { calls: 0, successes: 0, errors: 0, totalMs: 0, flags: {} };
  const durations = [];

  const sendHealth = () => sse(res, 'health', {
    ...calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
    durations: [...durations],
  });

  // ── STEP 1: Search ────────────────────────────────────────────────────────
  sse(res, 'status', { step: 'search', message: `Searching X for: "${query}"`, progress: 0 });

  const searchRes = await callAPI('search.php', { query, count: 50 });
  health.calls++; health.totalMs += searchRes.duration_ms;
  durations.push(searchRes.duration_ms);

  if (!searchRes.success) {
    const s = searchRes.status;
    if (s === 429) health.flags.limited = true;
    if (s === 403) health.flags.blocked = true;
    health.errors++;
    sendHealth();
    sse(res, 'error', {
      step: 'search', message: 'Search API call failed', status: s,
      detail: typeof searchRes.error === 'object' ? searchRes.error : { message: searchRes.error },
      health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
    });
    res.end();
    return;
  }
  health.successes++;

  const tweets  = searchRes.data?.timeline || [];
  const seen    = new Set();
  const handles = [];
  for (const t of tweets) {
    const h = t.screen_name || t.author?.screen_name;
    if (h && !seen.has(h.toLowerCase())) { seen.add(h.toLowerCase()); handles.push(h); }
  }
  const targets = handles.slice(0, 10);

  sse(res, 'search_done', {
    query, found: handles.length, fetching: targets.length, handles: targets,
    tweets_returned: tweets.length, duration_ms: searchRes.duration_ms,
  });
  sendHealth();

  if (targets.length === 0) {
    sse(res, 'complete', { fetched: 0, errors: 0, total: 0, message: 'No accounts found.' });
    res.end();
    return;
  }

  // ── STEP 2: Fetch each account ────────────────────────────────────────────
  const accounts = [];

  for (let i = 0; i < targets.length; i++) {
    const handle = targets[i];

    if (i > 0) {
      sse(res, 'status', {
        step: 'delay',
        message: `Anti-block delay 3s before @${handle}…`,
        progress: Math.round((i / targets.length) * 100),
        current: i, total: targets.length,
      });
      await sleep(DELAY_MS);
    }

    sse(res, 'status', {
      step: 'fetching',
      message: `Fetching @${handle}`,
      progress: Math.round((i / targets.length) * 100),
      current: i + 1, total: targets.length,
    });

    const r = await callAPI('screenname.php', { screenname: handle });
    health.calls++; health.totalMs += r.duration_ms;
    durations.push(r.duration_ms);

    if (r.success) {
      health.successes++;
      const u   = r.data;
      const sc  = scoreAndClassify(u);          // scoring & classification

      const account = {
        index: i + 1, total: targets.length,
        handle,
        name:        u.name    || handle,
        screen_name: u.profile || handle,
        bio:         u.desc    || '',
        followers:   u.sub_count,
        following:   u.friends,
        tweets:      u.statuses_count,
        verified:    u.blue_verified || false,
        avatar:      u.avatar   || '',
        website:     u.website  || '',
        location:    u.location || '',
        created_at:  u.created_at || '',
        duration_ms: r.duration_ms,
        // tier
        tier:
          u.sub_count >= 500000 ? 'Macro'
          : u.sub_count >= 100000 ? 'Mid-Tier'
          : u.sub_count >= 10000  ? 'Micro'
          : u.sub_count >= 500    ? 'Nano'
          : 'Below bar',
        ratio: u.sub_count && u.friends
          ? (u.sub_count / Math.max(u.friends, 1)).toFixed(2) : null,
        pass_min_bar: u.sub_count >= 500 && !!u.desc,
        // scores + classification
        type:     sc.type,
        d2:       sc.d2,
        d3:       sc.d3,
        d4:       sc.d4,
        d5:       sc.d5,
        overall:  sc.overall,
        dmOpen:   sc.dmOpen,
        hasEmail: sc.hasEmail,
      };

      accounts.push(account);
      sse(res, 'account', {
        account,
        health:    calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
        durations: [...durations],
      });
    } else {
      health.errors++;
      if (r.status === 429) health.flags.limited = true;
      if (r.status === 403) health.flags.blocked = true;
      sse(res, 'fetch_error', {
        handle, index: i + 1, total: targets.length,
        status: r.status, error: r.error,
        health:    calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
        durations: [...durations],
      });
    }
    sendHealth();
  }

  sse(res, 'complete', {
    fetched: accounts.length, errors: health.errors, total: targets.length,
    health:    calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
    durations: [...durations],
  });
  res.end();
});

// ── Individual test endpoints ───────────────────────────────────────────────
const endpointMap = {
  user:      (q) => callAPI('screenname.php',    { screenname: q.handle }),
  search:    (q) => callAPI('search.php',         { query: q.query, count: q.count || 20 }),
  timeline:  (q) => callAPI('timeline.php',       { screenname: q.handle }),
  following: (q) => callAPI('following.php',      { screenname: q.handle }),
  followers: (q) => callAPI('followers.php',      { screenname: q.handle }),
  community: (q) => callAPI('community_info.php', { community_id: q.community_id }),
  trends:    ()  => callAPI('trends.php',         {}),
};
Object.entries(endpointMap).forEach(([name, fn]) => {
  app.get(`/api/${name}`, async (req, res) => res.json(await fn(req.query)));
});

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', key_set: !!RAPIDAPI_KEY, host: RAPIDAPI_HOST });
});

app.listen(PORT, () => {
  console.log(`\n  KiteAI Agent Demo — Backend`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  RapidAPI key: ${RAPIDAPI_KEY ? RAPIDAPI_KEY.slice(0, 10) + '...' : 'NOT SET'}\n`);
});

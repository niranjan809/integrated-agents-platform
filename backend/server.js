require('dotenv').config();
const express      = require('express');
const axios        = require('axios');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cron         = require('node-cron');
const { db, initDB } = require('./db');
const { aiScoreBatch, BATCH_SIZE, SCORING_MODEL } = require('./openrouter');
const { getFriendSearchQueries, getFriendInfluencerHandles, testFriendDb } = require('./friendDb');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security headers (API-safe — disable browser-only policies) ──────────────
app.use(helmet({
  crossOriginResourcePolicy:   { policy: 'cross-origin' },
  crossOriginEmbedderPolicy:   false,
  contentSecurityPolicy:       false,
}));

// ── CORS — JWT is in Authorization header so no credentials mode needed ───────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl / Render health checks
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow all Vercel preview deployments (*.vercel.app)
    if (/^https:\/\/[a-z0-9-]+(\.vercel\.app)$/.test(origin)) return cb(null, true);
    cb(new Error(`CORS not allowed for origin: ${origin}`));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle OPTIONS preflight explicitly so rate-limiter doesn't block it
app.options('*', cors());
app.use(express.json());

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true }));
app.use('/api',      rateLimit({ windowMs: 1 * 60 * 1000,  max: 120, standardHeaders: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/keywords',  require('./routes/keywords'));
app.use('/api/accounts',  require('./routes/accounts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings',  require('./routes/settings'));

// ═══════════════════════════════════════════════════════════════════════════
// PROACTIVE RATE LIMITER — prevents blocks before they happen
//
// Strategy: each key is allowed SAFE_RPM requests per minute.
// Before every request we calculate the earliest time that key can fire
// without exceeding that rate, then sleep until then (+ random jitter).
// This means we NEVER fire faster than the safe rate — no 429s.
//
// With 2 keys at 6 RPM each → 12 RPM combined → ~5s between requests total.
// ═══════════════════════════════════════════════════════════════════════════
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'twitter-api45.p.rapidapi.com';
const BASE_URL      = `https://${RAPIDAPI_HOST}`;

const SAFE_RPM  = 6;     // requests-per-minute per key
const JITTER_MS = 1200;  // ±600ms random spread

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter()  { return Math.floor(Math.random() * JITTER_MS) - JITTER_MS / 2; }

const KEYS = [
  process.env.RAPIDAPI_KEY,
  process.env.RAPIDAPI_KEY_BACKUP,
].filter(Boolean).map((key, i) => ({
  key,
  label:             `Key${i + 1}`,
  rpm:               SAFE_RPM,
  minGapMs:          Math.ceil(60_000 / SAFE_RPM),
  lastFiredAt:       0,
  cooldownUntil:     0,
  disabled:          false,
  consecutiveErrors: 0,
  requests:          0,
}));

// Returns the key that will be ready soonest, sleeping until it is
// Validate keys without burning quota — just format-check then mark as pending.
// Real validation happens on the first actual API call.
function validateKeys() {
  for (const k of KEYS) {
    if (!k.key || k.key.length < 20) {
      k.disabled = true;
      console.log(`  ${k.label}: ✗ disabled — key missing or invalid format`);
    } else {
      console.log(`  ${k.label}: ✓ configured (will test on first use)`);
    }
  }
  console.log(`  Keys configured: ${KEYS.filter(k => !k.disabled).map(k => k.label).join(', ')}`);
}

// Track global consecutive 429s — 3+ in a row = daily quota exhausted
let globalConsecutive429 = 0;
const QUOTA_EXHAUSTED_THRESHOLD = 3;

// Throws a special error when quota is exhausted so the run can stop gracefully
class QuotaExhaustedError extends Error {
  constructor(msg) { super(msg); this.name = 'QuotaExhaustedError'; }
}

// Sleep in 8-second chunks, sending SSE keepalive pings so browser
// doesn't close the idle EventSource connection during long rate-limit waits
async function sleepWithPing(totalMs, keepAlive) {
  const CHUNK = 8_000;
  let remaining = totalMs;
  while (remaining > 0) {
    const chunk = Math.min(CHUNK, remaining);
    await sleep(chunk);
    remaining -= chunk;
    // Send SSE comment — browser ignores it as data but TCP stays alive
    if (keepAlive) keepAlive(Math.ceil(remaining / 1000));
  }
}

async function acquireKey(emitStatus, sseKeepAlive) {
  while (true) {
    const now = Date.now();

    // Bail out if ALL non-disabled keys have been 429'd more than threshold
    const activeKeys = KEYS.filter(k => !k.disabled); // disabled = invalid key format only
    if (activeKeys.length === 0) throw new QuotaExhaustedError('All API keys are disabled');
    if (globalConsecutive429 >= QUOTA_EXHAUSTED_THRESHOLD) {
      throw new QuotaExhaustedError(
        `API daily quota exhausted after ${globalConsecutive429} consecutive rate-limits. ` +
        `RapidAPI resets at midnight UTC. Try again tomorrow.`
      );
    }

    const readyAt = KEYS.map(k => {
      if (k.disabled) return Infinity;
      // Each key uses its own minGapMs (paid key = 20s gap, standard = 10s gap)
      return Math.max(k.lastFiredAt + k.minGapMs, k.cooldownUntil);
    });

    const earliest = Math.min(...readyAt);
    const idx      = readyAt.indexOf(earliest);
    const waitMs   = Math.max(0, earliest - now) + Math.max(0, jitter());

    if (waitMs > 500) {
      const waitSec = Math.round(waitMs / 1000);
      if (emitStatus) emitStatus(`Rate pacing — waiting ${waitSec}s (${KEYS[idx].label})`);
      console.log(`[RATE] waiting ${waitSec}s → ${KEYS[idx].label}`);
      // Sleep in chunks — each chunk sends a keepalive ping to the SSE client
      await sleepWithPing(waitMs, (remSec) => {
        if (emitStatus && remSec > 0) emitStatus(`Rate pacing — ${remSec}s remaining`);
        if (sseKeepAlive) sseKeepAlive(); // sends raw SSE comment to keep TCP alive
      });
    }

    const k = KEYS[idx];
    if (Date.now() >= k.cooldownUntil) {
      k.lastFiredAt = Date.now();
      return k;
    }
  }
}

function penalise(k, status) {
  k.consecutiveErrors++;
  if (status === 429) {
    globalConsecutive429++;
    k.cooldownUntil = Date.now() + 75_000;
    console.log(`[RATE] ${k.label} 429 (consecutive: ${globalConsecutive429}) → cooldown 75s`);
  } else if (status === 403) {
    // Not subscribed or forbidden — long cooldown, auto-retry after 1hr
    // Key will re-activate automatically if user subscribes on RapidAPI
    k.cooldownUntil = Date.now() + 3_600_000;
    k.notSubscribed = true;
    console.log(`[RATE] ${k.label} 403 → not subscribed (cooldown 1hr, auto-retries)`);
  } else {
    const backoff = Math.min(120_000, 8_000 * Math.pow(2, k.consecutiveErrors - 1));
    k.cooldownUntil = Date.now() + backoff;
    console.log(`[RATE] ${k.label} ${status} → backoff ${Math.round(backoff / 1000)}s`);
  }
}

function clearErrors(k) {
  globalConsecutive429 = 0; // successful request resets quota counter
  k.consecutiveErrors  = 0;
  k.requests++;
}

async function callAPI(endpoint, params = {}, emitStatus = null, sseKeepAlive = null) {
  const k = await acquireKey(emitStatus, sseKeepAlive);
  const start = Date.now();
  try {
    const resp = await axios.get(`${BASE_URL}/${endpoint}`, {
      params,
      headers: {
        'X-RapidAPI-Key':  k.key,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
        'Content-Type':    'application/json',
      },
      timeout: 20_000,
    });
    clearErrors(k);
    return { success: true, data: resp.data, status: resp.status,
             duration_ms: Date.now() - start, key_label: k.label };
  } catch (err) {
    const status  = err.response?.status || 0;
    const elapsed = Date.now() - start;
    penalise(k, status);

    // On rate-limit or block, immediately try the other key if it's free
    if (status === 429 || status === 403) {
      const other = KEYS.find(x => x !== k && !x.disabled && Date.now() >= x.cooldownUntil);
      if (other) {
        console.log(`[RATE] Immediate retry with ${other.label}`);
        await sleep(800 + Math.max(0, jitter()));
        try {
          const resp2 = await axios.get(`${BASE_URL}/${endpoint}`, {
            params,
            headers: { 'X-RapidAPI-Key': other.key, 'X-RapidAPI-Host': RAPIDAPI_HOST, 'Content-Type': 'application/json' },
            timeout: 20_000,
          });
          other.lastFiredAt = Date.now();
          clearErrors(other);
          return { success: true, data: resp2.data, status: resp2.status,
                   duration_ms: Date.now() - start, key_label: other.label };
        } catch (e2) {
          penalise(other, e2.response?.status || 0);
        }
      }
    }
    return { success: false, error: err.response?.data || err.message,
             status, duration_ms: elapsed, key_label: k.label };
  }
}

function keyStats() {
  const now = Date.now();
  return KEYS.map(k => {
    const cooldownSec = Math.max(0, Math.round((k.cooldownUntil - now) / 1000));
    const status = k.disabled          ? 'invalid'
                 : k.notSubscribed && cooldownSec > 0 ? 'not_subscribed'
                 : cooldownSec > 0     ? 'cooldown'
                 :                       'ready';
    return {
      label:        k.label,
      requests:     k.requests,
      status,
      available:    !k.disabled && cooldownSec === 0,
      cooldown_sec: cooldownSec,
      rpm_limit:    k.rpm,
    };
  });
}

// ── Scoring & classification ──────────────────────────────────────────────────
function scoreAndClassify(u) {
  const bio      = (u.desc  || '').toLowerCase();
  const name     = (u.name  || '').toLowerCase();
  const followers = Number(u.sub_count) || 0;
  const following = Number(u.friends)   || 1;
  const ratio     = followers / Math.max(following, 1);

  const aiKw = [
    'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt',
    'voice', 'speech', 'nlp', 'deep learning', 'developer', 'engineer', 'founder',
    'startup', 'saas', 'api', 'tech', 'software', 'product', 'build', 'creator',
    'conversational', 'chatbot', 'language model', 'generative', 'vapi', 'elevenlabs',
  ];
  const aiHits = aiKw.filter(k => bio.includes(k) || name.includes(k)).length;
  const d3 = Math.min(95, aiHits * 12 + (bio.length > 30 ? 8 : 0));

  const d4 = Math.min(95,
    (u.blue_verified ? 30 : 0) +
    (ratio >= 30 ? 35 : ratio >= 10 ? 22 : ratio >= 3 ? 12 : 0) +
    (followers >= 100000 ? 30 : followers >= 10000 ? 20 : followers >= 1000 ? 10 : 0)
  );

  const d5 = followers >= 500000 ? 95
    : followers >= 100000 ? 80
    : followers >= 10000  ? 60
    : followers >= 1000   ? 40
    : followers >= 500    ? 25 : 10;

  const collabKw = ['dm open', 'dms open', 'dm for', 'collab', 'partnership', 'partner',
    'business inquir', 'media kit', 'contact', 'open to', 'work with', 'available for'];
  const collabHit = collabKw.some(k => bio.includes(k));
  const d2 = collabHit ? 82 : (u.website ? 50 : 18);

  const overall = Math.round(d2 * 0.25 + d3 * 0.25 + d4 * 0.20 + d5 * 0.30);

  const prKw   = ['official', ' hq', ' team', 'news', 'daily', 'media', 'press',
    'brand', 'product', 'inc', 'corp', 'comms', 'marketing', 'agency', 'newsletter', 'digest', 'hub'];
  const inflKw = ['founder', 'ceo', 'cto', 'engineer', 'developer', 'researcher',
    'writer', 'investor', 'creator', 'building', 'blogger', 'author', 'speaker'];
  const aiPageKw = ['ai news', 'ai daily', 'ai insider', 'ai hub', 'ai tools', 'ai weekly', 'llm news'];

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

  // Track A = collab pipeline, Track B = ads only
  const track = (type === 'PR Page' || type === 'Brand Page') ? 'B' : 'A';

  const dmOpen   = bio.includes('dm') || bio.includes('dms open');
  const hasEmail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/.test(bio);
  const emailMatch = bio.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);

  return { d2: Math.round(d2), d3: Math.round(d3), d4: Math.round(d4), d5: Math.round(d5),
           overall, type, track, dmOpen, hasEmail, contactEmail: emailMatch ? emailMatch[0] : null };
}

// ── Health calculator ─────────────────────────────────────────────────────────
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
  return { status, strength, color, avgMs, successRate, calls, successes, errors,
           total_keys: KEYS.length };
}

// ── SSE helper ────────────────────────────────────────────────────────────────
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Save account to DB with deduplication ─────────────────────────────────────
async function upsertAccount(account, runId) {
  const { rows } = await db.execute({
    sql: 'SELECT id FROM accounts WHERE handle = ?',
    args: [account.handle.toLowerCase()],
  });
  const isDup = rows.length > 0;

  if (isDup) {
    await db.execute({
      sql: `UPDATE accounts SET name=?, bio=?, followers=?, following=?, tweets=?,
            verified=?, avatar=?, website=?, location=?, tier=?, account_type=?,
            track=?, d2=?, d3=?, d4=?, d5=?, overall=?, dm_open=?, has_email=?,
            contact_email=?, ai_model=?, ai_reason=?, last_updated=datetime('now'), run_id=?
            WHERE handle=?`,
      args: [account.name, account.bio, account.followers, account.following, account.tweets,
             account.verified ? 1 : 0, account.avatar, account.website, account.location,
             account.tier, account.account_type, account.track,
             account.d2, account.d3, account.d4, account.d5, account.overall,
             account.dmOpen ? 1 : 0, account.hasEmail ? 1 : 0,
             account.contactEmail || null, account.ai_model || null, account.ai_reason || null,
             runId, account.handle.toLowerCase()],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO accounts (handle, name, bio, followers, following, tweets, verified,
            avatar, website, location, tier, account_type, track, d2, d3, d4, d5, overall,
            dm_open, has_email, contact_email, ai_model, ai_reason, run_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [account.handle.toLowerCase(), account.name, account.bio,
             account.followers, account.following, account.tweets,
             account.verified ? 1 : 0, account.avatar, account.website, account.location,
             account.tier, account.account_type, account.track,
             account.d2, account.d3, account.d4, account.d5, account.overall,
             account.dmOpen ? 1 : 0, account.hasEmail ? 1 : 0,
             account.contactEmail || null, account.ai_model || null, account.ai_reason || null,
             runId],
    });
  }
  return isDup;
}

// ── Core agent run function (reused by SSE endpoint + cron) ───────────────────
async function runAgent({ queries, directHandles = [], triggeredBy = 'manual', sseRes = null, isAborted = () => false }) {
  const emit = (event, data) => { if (sseRes && !isAborted()) sse(sseRes, event, data); };
  // Pass a status emitter into callAPI so pacing messages reach the UI
  const pace = (msg) => emit('status', { step: 'pacing', message: msg });
  // Sends a raw SSE comment every 8s during rate-limit waits — keeps the
  // browser's EventSource TCP connection alive during long silent periods
  const keepAlive = () => { if (sseRes && !isAborted()) sseRes.write(': ping\n\n'); };

  // Create run record
  const runResult = await db.execute({
    sql:  `INSERT INTO runs (triggered_by, keywords_used, status) VALUES (?, ?, 'running')`,
    args: [triggeredBy, queries.join(', ')],
  });
  const runId = Number(runResult.lastInsertRowid);

  const health   = { calls: 0, successes: 0, errors: 0, totalMs: 0, flags: {} };
  const durations = [];
  let accountsAdded = 0, duplicatesSkipped = 0;
  const seenThisRun = new Set(); // cross-query dedup within this run
  globalConsecutive429 = 0;     // reset quota counter for a fresh run

  const sendHealth = () => emit('health', {
    ...calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
    durations:  [...durations],
    key_stats:  keyStats(),
  });

  try { // catches QuotaExhaustedError from acquireKey
  for (const query of queries) {
    emit('status', { step: 'search', message: `Searching X for: "${query}"`, progress: 0 });

    const searchRes = await callAPI('search.php', { query, count: 50 }, pace, keepAlive);
    health.calls++; health.totalMs += searchRes.duration_ms;
    durations.push(searchRes.duration_ms);

    if (!searchRes.success) {
      const s = searchRes.status;
      if (s === 429) health.flags.limited = true;
      if (s === 403) health.flags.blocked = true;
      health.errors++;
      sendHealth();
      emit('error', { step: 'search', message: `Search failed for "${query}"`, status: s });
      continue;
    }
    health.successes++;

    const tweets  = searchRes.data?.timeline || [];
    const seenQuery = new Set();
    const handles = [];
    for (const t of tweets) {
      const h = t.screen_name || t.author?.screen_name;
      const hl = h?.toLowerCase();
      // Skip duplicates within this query AND duplicates already fetched in this run
      if (hl && !seenQuery.has(hl) && !seenThisRun.has(hl)) {
        seenQuery.add(hl);
        handles.push(h);
      }
    }
    // No hard cap — take all unique handles from this search (up to 50 per query)
    const targets = handles;

    emit('search_done', {
      query, found: handles.length, fetching: targets.length, handles: targets,
      tweets_returned: tweets.length, duration_ms: searchRes.duration_ms,
    });
    sendHealth();

    // ── Phase 1: Fetch all profiles for this query ──────────────────────────
    const fetchedAccounts = []; // { accountBase, sc, isDuplicate }

    for (let i = 0; i < targets.length; i++) {
      if (isAborted()) break;
      const handle = targets[i];
      seenThisRun.add(handle.toLowerCase());

      emit('status', {
        step:    'fetching',
        message: `Fetching @${handle} [${i + 1}/${targets.length}]`,
        progress: Math.round((i / targets.length) * 80), // 0-80% for fetch phase
        current: i + 1, total: targets.length,
        key_stats: keyStats(),
      });

      const r = await callAPI('screenname.php', { screenname: handle }, pace, keepAlive);
      health.calls++; health.totalMs += r.duration_ms;
      durations.push(r.duration_ms);

      if (r.success) {
        health.successes++;
        const u         = r.data;
        const followers = Number(u.sub_count)      || 0;
        const tweets    = Number(u.statuses_count) || 0;
        const name      = (u.name || '').trim();
        const bio       = (u.desc || '').trim();

        // ── Minimum bar — discard invalid/bot/empty profiles ──────────────
        // These checks happen before scoring to save AI quota on junk accounts
        const skipReason =
          followers < 100                    ? `only ${followers} followers` :
          tweets    < 1                      ? 'no tweets'                   :
          name.length === 0                  ? 'no name (suspended?)'        :
          (followers < 500 && bio.length === 0) ? 'no bio + low followers'   :
          null;

        if (skipReason) {
          emit('status', { step: 'filtered',
            message: `Skipped @${handle} — ${skipReason}`, progress: Math.round((i / targets.length) * 80) });
          continue;
        }

        const sc = scoreAndClassify(u);

        // Post-score gate — discard accounts with near-zero relevance (score < 10)
        // e.g. 100-follower, no bio, no website → overall ≈ 7-8. Not worth AI quota or DB space.
        if (sc.overall < 10) {
          emit('status', { step: 'filtered', message: `Skipped @${handle} — overall score too low (${sc.overall})`, progress: Math.round((i / targets.length) * 80) });
          continue;
        }

        fetchedAccounts.push({
          handle: handle.toLowerCase(),
          name,
          bio,
          followers,
          following: Number(u.friends) || 0,
          tweets,
          verified:  u.blue_verified  || false,
          avatar:    u.avatar         || '',
          website:   u.website        || '',
          location:  u.location       || '',
          _sc: sc,
        });
      } else {
        health.errors++;
        if (r.status === 429) health.flags.limited = true;
        if (r.status === 403) health.flags.blocked = true;
        emit('fetch_error', { handle, index: i + 1, total: targets.length,
          status: r.status, error: r.error,
          health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags) });
      }
      sendHealth();
    }

    if (isAborted() || !fetchedAccounts.length) continue;

    // ── Phase 2: Batch AI scoring — only NEW accounts, BATCH_SIZE at a time ─
    // Duplicates already have scores in DB and don't need re-scoring.
    // Pre-check which handles already exist in DB.
    const existingHandles = new Set();
    if (fetchedAccounts.length > 0) {
      const placeholders = fetchedAccounts.map(() => '?').join(',');
      const { rows: existing } = await db.execute({
        sql:  `SELECT handle FROM accounts WHERE handle IN (${placeholders})`,
        args: fetchedAccounts.map(a => a.handle),
      });
      existing.forEach(r => existingHandles.add(r.handle));
    }

    const newAccounts = fetchedAccounts.filter(a => !existingHandles.has(a.handle));
    const dupAccounts = fetchedAccounts.filter(a =>  existingHandles.has(a.handle));

    emit('status', {
      step:    'ai_scoring',
      message: `AI scoring ${newAccounts.length} new accounts in batches of ${BATCH_SIZE} (${dupAccounts.length} duplicates skip AI)…`,
      progress: 80,
    });

    // Score new accounts in batches
    const aiScores = {}; // handle → ai result
    for (let b = 0; b < newAccounts.length; b += BATCH_SIZE) {
      if (isAborted()) break;
      const batch = newAccounts.slice(b, b + BATCH_SIZE);
      emit('status', {
        step:    'ai_scoring',
        message: `Batch AI [${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(newAccounts.length / BATCH_SIZE)}] — scoring @${batch.map(a => a.handle).join(', @')}`,
        progress: 80 + Math.round((b / Math.max(newAccounts.length, 1)) * 15),
      });
      try {
        const results = await aiScoreBatch(batch);
        if (results) {
          batch.forEach((a, i) => { if (results[i]) aiScores[a.handle] = results[i]; });
        }
      } catch (e) {
        console.warn('[AI batch] error:', e.message);
      }
    }

    // ── Phase 3: Merge scores, upsert to DB, emit to client ──────────────────
    const allToEmit = [...newAccounts, ...dupAccounts];
    for (let idx = 0; idx < allToEmit.length; idx++) {
      const a   = allToEmit[idx];
      const sc  = a._sc;
      const ai  = aiScores[a.handle]; // present only for new accounts
      const isDup = existingHandles.has(a.handle);

      const finalD2   = ai ? ai.d2  : sc.d2;
      const finalD3   = ai ? ai.d3  : sc.d3;
      const finalType = ai ? (ai.type || sc.type) : sc.type;
      // Track is enforced by type — AI track suggestion is overridden to prevent
      // inconsistencies where AI says "PR Page" but returns track "A"
      const finalTrack = (finalType === 'PR Page' || finalType === 'Brand Page') ? 'B' : 'A';
      const finalOverall = Math.round(finalD2 * 0.25 + finalD3 * 0.25 + sc.d4 * 0.20 + sc.d5 * 0.30);

      const account = {
        handle:       a.handle,
        name:         a.name,
        bio:          a.bio,
        followers:    a.followers,
        following:    a.following,
        tweets:       a.tweets,
        verified:     a.verified,
        avatar:       a.avatar,
        website:      a.website,
        location:     a.location,
        tier: a.followers >= 500000 ? 'Macro'
            : a.followers >= 100000 ? 'Mid-Tier'
            : a.followers >= 10000  ? 'Micro'
            : a.followers >= 500    ? 'Nano' : 'Below bar',
        account_type: finalType,
        track:        finalTrack,
        d2: finalD2, d3: finalD3, d4: sc.d4, d5: sc.d5,
        overall:      finalOverall,
        dmOpen:       sc.dmOpen,
        hasEmail:     sc.hasEmail,
        contactEmail: sc.contactEmail,
        ai_model:     ai?.model || null,
        ai_reason:    null,
      };

      const savedDup = await upsertAccount(account, runId);
      if (savedDup) duplicatesSkipped++; else accountsAdded++;

      emit('account', {
        account:   { ...account, isDuplicate: savedDup, index: idx + 1, total: allToEmit.length },
        health:    calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
        durations: [...durations],
      });
    }
    sendHealth();
  }

  // ── Direct handle phase — fetch known influencers from friend's DB ────────────
  // These are fetched directly (no search step) and saved to OUR DB only
  if (directHandles.length > 0 && !isAborted()) {
    const newDirectHandles = directHandles.filter(h => !seenThisRun.has(h.toLowerCase()));
    if (newDirectHandles.length > 0) {
      emit('status', {
        step: 'direct_fetch',
        message: `Fetching ${newDirectHandles.length} known influencers from friend's list…`,
        progress: 95,
      });
      const directFetched = [];
      for (let i = 0; i < newDirectHandles.length; i++) {
        if (isAborted()) break;
        const handle = newDirectHandles[i];
        seenThisRun.add(handle.toLowerCase());
        emit('status', { step: 'fetching', message: `[Friend list] @${handle} [${i + 1}/${newDirectHandles.length}]`, progress: 95 });
        const r = await callAPI('screenname.php', { screenname: handle }, pace, keepAlive);
        health.calls++; health.totalMs += r.duration_ms;
        if (r.success) {
          health.successes++;
          const u         = r.data;
          const followers = Number(u.sub_count)      || 0;
          const tweets    = Number(u.statuses_count) || 0;
          const name      = (u.name || '').trim();
          const bio       = (u.desc || '').trim();

          const skipReason =
            followers < 100                       ? `only ${followers} followers` :
            tweets    < 1                         ? 'no tweets'                   :
            name.length === 0                     ? 'no name (suspended?)'        :
            (followers < 500 && bio.length === 0) ? 'no bio + low followers'      :
            null;

          if (skipReason) {
            emit('status', { step: 'filtered', message: `Skipped @${handle} (friend list) — ${skipReason}`, progress: 95 });
          } else {
            const sc = scoreAndClassify(u);
            if (sc.overall < 10) {
              emit('status', { step: 'filtered', message: `Skipped @${handle} (friend list) — score too low (${sc.overall})`, progress: 95 });
            } else {
              directFetched.push({
                handle: handle.toLowerCase(), name, bio,
                followers, following: Number(u.friends) || 0, tweets,
                verified: u.blue_verified || false, avatar: u.avatar || '',
                website: u.website || '', location: u.location || '',
                _sc: sc,
              });
            }
          }
        } else { health.errors++; }
      }
      // Batch AI score the direct handles
      if (directFetched.length > 0) {
        const existingSet = new Set();
        if (directFetched.length > 0) {
          const ph = directFetched.map(() => '?').join(',');
          const { rows: ex } = await db.execute({ sql: `SELECT handle FROM accounts WHERE handle IN (${ph})`, args: directFetched.map(a => a.handle) });
          ex.forEach(r => existingSet.add(r.handle));
        }
        const newDirect = directFetched.filter(a => !existingSet.has(a.handle));
        const aiScoresDirect = {};
        for (let b = 0; b < newDirect.length; b += BATCH_SIZE) {
          if (isAborted()) break;
          const batch = newDirect.slice(b, b + BATCH_SIZE);
          try {
            const results = await aiScoreBatch(batch);
            if (results) batch.forEach((a, i) => { if (results[i]) aiScoresDirect[a.handle] = results[i]; });
          } catch {}
        }
        for (const a of directFetched) {
          const sc = a._sc; const ai = aiScoresDirect[a.handle]; const isDup = existingSet.has(a.handle);
          const finalD2 = ai ? ai.d2 : sc.d2; const finalD3 = ai ? ai.d3 : sc.d3;
          const finalType  = ai ? (ai.type || sc.type) : sc.type;
          const finalTrack = (finalType === 'PR Page' || finalType === 'Brand Page') ? 'B' : 'A';
          const finalOverall = Math.round(finalD2 * 0.25 + finalD3 * 0.25 + sc.d4 * 0.20 + sc.d5 * 0.30);
          const account = {
            handle: a.handle, name: a.name, bio: a.bio, followers: a.followers, following: a.following,
            tweets: a.tweets, verified: a.verified, avatar: a.avatar, website: a.website, location: a.location,
            tier: a.followers >= 500000 ? 'Macro' : a.followers >= 100000 ? 'Mid-Tier' : a.followers >= 10000 ? 'Micro' : a.followers >= 500 ? 'Nano' : 'Below bar',
            account_type: finalType, track: finalTrack, d2: finalD2, d3: finalD3, d4: sc.d4, d5: sc.d5,
            overall: finalOverall, dmOpen: sc.dmOpen, hasEmail: sc.hasEmail, contactEmail: sc.contactEmail,
            ai_model: ai?.model || null, ai_reason: null,
          };
          const savedDup = await upsertAccount(account, runId);
          if (savedDup) duplicatesSkipped++; else accountsAdded++;
          emit('account', { account: { ...account, isDuplicate: savedDup, source: 'friend_list' }, health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags), durations: [...durations] });
        }
      }
    }
  }

  } catch (err) {
    // Quota exhausted — stop gracefully, save what we have, tell the client clearly
    if (err.name === 'QuotaExhaustedError') {
      emit('quota_exhausted', { message: err.message });
      console.log('[RATE] Run stopped early:', err.message);
    } else {
      throw err; // unexpected error — propagate
    }
  }

  const runStatus = globalConsecutive429 >= QUOTA_EXHAUSTED_THRESHOLD ? 'quota_exhausted' : 'completed';

  // Finalize run
  await db.execute({
    sql: `UPDATE runs SET status=?, completed_at=datetime('now'),
          accounts_found=?, accounts_added=?, duplicates_skipped=? WHERE id=?`,
    args: [runStatus, accountsAdded + duplicatesSkipped, accountsAdded, duplicatesSkipped, runId],
  });
  await db.execute({ sql: `UPDATE agent_config SET value=datetime('now'), updated_at=datetime('now') WHERE key='last_run'`, args: [] });

  const summary = { runId, accountsAdded, duplicatesSkipped, errors: health.errors,
    quotaExhausted: runStatus === 'quota_exhausted',
    health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags) };
  emit('complete', summary);
  return summary;
}

// ── SSE Agent Run endpoint ────────────────────────────────────────────────────
app.get('/api/run-demo', require('./middleware/auth').requireAuth, async (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // retry:0 tells the browser's EventSource NOT to auto-reconnect when the
  // stream closes normally — prevents the false "connection lost" error
  res.write('retry: 0\n\n');
  res.flushHeaders();

  let queries         = [];
  let directHandles   = []; // influencer handles from friend's DB — fetched directly, no search
  const { query } = req.query;

  if (query) {
    // Custom query from UI — use as-is
    queries = [query];
  } else {
    // 1. Own active keywords
    const { rows: ownRows } = await db.execute(
      `SELECT keyword FROM keywords WHERE active = 1 ORDER BY class, category`
    );
    const ownKeywords = ownRows.map(r => r.keyword);

    // 2. Friend's search queries (read-only, never writes to friend's DB)
    const friendQueries = await getFriendSearchQueries({ maxRows: 300 });

    // 3. Friend's known influencer handles (fetch directly, skip search step)
    directHandles = await getFriendInfluencerHandles();

    // Merge & deduplicate queries (own keywords take priority)
    const seen = new Set(ownKeywords.map(k => k.toLowerCase()));
    const merged = [...ownKeywords];
    for (const q of friendQueries) {
      if (!seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); merged.push(q); }
    }
    queries = merged.length ? merged : ['ai voice assistant', 'vapi developer', 'elevenlabs'];

    console.log(`[Agent] Queries: ${ownKeywords.length} own + ${friendQueries.length} friend = ${queries.length} total`);
    console.log(`[Agent] Direct handles from friend: ${directHandles.length}`);
  }

  // Handle client disconnect gracefully
  let aborted = false;
  req.on('close', () => { aborted = true; });

  await runAgent({ queries, directHandles, triggeredBy: 'manual', sseRes: res, isAborted: () => aborted });
  if (!res.writableEnded) res.end();
});

// ── Health check (public) ─────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:     'ok',
    key_stats:  keyStats(),
    db_url:     process.env.TURSO_URL ? 'connected' : 'NOT SET',
  });
});

// ── Monthly cron — 1st of every month at 02:00 AM UTC ────────────────────────
cron.schedule('0 2 1 * *', async () => {
  const stamp = new Date().toISOString();
  console.log(`\n[CRON] ══════ Monthly run starting — ${stamp} ══════`);
  try {
    // Check auto-run is enabled
    const cfg = await db.execute(`SELECT value FROM agent_config WHERE key='auto_run_enabled'`);
    if (cfg.rows[0]?.value !== '1') {
      console.log('[CRON] Auto-run is disabled in settings — skipping');
      return;
    }

    // 1. Own active keywords (all, no limit)
    const { rows: ownRows } = await db.execute(`SELECT keyword FROM keywords WHERE active = 1 ORDER BY class, category`);
    const ownKeywords = ownRows.map(r => r.keyword);

    // 2. Friend's search queries (read-only)
    const friendQueries = await getFriendSearchQueries({ maxRows: 300 });

    // 3. Friend's known influencer handles (direct fetch)
    const directHandles = await getFriendInfluencerHandles();

    // Merge + deduplicate
    const seen = new Set(ownKeywords.map(k => k.toLowerCase()));
    const merged = [...ownKeywords];
    for (const q of friendQueries) {
      if (!seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); merged.push(q); }
    }

    if (!merged.length && !directHandles.length) {
      console.log('[CRON] No keywords or handles to process — skipping');
      return;
    }

    console.log(`[CRON] Queries: ${ownKeywords.length} own + ${friendQueries.length} friend = ${merged.length} total`);
    console.log(`[CRON] Direct handles: ${directHandles.length}`);

    // Record next-run time before starting (1st of next month)
    const nextRun = new Date(); nextRun.setMonth(nextRun.getMonth() + 1); nextRun.setDate(1); nextRun.setHours(2, 0, 0, 0);
    await db.execute({ sql: `UPDATE agent_config SET value=?, updated_at=datetime('now') WHERE key='next_run'`, args: [nextRun.toISOString()] });

    const summary = await runAgent({ queries: merged, directHandles, triggeredBy: 'cron' });
    console.log(`[CRON] ══════ Monthly run complete — added:${summary.accountsAdded} updated:${summary.duplicatesSkipped} errors:${summary.errors} ══════\n`);

  } catch (err) {
    console.error('[CRON] Monthly run error:', err.message);
  }
}, { timezone: 'UTC' });

// ── Boot ──────────────────────────────────────────────────────────────────────
initDB().then(async () => {
  app.listen(PORT, () => {
    // Expose keyStats to routes via app.locals
    app.locals.keyStats = keyStats;

    console.log(`\n  KiteAI X Agent — Backend`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Turso:    ${process.env.TURSO_URL ? 'connected' : 'NOT SET'}`);
    console.log(`  OpenRouter: ${process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_key_here' ? 'key set ✓' : 'NOT SET'}`);
    console.log(`  Monthly cron: active (1st of month, 02:00 UTC)`);
    console.log(`\n  RapidAPI keys (no quota burned on startup):`);
    validateKeys();
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

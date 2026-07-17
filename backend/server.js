require('dotenv').config();
const express      = require('express');
const axios        = require('axios');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cron         = require('node-cron');
const { db, initDB } = require('./db');
const { aiScoreBatch, aiAnalyseTweets, analysePaidPattern, BATCH_SIZE, SCORING_MODEL } = require('./openrouter');
const { classifyFromBio } = require('./promotionClassifier');
const { getFriendSearchQueries, getFriendInfluencerHandles, testFriendDb } = require('./friendDb');

const app  = express();
app.set('trust proxy', 1); // Required on Render â€” sits behind a reverse proxy
const PORT = process.env.PORT || 3001;

// â”€â”€ Security headers (API-safe â€” disable browser-only policies) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use(helmet({
  crossOriginResourcePolicy:   { policy: 'cross-origin' },
  crossOriginEmbedderPolicy:   false,
  contentSecurityPolicy:       false,
}));

// â”€â”€ CORS â€” JWT is in Authorization header so no credentials mode needed â”€â”€â”€â”€â”€â”€â”€
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:4173'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / curl / Render health checks
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Allow any local dev origin (localhost / 127.0.0.1, any port)
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    // Allow all Vercel preview deployments (*.vercel.app)
    if (/^https:\/\/[a-z0-9-]+(\.vercel\.app)$/.test(origin)) return cb(null, true);
    cb(new Error(`CORS not allowed for origin: ${origin}`));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Handle OPTIONS preflight explicitly so rate-limiter doesn't block it
app.options('*', cors());
app.use(express.json());

// â”€â”€ Rate limiting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true }));
app.use('/api',      rateLimit({ windowMs: 1 * 60 * 1000,  max: 120, standardHeaders: true }));

// â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Platform (shared by every agent): auth + the section/agent catalogue gateway + admin panel
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/admin',     require('./routes/admin'));
// RBAC Phase 1 — admin user management + audit log. Mounted at the NARROW
// /api/admin prefix (after routes/admin.js) so its admin-only gate can't
// intercept other /api/* routes. Routes still resolve to /api/admin/users, etc.
app.use('/api/admin',     require('./routes/admin-users'));
app.use('/api/sections',  require('./routes/sections'));
app.use('/api/agents',    require('./routes/agents'));
// Brand Visibility agent: lexicon config CRUD, proxied to the Python FastAPI backend
app.use('/api/brand-visibility/config', require('./routes/brand-visibility-config'));
// X Agent (this repo's own agent): its dashboard data + run APIs
app.use('/api/keywords',  require('./routes/keywords'));
app.use('/api/accounts',  require('./routes/accounts'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings',  require('./routes/settings'));
app.use('/api/tasks',     require('./routes/tasks'));

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PROACTIVE RATE LIMITER â€” prevents blocks before they happen
//
// Strategy: each key is allowed SAFE_RPM requests per minute.
// Before every request we calculate the earliest time that key can fire
// without exceeding that rate, then sleep until then (+ random jitter).
// This means we NEVER fire faster than the safe rate â€” no 429s.
//
// Paid key only (twitter241.p.rapidapi.com)
// Anti-bot: 3 RPM, Â±3s jitter, human breaks every 20-35 requests,
//           shuffled query order, varied count 40-50 per search
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'twitter241.p.rapidapi.com';
const BASE_URL      = `https://${RAPIDAPI_HOST}`;

const PAID_RPM  = Math.max(1, Number(process.env.PAID_KEY_RPM) || 3);
const JITTER_MS = 6000; // Â±3 000ms random spread

// Per-run request cap â€” protects shared paid quota
const MAX_REQUESTS_PER_RUN = Number(process.env.MAX_REQUESTS_PER_RUN) || 5000;

// How many pages to pull per compound search query (page 1 + extra cursor pages).
// Each page = 1 API call. "Top" search depth has diminishing returns after a few
// pages (results start repeating), so 3 is a sensible default. Tunable via env.
const MAX_SEARCH_PAGES = Math.max(1, Number(process.env.MAX_SEARCH_PAGES) || 4);

// An account whose recent timeline is >= this % pure reposts/retweets is treated as
// a "reposter / amplifier" — shown in its own section, kept OUT of A1/A2. Env-tunable.
const REPOST_THRESHOLD = Math.max(1, Math.min(100, Number(process.env.REPOST_THRESHOLD) || 60));

// Hard monthly-quota guard. RapidAPI reports the real shared monthly counter in
// response headers; we stop a run when remaining drops to this reserve so we never
// exhaust the plan (and leave headroom for the shared user). Configurable via env.
const QUOTA_MIN_REMAINING = Number(process.env.QUOTA_MIN_REMAINING) || 3000;
let rapidQuotaRemaining = null; // latest x-ratelimit-requests-remaining seen
let rapidQuotaLimit     = null; // latest x-ratelimit-requests-limit seen

// Authenticity threshold — A2 promoters scoring >= this read as genuine creators;
// below it they're salesy/templated (separate "low-quality" bucket). Keep in sync
// with the same constant in routes/accounts.js and the frontend.
const GENUINE_THRESHOLD = 60;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter()  { return Math.floor(Math.random() * JITTER_MS) - JITTER_MS / 2; }

// Human break â€” random pause every 20-35 requests (anti-bot behaviour)
let requestsSinceBreak = 0;
async function humanBreak(emitStatus) {
  requestsSinceBreak++;
  const threshold = 20 + Math.floor(Math.random() * 15);
  if (requestsSinceBreak >= threshold) {
    requestsSinceBreak = 0;
    const breakMs = 30_000 + Math.floor(Math.random() * 30_000);
    if (emitStatus) emitStatus(`Human break â€” ${Math.round(breakMs/1000)}s pause (anti-bot)`);
    console.log(`[ANTI-BOT] Human break: ${Math.round(breakMs/1000)}s`);
    await sleep(breakMs);
  }
}

// Paid key only â€” free keys removed
const KEYS = [
  { key: process.env.RAPIDAPI_KEY_PAID, label: 'KeyPaid', rpm: PAID_RPM },
].filter(k => k.key).map(({ key, label, rpm }) => ({
  key,
  label,
  rpm,
  minGapMs:          Math.ceil(60_000 / rpm),
  lastFiredAt:       0,
  cooldownUntil:     0,
  disabled:          false,
  consecutiveErrors: 0,
  requests:          0,
}));

// â”€â”€ twitter241 response field extractors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Extract handles from twitter241 /search response
function extractHandles241(data) {
  const instructions = data?.result?.timeline?.instructions || [];
  const addEntries   = instructions.find(i => i.type === 'TimelineAddEntries');
  const entries      = addEntries?.entries || [];
  const handles = [];
  const seen = new Set();
  for (const e of entries) {
    try {
      const userResult = e.content?.itemContent?.tweet_results?.result
                          ?.core?.user_results?.result;
      const h = userResult?.core?.screen_name?.toLowerCase();
      if (h && !seen.has(h)) { seen.add(h); handles.push(userResult.core.screen_name); }
    } catch {}
  }
  return handles;
}

// Extract profile fields from twitter241 /user response
function extractProfile241(data, handle) {
  const u = data?.result?.data?.user?.result;
  if (!u) return null;
  const core   = u.core   || {};
  const legacy = u.legacy || {};
  return {
    name:      core.name      || handle,
    screen:    core.screen_name || handle,
    bio:       legacy.description || '',
    followers: Number(legacy.followers_count) || 0,
    following: Number(legacy.friends_count)   || 0,
    tweets:    Number(legacy.statuses_count)  || 0,
    verified:  u.is_blue_verified || false,
    avatar:    u.avatar?.image_url || '',
    website:   legacy.entities?.url?.urls?.[0]?.expanded_url || '',
    location:  legacy.location || '',
  };
}

// Returns the key that will be ready soonest, sleeping until it is
// Validate keys without burning quota â€” just format-check then mark as pending.
// Real validation happens on the first actual API call.
function validateKeys() {
  for (const k of KEYS) {
    if (!k.key || k.key.length < 20) {
      k.disabled = true;
      console.log(`  ${k.label}: âœ— disabled â€” key missing or invalid format`);
    } else {
      console.log(`  ${k.label}: âœ“ configured (will test on first use)`);
    }
  }
  const activeKeys = KEYS.filter(k => !k.disabled);
  if (activeKeys.length === 0) {
    console.log('  âš ï¸  WARNING: No API keys configured! Set RAPIDAPI_KEY_PAID in environment variables.');
  } else {
    console.log(`  Keys configured: ${activeKeys.map(k => k.label).join(', ')}`);
  }
}

// Optional sink for per-request API logging — set by a run (runAgent/resolveUnknowns)
// so callAPI can stream the raw request string + response status to the UI.
let apiCallSink = null;

// ── Run manager — decouples the agent run from any single SSE connection ──────
// The run executes in the background and broadcasts events to ALL attached
// viewers. Viewers can disconnect/reconnect freely without killing the run; it
// only stops on an explicit stop request or the per-run cap.
const runManager = {
  active: false,
  startedAt: 0,
  triggeredBy: null,
  stopRequested: false,
  progress: 0,            // OVERALL % across the whole run (driven by run_progress)
  phase: 'idle',          // search | profiles | friends | done
  taskId: null,           // when set, the run is scoped to a Task and links accounts to it
  currentQuery: null,     // the compound query being searched right now
  queriesDone: 0,         // how many compound queries finished
  totalQueries: 0,        // total compound queries this run
  listeners: new Set(),   // open SSE res objects
  history: [],            // recent events so late-joiners catch up
  lastSummary: null,
  broadcast(event, data) {
    // OVERALL progress is driven ONLY by run_progress (status.progress is per-phase, not overall)
    if (event === 'run_progress' && data) {
      if (typeof data.overallPct   === 'number') this.progress      = data.overallPct;
      if (typeof data.queriesDone  === 'number') this.queriesDone   = data.queriesDone;
      if (typeof data.totalQueries === 'number') this.totalQueries  = data.totalQueries;
      if (data.phase)            this.phase        = data.phase;
      if ('currentQuery' in data) this.currentQuery = data.currentQuery;
    }
    this.history.push({ event, data });
    if (this.history.length > 400) this.history.shift();
    for (const res of this.listeners) {
      try { sse(res, event, data); } catch { this.listeners.delete(res); }
    }
  },
  ping() {
    for (const res of this.listeners) {
      try { res.write(': ping\n\n'); } catch { this.listeners.delete(res); }
    }
  },
  endListeners() {
    for (const res of this.listeners) { try { res.end(); } catch {} }
    this.listeners.clear();
  },
};

// Start an agent run in the BACKGROUND (not tied to any request). Returns false
// if a run is already active. Events stream to whoever is attached as a listener.
function startAgentRun({ queries, directHandles = [], triggeredBy = 'manual', taskId = null }) {
  if (runManager.active) return false;
  runManager.active = true;
  runManager.stopRequested = false;
  runManager.startedAt = Date.now();
  runManager.triggeredBy = triggeredBy;
  runManager.taskId = taskId;
  runManager.progress = 0;
  runManager.phase = 'search';
  runManager.currentQuery = null;
  runManager.queriesDone = 0;
  runManager.totalQueries = 0;
  runManager.history = [];
  runManager.lastSummary = null;

  runAgent({
    queries, directHandles, triggeredBy, taskId,
    emit:      (e, d) => runManager.broadcast(e, d),
    keepAlive: ()     => runManager.ping(),
    isAborted: ()     => runManager.stopRequested,
  })
    .then(summary => { runManager.lastSummary = summary; console.log(`[run] complete (${triggeredBy}) — +${summary?.accountsAdded ?? 0} new, ${summary?.duplicatesSkipped ?? 0} updated`); })
    .catch(err => { console.error('[run] error:', err.message); try { runManager.broadcast('error', { step: 'run', message: err.message }); } catch {} })
    .finally(() => {
      runManager.active = false;
      apiCallSink = null;
      if (taskId) db.execute({ sql: `UPDATE tasks SET status='done', last_run_at=datetime('now') WHERE id=?`, args: [taskId] }).catch(() => {});
      runManager.endListeners(); // close viewer connections; data is saved in DB
    });
  return true;
}

// Track global consecutive 429s â€” 3+ in a row = daily quota exhausted
let globalConsecutive429 = 0;
const QUOTA_EXHAUSTED_THRESHOLD = 3;

// Throws a special error when quota is exhausted so the run can stop gracefully
class QuotaExhaustedError extends Error {
  constructor(msg) { super(msg); this.name = 'QuotaExhaustedError'; }
}

// Sleep in 8-second chunks, sending SSE keepalive pings so browser
// doesn't close the idle EventSource connection during long rate-limit waits
async function sleepWithPing(totalMs, keepAlive) {
  const CHUNK = 5_000; // ping every 5s â€” Render drops idle SSE after ~30s
  let remaining = totalMs;
  while (remaining > 0) {
    const chunk = Math.min(CHUNK, remaining);
    await sleep(chunk);
    remaining -= chunk;
    // Send SSE comment â€” browser ignores it as data but TCP stays alive
    if (keepAlive) keepAlive(Math.ceil(remaining / 1000));
  }
}

async function acquireKey(emitStatus, sseKeepAlive) {
  while (true) {
    const now = Date.now();

    // Bail out if ALL non-disabled keys have been 429'd more than threshold
    const activeKeys = KEYS.filter(k => !k.disabled); // disabled = invalid key format only
    if (activeKeys.length === 0) throw new QuotaExhaustedError(
      KEYS.length === 0
        ? 'No API keys configured â€” set RAPIDAPI_KEY_PAID in Render environment variables'
        : 'All API keys are disabled or in cooldown'
    );
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
      if (emitStatus) emitStatus(`Rate pacing â€” waiting ${waitSec}s (${KEYS[idx].label})`);
      console.log(`[RATE] waiting ${waitSec}s â†’ ${KEYS[idx].label}`);
      // Sleep in chunks â€” each chunk sends a keepalive ping to the SSE client
      await sleepWithPing(waitMs, (remSec) => {
        if (emitStatus && remSec > 0) emitStatus(`Rate pacing â€” ${remSec}s remaining`);
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
    console.log(`[RATE] ${k.label} 429 (consecutive: ${globalConsecutive429}) â†’ cooldown 75s`);
  } else if (status === 403) {
    // Not subscribed or forbidden â€” long cooldown, auto-retry after 1hr
    // Key will re-activate automatically if user subscribes on RapidAPI
    k.cooldownUntil = Date.now() + 3_600_000;
    k.notSubscribed = true;
    console.log(`[RATE] ${k.label} 403 â†’ not subscribed (cooldown 1hr, auto-retries)`);
  } else {
    const backoff = Math.min(120_000, 8_000 * Math.pow(2, k.consecutiveErrors - 1));
    k.cooldownUntil = Date.now() + backoff;
    console.log(`[RATE] ${k.label} ${status} â†’ backoff ${Math.round(backoff / 1000)}s`);
  }
}

function clearErrors(k) {
  globalConsecutive429 = 0; // successful request resets quota counter
  k.consecutiveErrors  = 0;
  k.requests++;
}

// Read the real shared monthly quota from RapidAPI response headers
function captureQuota(headers) {
  if (!headers) return;
  const rem = Number(headers['x-ratelimit-requests-remaining']);
  const lim = Number(headers['x-ratelimit-requests-limit']);
  if (Number.isFinite(rem)) rapidQuotaRemaining = rem;
  if (Number.isFinite(lim)) rapidQuotaLimit = lim;
  // Persist so the dashboard can show real quota even on a fresh process (before any new call)
  if (Number.isFinite(rem)) persistQuota(rem, Number.isFinite(lim) ? lim : rapidQuotaLimit).catch(() => {});
}

// Save last-known shared monthly quota to agent_config (survives process restarts)
async function persistQuota(rem, lim) {
  const put = (key, val) => db.execute({
    sql: `INSERT INTO agent_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
    args: [key, String(val)],
  });
  await put('rapid_quota_remaining', rem);
  if (Number.isFinite(lim)) await put('rapid_quota_limit', lim);
}

// True when we're at/below the reserve and must stop to protect the shared plan
function quotaExhaustedGuard() {
  return rapidQuotaRemaining != null && rapidQuotaRemaining <= QUOTA_MIN_REMAINING;
}

// ── App-level MONTHLY budget — our own call cap, independent of the shared plan ──
// The RapidAPI header counter is shared with a friend and can't tell our calls apart,
// so we keep our OWN monthly counter and hard-stop at MONTHLY_CALL_BUDGET. Persisted
// to agent_config under a per-month key so it survives restarts and resets each month.
const MONTHLY_CALL_BUDGET = Math.max(1, Number(process.env.MONTHLY_CALL_BUDGET) || 5000);
let monthlyCalls    = 0;
let currentMonthKey = null;

function monthKey(d = new Date()) {
  return `calls_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
async function loadMonthlyCalls() {
  currentMonthKey = monthKey();
  try {
    const { rows } = await db.execute({ sql: `SELECT value FROM agent_config WHERE key=?`, args: [currentMonthKey] });
    monthlyCalls = rows[0] ? (Number(rows[0].value) || 0) : 0;
  } catch { monthlyCalls = 0; }
}
function recordCall() {
  const k = monthKey();
  if (k !== currentMonthKey) { currentMonthKey = k; monthlyCalls = 0; } // new month → reset
  monthlyCalls++;
  db.execute({
    sql: `INSERT INTO agent_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
    args: [k, String(monthlyCalls)],
  }).catch(() => {});
}
// True once our app has spent its monthly budget — every run/task/resolve stops here
function monthlyBudgetGuard() { return monthlyCalls >= MONTHLY_CALL_BUDGET; }

// Summarise the response body into a short human string for the log
function summariseResponse(endpoint, data) {
  try {
    if (endpoint === 'search') {
      const handles = (JSON.stringify(data).match(/"screen_name"/g) || []).length;
      return `${handles} results`;
    }
    if (endpoint === 'user') {
      const u    = data?.result?.data?.user?.result;
      const name = u?.core?.screen_name || u?.legacy?.screen_name;
      const fol  = u?.legacy?.followers_count;
      return name ? `@${name}${fol != null ? ` · ${Number(fol).toLocaleString()} followers` : ''}` : 'profile';
    }
  } catch {}
  try { return `${Math.round(JSON.stringify(data).length / 1024)}KB`; } catch { return 'ok'; }
}

// Build a maskable request string + stream request/response (incl. result) to the UI log
function logApiCall(endpoint, params, status, ok, ms, keyLabel, errMsg, result) {
  if (!apiCallSink) return;
  let q = Object.entries(params || {}).map(([k, v]) => `${k}=${v}`).join('&');
  if (q.length > 120) q = q.slice(0, 120) + '…';
  const request  = `GET /${endpoint}${q ? '?' + q : ''}`;
  const response = ok
    ? `${status} OK · ${ms}ms${result ? ' · ' + result : ''} · ${keyLabel}`
    : `${status || 'ERR'} · ${ms}ms${errMsg ? ' · ' + String(errMsg).slice(0, 70) : ''}`;
  try { apiCallSink({ request, response, result: result || null, ok: !!ok, status: status || 0 }); } catch {}
}

async function callAPI(endpoint, params = {}, emitStatus = null, sseKeepAlive = null) {
  const k = await acquireKey(emitStatus, sseKeepAlive);
  const start = Date.now();
  recordCall(); // count against our own monthly budget (every outbound request)
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
    captureQuota(resp.headers);
    logApiCall(endpoint, params, resp.status, true, Date.now() - start, k.label, null, summariseResponse(endpoint, resp.data));
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
        other.lastFiredAt = Date.now(); // mark fired before attempt to prevent immediate re-use
        await sleep(800 + Math.max(0, jitter()));
        recordCall(); // retry is a second outbound request — count it too
        try {
          const resp2 = await axios.get(`${BASE_URL}/${endpoint}`, {
            params,
            headers: { 'X-RapidAPI-Key': other.key, 'X-RapidAPI-Host': RAPIDAPI_HOST, 'Content-Type': 'application/json' },
            timeout: 20_000,
          });
          other.lastFiredAt = Date.now();
          clearErrors(other);
          captureQuota(resp2.headers);
          logApiCall(endpoint, params, resp2.status, true, Date.now() - start, other.label, null, summariseResponse(endpoint, resp2.data));
          return { success: true, data: resp2.data, status: resp2.status,
                   duration_ms: Date.now() - start, key_label: other.label };
        } catch (e2) {
          penalise(other, e2.response?.status || 0);
        }
      }
    }
    logApiCall(endpoint, params, status, false, elapsed, k.label,
               typeof err.response?.data === 'string' ? err.response.data : err.message);
    return { success: false, error: err.response?.data || err.message,
             status, duration_ms: elapsed, key_label: k.label };
  }
}

// Fetch a handle's recent ORIGINAL posts (skips pure retweets). Shared by the
// live agent's promotion check and the resolve-unknowns backfill job.
async function fetchRecentTweets(handle, count = 20, paceFn = null, keepAliveFn = null) {
  const res = await callAPI('search', { query: `from:${handle}`, count, type: 'Latest' }, paceFn, keepAliveFn);
  if (!res.success) return { tweets: [], duration_ms: res.duration_ms, success: false, status: res.status, repostRatio: null };
  const instr   = res.data?.result?.timeline?.instructions || [];
  const entries = (instr.find(i => i.type === 'TimelineAddEntries')?.entries || []);
  const tweets  = [];
  let reposts = 0, total = 0;
  for (const e of entries) {
    try {
      const lg = e.content?.itemContent?.tweet_results?.result?.legacy;
      const t  = lg?.full_text;
      if (!t) continue;
      total++;
      // A pure repost = retweet ("RT @…") or has a retweeted_status. Quote tweets have
      // their own commentary (don't start with "RT @") and count as original content.
      if (t.startsWith('RT @') || lg?.retweeted_status_result) reposts++;
      else tweets.push(t.slice(0, 220));
    } catch {}
  }
  const repostRatio = total > 0 ? Math.round((reposts / total) * 100) : null;
  return { tweets, duration_ms: res.duration_ms, success: true, repostRatio, repostCount: reposts, total };
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

// â”€â”€ Scoring & classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Health calculator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ SSE helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// â”€â”€ Save account to DB with deduplication â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function upsertAccount(account, runId) {
  const { rows } = await db.execute({
    sql: 'SELECT id FROM accounts WHERE handle = ?',
    args: [account.handle.toLowerCase()],
  });
  const isDup = rows.length > 0;

  const promoSignals = JSON.stringify(account.promotion_signals || []);
  // Authenticity is optional — null means "not scored this pass", so on UPDATE we
  // COALESCE to keep any existing score rather than wiping it on a plain refresh.
  const aScore   = (account.authenticity_score === undefined || account.authenticity_score === null)
                   ? null : Number(account.authenticity_score);
  const aReason  = account.authenticity_reason  || null;
  const aExample = account.authenticity_example || null;
  const repostRatio = (account.repost_ratio === undefined || account.repost_ratio === null)
                      ? null : Number(account.repost_ratio);
  if (isDup) {
    await db.execute({
      sql: `UPDATE accounts SET name=?, bio=?, followers=?, following=?, tweets=?,
            verified=?, avatar=?, website=?, location=?, tier=?, account_type=?,
            track=?, d2=?, d3=?, d4=?, d5=?, overall=?, dm_open=?, has_email=?,
            contact_email=?, ai_model=?, ai_reason=?,
            promotion_type=?, promotion_confidence=?, promotion_signals=?,
            authenticity_score=COALESCE(?, authenticity_score),
            authenticity_reason=COALESCE(?, authenticity_reason),
            authenticity_example=COALESCE(?, authenticity_example),
            repost_ratio=COALESCE(?, repost_ratio),
            last_updated=datetime('now'), run_id=?
            WHERE handle=?`,
      args: [account.name, account.bio, account.followers, account.following, account.tweets,
             account.verified ? 1 : 0, account.avatar, account.website, account.location,
             account.tier, account.account_type, account.track,
             account.d2, account.d3, account.d4, account.d5, account.overall,
             account.dmOpen ? 1 : 0, account.hasEmail ? 1 : 0,
             account.contactEmail || null, account.ai_model || null, account.ai_reason || null,
             account.promotion_type || 'unknown', account.promotion_confidence || 0, promoSignals,
             aScore, aReason, aExample, repostRatio,
             runId, account.handle.toLowerCase()],
    });
  } else {
    await db.execute({
      sql: `INSERT INTO accounts (handle, name, bio, followers, following, tweets, verified,
            avatar, website, location, tier, account_type, track, d2, d3, d4, d5, overall,
            dm_open, has_email, contact_email, ai_model, ai_reason,
            promotion_type, promotion_confidence, promotion_signals,
            authenticity_score, authenticity_reason, authenticity_example, repost_ratio, run_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      args: [account.handle.toLowerCase(), account.name, account.bio,
             account.followers, account.following, account.tweets,
             account.verified ? 1 : 0, account.avatar, account.website, account.location,
             account.tier, account.account_type, account.track,
             account.d2, account.d3, account.d4, account.d5, account.overall,
             account.dmOpen ? 1 : 0, account.hasEmail ? 1 : 0,
             account.contactEmail || null, account.ai_model || null, account.ai_reason || null,
             account.promotion_type || 'unknown', account.promotion_confidence || 0, promoSignals,
             aScore, aReason, aExample, repostRatio, runId],
    });
  }
  return isDup;
}

// â”€â”€ Core agent run function (reused by SSE endpoint + cron) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// emit/keepAlive are injected by the caller (runManager broadcasts to all attached
// viewers). The run is NO LONGER tied to a single socket — it only stops when an
// explicit stop is requested (isAborted), so it survives client disconnects.
async function runAgent({ queries, directHandles = [], triggeredBy = 'manual', taskId = null, emit = () => {}, keepAlive = () => {}, isAborted = () => false }) {
  // When the run is scoped to a Task, link every account we save to that task
  // (shared global pool — the link lets us view each task's results separately).
  const linkTask = async (handle) => {
    if (!taskId || !handle) return;
    try {
      await db.execute({
        sql:  `INSERT OR IGNORE INTO task_accounts (task_id, handle) VALUES (?, ?)`,
        args: [taskId, handle.toLowerCase()],
      });
    } catch {}
  };
  const isLocalAborted = () => isAborted();
  const pace = (msg) => emit('status', { step: 'pacing', message: msg });
  const paceWithBreak = async (msg) => { pace(msg); await humanBreak(pace); };
  apiCallSink = (c) => emit('api_call', c); // stream raw request/response strings to listeners

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
  globalConsecutive429  = 0;    // reset quota counter for a fresh run
  requestsSinceBreak   = 0;    // reset human-break counter

  // ── Step 1: Build compound OR queries (6 keywords per call) ──────────────────
  // “vapi OR elevenlabs OR deepgram OR retell OR cartesia OR livekit” = 1 call
  // GROUP=6: ~33% fewer search calls than 4, niche-keyword coverage barely affected,
  // frees more per-run budget for profile fetches. (Tunable; ~512-char query cap.)
  function buildCompoundQueries(rawQueries) {
    const GROUP = 6;
    const groups = [];
    for (let i = 0; i < rawQueries.length; i += GROUP) {
      const chunk = rawQueries.slice(i, i + GROUP);
      const wrapped = chunk.map(q => q.includes(' ') ? `"${q}"` : q);
      groups.push(wrapped.join(' OR '));
    }
    return groups;
  }

  // ── Step 2: Weekly rotation — run 1/4 of queries per week ────────────────────
  // Week 1: indices 0,4,8...  Week 2: indices 1,5,9...  etc.
  // Spreads discovery evenly and quadruples profile-fetch budget per run
  function applyWeeklyRotation(compoundQueries) {
    if (triggeredBy === 'manual' || taskId) return compoundQueries; // manual + task = full run
    const weekSlot = Math.floor((new Date().getDate() - 1) / 7) % 4;
    return compoundQueries.filter((_, i) => i % 4 === weekSlot);
  }

  const compoundQueries = applyWeeklyRotation(buildCompoundQueries(queries));
  const totalCompound   = compoundQueries.length;
  emit('status', { step: 'init',
    message: `${queries.length} keywords → ${totalCompound} compound queries${triggeredBy !== 'manual' ? ' (weekly rotation: 1/4)' : ''}`,
    progress: 0 });

  // Cross-query handle frequency — handles appearing in multiple searches get fetched first
  const handleFrequency = new Map();

  // Shuffle compound queries — anti-bot pattern variation
  const shuffledQueries = [...compoundQueries].sort(() => Math.random() - 0.5);

  const sendHealth = () => emit('health', {
    ...calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
    durations:  [...durations],
    key_stats:  keyStats(),
  });

  // OVERALL progress helper: maps (queryIndex + intra-query fraction) → 0-95%.
  // Reserves 95-100% for the post-loop friend-list / direct-handle phase.
  const overallPct = (qIdx, intra = 0) =>
    Math.min(95, Math.round(((qIdx + Math.min(Math.max(intra, 0), 1)) / Math.max(totalCompound, 1)) * 95));

  try { // catches QuotaExhaustedError from acquireKey
  for (let qIdx = 0; qIdx < shuffledQueries.length; qIdx++) {
    const query = shuffledQueries[qIdx];
    if (isLocalAborted()) break;
    if (monthlyBudgetGuard() || health.calls >= MAX_REQUESTS_PER_RUN || quotaExhaustedGuard()) {
      emit('status', { step: 'cap_reached', message: `Stopping before next query — ${monthlyBudgetGuard() ? `monthly app budget reached (${monthlyCalls}/${MONTHLY_CALL_BUDGET} calls used)` : quotaExhaustedGuard() ? `shared-plan reserve reached (${rapidQuotaRemaining} left)` : `per-run cap (${MAX_REQUESTS_PER_RUN})`}. Data saved.`, progress: 100 });
      break;
    }
    emit('run_progress', { phase: 'search', currentQuery: query,
      queriesDone: qIdx, totalQueries: totalCompound, overallPct: overallPct(qIdx) });
    emit('status', { step: 'search', message: `Searching: "${query}" [${qIdx + 1}/${totalCompound}]`, progress: 0 });

    const searchCount = 40 + Math.floor(Math.random() * 11); // anti-bot count variation
    const searchRes = await callAPI('search', { query, count: searchCount, type: 'Top' }, paceWithBreak, keepAlive);
    health.calls++; health.totalMs += searchRes.duration_ms;
    durations.push(searchRes.duration_ms);

    if (!searchRes.success) {
      const s = searchRes.status;
      if (s === 429) health.flags.limited = true;
      if (s === 403) health.flags.blocked = true;
      health.errors++;
      sendHealth();
      emit('error', { step: 'search', message: `Search failed for “${query}”`, status: s });
      continue;
    }
    health.successes++;

    // Extract handles from page 1
    let rawHandles = extractHandles241(searchRes.data);

    // ── PAGINATION: chain cursor.bottom to pull deeper pages ──────────────────
    // Loop page 2..MAX_SEARCH_PAGES. Stop early on any of:
    //   • no cursor returned          (reached the end)
    //   • cursor didn't change        (twitter repeats the bottom cursor at the end)
    //   • a page added 0 new handles  (only duplicates left)
    //   • budget/quota guard or abort (protect the shared plan)
    let cursor = searchRes.data?.cursor?.bottom;
    let lastCursor = null;
    for (let page = 2; page <= MAX_SEARCH_PAGES; page++) {
      if (!cursor || cursor === lastCursor) break;
      if (isLocalAborted() || quotaExhaustedGuard() || monthlyBudgetGuard()) break;
      if (health.calls >= MAX_REQUESTS_PER_RUN * 0.7) break; // keep 30% of budget for profile fetches
      lastCursor = cursor;

      const pageRes = await callAPI('search',
        { query, count: searchCount, type: 'Top', cursor },
        paceWithBreak, keepAlive);
      health.calls++; health.totalMs += pageRes.duration_ms;
      if (!pageRes.success) break;
      health.successes++;

      const before    = rawHandles.length;
      const merged     = new Set(rawHandles.map(h => h.toLowerCase()));
      const pageHandles = extractHandles241(pageRes.data);
      for (const h of pageHandles) if (!merged.has(h.toLowerCase())) { merged.add(h.toLowerCase()); rawHandles.push(h); }
      const added = rawHandles.length - before;
      emit('status', { step: 'search', message: `  page ${page}: +${added} new handles (${rawHandles.length} total for this query)`, progress: 0 });
      if (added === 0) break; // page brought only duplicates — deeper pages won't help

      cursor = pageRes.data?.cursor?.bottom;
    }

    // Update cross-query frequency map — handles appearing in multiple queries = higher priority
    for (const h of rawHandles) {
      const hl = h.toLowerCase();
      handleFrequency.set(hl, (handleFrequency.get(hl) || 0) + 1);
    }

    const seenQuery  = new Set();
    const handles    = [];
    for (const h of rawHandles) {
      const hl = h?.toLowerCase();
      if (hl && !seenQuery.has(hl) && !seenThisRun.has(hl)) {
        seenQuery.add(hl);
        handles.push(h);
      }
    }
    // Filter out handles updated within the last 6 days (weekly run optimisation)
    // These accounts are fresh enough â€” skip re-fetching to save API quota
    const recentCutoff = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const freshHandles = handles.map(h => h.toLowerCase());
    let skipCount = 0;
    const freshInDb = freshHandles.length > 0
      ? (await db.execute({
          sql:  `SELECT handle FROM accounts WHERE handle IN (${freshHandles.map(()=>'?').join(',')}) AND last_updated > ?`,
          args: [...freshHandles, recentCutoff],
        })).rows.map(r => r.handle)
      : [];
    const recentSet = new Set(freshInDb);
    const targets = handles
      .filter(h => {
        if (recentSet.has(h.toLowerCase())) { skipCount++; seenThisRun.add(h.toLowerCase()); return false; }
        return true;
      })
      // Sort by cross-query frequency desc — accounts appearing in multiple searches fetched first
      .sort((a, b) => (handleFrequency.get(b.toLowerCase()) || 0) - (handleFrequency.get(a.toLowerCase()) || 0));
    if (skipCount > 0) emit('status', { step: 'skipped_recent', message: `Skipped ${skipCount} handles updated in last 6 days` });

    emit('search_done', {
      query, found: handles.length, fetching: targets.length, handles: targets,
      tweets_returned: rawHandles.length, duration_ms: searchRes.duration_ms,
    });
    sendHealth();

    // â”€â”€ Phase 1: Fetch all profiles for this query â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const fetchedAccounts = []; // { accountBase, sc, isDuplicate }

    for (let i = 0; i < targets.length; i++) {
      if (isLocalAborted()) break;
      const handle = targets[i];
      seenThisRun.add(handle.toLowerCase());

      emit('status', {
        step:    'fetching',
        message: `Fetching @${handle} [${i + 1}/${targets.length}]`,
        progress: Math.round((i / targets.length) * 80), // 0-80% for fetch phase
        current: i + 1, total: targets.length,
        key_stats: keyStats(),
      });
      emit('run_progress', { phase: 'profiles', currentQuery: query,
        queriesDone: qIdx, totalQueries: totalCompound,
        overallPct: overallPct(qIdx, (i + 1) / Math.max(targets.length, 1)) });

      // twitter241: /user?username=handle
      const r = await callAPI('user', { username: handle }, paceWithBreak, keepAlive);
      health.calls++; health.totalMs += r.duration_ms;
      durations.push(r.duration_ms);

      // App monthly budget — hard stop at our own MONTHLY_CALL_BUDGET
      if (monthlyBudgetGuard()) {
        emit('status', { step: 'cap_reached',
          message: `Monthly app budget reached (${monthlyCalls}/${MONTHLY_CALL_BUDGET} calls this month). Stopping. Data saved so far.`,
          progress: 100 });
        console.log(`[BUDGET] Run stopped — ${monthlyCalls}/${MONTHLY_CALL_BUDGET} monthly calls used`);
        break;
      }
      // Per-run request cap â€” stop gracefully when limit reached
      if (health.calls >= MAX_REQUESTS_PER_RUN) {
        emit('status', { step: 'cap_reached',
          message: `Request cap reached (${MAX_REQUESTS_PER_RUN} calls). Stopping to protect shared quota. Data saved so far.`,
          progress: 100 });
        console.log(`[CAP] Run stopped at ${health.calls} requests (limit: ${MAX_REQUESTS_PER_RUN})`);
        break;
      }
      // Hard monthly-quota guard â€” stop before exhausting the shared plan
      if (quotaExhaustedGuard()) {
        emit('status', { step: 'cap_reached',
          message: `Monthly quota guard hit (${rapidQuotaRemaining} of ${rapidQuotaLimit} left, reserve ${QUOTA_MIN_REMAINING}). Stopping. Data saved so far.`,
          progress: 100 });
        console.log(`[QUOTA] Run stopped — ${rapidQuotaRemaining} requests remaining (reserve ${QUOTA_MIN_REMAINING})`);
        break;
      }

      if (r.success) {
        health.successes++;
        // twitter241 response â†’ flat fields via extractProfile241
        const p         = extractProfile241(r.data, handle);
        if (!p) { health.errors++; continue; }
        const followers = p.followers;
        const tweets    = p.tweets;
        const name      = p.name.trim();
        const bio       = p.bio.trim();
        // Build a normalised object scoreAndClassify can read
        const u = {
          name: p.name, desc: p.bio,
          sub_count: p.followers, friends: p.following,
          statuses_count: p.tweets, blue_verified: p.verified,
          avatar: p.avatar, website: p.website, location: p.location,
        };

        // â”€â”€ Minimum bar â€” discard invalid/bot/empty profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // These checks happen before scoring to save AI quota on junk accounts
        const skipReason =
          followers < 100                    ? `only ${followers} followers` :
          tweets    < 1                      ? 'no tweets'                   :
          name.length === 0                  ? 'no name (suspended?)'        :
          (followers < 500 && bio.length === 0) ? 'no bio + low followers'   :
          null;

        if (skipReason) {
          emit('status', { step: 'filtered',
            message: `Skipped @${handle} â€” ${skipReason}`, progress: Math.round((i / targets.length) * 80) });
          continue;
        }

        const sc = scoreAndClassify(u);

        // Post-score gate â€” discard accounts with near-zero relevance (score < 10)
        // e.g. 100-follower, no bio, no website â†’ overall â‰ˆ 7-8. Not worth AI quota or DB space.
        if (sc.overall < 10) {
          emit('status', { step: 'filtered', message: `Skipped @${handle} â€” overall score too low (${sc.overall})`, progress: Math.round((i / targets.length) * 80) });
          continue;
        }

        fetchedAccounts.push({
          handle:    handle.toLowerCase(),
          name, bio, followers, tweets,
          following: p.following,
          verified:  p.verified,
          avatar:    p.avatar,
          website:   p.website,
          location:  p.location,
          _sc: sc,
        });
      } else {
        health.errors++;
        if (r.status === 429) health.flags.limited = true;
        if (r.status === 403) health.flags.blocked = true;
        emit('fetch_error', { handle, index: i + 1, total: targets.length,
          status: r.status, error: typeof r.error === 'string' ? r.error : 'Request failed',
          health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags) });
      }
      sendHealth();
    }

    if (isLocalAborted() || !fetchedAccounts.length) continue;

    // â”€â”€ Phase 2: Batch AI scoring â€” only NEW accounts, BATCH_SIZE at a time â”€
    // Duplicates already have scores in DB and don't need re-scoring.
    // Pre-check which handles already exist in DB.
    const existingHandles = new Set();
    const existingPromo   = new Map(); // handle → current promotion_type (for unknown re-check)
    if (fetchedAccounts.length > 0) {
      const placeholders = fetchedAccounts.map(() => '?').join(',');
      const { rows: existing } = await db.execute({
        sql:  `SELECT handle, promotion_type FROM accounts WHERE handle IN (${placeholders})`,
        args: fetchedAccounts.map(a => a.handle),
      });
      existing.forEach(r => { existingHandles.add(r.handle); existingPromo.set(r.handle, r.promotion_type); });
    }

    const newAccounts = fetchedAccounts.filter(a => !existingHandles.has(a.handle));
    const dupAccounts = fetchedAccounts.filter(a =>  existingHandles.has(a.handle));

    emit('status', {
      step:    'ai_scoring',
      message: `AI scoring ${newAccounts.length} new accounts in batches of ${BATCH_SIZE} (${dupAccounts.length} duplicates skip AI)â€¦`,
      progress: 80,
    });

    // Score new accounts in batches
    const aiScores = {}; // handle â†’ ai result
    for (let b = 0; b < newAccounts.length; b += BATCH_SIZE) {
      if (isLocalAborted()) break;
      const batch = newAccounts.slice(b, b + BATCH_SIZE);
      emit('status', {
        step:    'ai_scoring',
        message: `Batch AI [${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(newAccounts.length / BATCH_SIZE)}] â€” scoring @${batch.map(a => a.handle).join(', @')}`,
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

    // â”€â”€ Phase 3: Merge scores, upsert to DB, emit to client â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const allToEmit = [...newAccounts, ...dupAccounts];
    for (let idx = 0; idx < allToEmit.length; idx++) {
      const a   = allToEmit[idx];
      const sc  = a._sc;
      const ai  = aiScores[a.handle]; // present only for new accounts
      const isDup = existingHandles.has(a.handle);

      const finalD2   = ai ? ai.d2  : sc.d2;
      const finalD3   = ai ? ai.d3  : sc.d3;
      const finalType = ai ? (ai.type || sc.type) : sc.type;
      // Track is enforced by type â€” AI track suggestion is overridden to prevent
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
        ai_model:  ai?.model || null,
        ai_reason: null,
      };

      // ── Promotion classification (runs during fetch, no separate step needed) ─
      // Step 1: AI batch already checked bio → returns promotion_type if found
      // Step 2: Bio keyword check (free, instant)
      // Step 3: Evidence-based paid-pattern tweet analysis for Track A accounts
      //         still unresolved — INCLUDING stale duplicates whose stored type
      //         is still unknown/none, so the backlog shrinks on every refresh.
      let promoType       = ai?.promotion_type       || existingPromo.get(a.handle) || 'unknown';
      let promoConfidence = ai?.promotion_confidence || 0;
      let promoSignals    = ai?.promotion_signals    || [];
      let authScore = null, authReason = null, authExample = null; // genuine-creator quality
      let repostRatio = null; // % of recent posts that are reposts (amplifier detection)

      const dupNeedsRecheck = isDup && ['unknown', 'none'].includes(existingPromo.get(a.handle));
      if (finalTrack === 'A' && (!isDup || dupNeedsRecheck)) {
        // Bio keyword check (overrides if AI missed it / for dup re-checks)
        if (promoType === 'unknown') {
          const bioResult = classifyFromBio(a.bio, a.name, finalType);
          if (bioResult && bioResult.promotion_type !== 'unknown') {
            promoType       = bioResult.promotion_type;
            promoConfidence = bioResult.promotion_confidence;
            promoSignals    = bioResult.promotion_signals;
          }
        }

        // Tweet analysis — run unless bio already proved explicit (no need to confirm)
        const needsTweetCheck = promoType !== 'explicit' && health.calls < MAX_REQUESTS_PER_RUN - 50;
        if (needsTweetCheck) {
          emit('status', { step: 'tweet_check', message: `Paid-pattern check @${a.handle}` });
          const { tweets, duration_ms, repostRatio: rr } = await fetchRecentTweets(a.handle, 20, pace, keepAlive);
          health.calls++; health.totalMs += duration_ms;
          repostRatio = rr;

          if (tweets.length > 0) {
            const tweetAI = await analysePaidPattern(a.handle, a.bio, tweets);
            if (tweetAI && tweetAI.promotion_type && tweetAI.promotion_type !== 'unknown') {
              // Take the stronger of bio vs tweet verdict; a tweet 'none' resolves an unknown
              if (tweetAI.promotion_type === 'explicit' ||
                 (promoType !== 'explicit' && tweetAI.promotion_type === 'inferred') ||
                  promoType === 'unknown') {
                promoType       = tweetAI.promotion_type;
                promoConfidence = Math.max(promoConfidence, tweetAI.promotion_confidence);
                promoSignals    = (tweetAI.promotion_signals?.length ? tweetAI.promotion_signals : promoSignals).slice(0, 3);
              }
              // Capture authenticity (genuine-creator quality) for promoters
              if ((promoType === 'explicit' || promoType === 'inferred') && tweetAI.authenticity_score != null) {
                authScore   = tweetAI.authenticity_score;
                authReason  = tweetAI.authenticity_reason;
                authExample = tweetAI.authenticity_example;
              }
            }
          }
        }
      }

      account.promotion_type       = promoType;
      account.promotion_confidence = promoConfidence;
      account.promotion_signals    = promoSignals;
      account.authenticity_score   = authScore;
      account.authenticity_reason  = authReason;
      account.authenticity_example = authExample;
      account.repost_ratio         = repostRatio;

      const savedDup = await upsertAccount(account, runId);
      if (savedDup) duplicatesSkipped++; else accountsAdded++;
      await linkTask(account.handle);

      emit('account', {
        account:   { ...account, isDuplicate: savedDup, index: idx + 1, total: allToEmit.length },
        health:    calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
        durations: [...durations],
      });
    }
    sendHealth();
  }

  // â”€â”€ Direct handle phase â€” fetch known influencers from friend's DB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These are fetched directly (no search step) and saved to OUR DB only
  if (directHandles.length > 0 && !isLocalAborted()) {
    const newDirectHandles = directHandles.filter(h => !seenThisRun.has(h.toLowerCase()));
    if (newDirectHandles.length > 0) {
      emit('status', {
        step: 'direct_fetch',
        message: `Fetching ${newDirectHandles.length} known influencers from friend's listâ€¦`,
        progress: 95,
      });
      emit('run_progress', { phase: 'friends', currentQuery: null,
        queriesDone: totalCompound, totalQueries: totalCompound, overallPct: 96 });
      const directFetched = [];
      for (let i = 0; i < newDirectHandles.length; i++) {
        if (isLocalAborted()) break;
        const handle = newDirectHandles[i];
        seenThisRun.add(handle.toLowerCase());
        emit('status', { step: 'fetching', message: `[Friend list] @${handle} [${i + 1}/${newDirectHandles.length}]`, progress: 95 });
        const r = await callAPI('user', { username: handle }, paceWithBreak, keepAlive);
        health.calls++; health.totalMs += r.duration_ms;
        if (r.success) {
          health.successes++;
          const p         = extractProfile241(r.data, handle);
          if (!p) { health.errors++; continue; }
          const followers = p.followers;
          const tweets    = p.tweets;
          const name      = p.name.trim();
          const bio       = p.bio.trim();
          const u = { name: p.name, desc: p.bio, sub_count: p.followers, friends: p.following,
                      statuses_count: p.tweets, blue_verified: p.verified,
                      avatar: p.avatar, website: p.website, location: p.location };

          const skipReason =
            followers < 100                       ? `only ${followers} followers` :
            tweets    < 1                         ? 'no tweets'                   :
            name.length === 0                     ? 'no name (suspended?)'        :
            (followers < 500 && bio.length === 0) ? 'no bio + low followers'      :
            null;

          if (skipReason) {
            emit('status', { step: 'filtered', message: `Skipped @${handle} (friend list) â€” ${skipReason}`, progress: 95 });
          } else {
            const sc = scoreAndClassify(u);
            if (sc.overall < 10) {
              emit('status', { step: 'filtered', message: `Skipped @${handle} (friend list) â€” score too low (${sc.overall})`, progress: 95 });
            } else {
              directFetched.push({
                handle: handle.toLowerCase(), name, bio,
                followers, following: p.following, tweets,
                verified: p.verified, avatar: p.avatar,
                website: p.website, location: p.location,
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
          if (isLocalAborted()) break;
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
            promotion_type:       ai?.promotion_type       || 'unknown',
            promotion_confidence: ai?.promotion_confidence || 0,
            promotion_signals:    ai?.promotion_signals    || [],
          };
          const savedDup = await upsertAccount(account, runId);
          if (savedDup) duplicatesSkipped++; else accountsAdded++;
          await linkTask(account.handle);
          emit('account', { account: { ...account, isDuplicate: savedDup, source: 'friend_list' }, health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags), durations: [...durations] });
        }
      }
    }
  }

  } catch (err) {
    // Quota exhausted â€” stop gracefully, save what we have, tell the client clearly
    if (err.name === 'QuotaExhaustedError') {
      emit('quota_exhausted', { message: err.message });
      console.log('[RATE] Run stopped early:', err.message);
    } else {
      throw err; // unexpected error â€” propagate
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

  // Get promotion counts for run history
  const [totalStats, promoStats] = await Promise.all([
    db.execute(`SELECT COUNT(*) as total FROM accounts`),
    db.execute(`SELECT promotion_type, COUNT(*) as n FROM accounts WHERE track='A' GROUP BY promotion_type`),
  ]);
  const promoMap = {};
  for (const r of promoStats.rows) promoMap[r.promotion_type] = Number(r.n);

  const summary = {
    runId, accountsAdded, duplicatesSkipped, errors: health.errors,
    quotaExhausted: runStatus === 'quota_exhausted',
    totalAccountsInDB: Number(totalStats.rows[0].total),
    confirmedPaid: promoMap['explicit'] || 0,
    likelyPaid:    promoMap['inferred'] || 0,
    health: calcHealth(health.calls, health.successes, health.errors, health.totalMs, health.flags),
  };
  emit('run_progress', { phase: 'done', currentQuery: null,
    queriesDone: runManager.totalQueries || 0, totalQueries: runManager.totalQueries || 0, overallPct: 100 });
  emit('complete', summary);
  apiCallSink = null;
  return summary;
}

// ── Resolve Unknowns ─────────────────────────────────────────────────────────
// One-pass backfill: re-analyse Track A accounts that are still unknown/none with
// the evidence-based paid-pattern detector, promoting real promoters into A1/A2.
// Re-uses the same rate limiter / anti-bot pacing as the agent.
async function resolveUnknowns({ scope = 'all', sseRes = null, isAborted = () => false }) {
  let localAborted = false;
  const isLocalAborted = () => localAborted || isAborted();
  const emit = (event, data) => { if (sseRes && !isLocalAborted()) { try { sse(sseRes, event, data); } catch { localAborted = true; } } };
  const keepAlive = () => { if (sseRes && !isLocalAborted()) { try { sseRes.write(': ping\n\n'); } catch { localAborted = true; } } };
  const pace = (msg) => emit('status', { step: 'pacing', message: msg });
  const paceWithBreak = async (msg) => { pace(msg); await humanBreak(pace); };
  apiCallSink = (c) => emit('api_call', c); // stream raw request/response strings to the UI

  // Processes: (a) unknown/none accounts to resolve, AND (b) already-A2/A1 accounts
  // not yet authenticity-scored — so existing A2s get a genuine-vs-salesy quality score.
  // Once scored, an account is no longer re-selected → resumable & idempotent.
  // Relevant-first ordering so the most valuable accounts resolve before any cap.
  const minScore = scope === 'relevant' ? 30 : 0;
  const { rows } = await db.execute({
    sql: `SELECT handle, name, bio, account_type, overall, promotion_type, authenticity_score
          FROM accounts
          WHERE track='A' AND overall >= ?
            AND ( promotion_type IN ('unknown','none')
                  OR (promotion_type IN ('inferred','explicit') AND authenticity_score IS NULL) )
          ORDER BY overall DESC`,
    args: [minScore],
  });

  const health = { calls: 0, successes: 0, errors: 0, totalMs: 0, flags: {} };
  globalConsecutive429 = 0;
  requestsSinceBreak   = 0;
  let toA1 = 0, toA2 = 0, toNone = 0, stillUnknown = 0, genuine = 0, salesy = 0, processed = 0;

  emit('start', { total: rows.length, scope });

  try {
    for (let i = 0; i < rows.length; i++) {
      if (isLocalAborted()) break;
      if (monthlyBudgetGuard() || health.calls >= MAX_REQUESTS_PER_RUN || quotaExhaustedGuard()) {
        emit('status', { step: 'cap_reached', message: monthlyBudgetGuard()
          ? `Monthly app budget reached (${monthlyCalls}/${MONTHLY_CALL_BUDGET} calls this month). Stopping. Progress saved.`
          : quotaExhaustedGuard()
          ? `Shared-plan reserve reached (${rapidQuotaRemaining} of ${rapidQuotaLimit} left). Stopping. Progress saved.`
          : `Request cap (${MAX_REQUESTS_PER_RUN}) reached — stopping. Progress saved.` });
        break;
      }
      const acc = rows[i];
      emit('status', {
        step: 'analysing',
        message: `Paid-pattern check @${acc.handle} [${i + 1}/${rows.length}]`,
        current: i + 1, total: rows.length,
        progress: Math.round((i / Math.max(rows.length, 1)) * 100),
        key_stats: keyStats(),
      });

      const { tweets, success, duration_ms, repostRatio } = await fetchRecentTweets(acc.handle, 20, paceWithBreak, keepAlive);
      health.calls++; health.totalMs += duration_ms || 0;
      if (success) health.successes++; else health.errors++;
      // Persist repost ratio whenever we have it — even pure-reposter timelines (0 originals)
      if (repostRatio != null) {
        await db.execute({ sql: `UPDATE accounts SET repost_ratio=? WHERE handle=?`, args: [repostRatio, acc.handle] }).catch(() => {});
      }

      let outcome = acc.promotion_type;       // unchanged unless re-analysis resolves it
      let result  = null;
      let newAuth = null, authReason = null, authExample = null;
      if (tweets.length > 0) {
        try { result = await analysePaidPattern(acc.handle, acc.bio, tweets); }
        catch (e) { console.warn('[resolve] analyse error:', e.message); }

        const promotionResolved = result && result.promotion_type && result.promotion_type !== 'unknown';
        if (promotionResolved) outcome = result.promotion_type;

        // Trust authenticity only when the result itself rates the account a promoter
        const resultIsPromoter = result && (result.promotion_type === 'explicit' || result.promotion_type === 'inferred');
        if (resultIsPromoter && result.authenticity_score != null) {
          newAuth     = result.authenticity_score;
          authReason  = result.authenticity_reason  || null;
          authExample = result.authenticity_example || null;
        }

        // Persist if we resolved the promotion type OR produced a fresh authenticity score.
        // COALESCE keeps existing authenticity when newAuth is null (no clobber).
        if (promotionResolved || newAuth != null) {
          await db.execute({
            sql: `UPDATE accounts SET promotion_type=?, promotion_confidence=?, promotion_signals=?,
                  authenticity_score=COALESCE(?, authenticity_score),
                  authenticity_reason=COALESCE(?, authenticity_reason),
                  authenticity_example=COALESCE(?, authenticity_example),
                  last_updated=datetime('now') WHERE handle=?`,
            args: [outcome, result?.promotion_confidence || 0, JSON.stringify(result?.promotion_signals || []),
                   newAuth, authReason, authExample, acc.handle],
          });
        }
      }

      processed++;
      const effAuth = (newAuth != null) ? newAuth : acc.authenticity_score;
      if      (outcome === 'explicit') toA1++;
      else if (outcome === 'inferred') {
        toA2++;
        if (effAuth != null) { if (effAuth >= GENUINE_THRESHOLD) genuine++; else salesy++; }
      }
      else if (outcome === 'none')     toNone++;
      else                             stillUnknown++;

      emit('account', {
        handle: acc.handle, name: acc.name, overall: acc.overall,
        from: acc.promotion_type, to: outcome,
        authenticity: effAuth, genuine: effAuth != null && effAuth >= GENUINE_THRESHOLD,
        signals: result?.promotion_signals || [],
        tally: { toA1, toA2, toNone, stillUnknown, genuine, salesy, processed, total: rows.length },
      });
    }
  } catch (err) {
    if (err.name === 'QuotaExhaustedError') {
      emit('quota_exhausted', { message: err.message });
    } else {
      console.error('[resolve-unknowns] error:', err.message);
    }
  }

  const summary = { processed, toA1, toA2, toNone, stillUnknown, genuine, salesy, total: rows.length };
  emit('complete', summary);
  apiCallSink = null;
  return summary;
}

// ── SSE: Resolve Unknowns endpoint ───────────────────────────────────────────
app.get('/api/resolve-unknowns', require('./middleware/auth').requireAuth, async (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write('retry: 0\n\n');
  res.flushHeaders();

  const scope = req.query.scope === 'relevant' ? 'relevant' : 'all';
  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    await resolveUnknowns({ scope, sseRes: res, isAborted: () => aborted });
  } catch (err) {
    console.error('[SSE] resolveUnknowns error:', err.message);
  } finally {
    apiCallSink = null;
    if (!res.writableEnded) res.end();
  }
});

// â”€â”€ SSE Agent Run endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/run-demo', require('./middleware/auth').requireAuth, async (req, res) => {
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // retry:0 tells the browser's EventSource NOT to auto-reconnect when the
  // stream closes normally â€” prevents the false "connection lost" error
  res.write('retry: 0\n\n');
  res.flushHeaders();

  // ATTACH ONLY — this endpoint never starts a run (use POST /api/agent/start).
  // Disconnecting just detaches the viewer; the background run keeps going. This
  // makes reconnect safe — re-opening the stream can never launch a new run.
  runManager.listeners.add(res);
  req.on('close', () => { runManager.listeners.delete(res); });

  // Replay recent events so a fresh/reconnecting viewer catches up.
  for (const f of runManager.history) { try { sse(res, f.event, f.data); } catch {} }

  if (!runManager.active) {
    // Nothing running — let the client know and close (history above shows the last run).
    try { sse(res, 'idle', { message: 'No agent run is active' }); } catch {}
    runManager.listeners.delete(res);
    return res.end();
  }
  // Active run — stay open; runManager broadcasts live events and ends us on completion.
});

// â”€â”€ Agent control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Start a run in the background (returns immediately). Watch it via GET /api/run-demo.
app.post('/api/agent/start', require('./middleware/auth').requireAuth, async (req, res) => {
  if (runManager.active) return res.json({ ok: true, alreadyRunning: true, message: 'A run is already in progress' });
  if (monthlyBudgetGuard()) return res.json({ ok: false, budgetReached: true, message: `Monthly app budget reached (${monthlyCalls}/${MONTHLY_CALL_BUDGET} calls this month). Resets next month.` });

  let queries       = [];
  let directHandles = [];
  const query = req.query.query || req.body?.query;

  if (query) {
    queries = [query];
  } else {
    const { rows: ownRows } = await db.execute(
      `SELECT keyword FROM keywords WHERE active = 1 ORDER BY class, category`
    );
    const ownKeywords   = ownRows.map(r => r.keyword);
    const friendQueries = await getFriendSearchQueries({ maxRows: 300 });
    directHandles       = await getFriendInfluencerHandles();

    const seen = new Set(ownKeywords.map(k => k.toLowerCase()));
    const merged = [...ownKeywords];
    for (const q of friendQueries) {
      if (!seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); merged.push(q); }
    }
    queries = merged.length ? merged : ['ai voice assistant', 'vapi developer', 'elevenlabs'];
    console.log(`[Agent] Queries: ${ownKeywords.length} own + ${friendQueries.length} friend = ${queries.length} total | direct: ${directHandles.length}`);
  }

  const started = startAgentRun({ queries, directHandles, triggeredBy: 'manual' });
  res.json({ ok: true, started, totalQueries: queries.length });
});

// Run a Task — scoped to that task's keywords, links found accounts to the task.
app.post('/api/tasks/:id/run', require('./middleware/auth').requireAuth, async (req, res) => {
  if (runManager.active) return res.json({ ok: true, alreadyRunning: true, message: 'A run is already in progress' });
  if (monthlyBudgetGuard()) return res.json({ ok: false, budgetReached: true, message: `Monthly app budget reached (${monthlyCalls}/${MONTHLY_CALL_BUDGET} calls this month). Resets next month.` });
  const { rows } = await db.execute({ sql: `SELECT * FROM tasks WHERE id = ?`, args: [req.params.id] });
  if (!rows.length) return res.status(404).json({ error: 'Task not found' });

  let keywords = [];
  try { keywords = JSON.parse(rows[0].keywords); } catch {}
  if (!Array.isArray(keywords) || !keywords.length) return res.status(400).json({ error: 'Task has no keywords' });

  const taskId = Number(req.params.id);
  await db.execute({ sql: `UPDATE tasks SET status='running', last_run_at=datetime('now') WHERE id=?`, args: [taskId] }).catch(() => {});

  const started = startAgentRun({ queries: keywords, directHandles: [], triggeredBy: `task:${rows[0].name}`, taskId });
  res.json({ ok: true, started, taskId, totalKeywords: keywords.length });
});

// Gather the full weekly query set: own active keywords + friend queries + direct handles
async function buildWeeklyRun() {
  const { rows: ownRows } = await db.execute(`SELECT keyword FROM keywords WHERE active = 1 ORDER BY class, category`);
  const ownKeywords   = ownRows.map(r => r.keyword);
  const friendQueries = await getFriendSearchQueries({ maxRows: 300 });
  const directHandles = await getFriendInfluencerHandles();
  const seen = new Set(ownKeywords.map(k => k.toLowerCase()));
  const merged = [...ownKeywords];
  for (const q of friendQueries) {
    if (!seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); merged.push(q); }
  }
  return { queries: merged, directHandles };
}

// POST /api/cron/run — external scheduler (GitHub Actions) trigger for the weekly run.
// Secured by CRON_SECRET (header x-cron-secret OR ?secret=). The incoming request also
// wakes Render from sleep — which is why this works where the in-process cron can't.
app.post('/api/cron/run', async (req, res) => {
  const provided = req.get('x-cron-secret') || req.query.secret;
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'invalid or missing cron secret' });
  }
  try {
    const cfg = await db.execute(`SELECT value FROM agent_config WHERE key='auto_run_enabled'`);
    if (cfg.rows[0]?.value !== '1')  return res.json({ ok: false, reason: 'auto-run disabled' });
    if (runManager.active)           return res.json({ ok: true,  alreadyRunning: true });
    if (monthlyBudgetGuard())        return res.json({ ok: false, budgetReached: true, message: `Monthly budget reached (${monthlyCalls}/${MONTHLY_CALL_BUDGET})` });

    const { queries, directHandles } = await buildWeeklyRun();
    if (!queries.length && !directHandles.length) return res.json({ ok: false, reason: 'no keywords' });

    const nextRun = new Date(); nextRun.setDate(nextRun.getDate() + 7); nextRun.setHours(6, 0, 0, 0);
    await db.execute({ sql: `UPDATE agent_config SET value=?, updated_at=datetime('now') WHERE key='next_run'`, args: [nextRun.toISOString()] }).catch(() => {});

    const started = startAgentRun({ queries, directHandles, triggeredBy: 'github_cron' });
    console.log(`[CRON] Weekly run triggered via GitHub Action — ${queries.length} queries, ${directHandles.length} direct handles`);
    res.json({ ok: true, started, totalQueries: queries.length });
  } catch (err) {
    console.error('[CRON] trigger error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/agent/status', require('./middleware/auth').requireAuth, (req, res) => {
  res.json({
    running:     runManager.active,
    startedAt:   runManager.startedAt ? new Date(runManager.startedAt).toISOString() : null,
    triggeredBy: runManager.triggeredBy,
    taskId:      runManager.taskId,
    progress:    runManager.progress,
    phase:       runManager.phase,
    currentQuery: runManager.currentQuery,
    queriesDone: runManager.queriesDone,
    totalQueries: runManager.totalQueries,
    viewers:     runManager.listeners.size,
    lastSummary: runManager.lastSummary,
  });
});

app.post('/api/agent/stop', require('./middleware/auth').requireAuth, async (req, res) => {
  if (!runManager.active) {
    // No live run, but the DB may show a stale 'running' row (process died mid-run,
    // e.g. Render free-tier sleep). Clear it so the dashboard stops saying "Running".
    const r = await db.execute(
      `UPDATE runs SET status='interrupted', completed_at=datetime('now') WHERE status='running'`
    ).catch(() => ({ rowsAffected: 0 }));
    return res.json({ ok: true, cleared: r.rowsAffected || 0,
      message: r.rowsAffected ? `No live run — cleared ${r.rowsAffected} stale "running" record(s).`
                              : 'No run active.' });
  }
  runManager.stopRequested = true;
  res.json({ ok: true, message: 'Stop requested — the run will finish its current request and stop.' });
});

// â”€â”€ Health check (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app.get('/api/health', (req, res) => {
  res.json({
    status:     'ok',
    key_stats:  keyStats(),
    db_url:     process.env.TURSO_URL ? 'connected' : 'NOT SET',
    rapid_quota: {
      remaining: rapidQuotaRemaining,
      limit:     rapidQuotaLimit,
      reserve:   QUOTA_MIN_REMAINING,
      used:      (rapidQuotaLimit != null && rapidQuotaRemaining != null) ? rapidQuotaLimit - rapidQuotaRemaining : null,
      pct_used:  (rapidQuotaLimit ? Math.round(((rapidQuotaLimit - rapidQuotaRemaining) / rapidQuotaLimit) * 100) : null),
    },
    monthly_calls: {
      used:     monthlyCalls,
      budget:   MONTHLY_CALL_BUDGET,
      remaining: Math.max(0, MONTHLY_CALL_BUDGET - monthlyCalls),
      pct_used: Math.round((monthlyCalls / MONTHLY_CALL_BUDGET) * 100),
      month:    currentMonthKey,
    },
  });
});

// â”€â”€ Weekly cron â€” every Monday at 06:00 AM IST (Indian Standard Time, UTC+5:30) â”€â”€
// Only schedule â€” monthly cron removed. Weekly keeps data fresh.
// Recent accounts (< 6 days old) are skipped to protect shared API quota.
cron.schedule('0 6 * * 1', async () => {
  const stamp = new Date().toISOString();
  console.log(`\n[WEEKLY] â•â•â•â•â•â• Weekly refresh starting â€” ${stamp} â•â•â•â•â•â•`);
  try {
    const cfg = await db.execute(`SELECT value FROM agent_config WHERE key='auto_run_enabled'`);
    if (cfg.rows[0]?.value !== '1') { console.log('[WEEKLY] Auto-run disabled â€” skipping'); return; }

    const { rows: ownRows } = await db.execute(`SELECT keyword FROM keywords WHERE active = 1 ORDER BY class, category`);
    const ownKeywords   = ownRows.map(r => r.keyword);
    const friendQueries = await getFriendSearchQueries({ maxRows: 300 });
    const directHandles = await getFriendInfluencerHandles();

    const seen = new Set(ownKeywords.map(k => k.toLowerCase()));
    const merged = [...ownKeywords];
    for (const q of friendQueries) {
      if (!seen.has(q.toLowerCase())) { seen.add(q.toLowerCase()); merged.push(q); }
    }

    if (!merged.length && !directHandles.length) { console.log('[WEEKLY] No keywords â€” skipping'); return; }

    console.log(`[WEEKLY] ${merged.length} queries | cap: ${MAX_REQUESTS_PER_RUN} | anti-bot: on`);
    const nextRun = new Date(); nextRun.setDate(nextRun.getDate() + 7); nextRun.setHours(6, 0, 0, 0);
    await db.execute({ sql: `UPDATE agent_config SET value=?, updated_at=datetime('now') WHERE key='next_run'`, args: [nextRun.toISOString()] });

    if (runManager.active) { console.log('[WEEKLY] A run is already active - skipping'); return; }
    startAgentRun({ queries: merged, directHandles, triggeredBy: 'weekly_cron' });
    const summary = { accountsAdded: '?', duplicatesSkipped: '?' }; // runs in background; see runManager.lastSummary
    console.log(`[WEEKLY] â•â•â•â•â•â• Done â€” +${summary.accountsAdded} new, ${summary.duplicatesSkipped} updated â•â•â•â•â•â•\n`);
  } catch (err) {
    console.error('[WEEKLY] Error:', err.message);
  }
}, { timezone: 'Asia/Kolkata' });

// â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
initDB().then(async () => {
  // Zombie-run cleanup: any row still 'running' means a previous process died mid-run
  // (Render free-tier sleep, crash, kill). Mark them interrupted so the dashboard is honest.
  try {
    const z = await db.execute(`UPDATE runs SET status='interrupted', completed_at=datetime('now') WHERE status='running'`);
    if (z.rowsAffected) console.log(`  [boot] Cleared ${z.rowsAffected} stale 'running' run(s) → interrupted`);
  } catch (e) { console.error('  [boot] zombie-run cleanup failed:', e.message); }

  // Restore last-known shared quota so the dashboard shows it before the first new API call
  try {
    const { rows } = await db.execute(`SELECT key, value FROM agent_config WHERE key IN ('rapid_quota_remaining','rapid_quota_limit')`);
    for (const r of rows) {
      if (r.key === 'rapid_quota_remaining' && r.value != null) rapidQuotaRemaining = Number(r.value);
      if (r.key === 'rapid_quota_limit'     && r.value != null) rapidQuotaLimit     = Number(r.value);
    }
  } catch {}

  // Load our own monthly call counter (app budget, resets each month)
  await loadMonthlyCalls();
  console.log(`  [boot] App calls this month: ${monthlyCalls}/${MONTHLY_CALL_BUDGET}`);

  app.listen(PORT, () => {
    // Expose keyStats to routes via app.locals
    app.locals.keyStats = keyStats;

    console.log(`\n  KiteAI X Agent â€” Backend`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  Turso:    ${process.env.TURSO_URL ? 'connected' : 'NOT SET'}`);
    console.log(`  OpenRouter: ${process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_key_here' ? 'key set âœ“' : 'NOT SET'}`);
    console.log(`  Weekly cron:  active (every Monday, 02:00 IST / Asia/Kolkata)`);
    console.log(`  Request cap: ${MAX_REQUESTS_PER_RUN}/run | Anti-bot: jitter Â±3s + human breaks`);
    console.log(`\n  RapidAPI keys (no quota burned on startup):`);
    validateKeys();
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

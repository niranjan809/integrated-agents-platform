// HTTP API (Fastify) over the Turso datastore. Mostly read-only; POST /api/search (v0.13)
// runs an ad-hoc discovery search and logs a curator_actions audit row (no catalog mutation).
//
// Auth: bcrypt session cookies via @fastify/cookie, 7-day TTL with 24h rolling
// extension. Session tokens live in the sessions table; expired rows purged on
// startup. All routes except /health, /api/auth/login, /api/auth/logout require
// a valid session (see AUTH_EXEMPT and the preHandler hook below).
//
// CORS: locked to http://localhost:5173 (dashboard dev origin), credentials: true.
// Update the CORS origin to match the frontend host when deploying to production.
//
// Every endpoint accepts ?platform= (validated against instagram | tiktok | all).
// /api/accounts/:handle REQUIRES ?platform= — handle is not unique across platforms.
//
// Every DB access goes through src/db.js helpers (all/get). Handlers are async.
import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import bcrypt from "bcrypt";
import { all, get, run, nowIso, close as closeDb } from "./db.js";
import { monthlyCount, capFor, canCall } from "./budget.js";
import { runAdhocSearch } from "./discovery/search_adhoc.js";
import { logAction } from "./curator_audit.js";
import { addAccount, VALID_CATEGORIES, VALID_GENUINENESS } from "./curator/account_add.js";
import { captureState, removeAccount } from "./curator/account_remove.js";
import { addKeyword, KNOWN_TIERS } from "./curator/keyword_add.js";
import { removeKeyword } from "./curator/keyword_remove.js";
import * as seedHashtags from "./seed_hashtags.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { THRESHOLDS } from "./genuineness.js";
import { CONF_THRESHOLD, TOOL_HASHTAGS } from "./category_rules.js";
import { PROMPT_VERSION as GATE_PROMPT_VERSION } from "./ai_relevance.js";
import { PROMPT_VERSION as CATEGORY_PROMPT_VERSION } from "./category_llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const HANDLE_RE = /^[a-zA-Z0-9._]+$/;

// The "latest classification per (platform, handle)" join, reused across endpoints.
// Composite (platform, handle) — the same handle can exist on both platforms.
const LATEST_JOIN = `
  FROM accounts a
  JOIN classifications c ON c.platform = a.platform AND c.handle = a.handle
  JOIN (SELECT platform, handle, MAX(id) AS mid FROM classifications GROUP BY platform, handle) latest
    ON latest.platform = c.platform AND latest.handle = c.handle AND latest.mid = c.id
`;

const PLATFORMS = ["instagram", "tiktok"];

const SORTS = {
  followers_desc: "a.follower_count DESC",
  followers_asc: "a.follower_count ASC",
  engagement_desc: "a.engagement_rate DESC",
  engagement_asc: "a.engagement_rate ASC",
  updated_desc: "a.last_refreshed_at DESC",
};

function safeParse(json, fallback = null) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function pct(correct, total) {
  return total ? Number(((100 * correct) / total).toFixed(1)) : 0;
}

// Validate ?platform=. Returns 'instagram' | 'tiktok' | 'all' (default when absent),
// or sends a 400 and returns null (caller must `if (!platform) return;`).
function parsePlatform(query, reply) {
  const p = query.platform;
  if (p == null || p === "" || p === "all") return "all";
  if (PLATFORMS.includes(p)) return p;
  reply.code(400).send({ error: "invalid_platform", allowed: [...PLATFORMS, "all"] });
  return null;
}

const app = Fastify({ logger: false, disableRequestLogging: true });

// CORS locked to the Vite dev origin; credentials:true so the session cookie is sent
// cross-origin (5173 -> 3001). cookie plugin parses/sets cr_session.
await app.register(cors, { origin: "http://localhost:5173", credentials: true });
await app.register(cookie);

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days
const ROLL_WINDOW_MS = 24 * 3600 * 1000; // extend sessions expiring within 24h
// Routes reachable without a session. logout is exempt so it can always return 200;
// everything else under /api requires auth (see the preHandler hook below).
const AUTH_EXEMPT = new Set(["/health", "/api/auth/login", "/api/auth/logout"]);

// One structured log line per request: method path status ms.
app.addHook("onResponse", async (req, reply) => {
  logger.info(`${req.method} ${req.url} ${reply.statusCode} ${reply.elapsedTime.toFixed(1)}ms platform=${req.query?.platform || "all"}`);
});

// Never leak stack traces. Log server-side, return a generic 500 with the request id.
app.setErrorHandler((err, req, reply) => {
  logger.error(`request ${req.id} failed: ${err.stack || err.message}`);
  reply.code(500).send({ error: "internal", request_id: req.id });
});

// Auth guard: every route except AUTH_EXEMPT requires a valid, unexpired session.
// Attaches req.user and rolling-extends sessions near expiry.
app.addHook("preHandler", async (req, reply) => {
  const path = req.url.split("?")[0];
  if (AUTH_EXEMPT.has(path)) return;

  // Platform proxy bypass: integrated-agents-platform authenticates via a shared
  // secret header instead of a cookie session. Only active when the secret is
  // configured — if CREATOR_RADAR_INTERNAL_SECRET is unset, this block is skipped
  // entirely so no header can ever bypass cookie auth. Companion to the platform
  // proxy (integrated-agents-platform 5da8e54); mirrors brand-visibility's
  // X-Cron-Secret pattern.
  const internalSecret = process.env.CREATOR_RADAR_INTERNAL_SECRET;
  if (internalSecret) {
    const provided = req.headers["x-internal-secret"];
    if (provided === internalSecret) {
      req.user = { id: 0, username: "__service__", role: "admin" };
      return;
    }
    if (provided != null) {
      logger.warn(`X-Internal-Secret mismatch from ${req.ip} on ${req.method} ${path}`);
    }
  }

  const token = req.cookies?.cr_session;
  if (!token) return reply.code(401).send({ error: "unauthenticated" });

  const row = await get(
    `SELECT s.expires_at, u.id AS user_id, u.username, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = @token`,
    { token }
  );
  if (!row || row.expires_at <= nowIso()) return reply.code(401).send({ error: "unauthenticated" });

  req.user = { id: row.user_id, username: row.username, role: row.role };

  // Rolling session: within 24h of expiry -> extend to a fresh 7 days.
  if (row.expires_at < new Date(Date.now() + ROLL_WINDOW_MS).toISOString()) {
    await run("UPDATE sessions SET expires_at = @e WHERE token = @t", {
      e: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      t: token,
    });
  }
});

// ---------------------------------------------------------------- /health
app.get("/health", async () => {
  let turso_reachable = false;
  try {
    await get("SELECT 1 AS x");
    turso_reachable = true;
  } catch {
    turso_reachable = false;
  }
  return { status: "ok", uptime_seconds: Math.floor(process.uptime()), turso_reachable };
});

// ---------------------------------------------------------------- auth
app.post("/api/auth/login", async (req, reply) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) return reply.code(400).send({ error: "missing_credentials" });

  const user = await get(
    "SELECT id, username, password_hash, role FROM users WHERE username = @u",
    { u: username }
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return reply.code(401).send({ error: "invalid_credentials" });
  }

  // ?admin_only=1 (used by the /admin login route): valid credentials are required first
  // (checked above, so we don't reveal a user's role to a wrong password), then the account
  // must be an admin. Non-admins get 403 admin_required. Absent the flag, any role logs in.
  const adminOnly = req.query.admin_only === "1" || req.query.admin_only === "true";
  if (adminOnly && user.role !== "admin") {
    return reply.code(403).send({ error: "admin_required" });
  }

  const token = randomBytes(32).toString("hex");
  const now = nowIso();
  await run(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (@t, @uid, @c, @e)",
    { t: token, uid: user.id, c: now, e: new Date(Date.now() + SESSION_TTL_MS).toISOString() }
  );
  await run("UPDATE users SET last_login_at = @t WHERE id = @id", { t: now, id: user.id });

  reply.setCookie("cr_session", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000, // seconds
    secure: false, // local http
  });
  return { user: { username: user.username, role: user.role } };
});

app.post("/api/auth/logout", async (req, reply) => {
  const token = req.cookies?.cr_session;
  if (token) await run("DELETE FROM sessions WHERE token = @t", { t: token });
  reply.clearCookie("cr_session", { path: "/" });
  return { ok: true };
});

app.get("/api/auth/me", async (req) => {
  // Behind the auth hook — req.user is guaranteed set here.
  return { user: { username: req.user.username, role: req.user.role } };
});

// ---------------------------------------------------------------- /api/accounts
app.get("/api/accounts", async (req, reply) => {
  const q = req.query;
  const platform = parsePlatform(q, reply);
  if (!platform) return;
  const where = ["1=1"];
  const args = {};

  if (platform !== "all") {
    where.push("a.platform = @platform");
    args.platform = platform;
  }
  if (q.category) {
    where.push("c.category = @category");
    args.category = q.category;
  }
  if (q.genuineness) {
    where.push("c.genuineness = @genuineness");
    args.genuineness = q.genuineness;
  }
  if (q.method) {
    where.push("c.category_method = @method");
    args.method = q.method;
  }
  const minF = parseInt(q.min_followers, 10);
  if (!Number.isNaN(minF)) {
    where.push("a.follower_count >= @min_followers");
    args.min_followers = minF;
  }
  const maxF = parseInt(q.max_followers, 10);
  if (!Number.isNaN(maxF)) {
    where.push("a.follower_count <= @max_followers");
    args.max_followers = maxF;
  }

  const orderBy = (SORTS[q.sort] || SORTS.updated_desc) + ", a.handle ASC";
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);
  const whereSql = where.join(" AND ");

  const total = (await get(`SELECT COUNT(*) AS n ${LATEST_JOIN} WHERE ${whereSql}`, args)).n;

  const results = await all(
    `SELECT
       a.platform, a.handle, a.display_name,
       c.category AS predicted_category,
       c.genuineness AS predicted_genuineness,
       c.category_confidence, c.category_method, c.category_rule_matched, c.genuineness_rule_matched,
       a.follower_count, a.following_count, a.engagement_rate, c.ai_content_fraction,
       a.posts_per_week_last_8w, a.days_since_last_post, a.last_refreshed_at, a.discovered_via
     ${LATEST_JOIN}
     WHERE ${whereSql}
     ORDER BY ${orderBy}
     LIMIT @limit OFFSET @offset`,
    { ...args, limit, offset }
  );

  return { total, returned: results.length, results };
});

// ---------------------------------------------------------------- /api/accounts/:handle
app.get("/api/accounts/:handle", async (req, reply) => {
  const { handle } = req.params;
  if (!HANDLE_RE.test(handle)) return reply.code(400).send({ error: "invalid_handle" });

  // handle is not unique across platforms — a specific platform is REQUIRED here.
  const p = req.query.platform;
  if (p == null || p === "" || p === "all") {
    return reply.code(400).send({
      error: "platform_required",
      message: "handle is not unique across platforms — specify ?platform=instagram or ?platform=tiktok",
    });
  }
  if (!PLATFORMS.includes(p)) {
    return reply.code(400).send({ error: "invalid_platform", allowed: [...PLATFORMS, "all"] });
  }

  const account = await get("SELECT * FROM accounts WHERE platform = @p AND handle = @handle", { p, handle });
  if (!account) return reply.code(404).send({ error: "not_found" });

  const c = await get(
    `SELECT * FROM classifications WHERE platform = @p AND handle = @handle ORDER BY id DESC LIMIT 1`,
    { p, handle }
  );
  const posts_in_db = (await get("SELECT COUNT(*) AS n FROM posts WHERE platform = @p AND handle = @handle", { p, handle })).n;
  const classifications_count = (await get("SELECT COUNT(*) AS n FROM classifications WHERE platform = @p AND handle = @handle", { p, handle })).n;
  const candidate_accounts_count = (await get("SELECT COUNT(*) AS n FROM candidate_accounts WHERE platform = @p AND handle = @handle", { p, handle })).n;

  return {
    ...account,
    predicted_category: c ? c.category : null,
    predicted_genuineness: c ? c.genuineness : null,
    posts_in_db,
    classifications_count,
    candidate_accounts_count,
    classification: c
      ? { ...c, signals_snapshot: safeParse(c.signals_snapshot_json, null) }
      : null,
  };
});

// ---------------------------------------------------------------- /api/accounts/:handle/posts
app.get("/api/accounts/:handle/posts", async (req, reply) => {
  const { handle } = req.params;
  if (!HANDLE_RE.test(handle)) return reply.code(400).send({ error: "invalid_handle" });
  const platform = parsePlatform(req.query, reply);
  if (!platform) return;

  const where = ["handle = @handle"];
  const args = { handle };
  if (platform !== "all") {
    where.push("platform = @platform");
    args.platform = platform;
  }
  const whereSql = where.join(" AND ");

  const account = await get(`SELECT handle FROM accounts WHERE ${whereSql} LIMIT 1`, args);
  if (!account) return reply.code(404).send({ error: "not_found" });

  const rows = await all(`SELECT * FROM posts WHERE ${whereSql} ORDER BY posted_at DESC`, args);
  const posts = rows.map((p) => ({ ...p, hashtags: safeParse(p.hashtags_json, []) }));
  return { handle, platform, count: posts.length, posts };
});

// ---------------------------------------------------------------- POST /api/search (v0.13)
// Ad-hoc discovery search for the dashboard Search tab. Wraps the same runAdhocSearch core
// the CLI uses (search + prefilter, no staging/fetch/classify). Logs a curator_actions row.
// Instagram only — TikTok /search isn't wired into discovery yet.
app.post("/api/search", async (req, reply) => {
  const body = req.body ?? {};
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const platform = body.platform || "instagram";
  let limit = parseInt(body.limit, 10);
  limit = Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 50);

  if (!query) return reply.code(400).send({ error: "empty_query", message: "query is required." });
  if (query.length > 200) return reply.code(400).send({ error: "query_too_long", message: "query must be ≤200 characters." });
  if (!PLATFORMS.includes(platform)) return reply.code(400).send({ error: "invalid_platform", allowed: PLATFORMS });
  if (platform === "tiktok") {
    return reply.code(400).send({
      error: "tiktok_search_not_wired",
      message: "TikTok search adapter not integrated into discovery pipeline (known gap). Instagram-only for now.",
    });
  }

  // Budget guard: one search = one rapidapi call.
  if (!(await canCall("rapidapi"))) {
    return reply.code(429).send({ error: "budget_exhausted", message: "RapidAPI monthly budget exhausted — try again next cycle." });
  }

  let res;
  try {
    res = await runAdhocSearch({ query, platform, limit });
  } catch (e) {
    logger.error(`/api/search "${query}" failed: ${e.message}`);
    return reply.code(502).send({ error: "search_failed", message: "Upstream search failed. See server logs." });
  }

  await logAction({
    action: "search_adhoc",
    target_type: "search",
    target_id: query,
    platform,
    after_state: { survivors_count: res.survivors_count, raw_count: res.raw_count },
    reason: null,
    actor: req.user.username,
  });

  return {
    query: res.query,
    platform: res.platform,
    raw_count: res.raw_count,
    survivors_count: res.survivors_count,
    candidates: res.candidates,
  };
});

// ---------------------------------------------------------------- POST /api/accounts (v0.13)
// Manually add an account: fetch → gate (always) → classify → audit. Streams NDJSON progress
// lines ({stage}) so the modal can render a step checklist, ending with {stage:"done", ...}
// or {stage:"error", ...}. Validation/dup/budget failures return normal JSON BEFORE streaming.
const CORS_HEADERS = { "Access-Control-Allow-Origin": "http://localhost:5173", "Access-Control-Allow-Credentials": "true" };

app.post("/api/accounts", async (req, reply) => {
  const b = req.body ?? {};
  const handle = typeof b.handle === "string" ? b.handle.replace(/^@/, "").trim() : "";
  const platform = b.platform;
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  const expectedCategory = b.expected_category || null;
  const expectedGenuineness = b.expected_genuineness || null;

  if (!handle || !HANDLE_RE.test(handle)) return reply.code(400).send({ error: "invalid_handle", message: "A valid handle is required." });
  if (!PLATFORMS.includes(platform)) return reply.code(400).send({ error: "invalid_platform", allowed: PLATFORMS });
  if (!reason) return reply.code(400).send({ error: "missing_reason", message: "A reason is required (logged to the audit trail)." });
  if (expectedCategory && !VALID_CATEGORIES.includes(expectedCategory)) return reply.code(400).send({ error: "invalid_category", allowed: VALID_CATEGORIES });
  if (expectedGenuineness && !VALID_GENUINENESS.includes(expectedGenuineness)) return reply.code(400).send({ error: "invalid_genuineness", allowed: VALID_GENUINENESS });

  const existing = await get("SELECT handle FROM accounts WHERE platform=@platform AND handle=@handle", { platform, handle });
  if (existing) return reply.code(409).send({ error: "duplicate", message: "This account is already in the catalog." });

  const fetchKey = platform === "tiktok" ? "tiktok_rapidapi" : "rapidapi";
  if (!(await canCall(fetchKey)) || !(await canCall("openrouter"))) {
    return reply.code(429).send({ error: "budget_exhausted", message: "API budget exhausted — try again next cycle." });
  }

  // Begin NDJSON stream. Hijack the reply so we control the raw socket; set CORS manually
  // (the cors plugin's onSend doesn't run on a hijacked response).
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", ...CORS_HEADERS });
  const send = (obj) => raw.write(JSON.stringify(obj) + "\n");

  try {
    const result = await addAccount({
      handle, platform, reason, actor: req.user.username,
      expectedCategory, expectedGenuineness,
      onProgress: (stage) => send({ stage }),
    });
    send({ stage: "done", account: result.account, classification: result.classification, gate: result.gate });
  } catch (e) {
    logger.error(`/api/accounts add @${handle} failed: ${e.message}`);
    send({ stage: "error", code: e.code || "internal", message: e.message });
  }
  raw.end();
});

// ---------------------------------------------------------------- DELETE /api/accounts/:handle (v0.13)
// Cascade-remove an account (classifications, posts, candidate_accounts, accounts).
// api_calls preserved. ?platform= required. Body: { reason }. Returns before_state + audit_id.
app.delete("/api/accounts/:handle", async (req, reply) => {
  const { handle } = req.params;
  if (!HANDLE_RE.test(handle)) return reply.code(400).send({ error: "invalid_handle" });
  const p = req.query.platform;
  if (!PLATFORMS.includes(p)) {
    return reply.code(400).send({ error: "platform_required", message: "specify ?platform=instagram or ?platform=tiktok" });
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (!reason) return reply.code(400).send({ error: "missing_reason", message: "A reason is required (logged to the audit trail)." });

  const exists = await get("SELECT handle FROM accounts WHERE platform=@p AND handle=@handle", { p, handle });
  if (!exists) return reply.code(404).send({ error: "not_found" });

  try {
    const res = await removeAccount({ handle, platform: p, reason, actor: req.user.username });
    return { removed: true, before_state: res.before_state, deleted: res.deleted, audit_id: res.audit_id };
  } catch (e) {
    if (e.code === "not_found") return reply.code(404).send({ error: "not_found" });
    logger.error(`/api/accounts delete @${handle} failed: ${e.message}`);
    return reply.code(500).send({ error: "remove_failed", message: e.message });
  }
});

// ---------------------------------------------------------------- /api/keywords (v0.13)
// Keyword (discovery-hashtag) management over seed_hashtags.json. Read fresh from disk each
// request. Platform-agnostic (hashtags aren't platform-scoped). Every mutation is audited.
app.get("/api/keywords", async () => {
  const doc = seedHashtags.load();
  const tiers = {};
  for (const t of KNOWN_TIERS) tiers[t] = seedHashtags.getTierArray(doc, t) || [];

  const removed_from_rotation = seedHashtags.removedList(doc).map((e) =>
    typeof e === "string"
      ? { hashtag: e, removed_at: doc.removed_from_rotation?.removed_at ?? null, reason: doc.removed_from_rotation?.reason ?? null, from_tier: null }
      : { hashtag: e.hashtag, removed_at: e.removed_at ?? null, reason: e.reason ?? null, from_tier: e.from_tier ?? null }
  );
  const skip_list = (doc.skip_list || []).map((s) => ({ hashtag: s.hashtag, reason: s.reason ?? null }));

  return { tiers, removed_from_rotation, skip_list };
});

app.post("/api/keywords", async (req, reply) => {
  const b = req.body ?? {};
  const hashtag = typeof b.hashtag === "string" ? b.hashtag : "";
  const tier = b.tier;
  if (!hashtag.trim()) return reply.code(400).send({ error: "missing_hashtag", message: "A hashtag is required." });
  if (!KNOWN_TIERS.includes(tier)) return reply.code(400).send({ error: "invalid_tier", allowed: KNOWN_TIERS });

  try {
    const res = await addKeyword({
      hashtag, tier, subCluster: b.sub_cluster || "", notes: b.notes || "",
      force: !!b.force, actor: req.user.username,
    });
    return reply.code(201).send({ added: true, hashtag: res.hashtag, tier: res.tier, restored: res.restored, audit_id: res.audit_id });
  } catch (e) {
    if (e.code === "duplicate") return reply.code(409).send({ error: "duplicate", tier: e.extra?.tier, message: `Already in tier ${e.extra?.tier}.` });
    if (e.code === "in_skip_list") return reply.code(409).send({ error: "in_skip_list", message: "Hashtag is in the skip list." });
    if (e.code === "already_removed") return reply.code(409).send({ error: "already_removed", removed_at: e.extra?.removed_at, reason: e.extra?.reason, message: "Hashtag was previously removed." });
    if (e.code === "invalid_tier") return reply.code(400).send({ error: "invalid_tier", allowed: KNOWN_TIERS });
    logger.error(`/api/keywords add "${hashtag}" failed: ${e.message}`);
    return reply.code(500).send({ error: "add_failed", message: e.message });
  }
});

app.delete("/api/keywords/:hashtag", async (req, reply) => {
  const hashtag = req.params.hashtag;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length < 10) return reply.code(400).send({ error: "missing_reason", message: "A reason of at least 10 characters is required." });

  try {
    const res = await removeKeyword({ hashtag, reason, actor: req.user.username });
    return { removed: true, from_tier: res.from_tier, audit_id: res.audit_id };
  } catch (e) {
    if (e.code === "not_found") return reply.code(404).send({ error: "not_found_in_any_active_tier", message: "Hashtag not found in any active tier." });
    logger.error(`/api/keywords delete "${hashtag}" failed: ${e.message}`);
    return reply.code(500).send({ error: "remove_failed", message: e.message });
  }
});

// ---------------------------------------------------------------- /api/report
// Metric breakdown for one platform (or 'all'). Budget is per-platform: instagram uses
// rapidapi+openrouter; tiktok uses tiktok_rapidapi+openrouter (openrouter shared).
async function computeBreakdown(platform) {
  const filter = platform === "all" ? "" : "WHERE a.platform = @platform";
  const args = platform === "all" ? {} : { platform };
  const rows = await all(
    `SELECT
       a.expected_category, c.category AS predicted_category,
       a.expected_genuineness, c.genuineness AS predicted_genuineness,
       c.category_method, c.category_rule_matched, c.genuineness_rule_matched
     ${LATEST_JOIN} ${filter}`,
    args
  );

  const catScored = rows.filter((r) => r.expected_category);
  const catCorrect = catScored.filter((r) => r.predicted_category === r.expected_category).length;
  const genScored = rows.filter((r) => r.expected_genuineness);
  const genCorrect = genScored.filter((r) => r.predicted_genuineness === r.expected_genuineness).length;
  const flagged = rows.filter(
    (r) => r.expected_genuineness === "Genuine" && (r.predicted_genuineness === "Low-effort" || r.predicted_genuineness === "Uncertain")
  ).length;

  const tally = (key) => {
    const m = {};
    for (const r of rows) if (r[key]) m[r[key]] = (m[r[key]] || 0) + 1;
    return m;
  };

  const openrouter = await monthlyCount("openrouter");
  let budget;
  if (platform === "tiktok") {
    budget = {
      tiktok_rapidapi: { used: await monthlyCount("tiktok_rapidapi"), cap: capFor("tiktok_rapidapi") },
      openrouter: { used: openrouter, cap: capFor("openrouter") },
    };
  } else {
    budget = {
      rapidapi: { used: await monthlyCount("rapidapi"), cap: capFor("rapidapi") },
      openrouter: { used: openrouter, cap: capFor("openrouter") },
    };
  }

  return {
    total: rows.length,
    category_agreement: { correct: catCorrect, total: catScored.length, percent: pct(catCorrect, catScored.length) },
    genuineness_agreement: { correct: genCorrect, total: genScored.length, percent: pct(genCorrect, genScored.length) },
    method_breakdown: {
      rule: rows.filter((r) => r.category_method === "rule").length,
      llm: rows.filter((r) => r.category_method === "llm").length,
      gate: rows.filter((r) => r.category_method === "gate").length,
    },
    category_rules_fired: tally("category_rule_matched"),
    genuineness_rules_fired: tally("genuineness_rule_matched"),
    flagged_non_genuine: flagged,
    budget,
  };
}

app.get("/api/report", async (req, reply) => {
  const platform = parsePlatform(req.query, reply);
  if (!platform) return;

  if (platform === "all") {
    const [instagram, tiktok] = await Promise.all([computeBreakdown("instagram"), computeBreakdown("tiktok")]);
    return {
      platform: "all",
      total_accounts: instagram.total + tiktok.total,
      platforms: { instagram, tiktok },
    };
  }

  // Single platform: flat shape at top level (backward-compatible with the pre-Phase-D
  // dashboard). total -> total_accounts; no `platforms` wrapper.
  const b = await computeBreakdown(platform);
  return {
    total_accounts: b.total,
    category_agreement: b.category_agreement,
    genuineness_agreement: b.genuineness_agreement,
    method_breakdown: b.method_breakdown,
    category_rules_fired: b.category_rules_fired,
    genuineness_rules_fired: b.genuineness_rules_fired,
    flagged_non_genuine: b.flagged_non_genuine,
    budget: b.budget,
  };
});

// ---------------------------------------------------------------- /api/rules
// Static rule descriptions kept in sync with category_rules.js / genuineness.js, plus
// the live threshold constants imported from those modules.
const CATEGORY_RULES = [
  { id: "CR1_DAILY_NEWS", category: "AI News/Aggregator", confidence: 0.85, condition: "(handle ~ daily|news|updates OR bio ~ daily ai|ai news|updates) AND posts_per_week >= 5" },
  { id: "CR4_PROMOTER_STRONG", category: "AI Promoter", confidence: 0.75, condition: "bio ~ founder|ceo|we help|book a call|our platform|try our AND external_url present AND bio !~ i teach|tutorials|learn (evaluated before CR2)" },
  { id: "CR2_TOOL_REVIEWER", category: "AI Tool Reviewer", confidence: 0.75, condition: "tool-hashtag fraction >= 0.5 AND avg caption > 100 chars AND bio !~ teach|tutorial|learn|guide|master|expert AND bio !~ founder|ceo|our platform|our tools|apply|book a call" },
  { id: "CR3_EDUCATOR_HANDLE", category: "AI Educator", confidence: 0.8, condition: "handle ~ aiwith|withai|learnai|ai.tutorial OR bio ~ i teach|learn ai|ai tutorials|ai course" },
  { id: "CR5_HYBRID_MARKETING", category: "Hybrid Creator+Promoter", confidence: 0.75, condition: "bio ~ agency|we help brands|marketing|lead gen|automation for AND external_url present" },
  { id: "CR6_NEWS_BROAD", category: "AI News/Aggregator", confidence: 0.7, condition: "(handle ~ ^the?(artificial|ai|genai) OR bio ~ everything ai|all things ai) AND posts_per_week >= 3" },
];
const GENUINENESS_RULES = [
  { id: "R1_ONE_POST_WONDER", label: "Low-effort", condition: `post_count < ${THRESHOLDS.MIN_POST_COUNT}` },
  { id: "R2_DORMANT", label: "Low-effort", condition: `days_since_last_post > ${THRESHOLDS.DORMANT_DAYS}` },
  { id: "R3_LOW_CADENCE", label: "Low-effort", condition: `posts_last_90d < ${THRESHOLDS.MIN_POSTS_90D}` },
  { id: "R4_DEAD_ENGAGEMENT", label: "Low-effort", condition: `engagement_rate < ${THRESHOLDS.DEAD_ER}` },
  { id: "R5_BOTLIKE_ENGAGEMENT", label: "Uncertain", condition: `engagement_rate > ${THRESHOLDS.BOTLIKE_ER}` },
  { id: "R6_LARGE_LOW_ER", label: "Uncertain", condition: `follower_count > ${THRESHOLDS.LARGE_FOLLOWERS} AND engagement_rate < ${THRESHOLDS.LARGE_LOW_ER}` },
  { id: "R7_PURCHASED_LIKE", label: "Uncertain", condition: `follower_count > ${THRESHOLDS.PURCHASED_FOLLOWERS} AND follower_following_ratio > ${THRESHOLDS.PURCHASED_RATIO}` },
  { id: "R8_TEMPLATE_FARM", label: "Low-effort", condition: `duplicate_caption_fraction > ${THRESHOLDS.TEMPLATE_DUP_FRAC}` },
  { id: "DEFAULT", label: "Genuine", condition: "no rule fired" },
];

app.get("/api/rules", async (req, reply) => {
  const platform = parsePlatform(req.query, reply); // validated but rules are shared
  if (!platform) return;

  // last_updated = newest mtime of the two rule modules.
  const files = ["category_rules.js", "genuineness.js"].map((f) => resolve(__dirname, f));
  const last_updated = new Date(
    Math.max(...files.map((f) => statSync(f).mtimeMs))
  ).toISOString();

  return {
    rules_are_shared: true,
    applies_to: [...PLATFORMS],
    category: CATEGORY_RULES,
    genuineness: GENUINENESS_RULES,
    meta: {
      last_updated,
      category_confidence_threshold: CONF_THRESHOLD,
      genuineness_thresholds: THRESHOLDS,
      tool_hashtags: [...TOOL_HASHTAGS],
    },
  };
});

// ---------------------------------------------------------------- /api/prompts
// The exact classifier prompt files + metadata, read fresh from disk per request
// (small files; no caching needed). Auth-required (not in AUTH_EXEMPT). Read-only.
const PROMPT_FILES = [
  {
    name: "AI-relevance gate",
    file_path: "src/prompts/ai_relevance_v1.md",
    version: GATE_PROMPT_VERSION,
    model: config.openrouter.model,
    purpose: "Decides whether an account is primarily AI content before category classification. Gate-fail → category = Uncategorized.",
  },
  {
    name: "Category classifier fallback",
    file_path: "src/prompts/category_llm_v1.md",
    version: CATEGORY_PROMPT_VERSION,
    model: config.openrouter.model,
    purpose: "Assigns an AI-creator category when the deterministic rules are inconclusive.",
  },
];

app.get("/api/prompts", async () => {
  const prompts = await Promise.all(
    PROMPT_FILES.map(async (p) => ({
      ...p,
      content: await readFile(resolve(config.projectRoot, p.file_path), "utf8"),
    }))
  );
  return { prompts };
});

// ---------------------------------------------------------------- /api/services
// External services + live monthly usage (from the budget ledger). provider_key maps to
// the api_calls.provider value budget.js counts against. Auth-required.
const SERVICE_DEFS = [
  {
    name: "Instagram profile data",
    provider: "RapidAPI (instagram-looter2)",
    endpoints: ["/profile", "/search"],
    purpose: "Fetch profile + posts, discovery search",
    provider_key: "rapidapi",
  },
  {
    name: "TikTok profile data",
    provider: "RapidAPI (tiktok-scraper7)",
    endpoints: ["/user/info", "/user/posts"],
    purpose: "Fetch profile + posts",
    provider_key: "tiktok_rapidapi",
  },
  {
    name: "LLM (classification + AI-relevance gate)",
    provider: "OpenRouter (Google Gemini 2.5 Flash)",
    endpoints: ["chat/completions"],
    purpose: "Category fallback + AI-relevance gate",
    provider_key: "openrouter",
  },
];

function serviceStatus(usage, cap) {
  if (usage >= cap) return "capped";
  if (usage >= cap * 0.85) return "throttled";
  return "healthy";
}

app.get("/api/services", async () => {
  const services = await Promise.all(
    SERVICE_DEFS.map(async (s) => {
      const usage = await monthlyCount(s.provider_key);
      const cap = capFor(s.provider_key);
      return { ...s, usage, cap, status: serviceStatus(usage, cap) };
    })
  );
  return { services };
});

// ---------------------------------------------------------------- lifecycle
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  try {
    await app.close();
    await closeDb();
  } catch (e) {
    logger.error(`shutdown error: ${e.message}`);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Cleanup: drop expired sessions on startup.
const purged = await run("DELETE FROM sessions WHERE expires_at < @now", { now: nowIso() });
logger.info(`startup: purged ${purged.rowsAffected ?? 0} expired session(s)`);

try {
  await app.listen({ port: PORT, host: HOST });
  logger.info(`server listening on http://${HOST}:${PORT}`);
} catch (err) {
  logger.error(`failed to start: ${err.message}`);
  process.exit(1);
}

/**
 * friendDb.js — READ-ONLY connection to friend's PostgreSQL DB (keyword source).
 * STRICT RULE: Only SELECT queries. Never INSERT / UPDATE / DELETE.
 *
 * Migrated from Turso (libSQL) → PostgreSQL. The exported function signatures are
 * unchanged, so the X Agent engine (server.js) and the keyword/admin/settings
 * routes that consume this module need no edits.
 *
 * Connection: process.env.POSTGRES_URL
 *   e.g. postgresql://user:pass@host:5432/kiteai_brand_visibility?sslmode=require
 *
 * Friend's DB tables (confirmed):
 *   keywords        — keyword, search_query, class_key, priority, enabled, ...
 *   keyword_classes — class_key, name, description, color_hex, display_order
 *   influencers     — handle, display_name, follower_tier, priority, enabled, ...
 */

const { Pool } = require('pg');

let _pool = null;

function getPool() {
  if (_pool) return _pool;
  const url = (process.env.POSTGRES_URL || '').trim();
  if (!url) return null;
  try {
    _pool = new Pool({
      // strip any ?sslmode=... so our explicit ssl opts apply (the DB uses a
      // self-signed cert, so we require SSL but skip strict CA verification)
      connectionString: url.split('?')[0],
      ssl: { rejectUnauthorized: false },
      max: 4,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    _pool.on('error', (e) => console.warn('[FriendDB] pool error:', e.message));
  } catch (err) {
    console.warn('[FriendDB] pool init failed:', err.message);
    return null;
  }
  return _pool;
}

/** Pull enabled search queries for agent runs — High priority first, capped at maxRows */
async function getFriendSearchQueries({ maxRows = 300 } = {}) {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT search_query, keyword, class_key, priority
      FROM   keywords
      WHERE  enabled = 1
        AND  search_query IS NOT NULL
        AND  length(trim(search_query)) > 1
      ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'STANDARD' THEN 2 ELSE 3 END, class_key, id
      LIMIT ${Number(maxRows) || 300}`);
    const seen = new Set();
    const queries = [];
    for (const r of rows) {
      const q = (r.search_query || r.keyword || '').trim().toLowerCase();
      if (q && !seen.has(q)) { seen.add(q); queries.push(q); }
    }
    console.log(`[FriendDB] ${queries.length} search queries loaded`);
    return queries;
  } catch (err) { console.warn('[FriendDB] getFriendSearchQueries:', err.message); return []; }
}

/** Pull known influencer handles for direct profile fetch */
async function getFriendInfluencerHandles() {
  const pool = getPool();
  if (!pool) return [];
  try {
    const { rows } = await pool.query(`
      SELECT handle FROM influencers WHERE enabled = 1
      ORDER BY CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`);
    const handles = rows.map(r => (r.handle || '').trim().replace(/^@/, '').toLowerCase()).filter(h => h.length > 0);
    console.log(`[FriendDB] ${handles.length} influencer handles loaded`);
    return handles;
  } catch (err) { console.warn('[FriendDB] getFriendInfluencerHandles:', err.message); return []; }
}

/** Full data for the Keywords page UI */
async function getFriendKeywordsForUI() {
  const pool = getPool();
  if (!pool) return null;
  try {
    const [classRes, kwRes, infRes] = await Promise.all([
      pool.query(`SELECT class_key, name, description, color_hex FROM keyword_classes ORDER BY display_order`),
      pool.query(`SELECT id, keyword, class_key, sub_category, intent, priority, search_query, enabled
                  FROM keywords ORDER BY class_key,
                    CASE priority WHEN 'High' THEN 1 WHEN 'STANDARD' THEN 2 ELSE 3 END, keyword`),
      pool.query(`SELECT handle, display_name, specialty, follower_tier, priority, enabled
                  FROM influencers ORDER BY CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`),
    ]);
    return {
      configured:  true,
      classes:     classRes.rows,
      keywords:    kwRes.rows,
      influencers: infRes.rows,
      totals: {
        keywords:    kwRes.rows.length,
        active:      kwRes.rows.filter(r => r.enabled).length,
        influencers: infRes.rows.length,
      },
    };
  } catch (err) {
    console.warn('[FriendDB] getFriendKeywordsForUI:', err.message);
    return { configured: true, error: err.message, classes: [], keywords: [], influencers: [], totals: { keywords: 0, active: 0, influencers: 0 } };
  }
}

/** Connection test */
async function testFriendDb() {
  const url = (process.env.POSTGRES_URL || '').trim();
  if (!url) return { ok: false, error: 'POSTGRES_URL not set in .env' };
  try {
    const pool = getPool();
    if (!pool) return { ok: false, error: 'DB pool not initialised (check POSTGRES_URL)' };
    const [kwRes, infRes] = await Promise.all([
      pool.query('SELECT COUNT(*) as n FROM keywords WHERE enabled = 1'),
      pool.query('SELECT COUNT(*) as n FROM influencers WHERE enabled = 1'),
    ]);
    return { ok: true, keywordCount: Number(kwRes.rows[0].n), influencerCount: Number(infRes.rows[0].n) };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { getFriendSearchQueries, getFriendInfluencerHandles, getFriendKeywordsForUI, testFriendDb };

/**
 * friendDb.js — READ-ONLY connection to friend's Turso DB.
 * STRICT RULE: Only SELECT queries. Never INSERT / UPDATE / DELETE.
 *
 * Friend's DB tables (confirmed):
 *   keywords        (1506 rows) — keyword, search_query, class_key, priority, enabled
 *   keyword_classes (9 rows)    — class_key, name, description, color_hex
 *   influencers     (42 rows)   — handle, display_name, follower_tier, priority, enabled
 */

const { createClient } = require('@libsql/client');

let _client = null;

function getClient() {
  if (_client) return _client;
  const url   = process.env.FRIEND_TURSO_URL?.trim();
  const token = process.env.FRIEND_TURSO_TOKEN?.trim();
  if (!url || !token) return null;
  try { _client = createClient({ url, authToken: token }); } catch { return null; }
  return _client;
}

/** Pull enabled search queries for agent runs — High priority first, capped at maxRows */
async function getFriendSearchQueries({ maxRows = 300 } = {}) {
  const client = getClient();
  if (!client) return [];
  try {
    const { rows } = await client.execute(`
      SELECT search_query, keyword, class_key, priority
      FROM   keywords
      WHERE  enabled = 1
        AND  search_query IS NOT NULL
        AND  length(trim(search_query)) > 1
      ORDER BY CASE priority WHEN 'High' THEN 1 WHEN 'STANDARD' THEN 2 ELSE 3 END, class_key, id
      LIMIT ${maxRows}`);
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
  const client = getClient();
  if (!client) return [];
  try {
    const { rows } = await client.execute(`
      SELECT handle FROM influencers WHERE enabled = 1
      ORDER BY CASE priority WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`);
    const handles = rows.map(r => (r.handle || '').trim().replace(/^@/, '').toLowerCase()).filter(h => h.length > 0);
    console.log(`[FriendDB] ${handles.length} influencer handles loaded`);
    return handles;
  } catch (err) { console.warn('[FriendDB] getFriendInfluencerHandles:', err.message); return []; }
}

/** Full data for the Keywords page UI */
async function getFriendKeywordsForUI() {
  const client = getClient();
  if (!client) return null;
  try {
    const [classRes, kwRes, infRes] = await Promise.all([
      client.execute(`SELECT class_key, name, description, color_hex FROM keyword_classes ORDER BY display_order`),
      client.execute(`SELECT id, keyword, class_key, sub_category, intent, priority, search_query, enabled
                      FROM keywords ORDER BY class_key,
                        CASE priority WHEN 'High' THEN 1 WHEN 'STANDARD' THEN 2 ELSE 3 END, keyword`),
      client.execute(`SELECT handle, display_name, specialty, follower_tier, priority, enabled
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
  const url = process.env.FRIEND_TURSO_URL?.trim();
  if (!url) return { ok: false, error: 'FRIEND_TURSO_URL not set in .env' };
  try {
    const client = getClient();
    if (!client) return { ok: false, error: 'DB client not initialised (check FRIEND_TURSO_TOKEN)' };
    const [kwRes, infRes] = await Promise.all([
      client.execute('SELECT COUNT(*) as n FROM keywords WHERE enabled = 1'),
      client.execute('SELECT COUNT(*) as n FROM influencers WHERE enabled = 1'),
    ]);
    return { ok: true, keywordCount: Number(kwRes.rows[0].n), influencerCount: Number(infRes.rows[0].n) };
  } catch (err) { return { ok: false, error: err.message }; }
}

module.exports = { getFriendSearchQueries, getFriendInfluencerHandles, getFriendKeywordsForUI, testFriendDb };

throw new Error(
  "This script targets legacy Turso/SQLite and is not compatible with Postgres. " +
    "Postgres schema is managed via db/schema.postgres.sql and scripts/migrate_schema_to_postgres.js. " +
    "If you need this functionality, port it to Postgres first."
);

// Phase B: make core tables platform-aware. Idempotent — safe to re-run (guards each
// step on PRAGMA table_info / PK shape). Logs every step with row counts.
//
// Turso ENFORCES foreign keys. accounts.handle was a PRIMARY KEY and posts/classifications
// had FK -> accounts(handle). Making the PK composite (platform, handle) means handle is
// no longer unique alone, which invalidates those single-column FKs. So accounts, posts,
// and classifications are all RECREATED (via client.migrate(), which disables FK enforcement
// for the migration): accounts gets composite PK + platform/sec_uid/external_id; posts gets
// platform/views/shares and its FK dropped; classifications gets platform and its FK dropped.
// Referential integrity is maintained in application code. api_calls + candidate_accounts have
// no FK -> simple ALTER ADD COLUMN. Backup taken first (db/backup_pre_multiplatform_*.sql).
import { client, all, get, run } from "../src/db.js";
import { logger } from "../src/logger.js";

const columns = async (t) => (await all(`PRAGMA table_info(${t})`)).map((r) => r.name);
const pkColumns = async (t) => (await all(`PRAGMA table_info(${t})`)).filter((r) => r.pk > 0).map((r) => r.name);
async function addColumnIfMissing(t, col, def) {
  if ((await columns(t)).includes(col)) { logger.info(`  ${t}.${col} present — skip`); return; }
  await client.execute(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`);
  logger.info(`  ${t}.${col} added (${def})`);
}
async function count(t) { return (await get(`SELECT COUNT(*) n FROM ${t}`)).n; }

// ---- 1. accounts: composite PK (platform, handle) + new columns ----
if ((await pkColumns("accounts")).includes("platform")) {
  logger.info("accounts: composite PK already present — skip");
} else {
  const before = await count("accounts");
  await client.migrate([
    "DROP TABLE IF EXISTS accounts_new",
    `CREATE TABLE accounts_new (
      handle TEXT NOT NULL, display_name TEXT, bio TEXT, profile_pic_url TEXT,
      is_verified INTEGER, is_business_account INTEGER,
      follower_count INTEGER, following_count INTEGER, post_count INTEGER,
      external_url TEXT, bio_email TEXT, raw_profile_json TEXT,
      expected_category TEXT, expected_genuineness TEXT,
      engagement_rate REAL, follower_following_ratio REAL,
      days_since_last_post INTEGER, posts_last_90d INTEGER,
      posts_per_week_last_8w REAL, duplicate_caption_fraction REAL,
      avg_likes REAL, avg_comments REAL, signals_computed_at TEXT,
      first_seen_at TEXT NOT NULL, last_refreshed_at TEXT, discovered_via TEXT,
      platform TEXT NOT NULL DEFAULT 'instagram', sec_uid TEXT, external_id TEXT,
      PRIMARY KEY (platform, handle)
    )`,
    `INSERT INTO accounts_new
      (handle, display_name, bio, profile_pic_url, is_verified, is_business_account,
       follower_count, following_count, post_count, external_url, bio_email, raw_profile_json,
       expected_category, expected_genuineness, engagement_rate, follower_following_ratio,
       days_since_last_post, posts_last_90d, posts_per_week_last_8w, duplicate_caption_fraction,
       avg_likes, avg_comments, signals_computed_at, first_seen_at, last_refreshed_at, discovered_via, platform)
     SELECT handle, display_name, bio, profile_pic_url, is_verified, is_business_account,
       follower_count, following_count, post_count, external_url, bio_email, raw_profile_json,
       expected_category, expected_genuineness, engagement_rate, follower_following_ratio,
       days_since_last_post, posts_last_90d, posts_per_week_last_8w, duplicate_caption_fraction,
       avg_likes, avg_comments, signals_computed_at, first_seen_at, last_refreshed_at, discovered_via, 'instagram'
     FROM accounts`,
    "DROP TABLE accounts",
    "ALTER TABLE accounts_new RENAME TO accounts",
  ]);
  const after = await count("accounts");
  logger.info(`accounts recreated: ${before} -> ${after} rows (composite PK + platform/sec_uid/external_id)`);
  if (before !== after) throw new Error(`accounts count drift ${before}->${after}`);
}

// ---- 2. posts: + platform, views, shares; drop FK ----
if ((await columns("posts")).includes("platform")) {
  logger.info("posts: platform present — skip recreation");
} else {
  const before = await count("posts");
  await client.migrate([
    "DROP TABLE IF EXISTS posts_new",
    `CREATE TABLE posts_new (
      post_id TEXT PRIMARY KEY, handle TEXT NOT NULL, caption TEXT, media_type TEXT,
      hashtags_json TEXT, likes INTEGER, comments INTEGER, posted_at TEXT, raw_json TEXT,
      platform TEXT NOT NULL DEFAULT 'instagram', views INTEGER, shares INTEGER
    )`,
    `INSERT INTO posts_new (post_id, handle, caption, media_type, hashtags_json, likes, comments, posted_at, raw_json, platform)
     SELECT post_id, handle, caption, media_type, hashtags_json, likes, comments, posted_at, raw_json, 'instagram' FROM posts`,
    "DROP TABLE posts",
    "ALTER TABLE posts_new RENAME TO posts",
    "CREATE INDEX IF NOT EXISTS idx_posts_handle ON posts(handle)",
    "CREATE INDEX IF NOT EXISTS idx_posts_platform_handle ON posts(platform, handle)",
  ]);
  const after = await count("posts");
  logger.info(`posts recreated: ${before} -> ${after} rows (+platform/views/shares, FK dropped)`);
  if (before !== after) throw new Error(`posts count drift ${before}->${after}`);
}

// ---- 3. classifications: + platform; drop FK (preserve id) ----
if ((await columns("classifications")).includes("platform")) {
  logger.info("classifications: platform present — skip recreation");
} else {
  const before = await count("classifications");
  await client.migrate([
    "DROP TABLE IF EXISTS classifications_new",
    `CREATE TABLE classifications_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT, handle TEXT NOT NULL,
      category TEXT NOT NULL, category_confidence REAL, category_method TEXT NOT NULL,
      category_rule_matched TEXT, genuineness TEXT NOT NULL, genuineness_rule_matched TEXT,
      ai_content_fraction REAL, reasoning TEXT, signals_snapshot_json TEXT,
      prompt_version TEXT, model TEXT, created_at TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram'
    )`,
    `INSERT INTO classifications_new (id, handle, category, category_confidence, category_method, category_rule_matched,
       genuineness, genuineness_rule_matched, ai_content_fraction, reasoning, signals_snapshot_json, prompt_version, model, created_at, platform)
     SELECT id, handle, category, category_confidence, category_method, category_rule_matched,
       genuineness, genuineness_rule_matched, ai_content_fraction, reasoning, signals_snapshot_json, prompt_version, model, created_at, 'instagram'
     FROM classifications`,
    "DROP TABLE classifications",
    "ALTER TABLE classifications_new RENAME TO classifications",
    "CREATE INDEX IF NOT EXISTS idx_classifications_handle ON classifications(handle)",
    "CREATE INDEX IF NOT EXISTS idx_classifications_platform_handle ON classifications(platform, handle)",
  ]);
  const after = await count("classifications");
  logger.info(`classifications recreated: ${before} -> ${after} rows (+platform, FK dropped)`);
  if (before !== after) throw new Error(`classifications count drift ${before}->${after}`);
}

// ---- 4-5. api_calls + candidate_accounts: no FK -> simple ALTER ----
for (const t of ["api_calls", "candidate_accounts"]) {
  logger.info(`${t}: adding platform…`);
  await addColumnIfMissing(t, "platform", "TEXT DEFAULT 'instagram'");
}

// ---- 6. backfill platform='instagram' where null ----
for (const t of ["accounts", "posts", "classifications", "api_calls", "candidate_accounts"]) {
  const r = await run(`UPDATE ${t} SET platform='instagram' WHERE platform IS NULL`);
  logger.info(`backfill ${t}: ${r.rowsAffected ?? 0} rows set 'instagram'`);
}

// ---- verify ----
logger.info("=== post-migration counts by platform ===");
for (const t of ["accounts", "posts", "classifications", "api_calls", "candidate_accounts"]) {
  const rows = await all(`SELECT platform, COUNT(*) n FROM ${t} GROUP BY platform`);
  logger.info(`  ${t}: ${rows.map((r) => `${r.platform}=${r.n}`).join(", ")}`);
}
logger.info("migration complete.");

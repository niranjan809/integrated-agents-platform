-- Creator Radar schema — POSTGRES dialect
-- Translated from db/schema.sql (SQLite/Turso) for Phase M-2 migration to Postgres 17.
-- Translation rules applied: INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL; is_*/is_verified 0/1
-- INTEGER → BOOLEAN; datetime('now') default → now()::text; TEXT/INTEGER/REAL otherwise stable.
-- Dates deliberately kept as TEXT (not TIMESTAMP) for behavior parity with the existing codebase.
-- Table creation order matters: accounts before posts/classifications (application-level integrity).

-- ===== accounts (parent) =====
-- Composite PRIMARY KEY (platform, handle): the same handle may exist on multiple
-- platforms as distinct creators. platform-qualified columns (sec_uid, external_id)
-- support TikTok snowball lookups.
CREATE TABLE IF NOT EXISTS accounts (
  handle TEXT NOT NULL,
  display_name TEXT,
  bio TEXT,
  profile_pic_url TEXT,
  is_verified BOOLEAN,                 -- was INTEGER 0/1 (SQLite)
  is_business_account BOOLEAN,         -- was INTEGER 0/1 (SQLite)
  follower_count INTEGER,
  following_count INTEGER,
  post_count INTEGER,
  external_url TEXT,
  bio_email TEXT,
  raw_profile_json TEXT,
  expected_category TEXT,
  expected_genuineness TEXT,
  engagement_rate REAL,
  follower_following_ratio REAL,
  days_since_last_post INTEGER,
  posts_last_90d INTEGER,
  posts_per_week_last_8w REAL,
  duplicate_caption_fraction REAL,
  avg_likes REAL,
  avg_comments REAL,
  signals_computed_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_refreshed_at TEXT,
  discovered_via TEXT,
  platform TEXT NOT NULL DEFAULT 'instagram',
  sec_uid TEXT,
  external_id TEXT,
  -- AI-relevance gate (v0.9): cached per-account gate result, decoupled from classification.
  ai_relevance_gate INTEGER,          -- 1 = primarily AI content, 0 = gated out (kept INTEGER — see note below)
  ai_relevance_confidence REAL,
  ai_relevance_reasoning TEXT,
  ai_relevance_computed_at TEXT,
  ai_relevance_prompt_version TEXT,
  PRIMARY KEY (platform, handle)
);

-- ===== posts =====
-- No FK to accounts (application-level integrity). views/shares are TikTok-only (NULL for Instagram).
CREATE TABLE IF NOT EXISTS posts (
  post_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  caption TEXT,
  media_type TEXT,
  hashtags_json TEXT,
  likes INTEGER,
  comments INTEGER,
  posted_at TEXT,
  raw_json TEXT,
  platform TEXT NOT NULL DEFAULT 'instagram',
  views INTEGER,
  shares INTEGER
);

-- ===== classifications =====
-- No FK to accounts (application-level integrity).
CREATE TABLE IF NOT EXISTS classifications (
  id SERIAL PRIMARY KEY,               -- was INTEGER PRIMARY KEY AUTOINCREMENT
  handle TEXT NOT NULL,
  category TEXT NOT NULL,
  category_confidence REAL,
  category_method TEXT NOT NULL,
  category_rule_matched TEXT,
  genuineness TEXT NOT NULL,
  genuineness_rule_matched TEXT,
  ai_content_fraction REAL,
  reasoning TEXT,
  signals_snapshot_json TEXT,
  prompt_version TEXT,
  model TEXT,
  created_at TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'instagram'
);

-- ===== api_calls (budget ledger) =====
CREATE TABLE IF NOT EXISTS api_calls (
  id SERIAL PRIMARY KEY,               -- was INTEGER PRIMARY KEY AUTOINCREMENT
  provider TEXT NOT NULL,
  endpoint TEXT,
  handle TEXT,
  status INTEGER,
  called_at TEXT NOT NULL,
  platform TEXT DEFAULT 'instagram'
);

-- ===== candidate_accounts (discovery staging) =====
CREATE TABLE IF NOT EXISTS candidate_accounts (
  id SERIAL PRIMARY KEY,               -- was INTEGER PRIMARY KEY AUTOINCREMENT
  handle TEXT NOT NULL,
  pk TEXT,
  full_name TEXT,
  is_verified BOOLEAN,                 -- was INTEGER 0/1 (SQLite)
  discovered_via TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  prefilter_verdict TEXT,
  prefilter_reason TEXT,
  fetch_status TEXT,
  fetched_at TEXT,
  promoted_to_accounts INTEGER DEFAULT 0,   -- kept INTEGER 0/1 (not is_*/_flag named — see note below)
  promoted_at TEXT,
  platform TEXT DEFAULT 'instagram',
  UNIQUE(handle, discovered_via)
);

-- ===== curator_actions (audit ledger, v0.12) =====
-- Every curator CLI mutation logs a row here — queryable label/catalog change history.
-- before_state/after_state are JSON snapshots (nullable: adds have no before, removes no after).
CREATE TABLE IF NOT EXISTS curator_actions (
  id SERIAL PRIMARY KEY,               -- was INTEGER PRIMARY KEY AUTOINCREMENT
  action TEXT NOT NULL,        -- 'account_add', 'account_remove', 'keyword_add', 'keyword_remove', 'search_adhoc'
  target_type TEXT NOT NULL,   -- 'account', 'keyword', 'search'
  target_id TEXT NOT NULL,     -- handle for accounts, hashtag for keywords, query string for searches
  platform TEXT,               -- 'instagram', 'tiktok', or NULL for platform-agnostic
  before_state TEXT,           -- JSON snapshot before action (nullable)
  after_state TEXT,            -- JSON snapshot after action (nullable)
  reason TEXT,                 -- curator-provided justification
  actor TEXT DEFAULT 'anooj',  -- who did it (for future multi-curator setup)
  performed_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))   -- was datetime('now')
);

-- ===== users (auth — platform-agnostic) =====
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,               -- was INTEGER PRIMARY KEY AUTOINCREMENT
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

-- ===== sessions (auth — references users) =====
-- NOTE: this FK exists in the source SQLite schema (contradicting the "no FKs" assumption).
-- Kept as-is: FK syntax is identical in Postgres. See ambiguity note in report re: enforcement.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ===== indexes =====
-- accounts is covered by its composite PRIMARY KEY (platform, handle).
CREATE INDEX IF NOT EXISTS idx_posts_handle ON posts(handle);
CREATE INDEX IF NOT EXISTS idx_posts_platform_handle ON posts(platform, handle);
CREATE INDEX IF NOT EXISTS idx_classifications_handle ON classifications(handle);
CREATE INDEX IF NOT EXISTS idx_classifications_platform_handle ON classifications(platform, handle);
CREATE INDEX IF NOT EXISTS idx_api_calls_called_at ON api_calls(called_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_curator_actions_action_time ON curator_actions(action, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_curator_actions_target ON curator_actions(target_type, target_id);

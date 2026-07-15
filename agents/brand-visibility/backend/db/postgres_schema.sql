-- ============================================================
-- Postgres schema for kite-brand-visibility-agent
-- Source: consolidated from KiteAI_dashboard/schema.py +
--         backend/agents/brand_visibility/x/db.py + linkedin/db.py
-- Generated: Tuesday July 14, 2026
-- linkedin_keywords: designed fresh (never existed on Turso)
-- ------------------------------------------------------------
-- Notes:
--   * Every statement uses IF NOT EXISTS for idempotency (safe re-runs).
--   * SQLite INTEGER PRIMARY KEY AUTOINCREMENT -> BIGSERIAL PRIMARY KEY.
--   * FK columns that reference a BIGSERIAL id are typed BIGINT (not INTEGER)
--     so the types match the referenced BIGSERIAL/BIGINT column.
--   * Boolean-ish flags (enabled, is_builder, is_active) stay INTEGER 0/1
--     for zero code-churn (Recon 1 recommendation).
--   * Some agent-owned tables intentionally store timestamps as TEXT (ISO-8601
--     strings written by Python _now()); those columns stay TEXT. Where the
--     source used DEFAULT (datetime('now')) on a TEXT column, it becomes
--     DEFAULT (now())::text — a fallback only; the app always supplies the value.
-- ============================================================


-- ============================================================
-- BLOCK A: Read-only config tables (dashboard-owned)
-- Source: KiteAI_dashboard/schema.py
-- ============================================================

CREATE TABLE IF NOT EXISTS keyword_classes (
  class_key     TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  priority      TEXT NOT NULL DEFAULT 'STANDARD',
  enabled       INTEGER NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  color_hex     TEXT,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keywords (
  id            BIGSERIAL PRIMARY KEY,
  keyword       TEXT NOT NULL,
  class_key     TEXT NOT NULL REFERENCES keyword_classes(class_key),
  sub_category  TEXT,
  intent        TEXT,
  priority      TEXT,
  search_query  TEXT,
  signal_type   TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  added_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  added_by      TEXT,
  last_used_at  TIMESTAMPTZ,
  hit_count     INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  UNIQUE(keyword, class_key)
);

CREATE TABLE IF NOT EXISTS influencers (
  handle          TEXT PRIMARY KEY,
  display_name    TEXT,
  specialty       TEXT,
  follower_tier   TEXT,
  priority        TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  added_at        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  added_by        TEXT,
  notes           TEXT,
  last_pulled_at  TIMESTAMPTZ,
  posts_pulled    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS classification_rules (
  id          BIGSERIAL PRIMARY KEY,
  rule_type   TEXT NOT NULL,
  rule_key    TEXT NOT NULL,
  rule_value  TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(rule_type, rule_key)
);

CREATE TABLE IF NOT EXISTS api_key_status (
  service           TEXT PRIMARY KEY,
  env_var_name      TEXT NOT NULL,
  last_tested_at    TIMESTAMPTZ,
  last_test_result  TEXT,
  last_test_message TEXT,
  notes             TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  value_type  TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Block A indexes
CREATE INDEX IF NOT EXISTS idx_keywords_class      ON keywords(class_key, enabled);
CREATE INDEX IF NOT EXISTS idx_keywords_priority   ON keywords(priority);
CREATE INDEX IF NOT EXISTS idx_influencers_priority ON influencers(priority, enabled);


-- ============================================================
-- BLOCK B: Shared operational tables (agents write, dashboard reads)
-- Source: KiteAI_dashboard/schema.py
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_runs (
  id              BIGSERIAL PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  triggered_by    TEXT,
  status          TEXT NOT NULL,
  calls_used      INTEGER NOT NULL DEFAULT 0,
  records_new     INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  summary_json    TEXT
);

CREATE TABLE IF NOT EXISTS agent_activity (
  id          BIGSERIAL PRIMARY KEY,
  run_id      BIGINT REFERENCES agent_runs(id),
  agent_id    TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  level       TEXT NOT NULL,
  phase       TEXT NOT NULL,
  event       TEXT NOT NULL,
  message     TEXT,
  meta_json   TEXT
);

CREATE TABLE IF NOT EXISTS llm_costs (
  id                 BIGSERIAL PRIMARY KEY,
  agent_id           TEXT NOT NULL,
  called_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purpose            TEXT NOT NULL,
  model              TEXT NOT NULL,
  input_tokens       INTEGER NOT NULL DEFAULT 0,
  output_tokens      INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  run_id             BIGINT REFERENCES agent_runs(id)
);

CREATE TABLE IF NOT EXISTS api_log (
  id          BIGSERIAL PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  called_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  service     TEXT NOT NULL,
  endpoint    TEXT,
  status_code INTEGER,
  month_key   TEXT NOT NULL
);

-- Block B indexes
CREATE INDEX IF NOT EXISTS idx_runs_started    ON agent_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_agent      ON agent_runs(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_run    ON agent_activity(run_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_llm_costs_date  ON llm_costs(called_at);
CREATE INDEX IF NOT EXISTS idx_llm_costs_agent ON llm_costs(agent_id, called_at);
CREATE INDEX IF NOT EXISTS idx_api_log_month   ON api_log(service, month_key);
CREATE INDEX IF NOT EXISTS idx_api_log_agent   ON api_log(agent_id, called_at);


-- ============================================================
-- BLOCK C: X agent-owned tables (KA017)
-- Source: backend/agents/brand_visibility/x/db.py
-- ============================================================

-- scraped_tweets: base DDL + author_reputation_label (added via _migrate_columns).
CREATE TABLE IF NOT EXISTS scraped_tweets (
  tweet_id                 TEXT PRIMARY KEY,
  created_at               TIMESTAMPTZ,
  author_id                TEXT,
  author_handle            TEXT,
  author_followers         INTEGER,
  author_bio               TEXT,
  text                     TEXT,
  like_count               INTEGER DEFAULT 0,
  reply_count              INTEGER DEFAULT 0,
  retweet_count            INTEGER DEFAULT 0,
  quote_count              INTEGER DEFAULT 0,
  impression_count         INTEGER,
  lang                     TEXT,
  source_type              TEXT,
  matched_class            TEXT,
  matched_query            TEXT,
  source_handle            TEXT,
  conversation_id          TEXT,
  ingested_at              TIMESTAMPTZ,
  last_seen_at             TIMESTAMPTZ,
  velocity                 DOUBLE PRECISION,
  priority_flag            TEXT,
  classified_at            TIMESTAMPTZ,
  confirmed_class          TEXT,
  intent_signal            TEXT,
  quality_score            INTEGER,
  is_builder               INTEGER,
  theme_tags               TEXT,
  competitor_mentioned     TEXT,
  summary_one_line         TEXT,
  relevance_score          INTEGER,
  noise_reason             TEXT,
  status                   TEXT DEFAULT 'PENDING',
  author_reputation_label  TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS query_state (
  query_hash        TEXT PRIMARY KEY,
  query_text        TEXT,
  last_since_id     TEXT,
  last_run_at       TIMESTAMPTZ,
  tweet_count_total INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content_themes (
  theme_id         TEXT PRIMARY KEY,
  theme_class      TEXT,
  tag_intersection TEXT,
  tweet_ids        TEXT,
  tweet_count      INTEGER,
  summary          TEXT,
  draft_post       TEXT,
  draft_format     TEXT,
  draft_rationale  TEXT,
  created_at       TIMESTAMPTZ,
  posted_url       TEXT,
  status           TEXT DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS user_id_cache (
  handle    TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL,
  cached_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS useful_promoters (
  id               BIGSERIAL PRIMARY KEY,
  author_handle    TEXT NOT NULL,
  author_followers INTEGER,
  matched_class    TEXT,
  tweet_id         TEXT NOT NULL,
  promotion_kind   TEXT NOT NULL,
  tier             TEXT NOT NULL,
  added_at         TEXT NOT NULL,
  UNIQUE(tweet_id)
);

CREATE TABLE IF NOT EXISTS author_reputation (
  author_handle        TEXT PRIMARY KEY,
  total_tweets         INTEGER NOT NULL DEFAULT 0,
  marketing_count      INTEGER NOT NULL DEFAULT 0,
  govt_promotion_count INTEGER NOT NULL DEFAULT 0,
  signal_count         INTEGER NOT NULL DEFAULT 0,
  noise_count          INTEGER NOT NULL DEFAULT 0,
  promotional_ratio    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  reputation_label     TEXT NOT NULL DEFAULT 'unknown',
  first_seen_at        TEXT NOT NULL,
  last_updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classification_costs (
  tweet_id        TEXT NOT NULL,
  classified_at   TEXT NOT NULL,
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  input_cost_usd  DOUBLE PRECISION NOT NULL,
  output_cost_usd DOUBLE PRECISION NOT NULL,
  total_cost_usd  DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (tweet_id, classified_at)
);

CREATE TABLE IF NOT EXISTS x_active_prompt (
  id         BIGSERIAL PRIMARY KEY,
  version    TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (now())::text  -- fallback only; app supplies ISO value
);

CREATE TABLE IF NOT EXISTS x_schedule (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  mode            TEXT NOT NULL DEFAULT 'all',
  sweep_type      TEXT NOT NULL DEFAULT 'Latest',
  max_pages       INTEGER NOT NULL DEFAULT 1,
  max_keywords    INTEGER NOT NULL DEFAULT 5,
  class_filter    TEXT NOT NULL DEFAULT '',
  since_hours     INTEGER,
  max_api_calls   INTEGER NOT NULL DEFAULT 12,
  last_run_at     TEXT,
  last_run_status TEXT,
  updated_at      TEXT NOT NULL DEFAULT (now())::text  -- fallback only; app supplies ISO value
);

-- Block C indexes
CREATE INDEX IF NOT EXISTS idx_tweets_status              ON scraped_tweets(status);
CREATE INDEX IF NOT EXISTS idx_tweets_class               ON scraped_tweets(matched_class);
CREATE INDEX IF NOT EXISTS idx_tweets_priority            ON scraped_tweets(priority_flag);
CREATE INDEX IF NOT EXISTS idx_tweets_author              ON scraped_tweets(author_handle);
CREATE INDEX IF NOT EXISTS idx_useful_promoters_handle    ON useful_promoters(author_handle);
CREATE INDEX IF NOT EXISTS idx_useful_promoters_tier      ON useful_promoters(tier);
CREATE INDEX IF NOT EXISTS idx_useful_promoters_kind      ON useful_promoters(promotion_kind);
CREATE INDEX IF NOT EXISTS idx_useful_promoters_added_at  ON useful_promoters(added_at);
CREATE INDEX IF NOT EXISTS idx_author_reputation_label    ON author_reputation(reputation_label);
CREATE INDEX IF NOT EXISTS idx_author_reputation_ratio    ON author_reputation(promotional_ratio);
CREATE INDEX IF NOT EXISTS idx_costs_classified_at        ON classification_costs(classified_at);


-- ============================================================
-- BLOCK D: LinkedIn agent-owned tables (KA018)
-- Source: backend/agents/brand_visibility/linkedin/db.py
-- ============================================================

-- linkedin_posts: base DDL + migrated columns (commercial_fit_score,
-- relationship_value_score, engagement_safety_score, classification_class).
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id                       BIGSERIAL PRIMARY KEY,
  post_urn                 TEXT UNIQUE,
  author_name              TEXT,
  author_headline          TEXT,
  author_urn               TEXT,
  author_profile_url       TEXT,
  author_followers         INTEGER,
  text                     TEXT,
  posted_at                TEXT,
  like_count               INTEGER DEFAULT 0,
  comment_count            INTEGER DEFAULT 0,
  repost_count             INTEGER DEFAULT 0,
  post_url                 TEXT,
  matched_keyword          TEXT,
  query_string             TEXT,
  source_class             TEXT,
  matched_category         TEXT,
  raw_json                 TEXT,
  ingested_at              TIMESTAMPTZ,
  status                   TEXT DEFAULT 'PENDING',
  classified_at            TIMESTAMPTZ,
  confirmed_class          TEXT,
  intent_signal            TEXT,
  relevance_score          INTEGER,
  summary_one_line         TEXT,
  commercial_fit_score     DOUBLE PRECISION,
  relationship_value_score DOUBLE PRECISION,
  engagement_safety_score  DOUBLE PRECISION,
  classification_class     TEXT
);

CREATE TABLE IF NOT EXISTS linkedin_runs (
  id               BIGSERIAL PRIMARY KEY,
  agent_id         TEXT DEFAULT 'KA018',
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  mode             TEXT,
  status           TEXT,
  keywords_queried INTEGER DEFAULT 0,
  api_calls_made   INTEGER DEFAULT 0,
  posts_ingested   INTEGER DEFAULT 0,
  posts_classified INTEGER DEFAULT 0,
  error_count      INTEGER DEFAULT 0,
  notes            TEXT
);

CREATE TABLE IF NOT EXISTS linkedin_schedule (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  enabled          INTEGER DEFAULT 0,
  interval_minutes INTEGER DEFAULT 1440,
  max_keywords     INTEGER DEFAULT 5,
  max_pages        INTEGER DEFAULT 1,
  categories       TEXT,
  min_volume       TEXT DEFAULT 'HIGH',
  date_posted      TEXT DEFAULT 'past_week',
  sort_by          TEXT DEFAULT 'date_posted',
  last_run_at      TEXT,
  next_run_at      TEXT,
  updated_at       TEXT
);

CREATE TABLE IF NOT EXISTS linkedin_active_prompt (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  prompt_text    TEXT NOT NULL,
  prompt_version TEXT NOT NULL DEFAULT 'v0',
  updated_at     TEXT NOT NULL DEFAULT (now())::text  -- fallback only; app supplies ISO value
);

CREATE TABLE IF NOT EXISTS linkedin_classification_costs (
  id            BIGSERIAL PRIMARY KEY,
  post_id       BIGINT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      DOUBLE PRECISION,
  classified_at TEXT NOT NULL DEFAULT (now())::text,  -- fallback only; app supplies ISO value
  FOREIGN KEY (post_id) REFERENCES linkedin_posts(id)
);

-- Block D indexes
CREATE INDEX IF NOT EXISTS idx_lp_status   ON linkedin_posts(status);
CREATE INDEX IF NOT EXISTS idx_lp_category ON linkedin_posts(matched_category);
CREATE INDEX IF NOT EXISTS idx_lp_keyword  ON linkedin_posts(matched_keyword);
CREATE INDEX IF NOT EXISTS idx_lcc_post_id ON linkedin_classification_costs(post_id);


-- ============================================================
-- BLOCK E: LinkedIn keyword library (fresh design)
-- ============================================================

-- linkedin_keywords: LinkedIn keyword library.
-- Never populated on Turso due to budget constraints.
-- Fresh design based on linkedin/db.py:189-225 read expectations.
-- Seed keywords loaded separately (not in this DDL file).
CREATE TABLE IF NOT EXISTS linkedin_keywords (
  id               BIGSERIAL PRIMARY KEY,
  keyword          TEXT NOT NULL,
  category         TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  volume_estimate  TEXT,
  source_count     INTEGER NOT NULL DEFAULT 0,
  added_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  notes            TEXT
);
CREATE INDEX IF NOT EXISTS idx_linkedin_keywords_active
  ON linkedin_keywords(is_active, category);


-- ============================================================
-- SEED DATA (idempotent: INSERT ... ON CONFLICT DO NOTHING)
-- Source: KiteAI_dashboard/schema.py:156-211
-- ============================================================

-- api_key_status default rows.
-- NOTE: the 'turso' row is carried over verbatim from the dashboard seed; it is
-- likely obsolete once we leave Turso for Postgres. Review before shipping.
INSERT INTO api_key_status (service, env_var_name) VALUES
  ('rapidapi',   'RAPIDAPI_KEY'),
  ('openrouter', 'OPENROUTER_API_KEY'),
  ('turso',      'TURSO_AUTH_TOKEN')
ON CONFLICT (service) DO NOTHING;

-- classification_rules priority-flag rows (rule_type = 'priority_flag').
INSERT INTO classification_rules (rule_type, rule_key, rule_value) VALUES
  ('priority_flag', 'URGENT_INFLUENCER_REPLY', '{"trigger": "source = INFLUENCER_REPLY"}'),
  ('priority_flag', 'URGENT_VIRAL',            '{"trigger": "velocity > 50 AND age_minutes < 120"}'),
  ('priority_flag', 'LOW_PRIORITY_CONTENT',    '{"trigger": "matched_class = ''G''"}'),
  ('priority_flag', 'STANDARD',                '{"trigger": "default"}')
ON CONFLICT (rule_type, rule_key) DO NOTHING;

-- settings default rows. Values reconciled to what the agents actually use
-- (see backend/shared/config/settings.py), NOT the dashboard schema.py defaults:
--   classifier = google/gemini-2.5-flash   (not claude-haiku-4-5)
--   drafter    = anthropic/claude-sonnet-4.5 (dot, not claude-sonnet-4-5)
INSERT INTO settings (key, value, value_type, description) VALUES
  ('MONTHLY_API_QUOTA',        '1000', 'int', 'Monthly RapidAPI call ceiling'),
  ('QUOTA_WARNING_PCT',        '80',   'int', 'Percentage of quota at which warnings show'),
  ('QUOTA_HARD_STOP_PCT',      '95',   'int', 'Percentage of quota at which agents halt'),
  ('DEFAULT_CLASSIFIER_MODEL', 'google/gemini-2.5-flash',     'str', 'Default LLM for classification'),
  ('DEFAULT_DRAFTER_MODEL',    'anthropic/claude-sonnet-4.5', 'str', 'Default LLM for content drafting')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- SEED: Agent-owned single-row config (recovered from old _migrate_* logic)
-- x_active_prompt v1: seeded from config/prompts/voice-ai-default.txt (the file
--   named by config/prompts/active.txt). This table has no natural unique key,
--   so idempotency uses WHERE NOT EXISTS (mirrors the old "seed only when the
--   table is empty" behavior) rather than ON CONFLICT.
-- x_schedule id=1: conservative sweep defaults, matching the old _migrate_schedule
--   (mode=all, sweep_type=Latest, max_pages=1, max_keywords=5, class_filter='',
--   since_hours=NULL, max_api_calls=12).
-- ============================================================

INSERT INTO x_active_prompt (version, content, is_active, created_at)
SELECT 'v1', $prompt$You are an analyst classifying X (Twitter) posts for relevance to a voice AI infrastructure market. The signal of interest is:
- Voice AI products and infrastructure (Vapi, Retell, Bland, Deepgram, ElevenLabs, Cartesia, LiveKit, Pipecat, Whisper, AssemblyAI, OpenAI Realtime API)
- Voice agent latency, reliability, barge-in, TTFT, endpointing, audio quality
- Voice AI pricing, billing, unit economics, vendor switching
- Agency builders deploying voice agents for verticals (dental, real estate, calling centers)
- Voice agent stack choices, comparisons, alternatives

For each tweet, output a single JSON object:
{
  "relevance_score": <0-100>,
  "confirmed_class": "<A-K or NOISE>",
  "intent_signal": "<BUILDER_PAIN | BUILDER_QUESTION | RECOMMENDATION | OBSERVATION | MARKETING | GOVT_PROMOTION>",
  "is_builder": <0 or 1>,
  "quality_score": <0-10>,
  "theme_tags": ["voice-latency", "vapi"],
  "competitor_mentioned": ["Vapi", "Retell"],
  "summary_one_line": "Brief one-liner under 140 chars",
  "noise_reason": "If relevance_score < 40, 25 words explaining irrelevance. Else empty."
}

Class definitions:
A = Macro AI Models & Inference (frontier model pain, cost, latency)
B = Orchestration & Agent Frameworks
C = Voice AI Stack (primary signal — voice agents, latency, providers, audio)
D = Unit Economics & Margins
E = Language Moat (multilingual voice — Arabic, Hindi, regional)
F = Vertical Integrators (agency builders, niche voice AI deployments)
G = AI Terminology (foundational concepts, often NOISE)
H = Influencer accounts (handled at scraper level)
K = Product-Based Keywords (high buying intent — comparisons, switching, pricing)
NOISE = unrelated to voice AI market

Intent signal definitions (apply strictly):

BUILDER_PAIN: Author describes a specific problem they hit while building/deploying. Must be their own experience. Example: "Vapi bill went from $25 to $187 last month".

BUILDER_QUESTION: Genuine help/comparison ask. Example: "anyone tried Retell vs Vapi for outbound calls?"

RECOMMENDATION: First-person product endorsement based on own use, no commercial structure. Example: "Pipecat dev experience feels clean".

OBSERVATION: News, analysis, or neutral commentary without sales structure. If the post would still be useful as a research note with no product attached, it is OBSERVATION.

MARKETING: Author promoting a product, service, course, agency, or themselves. Technical content does NOT exempt MARKETING — a tweet with accurate benchmarks can still be a vendor announcement.

Recognize MARKETING by these structural patterns (one strong signal or two weak signals is usually enough):
1. Vendor announcement language: "X has released", "X just launched", "X introduces", "Meet [product]", "just dropped", "just open-sourced".
2. Emoji opener (🚀 ⚡️ 🔥 💯) followed by feature list or product announcement.
3. Comparative framing: "N× faster than X", "kills your $200/month subscription", named competitor being out-performed.
4. CTA: landing page, vendor link, course signup, "DM me to learn more".
5. Agency sales / build-in-public: "I help businesses scale with AI", "Day N of building [product]".

EXAMPLE — MARKETING (despite real technical content):
"⚡️ Microsoft has released MAI-Transcribe-1.5, processes audio 276× faster than real time. Second-fastest competitor works twice as slowly. WER of 2.4% on Artificial Analysis benchmark, third place. Such speed with top-three accuracy."
→ MARKETING. Vendor announcement vocabulary + emoji opener + comparative framing + closer phrase. Real WER number does not make it analysis.

EXAMPLE — OBSERVATION (despite mentioning products):
"Dynamic model routing has largely been snake oil. Frontier models are often better, faster, AND cheaper than routed budget alternatives. Many projects use tightly bound model concerts, not swap-able ones. Model routing makes software feel opaque."
→ OBSERVATION. Methodology-first criticism. No vendor announcement structure, no CTA, no promotional closer.

When in doubt MARKETING vs OBSERVATION: judge STRUCTURE not topic. Structural purpose is "tell readers about a release / company news / product superiority" → MARKETING. Structural purpose is "share opinion or analytical framework" → OBSERVATION.

GOVT_PROMOTION: Government/ministry/official accounts (BHASHINI, DigitalIndia, MeitY) promoting their own initiatives. Signals: official handle + program/MoU/initiative content + hashtag stack (6+) + ministerial @-tags (10+) + formal "strengthening/empowering" language.

EXCEPTION: Major analytics/benchmark accounts (ArtificialAnalysis, lmsysorg, Marktechpost) doing benchmark posts are OBSERVATION even when mentioning products. Test: methodology-first = OBSERVATION, product-first = MARKETING.

Choose ONE intent. When mixed, priority: GOVT_PROMOTION > MARKETING > BUILDER_PAIN > BUILDER_QUESTION > RECOMMENDATION > OBSERVATION.

Scoring:
- 80-100: Builder describing specific voice AI problem with concrete vendor name, OR high-quality analysis from recognized analyst
- 60-79: Builder discussing related topic without specific market relevance
- 40-59: Tangential — touches market but author or context unclear
- 0-39: NOISE. ALWAYS fill noise_reason.

MARKETING but on-topic still gets full relevance score. Intent tag is separate from score: a high-relevance promotion is still relevant, just categorized differently.

Be strict on intent. Better to label a borderline post MARKETING than miscall a vendor announcement OBSERVATION.$prompt$, 1, (now())::text
WHERE NOT EXISTS (SELECT 1 FROM x_active_prompt);

INSERT INTO x_schedule
  (id, mode, sweep_type, max_pages, max_keywords, class_filter,
   since_hours, max_api_calls, updated_at)
VALUES (1, 'all', 'Latest', 1, 5, '', NULL, 12, (now())::text)
ON CONFLICT (id) DO NOTHING;

-- linkedin_schedule id=1: default sweep config, matching the defaults
-- LinkedInDatabase.get_schedule() used to lazily create (all from column
-- DEFAULTs: enabled=0, interval_minutes=1440, max_keywords=5, max_pages=1,
-- categories=NULL, min_volume='HIGH', date_posted='past_week',
-- sort_by='date_posted'). Lazy-create removed for consistency with x_schedule.
INSERT INTO linkedin_schedule
  (id, enabled, interval_minutes, max_keywords, max_pages,
   categories, min_volume, date_posted, sort_by, updated_at)
VALUES (1, 0, 1440, 5, 1, NULL, 'HIGH', 'past_week', 'date_posted', (now())::text)
ON CONFLICT (id) DO NOTHING;

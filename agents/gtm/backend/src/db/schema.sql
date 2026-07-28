CREATE TABLE IF NOT EXISTS companies (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  website    TEXT,
  segment    TEXT,
  ph_slug    TEXT,
  scope      TEXT, -- 'Global' | 'Regional', LLM-classified from real scraped text
  hq_country TEXT, -- LLM-classified from real scraped text, or null if no HQ signal found
  status     TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id                       TEXT PRIMARY KEY,
  company_id               TEXT REFERENCES companies(id),
  source_url               TEXT NOT NULL,
  source_type              TEXT NOT NULL,
  title                    TEXT,
  snippet                  TEXT NOT NULL,
  scraped_at               TEXT NOT NULL,
  gtm_category             TEXT,
  confidence               REAL,
  classification_reasoning TEXT
);

CREATE TABLE IF NOT EXISTS gtm_strategies (
  id             TEXT PRIMARY KEY,
  company_id     TEXT REFERENCES companies(id),
  category_name  TEXT NOT NULL,
  evidence_count INTEGER DEFAULT 0,
  first_seen     TEXT,
  last_updated   TEXT,
  UNIQUE(company_id, category_name)
);

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id           TEXT PRIMARY KEY,
  company_id   TEXT REFERENCES companies(id),
  status       TEXT,
  current_step TEXT,
  started_at   TEXT,
  completed_at TEXT,
  error_msg    TEXT
);

-- GTM categories the LLM is allowed to classify evidence into. Editable at
-- runtime (add/rename/delete) — renaming or deleting cascades to evidence and
-- gtm_strategies so nothing points at a category name that no longer exists.
CREATE TABLE IF NOT EXISTS gtm_categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- User-added detection rules that extend (never replace) a scraper's built-in
-- keyword/path lists, without touching the LLM classification step.
-- company_id NULL = applies to every company; set = applies only to that one.
CREATE TABLE IF NOT EXISTS detection_rules (
  id           TEXT PRIMARY KEY,
  scraper_name TEXT NOT NULL,
  rule_type    TEXT NOT NULL, -- 'keyword' | 'path'
  value        TEXT NOT NULL,
  category     TEXT,          -- optional, informational only
  company_id   TEXT REFERENCES companies(id),
  created_at   TEXT NOT NULL
);

-- LLM prompt templates, editable at runtime. {{placeholder}} tokens are
-- substituted at call time (see classifier/renderTemplate.ts) — editing a
-- template here changes what's actually sent to the model on the next call.
CREATE TABLE IF NOT EXISTS prompts (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  template   TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_company ON evidence(company_id);
CREATE INDEX IF NOT EXISTS idx_evidence_company_category ON evidence(company_id, gtm_category);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_company ON scrape_jobs(company_id, started_at);

const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const db = createClient({
  url:       process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

// ── Schema ───────────────────────────────────────────────────────────────────
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    DEFAULT 'admin',
  created_at    TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS keywords (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword    TEXT    UNIQUE NOT NULL,
  category   TEXT    DEFAULT 'general',
  class      TEXT    DEFAULT 'A',
  active     INTEGER DEFAULT 1,
  source     TEXT    DEFAULT 'manual',
  created_at TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at         TEXT    DEFAULT (datetime('now')),
  completed_at       TEXT,
  accounts_found     INTEGER DEFAULT 0,
  accounts_added     INTEGER DEFAULT 0,
  duplicates_skipped INTEGER DEFAULT 0,
  status             TEXT    DEFAULT 'running',
  triggered_by       TEXT    DEFAULT 'manual',
  keywords_used      TEXT,
  notes              TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  handle        TEXT    UNIQUE NOT NULL,
  name          TEXT,
  bio           TEXT,
  followers     INTEGER DEFAULT 0,
  following     INTEGER DEFAULT 0,
  tweets        INTEGER DEFAULT 0,
  verified      INTEGER DEFAULT 0,
  avatar        TEXT,
  website       TEXT,
  location      TEXT,
  joined_date   TEXT,
  tier          TEXT,
  account_type  TEXT,
  track         TEXT    DEFAULT 'A',
  d1            REAL    DEFAULT 0,
  d2            REAL    DEFAULT 0,
  d3            REAL    DEFAULT 0,
  d4            REAL    DEFAULT 0,
  d5            REAL    DEFAULT 0,
  overall       REAL    DEFAULT 0,
  dm_open       INTEGER DEFAULT 0,
  has_email     INTEGER DEFAULT 0,
  contact_email TEXT,
  linktree      TEXT,
  ai_model      TEXT,
  ai_reason     TEXT,
  run_id        INTEGER,
  first_seen    TEXT    DEFAULT (datetime('now')),
  last_updated  TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS agent_config (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  company      TEXT,
  keywords     TEXT    NOT NULL,             -- JSON array of raw keywords
  status       TEXT    DEFAULT 'idle',       -- idle | running | done
  last_run_id  INTEGER,
  last_run_at  TEXT,
  created_at   TEXT    DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_accounts (
  task_id   INTEGER NOT NULL,
  handle    TEXT    NOT NULL,
  added_at  TEXT    DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, handle),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Per-agent editable metadata (info panels). One row per agent id; rows are
-- created lazily on the first PATCH /x/about (no seed). Static fields (name,
-- description, integrations, version) live in agentRegistry.js — this table only
-- holds admin-authored overrides layered on top. updated_by is the users.id of
-- the last editor (no FK; the id is kept even if the user row is later removed).
CREATE TABLE IF NOT EXISTS agent_meta (
  agent_id             TEXT PRIMARY KEY,
  admin_notes          TEXT,
  description_override  TEXT,
  updated_at           TEXT DEFAULT (datetime('now')),
  updated_by           INTEGER
);

-- Audit log: actor_id/actor_email are DENORMALIZED historical values. No FK on
-- actor_id so we can delete users while preserving their audit trail. Standard
-- audit-log pattern.
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id     INTEGER NOT NULL,
  actor_email  TEXT    NOT NULL,
  action       TEXT    NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  meta_json    TEXT,
  created_at   TEXT    DEFAULT (datetime('now'))
);
`;

// ── Seed keywords from Google Sheets class structure ──────────────────────────
// These are the keyword classes from the KiteAI master keyword file.
// Each sub-list is seeded once; users can add/delete from the UI.
const SEED_KEYWORDS = [
  // Class C — Voice AI Stack (P1)
  { keyword: 'vapi', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'elevenlabs', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'deepgram', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'cartesia', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'livekit', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'ai voice assistant', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'voice ai', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'text to speech', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'speech to text', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'voice cloning', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'conversational ai', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'ai phone agent', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'ai call center', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'retell ai', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'bland ai', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'synthflow', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'assemblyai', category: 'Voice AI Stack', class: 'C' },
  { keyword: 'whisper ai', category: 'Voice AI Stack', class: 'C' },
  // Class A — Macro AI Models (P2)
  { keyword: 'gpt-4', category: 'AI Models', class: 'A' },
  { keyword: 'claude ai', category: 'AI Models', class: 'A' },
  { keyword: 'gemini ai', category: 'AI Models', class: 'A' },
  { keyword: 'llama model', category: 'AI Models', class: 'A' },
  { keyword: 'inference stack', category: 'AI Models', class: 'A' },
  { keyword: 'large language model', category: 'AI Models', class: 'A' },
  { keyword: 'llm developer', category: 'AI Models', class: 'A' },
  { keyword: 'foundation model', category: 'AI Models', class: 'A' },
  { keyword: 'ai developer', category: 'AI Models', class: 'A' },
  { keyword: 'openai', category: 'AI Models', class: 'A' },
  { keyword: 'anthropic', category: 'AI Models', class: 'A' },
  // Class B — Orchestration (P2)
  { keyword: 'langchain', category: 'Orchestration', class: 'B' },
  { keyword: 'n8n', category: 'Orchestration', class: 'B' },
  { keyword: 'vector database', category: 'Orchestration', class: 'B' },
  { keyword: 'mcp server', category: 'Orchestration', class: 'B' },
  { keyword: 'ai agent', category: 'Orchestration', class: 'B' },
  { keyword: 'agentic ai', category: 'Orchestration', class: 'B' },
  { keyword: 'ai automation', category: 'Orchestration', class: 'B' },
  { keyword: 'rag pipeline', category: 'Orchestration', class: 'B' },
  { keyword: 'ai workflow', category: 'Orchestration', class: 'B' },
  // Class E — Language Moat (P1)
  { keyword: 'gulf arabic ai', category: 'Language Moat', class: 'E' },
  { keyword: 'arabic nlp', category: 'Language Moat', class: 'E' },
  { keyword: 'hinglish ai', category: 'Language Moat', class: 'E' },
  { keyword: 'multilingual ai', category: 'Language Moat', class: 'E' },
  { keyword: 'sea language ai', category: 'Language Moat', class: 'E' },
  // Class F — Vertical Integrators (P1)
  { keyword: 'ai for dental', category: 'Vertical AI', class: 'F' },
  { keyword: 'ai real estate', category: 'Vertical AI', class: 'F' },
  { keyword: 'gohighlevel ai', category: 'Vertical AI', class: 'F' },
  { keyword: 'white label ai', category: 'Vertical AI', class: 'F' },
  { keyword: 'ai saas founder', category: 'Vertical AI', class: 'F' },
  { keyword: 'ai agency', category: 'Vertical AI', class: 'F' },
  // Class H — Influencer Accounts (P1)
  { keyword: 'ai influencer', category: 'Influencer', class: 'H' },
  { keyword: 'ai content creator', category: 'Influencer', class: 'H' },
  { keyword: 'tech youtuber', category: 'Influencer', class: 'H' },
  { keyword: 'ai newsletter', category: 'Influencer', class: 'H' },
  { keyword: 'ai reviewer', category: 'Influencer', class: 'H' },
  // Class K — Product Keywords (P1)
  { keyword: 'vapi alternative', category: 'Product Keywords', class: 'K' },
  { keyword: 'elevenlabs alternative', category: 'Product Keywords', class: 'K' },
  { keyword: 'voice ai pricing', category: 'Product Keywords', class: 'K' },
  { keyword: 'ai voice not working', category: 'Product Keywords', class: 'K' },
  { keyword: 'twilio alternative', category: 'Product Keywords', class: 'K' },
  { keyword: 'openai voice api', category: 'Product Keywords', class: 'K' },
  { keyword: 'kite ai', category: 'Product Keywords', class: 'K' },
];

async function initDB() {
  // Run schema (split on ; and execute each)
  const stmts = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
  for (const sql of stmts) {
    await db.execute(sql);
  }

  // ── Column migrations — add new columns to existing tables safely ──────────
  // ALTER TABLE fails silently if column already exists (we catch the error)
  const migrations = [
    `ALTER TABLE accounts ADD COLUMN ai_model           TEXT`,
    `ALTER TABLE accounts ADD COLUMN ai_reason          TEXT`,
    // Track A promotion detection columns
    `ALTER TABLE accounts ADD COLUMN promotion_type       TEXT DEFAULT 'unknown'`,
    // explicit | inferred | none | unknown
    `ALTER TABLE accounts ADD COLUMN promotion_confidence INTEGER DEFAULT 0`,
    // 0-100 — how confident we are about the promotion classification
    `ALTER TABLE accounts ADD COLUMN promotion_signals    TEXT`,
    // JSON array of detected signals e.g. '["#ad found","discount code pattern"]'
    // Authenticity / content-quality of a promoter's posts (genuine creator vs salesy/templated)
    `ALTER TABLE accounts ADD COLUMN authenticity_score   INTEGER`,
    // 0-100 — how genuine & high-quality their product/promo content reads (NULL = not yet scored)
    `ALTER TABLE accounts ADD COLUMN authenticity_reason  TEXT`,
    // short why-text for the authenticity score
    `ALTER TABLE accounts ADD COLUMN authenticity_example TEXT`,
    // the single most genuine post quoted as evidence
    `ALTER TABLE accounts ADD COLUMN repost_ratio INTEGER`,
    // 0-100 — % of recent posts that are pure reposts/retweets (NULL = not analyzed).
    // >= REPOST_THRESHOLD marks the account a "reposter / amplifier" (own section, out of A1/A2)
    // ── RBAC Phase 1 — user management columns ──────────────────────────────────
    // sections_allowed: comma-separated section slugs the user may access (used by
    // Phase 3 gating; not enforced yet). SQLite backfills existing rows with the
    // default. The other three are audit/ops metadata (NULL for pre-existing rows).
    `ALTER TABLE users ADD COLUMN sections_allowed    TEXT DEFAULT 'brand-visibility,pr,leaderboard'`,
    `ALTER TABLE users ADD COLUMN password_updated_at TEXT`,
    `ALTER TABLE users ADD COLUMN created_by          INTEGER`,
    `ALTER TABLE users ADD COLUMN last_login_at       TEXT`,
  ];
  for (const m of migrations) {
    try { await db.execute(m); }
    catch (e) {
      if (!e.message?.toLowerCase().includes('duplicate') &&
          !e.message?.toLowerCase().includes('already exists')) {
        console.warn('  Migration warning:', e.message);
      }
    }
  }

  // ── Backfill existing accounts that have NULL promotion_type ─────────────────
  // Accounts scored before this feature was added need 'unknown' as default
  const nullPromo = await db.execute(
    `SELECT COUNT(*) as n FROM accounts WHERE promotion_type IS NULL`
  );
  if (Number(nullPromo.rows[0].n) > 0) {
    await db.execute(
      `UPDATE accounts SET promotion_type = 'unknown', promotion_confidence = 0 WHERE promotion_type IS NULL`
    );
    console.log(`  Backfilled ${nullPromo.rows[0].n} accounts with promotion_type='unknown'`);
  }

  // Seed keywords if table is empty
  const { rows } = await db.execute('SELECT COUNT(*) as cnt FROM keywords');
  if (rows[0].cnt === 0) {
    for (const kw of SEED_KEYWORDS) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO keywords (keyword, category, class, source) VALUES (?, ?, ?, ?)',
        args: [kw.keyword, kw.category, kw.class, 'seed'],
      });
    }
    console.log(`  Seeded ${SEED_KEYWORDS.length} keywords into DB`);
  }

  // ── Auto-create admin user from .env credentials ────────────────────────────
  const adminEmail    = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const { rows: existing } = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?', args: [adminEmail],
    });
    if (existing.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await db.execute({
        sql:  'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        args: [adminEmail, hash, 'admin'],
      });
      console.log(`  Admin user created: ${adminEmail}`);
    } else {
      // Only rehash if password changed — avoids bcrypt cost on every cold start
      const { rows: userRow } = await db.execute({ sql: 'SELECT password_hash FROM users WHERE email = ?', args: [adminEmail] });
      const matches = userRow.length > 0 && await bcrypt.compare(adminPassword, userRow[0].password_hash);
      if (!matches) {
        const hash = await bcrypt.hash(adminPassword, 12);
        await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE email = ?', args: [hash, adminEmail] });
        console.log(`  Admin password updated: ${adminEmail}`);
      }
    }
    // Safety net: an admin row created before the sections_allowed migration would
    // (on some engines) have NULL — grant full section access so it isn't locked
    // out once Phase 3 gating lands. New rows already get the column default.
    await db.execute({
      sql: `UPDATE users SET sections_allowed = 'brand-visibility,pr,leaderboard'
            WHERE email = ? AND sections_allowed IS NULL`,
      args: [adminEmail],
    });
  }

  // Seed default agent config
  await db.execute(`INSERT OR IGNORE INTO agent_config (key, value) VALUES ('last_run', NULL)`);
  await db.execute(`INSERT OR IGNORE INTO agent_config (key, value) VALUES ('next_run', NULL)`);
  await db.execute(`INSERT OR IGNORE INTO agent_config (key, value) VALUES ('auto_run_enabled', '1')`);

  console.log('  DB initialized');
}

module.exports = { db, initDB };

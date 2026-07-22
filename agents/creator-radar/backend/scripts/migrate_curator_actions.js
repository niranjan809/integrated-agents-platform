throw new Error(
  "This script targets legacy Turso/SQLite and is not compatible with Postgres. " +
    "Postgres schema is managed via db/schema.postgres.sql and scripts/migrate_schema_to_postgres.js. " +
    "If you need this functionality, port it to Postgres first."
);

// v0.12 schema migration (idempotent): create the curator_actions audit table + its two
// indexes. Every curator CLI mutation (account/keyword add/remove, ad-hoc search) logs a
// row here, giving queryable label/catalog change history (addresses the v0.11 audit gap).
// Applies to the active DB (local SQLite / Turso). Safe to re-run.
import { client } from "../src/db.js";
import { logger } from "../src/logger.js";

const CREATE_CURATOR_ACTIONS = `
CREATE TABLE IF NOT EXISTS curator_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,        -- 'account_add', 'account_remove', 'keyword_add', 'keyword_remove', 'search_adhoc'
  target_type TEXT NOT NULL,   -- 'account', 'keyword', 'search'
  target_id TEXT NOT NULL,     -- handle for accounts, hashtag for keywords, query string for searches
  platform TEXT,               -- 'instagram', 'tiktok', or NULL for platform-agnostic
  before_state TEXT,           -- JSON snapshot before action (nullable — no before for adds)
  after_state TEXT,            -- JSON snapshot after action (nullable — no after for removes)
  reason TEXT,                 -- curator-provided justification
  actor TEXT DEFAULT 'anooj',  -- who did it (for future multi-curator setup)
  performed_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const IDX_ACTION_TIME = `CREATE INDEX IF NOT EXISTS idx_curator_actions_action_time
  ON curator_actions(action, performed_at DESC)`;
const IDX_TARGET = `CREATE INDEX IF NOT EXISTS idx_curator_actions_target
  ON curator_actions(target_type, target_id)`;

await client.execute(CREATE_CURATOR_ACTIONS);
logger.info("curator_actions table ready.");
await client.execute(IDX_ACTION_TIME);
await client.execute(IDX_TARGET);
logger.info("curator_actions indexes ready.");

// Verify.
const tables = (
  await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='curator_actions'")
).rows.map((r) => r.name);
const cols = (await client.execute("PRAGMA table_info(curator_actions)")).rows.map((r) => r.name);
const count = (await client.execute("SELECT COUNT(*) AS n FROM curator_actions")).rows[0].n;
logger.info(`table present: ${tables.length === 1}`);
logger.info(`columns: ${cols.join(", ")}`);
logger.info(`row count: ${count}`);

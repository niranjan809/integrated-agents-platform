throw new Error(
  "This script targets legacy Turso/SQLite and is not compatible with Postgres. " +
    "Postgres schema is managed via db/schema.postgres.sql and scripts/migrate_schema_to_postgres.js. " +
    "If you need this functionality, port it to Postgres first."
);

// Phase 3 schema migration (idempotent):
//   1. Create candidate_accounts table (discovery staging, separate from accounts).
//   2. Add accounts.discovered_via column if missing (guarded via PRAGMA table_info).
// Applies to Turso. Safe to re-run.
import { client } from "../src/db.js";
import { logger } from "../src/logger.js";

const CREATE_CANDIDATES = `
CREATE TABLE IF NOT EXISTS candidate_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  pk TEXT,
  full_name TEXT,
  is_verified INTEGER,
  discovered_via TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  prefilter_verdict TEXT,
  prefilter_reason TEXT,
  fetch_status TEXT,
  fetched_at TEXT,
  promoted_to_accounts INTEGER DEFAULT 0,
  promoted_at TEXT,
  UNIQUE(handle, discovered_via)
)`;

await client.execute(CREATE_CANDIDATES);
logger.info("candidate_accounts table ready.");

// Idempotent column add on accounts.
const accountCols = (await client.execute("PRAGMA table_info(accounts)")).rows.map((r) => r.name);
if (!accountCols.includes("discovered_via")) {
  await client.execute("ALTER TABLE accounts ADD COLUMN discovered_via TEXT");
  logger.info("added accounts.discovered_via column.");
} else {
  logger.info("accounts.discovered_via already present — no change.");
}

// Verify.
const tables = (
  await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
).rows.map((r) => r.name);
const candCols = (await client.execute("PRAGMA table_info(candidate_accounts)")).rows.map((r) => r.name);
logger.info(`tables: ${tables.join(", ")}`);
logger.info(`candidate_accounts columns: ${candCols.join(", ")}`);

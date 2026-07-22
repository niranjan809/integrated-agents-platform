throw new Error(
  "This script targets legacy Turso/SQLite and is not compatible with Postgres. " +
    "Postgres schema is managed via db/schema.postgres.sql and scripts/migrate_schema_to_postgres.js. " +
    "If you need this functionality, port it to Postgres first."
);

// v0.9 AI-relevance gate: add 5 nullable columns to the accounts table to cache the gate
// result per account (null gate = not yet computed). Idempotent — guards each ADD COLUMN on
// PRAGMA table_info, safe to re-run. Touches ONLY the accounts table. Adds columns only, so
// row count must be unchanged before/after (asserted).
//
// Columns (all nullable; null gate = not yet computed):
//   ai_relevance_gate            INTEGER  -- SQLite boolean: 1=primarily AI, 0=not, null=uncomputed
//                                          -- (INTEGER matches the existing is_verified convention)
//   ai_relevance_confidence      REAL     -- 0.0–1.0
//   ai_relevance_reasoning       TEXT     -- gate LLM justification, preserved for audit
//   ai_relevance_computed_at     TEXT     -- ISO 8601
//   ai_relevance_prompt_version  TEXT     -- e.g. "ai_relevance_v1"
import { client, all, get } from "../src/db.js";
import { logger } from "../src/logger.js";

const NEW_COLUMNS = [
  ["ai_relevance_gate", "INTEGER"],
  ["ai_relevance_confidence", "REAL"],
  ["ai_relevance_reasoning", "TEXT"],
  ["ai_relevance_computed_at", "TEXT"],
  ["ai_relevance_prompt_version", "TEXT"],
];

const columns = async (t) => (await all(`PRAGMA table_info(${t})`)).map((r) => r.name);
const count = async (t) => (await get(`SELECT COUNT(*) n FROM ${t}`)).n;

const before = await count("accounts");
const colsBefore = await columns("accounts");
logger.info(`accounts: ${before} rows, ${colsBefore.length} columns before migration.`);

for (const [col, def] of NEW_COLUMNS) {
  if (colsBefore.includes(col)) {
    logger.info(`  accounts.${col} present — skip`);
    continue;
  }
  await client.execute(`ALTER TABLE accounts ADD COLUMN ${col} ${def}`);
  logger.info(`  accounts.${col} added (${def})`);
}

const after = await count("accounts");
const colsAfter = await columns("accounts");
logger.info(`accounts: ${after} rows, ${colsAfter.length} columns after migration.`);

if (before !== after) throw new Error(`accounts row-count drift ${before} -> ${after} — ABORT`);

const present = NEW_COLUMNS.map(([c]) => c).filter((c) => colsAfter.includes(c));
if (present.length !== NEW_COLUMNS.length) {
  throw new Error(`expected all 5 columns present, got ${present.length}: ${present.join(", ")}`);
}
logger.info(`migration complete: 5 ai_relevance_* columns present, ${before} rows unchanged.`);

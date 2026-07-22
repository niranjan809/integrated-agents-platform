throw new Error(
  "This script targets legacy Turso/SQLite and is not compatible with Postgres. " +
    "Postgres schema is managed via db/schema.postgres.sql and scripts/migrate_schema_to_postgres.js. " +
    "If you need this functionality, port it to Postgres first."
);

// One-time: apply db/schema.sql to the Turso database. Idempotent (schema uses
// CREATE TABLE/INDEX IF NOT EXISTS). Splits the schema into individual statements
// because libsql execute() runs one statement per call.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { client } from "../src/db.js";
import { config } from "../src/config.js";
import { logger } from "../src/logger.js";

const schema = readFileSync(resolve(config.projectRoot, "db/schema.sql"), "utf8");

// Split on ';' at statement boundaries. Our schema has no ';' inside string literals,
// so a simple split is safe here.
const statements = schema
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const sql of statements) {
  await client.execute(sql);
}

const tables = (
  await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
).rows.map((r) => r.name);
const indexes = (
  await client.execute(
    "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
).rows.map((r) => r.name);

logger.info(`Turso schema applied. Tables: ${tables.join(", ")}`);
logger.info(`Indexes: ${indexes.join(", ")}`);

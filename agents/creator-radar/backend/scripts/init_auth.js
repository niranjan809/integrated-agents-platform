throw new Error(
  "This script targets legacy Turso/SQLite and is not compatible with Postgres. " +
    "Postgres schema is managed via db/schema.postgres.sql and scripts/migrate_schema_to_postgres.js. " +
    "If you need this functionality, port it to Postgres first."
);

// Auth schema migration (idempotent): users + sessions tables. Applies to Turso.
import { client } from "../src/db.js";
import { logger } from "../src/logger.js";

await client.execute(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TEXT NOT NULL,
  last_login_at TEXT
)`);

await client.execute(`
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
)`);

await client.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)");

const tables = (
  await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions') ORDER BY name"
  )
).rows.map((r) => r.name);
logger.info(`auth schema applied. Tables present: ${tables.join(", ")}`);

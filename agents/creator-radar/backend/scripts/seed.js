// Loads seed_accounts.json into the accounts table (Turso). Upsert on handle: on first
// insert we stamp first_seen_at; on conflict we only refresh the curator priors
// (expected_category / expected_genuineness). Idempotent. Runs as one atomic batch.
import { readFileSync } from "node:fs";
import { batch, get, nowIso } from "../src/db.js";
import { config } from "../src/config.js";
import { logger } from "../src/logger.js";

const raw = JSON.parse(readFileSync(config.seedPath, "utf8"));
const accounts = (raw.accounts ?? []).filter((a) => a.handle);

const now = nowIso();
const statements = accounts.map((a) => ({
  // platform-aware: accounts PK is now (platform, handle); this script seeds Instagram.
  sql: `INSERT INTO accounts (handle, platform, expected_category, expected_genuineness, first_seen_at)
        VALUES (@handle, 'instagram', @expected_category, @expected_genuineness, @first_seen_at)
        ON CONFLICT(platform, handle) DO UPDATE SET
          expected_category = excluded.expected_category,
          expected_genuineness = excluded.expected_genuineness`,
  args: {
    handle: a.handle,
    expected_category: a.expected_category ?? null,
    expected_genuineness: a.expected_genuineness ?? null,
    first_seen_at: now,
  },
}));

if (statements.length) await batch(statements);

const total = (await get("SELECT COUNT(*) AS n FROM accounts")).n;
logger.info(`Seeded/updated ${statements.length} accounts from ${config.seedPath}. accounts table now has ${total} rows.`);

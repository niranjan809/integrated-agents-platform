// Loads seed_accounts_tiktok.json into the accounts table with platform='tiktok'.
// Mirrors seed.js: batched upsert, ON CONFLICT(platform, handle) refreshes curator priors.
// Idempotent. (display_name is intentionally NOT updated on conflict — it's set by
// fetch_tiktok.js; the seed JSON has none, so updating it would null a fetched value.)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { batch, get, nowIso } from "../src/db.js";
import { config } from "../src/config.js";
import { logger } from "../src/logger.js";

const seedPath = resolve(config.projectRoot, "seed_accounts_tiktok.json");
const raw = JSON.parse(readFileSync(seedPath, "utf8"));
const accounts = (raw.accounts ?? []).filter((a) => a.handle);

const now = nowIso();
const statements = accounts.map((a) => ({
  // discovered_via='seed' on insert only; NOT in DO UPDATE, so a re-seed never overwrites
  // a value later set by discovery/fetch (mirrors seed.js's treatment of curator priors).
  sql: `INSERT INTO accounts (handle, platform, discovered_via, expected_category, expected_genuineness, first_seen_at)
        VALUES (@handle, 'tiktok', 'seed', @expected_category, @expected_genuineness, @first_seen_at)
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

const total = (await get("SELECT COUNT(*) AS n FROM accounts WHERE platform='tiktok'")).n;
logger.info(`Seeded/updated ${statements.length} TikTok accounts from ${seedPath}. accounts(platform=tiktok) now has ${total} rows.`);

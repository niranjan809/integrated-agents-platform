// v0.12 curator CLI — keyword:remove. Thin wrapper over the shared
// src/curator/keyword_remove.js core (same code path as DELETE /api/keywords/:hashtag).
// SOFT removal → removed_from_rotation with reason.
//
// Usage:
//   npm run keyword:remove -- --hashtag someterm --reason "collision noise, 0 kept of 12 candidates"
import { logger } from "../src/logger.js";
import { removeKeyword } from "../src/curator/keyword_remove.js";

const argv = process.argv.slice(2);
function argVal(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const hashtag = argVal("--hashtag");
const reason = argVal("--reason");

function fail(msg) {
  logger.error(msg);
  process.exit(1);
}
if (!hashtag) fail("--hashtag is required.");
if (!reason) fail("--reason is required (soft-removal must record why).");

async function main() {
  try {
    const res = await removeKeyword({ hashtag, reason });
    logger.info(`soft-removed "${res.entry.hashtag ?? hashtag}" from ${res.from_tier} → removed_from_rotation.`);
    logger.info(`original entry: ${JSON.stringify(res.entry)}`);
    logger.info(`reason: ${reason} | audit id: ${res.audit_id}`);
  } catch (e) {
    if (e.code === "not_found") fail(`hashtag "${hashtag}" not found in any active tier (T1/T2/T3/T2_discovered/T_voice).`);
    fail(`keyword:remove failed: ${e.message}`);
  }
}

await main();

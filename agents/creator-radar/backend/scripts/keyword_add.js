// v0.12 curator CLI — keyword:add. Thin wrapper over the shared src/curator/keyword_add.js
// core (same code path as POST /api/keywords). Restoring a soft-removed hashtag needs --force.
//
// Usage:
//   npm run keyword:add -- --hashtag someterm --tier T1 --sub-cluster "technical" --notes "note"
//   npm run keyword:add -- --hashtag anotherterm --tier T_voice
//   npm run keyword:add -- --hashtag revivedterm --tier T1 --force        # restore from removed_from_rotation
//   npm run keyword:add -- --hashtag newterm --tier T_custom --create-tier # create a new tier
import { logger } from "../src/logger.js";
import { addKeyword } from "../src/curator/keyword_add.js";

const argv = process.argv.slice(2);
function argVal(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const hasFlag = (n) => argv.includes(n);

const hashtag = argVal("--hashtag");
const tier = argVal("--tier");
const subCluster = argVal("--sub-cluster") || "";
const notes = argVal("--notes") || "";
const force = hasFlag("--force");
const create = hasFlag("--create-tier");

function fail(msg) {
  logger.error(msg);
  process.exit(1);
}
if (!hashtag) fail("--hashtag is required.");
if (!tier) fail("--tier is required.");

async function main() {
  try {
    const res = await addKeyword({ hashtag, tier, subCluster, notes, force, create });
    logger.info(`added "${res.hashtag}" to ${res.tier}${res.restored ? " (restored from removed_from_rotation via --force)" : ""}.`);
    logger.info(`entry: ${JSON.stringify(res.entry)}`);
  } catch (e) {
    if (e.code === "duplicate") fail(`Hashtag already present in tier ${e.extra?.tier}. Nothing to do.`);
    if (e.code === "in_skip_list") fail(`Hashtag is in skip_list. Remove it from skip_list first, then add.`);
    if (e.code === "already_removed") {
      fail(`Hashtag is in removed_from_rotation (removed at ${e.extra?.removed_at} for reason: ${e.extra?.reason}). Run with --force to restore, or edit seed_hashtags.json.`);
    }
    if (e.code === "invalid_tier") fail(`Tier "${tier}" not allowed. Known: ${e.extra?.allowed?.join(", ")}. Use --create-tier for a new one.`);
    fail(`keyword:add failed: ${e.message}`);
  }
}

await main();

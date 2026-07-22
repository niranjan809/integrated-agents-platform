// Classification pipeline per account (platform-aware):
//   1. signals.computeSignals(handle, platform)  -> writes accounts signal columns
//   2. genuineness.classify(features)            -> {label, rule_matched}   (shared rules)
//   3. categoryRules.classify(features, posts)   -> {category, confidence, rule_id} | null
//   4. if null: categoryLlm.classify(..., platform) -> LLM fallback (budget-gated)
//   5. write ONE row to classifications (with platform + a signals snapshot for audit)
//
// Idempotent: skips accounts that already have a classification unless --force.
//
// Usage:
//   node scripts/classify.js                          # all platforms, unclassified only
//   node scripts/classify.js --platform tiktok        # only tiktok
//   node scripts/classify.js --platform instagram --force
//   node scripts/classify.js --platform tiktok garyvee
import { all } from "../src/db.js";
import { logger } from "../src/logger.js";
import { classifyOne } from "../src/classify_core.js";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const platformArg = argVal("--platform", "all"); // instagram | tiktok | all
const handleArgs = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--platform");

// Returns [{ platform, handle }] targets, filtered by --platform and any handle args.
async function selectTargets() {
  const where = [];
  const args = {};
  if (platformArg !== "all") {
    where.push("platform = @platform");
    args.platform = platformArg;
  }
  if (handleArgs.length) {
    where.push(`handle IN (${handleArgs.map((_, i) => `@h${i}`).join(", ")})`);
    handleArgs.forEach((h, i) => (args[`h${i}`] = h));
  }
  const sql = `SELECT platform, handle FROM accounts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY platform, handle`;
  return all(sql, args);
}

async function main() {
  const targets = await selectTargets();
  logger.info(`classify: ${targets.length} account(s) in scope (platform=${platformArg})${force ? " (--force)" : ""}.`);

  const tally = { classified: 0, skipped: 0, failed: 0 };
  for (const { platform, handle } of targets) {
    try {
      tally[(await classifyOne(platform, handle, { force })).status]++;
    } catch (e) {
      logger.error(`failed @${handle} [${platform}]: ${e.message}`);
      tally.failed++;
    }
  }
  logger.info(`classify done. classified=${tally.classified} skipped=${tally.skipped} failed=${tally.failed}`);
}

await main();

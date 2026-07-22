// v0.12 curator CLI — account:add. Manually add one account: fetch → AI-relevance gate
// (always runs) → classify → audit. Thin wrapper over the shared src/curator/account_add.js
// core (same code path as the POST /api/accounts endpoint).
//
// Usage:
//   npm run account:add -- --handle exampleuser --platform instagram --reason "MD mentioned in meeting"
//   npm run account:add -- --handle x_creator --platform tiktok --reason "manual discovery" --expected-category "AI Educator"
import { logger } from "../src/logger.js";
import { addAccount, VALID_CATEGORIES, VALID_GENUINENESS } from "../src/curator/account_add.js";

const argv = process.argv.slice(2);
function argVal(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const handle = argVal("--handle");
const platform = argVal("--platform");
const reason = argVal("--reason");
const expectedCategory = argVal("--expected-category");
const expectedGenuineness = argVal("--expected-genuineness");

function fail(msg) {
  logger.error(msg);
  process.exit(1);
}
if (!handle) fail("--handle is required.");
if (!platform) fail("--platform is required (instagram | tiktok).");
if (!reason) fail("--reason is required.");
if (!["instagram", "tiktok"].includes(platform)) fail(`--platform must be instagram or tiktok (got "${platform}").`);
if (expectedCategory && !VALID_CATEGORIES.includes(expectedCategory)) fail(`--expected-category invalid. One of: ${VALID_CATEGORIES.join(", ")}`);
if (expectedGenuineness && !VALID_GENUINENESS.includes(expectedGenuineness)) fail(`--expected-genuineness invalid. One of: ${VALID_GENUINENESS.join(", ")}`);

async function main() {
  try {
    const res = await addAccount({
      handle, platform, reason,
      expectedCategory, expectedGenuineness,
      onProgress: (stage) => logger.info(`… ${stage}`),
    });
    const c = res.classification;
    logger.info(`DONE @${handle}: category=${c.category ?? "?"} genuineness=${c.genuineness ?? "?"} (gate=${res.gate.primarily_ai_content}).`);
  } catch (e) {
    if (e.code === "duplicate") fail(`@${handle} already exists for platform=${platform}. Nothing to do.`);
    if (e.code === "fetch_failed") {
      logger.error(`@${handle}: ${e.message}`);
      logger.warn("Recorded fetch_failed in audit. No accounts row was created (clean retry).");
      process.exit(1);
    }
    fail(`account:add failed: ${e.message}`);
  }
}

await main();

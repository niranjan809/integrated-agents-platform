// v0.12 curator CLI — account:remove. Cascade-delete ONE account with an interactive
// confirmation prompt (skippable via --yes). The delete + audit is the shared
// src/curator/account_remove.js core (same code path as DELETE /api/accounts/:handle);
// the prompt lives here in the CLI. No --force, no batch mode. api_calls preserved.
//
// Usage:
//   npm run account:remove -- --handle exampleuser --platform instagram --reason "confirmed dead account"
//   npm run account:remove -- --handle x --platform tiktok --reason "..." --yes   # skip prompt (scripted)
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { logger } from "../src/logger.js";
import { captureState, removeAccount } from "../src/curator/account_remove.js";

const argv = process.argv.slice(2);
function argVal(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const handle = argVal("--handle");
const platform = argVal("--platform");
const reason = argVal("--reason");
const skipPrompt = argv.includes("--yes");

function fail(msg) {
  logger.error(msg);
  process.exit(1);
}
if (!handle) fail("--handle is required.");
if (!platform) fail("--platform is required (instagram | tiktok).");
if (!reason) fail("--reason is required.");
if (!["instagram", "tiktok"].includes(platform)) fail(`--platform must be instagram or tiktok (got "${platform}").`);

async function main() {
  const state = await captureState(handle, platform);
  if (!state) fail(`@${handle} [${platform}] not found in accounts. Nothing to remove.`);

  if (!skipPrompt) {
    const rl = createInterface({ input, output });
    const answer = await rl.question(
      `About to delete account ${handle} (${platform}): ${state.posts_count} posts, ${state.classifications_count} classifications, ${state.candidate_accounts_count} candidate rows. Continue? [y/N] `
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      logger.info("Aborted — no changes made.");
      return;
    }
  }

  const res = await removeAccount({ handle, platform, reason });
  logger.info(`removed @${handle} [${platform}]:`);
  logger.info(`  classifications: ${res.deleted.classifications} | posts: ${res.deleted.posts} | candidate_accounts: ${res.deleted.candidate_accounts} | accounts: ${res.deleted.accounts}`);
  logger.info(`  api_calls: preserved (historical spend record)`);
  logger.info(`  audit row id: ${res.audit_id}`);
}

await main();

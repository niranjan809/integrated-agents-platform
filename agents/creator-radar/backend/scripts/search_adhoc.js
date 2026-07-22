// v0.12 curator CLI — search:adhoc. One-off keyword search for curator exploration.
// Runs a single /search, applies the existing prefilter, and writes survivors to a JSON
// file. Does NOT stage candidates, fetch profiles, or classify. Read-only w.r.t. the
// catalog (writes only the output file + one audit row).
//
// Usage:
//   npm run search:adhoc -- --query "voice ai mumbai" --platform instagram
//   npm run search:adhoc -- --query "ai educator india" --platform instagram --limit 30
//   npm run search:adhoc -- --query "some term" --output custom_filename.json
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";
import { runAdhocSearch } from "../src/discovery/search_adhoc.js";
import { logAction } from "../src/curator_audit.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
function argVal(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const query = argVal("--query");
const platform = argVal("--platform");
const limit = argVal("--limit") != null ? parseInt(argVal("--limit"), 10) : 20;
const outputArg = argVal("--output");

function fail(msg) {
  logger.error(msg);
  process.exit(1);
}

if (!query) fail("--query is required. Usage: npm run search:adhoc -- --query \"...\" --platform instagram");
if (!platform) fail("--platform is required (instagram | tiktok).");
if (!["instagram", "tiktok"].includes(platform)) fail(`--platform must be instagram or tiktok (got "${platform}").`);
if (platform === "tiktok") fail("ad-hoc search is not yet supported for tiktok (no /search adapter — only /profile). Instagram only for now.");

async function main() {
  const ts = nowIso();
  logger.info(`search:adhoc query="${query}" platform=${platform} limit=${limit}`);

  const res = await runAdhocSearch({ query, platform, limit }); // 1 rapidapi call

  const outName = outputArg || `adhoc_search_${ts.replace(/[:.]/g, "-")}.json`;
  const outPath = isAbsolute(outName) ? outName : join(ROOT, "scratch", outName);
  mkdirSync(dirname(outPath), { recursive: true });

  const doc = {
    query,
    platform,
    timestamp: ts,
    raw_candidates_count: res.raw_count,
    survivors_count: res.survivors_count,
    reason_breakdown: res.reason_breakdown,
    candidates: res.candidates,
  };
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");

  await logAction({
    action: "search_adhoc",
    target_type: "search",
    target_id: query,
    platform,
    after_state: { survivors_count: res.survivors_count, raw_candidates_count: res.raw_count, output_file: outPath },
    reason: null,
  });

  logger.info(`raw candidates: ${res.raw_count} | survivors after prefilter: ${res.survivors_count}`);
  logger.info(`reason breakdown: ${JSON.stringify(res.reason_breakdown)}`);
  logger.info(`survivors: ${res.candidates.map((c) => "@" + c.handle).join(", ") || "(none)"}`);
  logger.info(`written to: ${outPath}`);
  logger.info("NOTE: nothing staged/fetched/classified — this is exploration only.");
}

await main();

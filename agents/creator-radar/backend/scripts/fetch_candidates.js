// Selective /profile fetch for accepted candidates. Budget-gated; promotes fetched
// candidates into the accounts table (tagged with discovered_via). Does NOT classify.
//
// Usage:
//   node scripts/fetch_candidates.js                    # up to 12 accepted, any seed
//   node scripts/fetch_candidates.js --limit 8
//   node scripts/fetch_candidates.js --seed aiagents --limit 5
import { all } from "../src/db.js";
import { logger } from "../src/logger.js";
import { fetchAndPromote } from "../src/discovery/promote.js";
import { canCall, printStatus } from "../src/budget.js";

const HARD_CAP = 48;
const argv = process.argv.slice(2);
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const limitArg = parseInt(argVal("--limit", "12"), 10);
const limit = Math.min(Math.max(Number.isNaN(limitArg) ? 12 : limitArg, 1), HARD_CAP);
const seedFilter = argVal("--seed", null);

async function selectCandidates() {
  const where = ["platform = 'instagram'", "prefilter_verdict = 'accept'", "fetch_status IS NULL"];
  const args = { lim: limit };
  if (seedFilter) {
    // Accept a bare term ("aiagents") or a method-qualified value ("search:aiagents").
    const qualified = seedFilter.includes(":") ? seedFilter : `search:${seedFilter}`;
    where.push("(discovered_via = @seed OR discovered_via = @seedQualified)");
    args.seed = seedFilter;
    args.seedQualified = qualified;
  }
  // ORDER BY id ASC = candidate_accounts insertion order = /search ranking (position),
  // so --limit picks the top-ranked candidates for the seed.
  return all(
    `SELECT id, handle, discovered_via FROM candidate_accounts
     WHERE ${where.join(" AND ")} ORDER BY id ASC LIMIT @lim`,
    args
  );
}

async function main() {
  const candidates = await selectCandidates();
  logger.info(
    `fetch_candidates: ${candidates.length} accepted candidate(s) queued (limit ${limit}${seedFilter ? `, seed=${seedFilter}` : ""}).`
  );

  let fetched = 0;
  let empty = 0;
  let failed = 0;
  let stopped = false;

  for (const c of candidates) {
    if (!(await canCall("rapidapi"))) {
      logger.warn("RapidAPI budget cap reached — stopping cleanly.");
      stopped = true;
      break;
    }
    const r = await fetchAndPromote(c);
    if (r.status === "fetched_empty") {
      logger.warn(`@${c.handle}: 0 posts — marked fetched_empty, NOT promoted`);
      empty++;
    } else if (r.status === "failed") {
      logger.error(`failed @${c.handle}: ${r.error.message}`);
      failed++;
    } else {
      logger.info(`fetched @${c.handle} (via ${c.discovered_via}): ${r.profile.follower_count} followers, ${r.posts.length} posts`);
      fetched++;
    }
  }

  logger.info(`fetch_candidates done. fetched=${fetched} empty=${empty} failed=${failed}${stopped ? " (stopped at budget cap)" : ""}`);
  logger.info(`Next: run \`npm run classify\` to classify the newly promoted accounts.`);
  await printStatus();
}

await main();

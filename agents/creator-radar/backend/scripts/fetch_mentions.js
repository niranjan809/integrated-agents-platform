// P-3 — selective /profile fetch for mention-discovered candidates. Mirrors
// fetch_candidates.js but scoped to discovered_via LIKE 'mention:%', so re-running it
// never touches hashtag-discovered candidates (and vice-versa). Uses the same shared
// fetchAndPromote helper (src/discovery/promote.js) — identical fetch/promote/status logic.
//
// Mention candidates are staged with prefilter_verdict='accept' (human-curated at the P-3
// review pause), so there is no prefilter step here — see discovery_notes.md "v0.11 P-3:
// Prefilter bypass for mention candidates".
//
// Usage:
//   node scripts/fetch_mentions.js                 # fetch all unfetched mention candidates
//   node scripts/fetch_mentions.js --limit 10      # cap at 10
//   node scripts/fetch_mentions.js --dry-run       # list candidates, no fetch, no writes
import { all } from "../src/db.js";
import { logger } from "../src/logger.js";
import { fetchAndPromote } from "../src/discovery/promote.js";
import { canCall, printStatus } from "../src/budget.js";

const HARD_CAP = 48;
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const limitArg = argVal("--limit", null);
const limit = limitArg != null ? Math.min(Math.max(parseInt(limitArg, 10) || 0, 1), HARD_CAP) : null;

async function selectCandidates() {
  let sql = `SELECT id, handle, discovered_via FROM candidate_accounts
             WHERE platform='instagram' AND discovered_via LIKE 'mention:%' AND fetched_at IS NULL
             ORDER BY id ASC`;
  if (limit != null) sql += ` LIMIT ${limit}`;
  return all(sql);
}

async function main() {
  const candidates = await selectCandidates();
  logger.info(`fetch_mentions: ${candidates.length} unfetched mention candidate(s)${limit != null ? ` (limit ${limit})` : ""}.`);

  if (dryRun) {
    for (const c of candidates) logger.info(`  would fetch @${c.handle} (via ${c.discovered_via})`);
    logger.info("dry-run: no fetches performed, no writes.");
    return;
  }

  let fetched = 0, empty = 0, failed = 0, stopped = false;
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

  logger.info(`fetch_mentions done. fetched=${fetched} empty=${empty} failed=${failed}${stopped ? " (stopped at budget cap)" : ""}`);
  logger.info(`Next: run \`npm run relevance -- --platform instagram\` then \`npm run classify -- --platform instagram\`.`);
  await printStatus();
}

await main();

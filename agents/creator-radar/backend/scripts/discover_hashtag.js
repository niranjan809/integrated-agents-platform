// Phase 3 / P-1 discovery: for each seed term, call /search once, stage the returned
// users in candidate_accounts, and pre-filter them. In --from-list mode this ALSO runs
// the selective /profile fetch + promote step per hashtag (budget-gated), so a tier can
// be swept end-to-end in one command.
//
// Usage:
//   node scripts/discover_hashtag.js                          # 4 default seeds, stage only
//   node scripts/discover_hashtag.js aiagents                 # one seed (positional), stage only
//   node scripts/discover_hashtag.js --hashtag aiagents       # one seed (flag), stage only
//   node scripts/discover_hashtag.js --from-list T1 --limit 30           # first 30 T1 tags, fetch+promote
//   node scripts/discover_hashtag.js --from-list T2 --skip 10 --limit 20 # T2 tags 11-30
//   node scripts/discover_hashtag.js --from-list T1 --no-fetch           # tier sweep, stage only
//   node scripts/discover_hashtag.js --from-list T1 --fetch-per-tag 4    # override per-tag fetch cap
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { all, batch, nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";
import { searchByTerm } from "../src/providers/rapidapi_instagram_search.js";
import { prefilter } from "../src/discovery/prefilter.js";
import { fetchAndPromote } from "../src/discovery/promote.js";
import { canCall, monthlyCount, capFor, printStatus } from "../src/budget.js";

const DEFAULT_SEEDS = ["promptengineering", "aiagents", "voiceai", "chatgpttutorial"];

// Budget stop thresholds (P-1 STEP 1.3): halt the sweep before we're near either cap.
const RAPIDAPI_STOP = 450;
const OPENROUTER_STOP = 480;
const DEFAULT_FETCH_PER_TAG = 3;

// --- arg parsing ---
const argv = process.argv.slice(2);
function argVal(name, def = null) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const hasFlag = (name) => argv.includes(name);
const fromList = argVal("--from-list");
const limit = argVal("--limit") !== null ? parseInt(argVal("--limit"), 10) : null;
const skip = argVal("--skip") !== null ? parseInt(argVal("--skip"), 10) : 0;
const fetchPerTag = argVal("--fetch-per-tag") !== null ? parseInt(argVal("--fetch-per-tag"), 10) : DEFAULT_FETCH_PER_TAG;
const hashtagFlag = argVal("--hashtag");
const positional = argv.filter((a) => !a.startsWith("--"));

// Group reasons for the summary (strip the ":" detail and " [seed=…]" annotation).
const reasonKey = (reason) => reason.split(/[:[]/)[0].trim();

function loadTier(tier) {
  const here = dirname(fileURLToPath(import.meta.url));
  const doc = JSON.parse(readFileSync(join(here, "..", "seed_hashtags.json"), "utf8"));
  // Curator tiers live under doc.tiers.{T1,T2,T3}; discovered sections are top-level keys and
  // may be either a bare array (e.g. T2_discovered) OR an object wrapping a hashtags array
  // with metadata (e.g. T_voice: {added_at, source, notes, hashtags:[...]}). Handle all three.
  let rows = doc.tiers?.[tier] ?? doc[tier];
  if (rows && !Array.isArray(rows) && Array.isArray(rows.hashtags)) rows = rows.hashtags;
  if (!Array.isArray(rows)) {
    const tierKeys = Object.keys(doc.tiers || {});
    const topKeys = Object.keys(doc).filter(
      (k) => Array.isArray(doc[k]) ? doc[k]?.[0]?.hashtag : Array.isArray(doc[k]?.hashtags) && doc[k].hashtags?.[0]?.hashtag
    );
    throw new Error(`tier "${tier}" not found (have tiers: ${tierKeys.join(", ")}; top-level: ${topKeys.join(", ")})`);
  }
  return rows.map((r) => r.hashtag);
}

// Returns true (and logs) if either provider is at/over its stop threshold.
async function budgetStopHit() {
  const [rapid, openrouter] = [await monthlyCount("rapidapi"), await monthlyCount("openrouter")];
  if (rapid > RAPIDAPI_STOP) {
    logger.warn(`rapidapi ${rapid} > ${RAPIDAPI_STOP} stop threshold — halting sweep.`);
    return true;
  }
  if (openrouter > OPENROUTER_STOP) {
    logger.warn(`openrouter ${openrouter} > ${OPENROUTER_STOP} stop threshold — halting sweep.`);
    return true;
  }
  return false;
}

// Search one term and stage+prefilter its users into candidate_accounts.
// `catalog` is a mutable Set of already-known handles (lowercased); prefilter reads it and
// the fetch step adds to it, so a handle promoted earlier in this run is rejected later.
// Returns { candidates_returned, survivors, via } (survivors = accepted after prefilter).
async function stageSeed(term, catalog) {
  let result;
  try {
    result = await searchByTerm(term); // 1 API call
  } catch (e) {
    logger.error(`search "${term}" failed: ${e.message}`);
    return { candidates_returned: 0, survivors: 0, via: `search:${term}` };
  }

  const now = nowIso();
  // discovered_via is method-qualified ("search:<term>") so future discovery methods
  // stay distinguishable. prefilter() still gets the BARE term (SEED_OVERRIDES is keyed
  // by bare seed).
  const via = `search:${term}`;
  const scored = result.users.map((u) => ({ u, v: prefilter(u, term, catalog) }));

  const stmts = [];
  for (const { u, v } of scored) {
    stmts.push({
      sql: `INSERT OR IGNORE INTO candidate_accounts
              (handle, platform, pk, full_name, is_verified, discovered_via, discovered_at)
            VALUES (@handle, 'instagram', @pk, @full_name, @is_verified, @discovered_via, @discovered_at)`,
      args: {
        handle: u.handle,
        pk: u.pk,
        full_name: u.full_name,
        is_verified: u.is_verified ? 1 : 0,
        discovered_via: via,
        discovered_at: now,
      },
    });
    // Always refresh the verdict (so a prefilter change reflects on re-run).
    stmts.push({
      sql: `UPDATE candidate_accounts SET prefilter_verdict = @verdict, prefilter_reason = @reason
            WHERE platform = 'instagram' AND handle = @handle AND discovered_via = @via`,
      args: { verdict: v.verdict, reason: v.reason, handle: u.handle, via },
    });
  }
  if (stmts.length) await batch(stmts);

  const tally = {};
  for (const { v } of scored) tally[reasonKey(v.reason)] = (tally[reasonKey(v.reason)] || 0) + 1;
  const accepted = scored.filter((s) => s.v.verdict === "accept");

  logger.info(`seed "${term}": discovered ${scored.length}, accepted ${accepted.length}, rejected ${scored.length - accepted.length}`);
  logger.info(`  reason breakdown: ${JSON.stringify(tally)}`);
  logger.info(`  accepted handles: ${accepted.map((s) => "@" + s.u.handle).join(", ") || "(none)"}`);

  return { candidates_returned: scored.length, survivors: accepted.length, via };
}

// Fetch + promote up to `cap` accepted/unfetched candidates for one discovered_via.
// Adds promoted handles to `catalog`. Returns { fetched, empty, failed, stopped }.
async function fetchSeed(via, cap, catalog) {
  const queue = await all(
    `SELECT id, handle, discovered_via FROM candidate_accounts
     WHERE platform='instagram' AND discovered_via=@via AND prefilter_verdict='accept' AND fetch_status IS NULL
     ORDER BY id ASC LIMIT @lim`,
    { via, lim: cap }
  );
  let fetched = 0, empty = 0, failed = 0;
  for (const c of queue) {
    if (c.handle && catalog.has(c.handle.toLowerCase())) continue; // promoted earlier this run
    if (!(await canCall("rapidapi"))) return { fetched, empty, failed, stopped: true };
    const r = await fetchAndPromote(c);
    if (r.status === "fetched") {
      catalog.add(c.handle.toLowerCase());
      logger.info(`  fetched @${c.handle}: ${r.profile.follower_count} followers, ${r.posts.length} posts — promoted`);
      fetched++;
    } else if (r.status === "fetched_empty") {
      logger.warn(`  @${c.handle}: 0 posts — fetched_empty, NOT promoted`);
      empty++;
    } else {
      logger.error(`  failed @${c.handle}: ${r.error.message}`);
      failed++;
    }
  }
  return { fetched, empty, failed, stopped: false };
}

async function runFromList(tier) {
  const doFetch = !hasFlag("--no-fetch");
  let tags = loadTier(tier);
  const total = tags.length;
  tags = tags.slice(skip, limit !== null ? skip + limit : undefined);

  const catalog = new Set((await all("SELECT handle FROM accounts WHERE platform='instagram'")).map((r) => r.handle.toLowerCase()));
  logger.info(`discover --from-list ${tier}: ${tags.length}/${total} hashtags (skip=${skip}, limit=${limit ?? "none"}), fetch=${doFetch} (per-tag cap ${fetchPerTag})`);
  logger.info(`existing catalog=${catalog.size}`);

  const perTag = [];
  const agg = { candidates_returned: 0, survivors: 0, fetched: 0, empty: 0, failed: 0 };
  let stopped = false;

  for (let i = 0; i < tags.length; i++) {
    const term = tags[i];
    if (await budgetStopHit()) { stopped = true; break; }
    logger.info(`\n[${i + 1}/${tags.length}] #${term}`);
    const s = await stageSeed(term, catalog);
    const row = { hashtag: term, ...s, fetched: 0, empty: 0, failed: 0 };
    if (doFetch && s.survivors > 0) {
      const f = await fetchSeed(s.via, fetchPerTag, catalog);
      row.fetched = f.fetched; row.empty = f.empty; row.failed = f.failed;
      if (f.stopped) { perTag.push(row); accumulate(agg, row); stopped = true; logger.warn("RapidAPI cap reached during fetch — stopping."); break; }
    }
    perTag.push(row);
    accumulate(agg, row);
    const [rapid, openrouter] = [await monthlyCount("rapidapi"), await monthlyCount("openrouter")];
    logger.info(`  => returned ${row.candidates_returned}, survivors ${row.survivors}, fetched ${row.fetched}, empty ${row.empty}, failed ${row.failed} | budget rapidapi ${rapid}/${capFor("rapidapi")} openrouter ${openrouter}/${capFor("openrouter")}`);
  }

  // Sweep summary.
  logger.info(`\n===== --from-list ${tier} sweep summary${stopped ? " (STOPPED at budget)" : ""} =====`);
  logger.info(`hashtags processed: ${perTag.length}/${tags.length}`);
  logger.info(`totals: candidates_returned=${agg.candidates_returned} survivors=${agg.survivors} fetched(promoted)=${agg.fetched} empty=${agg.empty} failed=${agg.failed}`);
  logger.info(`per-hashtag (hashtag | returned | survivors | fetched | empty | failed):`);
  for (const r of perTag) {
    logger.info(`  #${r.hashtag} | ${r.candidates_returned} | ${r.survivors} | ${r.fetched} | ${r.empty} | ${r.failed}`);
  }
  if (doFetch) logger.info(`Next: npm run relevance -- --platform instagram && npm run classify -- --platform instagram`);
  await printStatus();
}

function accumulate(agg, row) {
  agg.candidates_returned += row.candidates_returned;
  agg.survivors += row.survivors;
  agg.fetched += row.fetched;
  agg.empty += row.empty;
  agg.failed += row.failed;
}

// Legacy staging-only mode (positional seeds / --hashtag / defaults). No fetch — preserves
// the original `npm run discover` behavior.
async function runStageOnly(seeds) {
  const catalog = new Set((await all("SELECT handle FROM accounts WHERE platform='instagram'")).map((r) => r.handle.toLowerCase()));
  logger.info(`discover: seeds=[${seeds.join(", ")}] | existing catalog=${catalog.size}`);
  for (const term of seeds) await stageSeed(term, catalog);
  await printStatus();
}

async function main() {
  if (fromList) {
    await runFromList(fromList);
  } else {
    const seeds = positional.length ? positional : hashtagFlag ? [hashtagFlag] : DEFAULT_SEEDS;
    await runStageOnly(seeds);
  }
}

await main();

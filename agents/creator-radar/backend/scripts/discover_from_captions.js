// P-2 STEP 2.3 — second-degree hashtag discovery. Mines the captions of accounts that
// PASSED the AI-relevance gate (accounts.ai_relevance_gate=1) for hashtags NOT already in
// our seed list, ranks them by how many distinct AI accounts use them, and writes the top
// 30 to scratch/ for human review. Read-only w.r.t. the catalog; NO API calls.
//
// Usage:
//   node scripts/discover_from_captions.js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { all, nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HASHTAG_RE = /#[a-z0-9_]+/gi; // ASCII per spec (English-focused); strips non-latin tags

// Build exclusion sets from seed_hashtags.json: current seed tiers, dropped tags, skip list.
function loadExclusions() {
  const doc = JSON.parse(readFileSync(join(ROOT, "seed_hashtags.json"), "utf8"));
  const seed = new Set();
  for (const tier of Object.values(doc.tiers || {})) for (const r of tier) seed.add(r.hashtag.toLowerCase());
  // Also exclude tags we explicitly dropped from rotation — don't re-surface them.
  for (const h of doc.removed_from_rotation?.hashtags || []) seed.add(h.toLowerCase());
  const skip = new Set((doc.skip_list || []).map((s) => s.hashtag.toLowerCase()));
  return { seed, skip };
}

async function main() {
  const { seed, skip } = loadExclusions();

  // Gate-passing Instagram accounts (the iterative AI set).
  const accounts = await all("SELECT handle FROM accounts WHERE platform='instagram' AND ai_relevance_gate=1");
  const gateHandles = accounts.map((a) => a.handle);
  logger.info(`source accounts (ai_relevance_gate=1, instagram): ${gateHandles.length}`);

  // All their captions.
  const posts = await all(
    `SELECT p.handle, p.caption
     FROM posts p
     JOIN accounts a ON a.platform='instagram' AND a.handle=p.handle
     WHERE p.platform='instagram' AND a.ai_relevance_gate=1`
  );
  logger.info(`posts analyzed: ${posts.length}`);

  // Aggregate: tag -> { occurrences, accounts:Set }.
  const agg = new Map();
  for (const { handle, caption } of posts) {
    if (!caption) continue;
    const matches = caption.match(HASHTAG_RE);
    if (!matches) continue;
    for (const raw of matches) {
      const tag = raw.slice(1).toLowerCase(); // strip '#'
      if (!tag) continue;
      let e = agg.get(tag);
      if (!e) { e = { occurrences: 0, accounts: new Set() }; agg.set(tag, e); }
      e.occurrences++;
      e.accounts.add(handle);
    }
  }
  const totalUnique = agg.size;

  // Filter: not in seed/dropped, not in skip, occurrences >= 3, distinct accounts >= 2.
  const filtered = [];
  const dropStats = { in_seed: 0, in_skip: 0, rare_lt3: 0, single_source: 0 };
  for (const [tag, e] of agg) {
    if (seed.has(tag)) { dropStats.in_seed++; continue; }
    if (skip.has(tag)) { dropStats.in_skip++; continue; }
    if (e.occurrences < 3) { dropStats.rare_lt3++; continue; }
    if (e.accounts.size < 2) { dropStats.single_source++; continue; }
    filtered.push({ hashtag: tag, distinct_accounts: e.accounts.size, total_occurrences: e.occurrences });
  }

  // Rank: distinct_accounts desc, then total_occurrences desc, then alphabetical.
  filtered.sort(
    (a, b) =>
      b.distinct_accounts - a.distinct_accounts ||
      b.total_occurrences - a.total_occurrences ||
      a.hashtag.localeCompare(b.hashtag)
  );

  const top30 = filtered.slice(0, 30);
  const outDoc = {
    generated_at: nowIso(),
    source_accounts: gateHandles.length,
    total_posts_analyzed: posts.length,
    novel_hashtags_found: filtered.length,
    top_30: top30,
  };

  const scratchDir = join(ROOT, "scratch");
  mkdirSync(scratchDir, { recursive: true });
  const outPath = join(scratchDir, "second_degree_hashtags.json");
  writeFileSync(outPath, JSON.stringify(outDoc, null, 2) + "\n");

  logger.info("=== second-degree hashtag discovery summary ===");
  logger.info(`  Total unique hashtags found: ${totalUnique}`);
  logger.info(`  Filtered out: in_seed=${dropStats.in_seed}, in_skip=${dropStats.in_skip}, rare(<3)=${dropStats.rare_lt3}, single_source=${dropStats.single_source}`);
  logger.info(`  Survivors (novel, >=3 occ, >=2 accounts): ${filtered.length}`);
  logger.info(`  Top 30 written to: ${outPath}`);
  logger.info(`  Top 30 preview (hashtag | distinct_accounts | total_occurrences):`);
  for (const t of top30) logger.info(`    #${t.hashtag} | ${t.distinct_accounts} | ${t.total_occurrences}`);
}

await main();

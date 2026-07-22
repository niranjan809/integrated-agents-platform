// P-3 STEP 3.1 — mention-based expansion. Parses @mentions from the captions of accounts
// that PASSED the AI-relevance gate; a handle mentioned by multiple gate-passing AI
// creators is a trust-signal candidate. Ranks by breadth (distinct sources) and writes the
// top 100 to scratch/ for human review. Read-only w.r.t. the catalog; NO API calls.
//
// Usage:
//   node scripts/discover_from_mentions.js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { all, nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MENTION_RE = /@([a-zA-Z0-9._]{2,30})/g;

// Domain-like TLDs => treat the token as a URL/email fragment, NOT a handle. Deliberately
// EXCLUDES ".ai" because many real creator handles end in .ai (e.g. yury.ai, power.ai).
const DOMAIN_TLD_RE = /\.(com|io|net|org|co|gg|xyz|app|dev|tv|info|biz|me|us|uk|de|fr)$/i;

// Generic single-word handles that are almost never a specific creator account.
const GENERIC_BLOCKLIST = new Set([
  "ai", "gpt", "ml", "art", "team", "news", "official", "real", "the", "me",
  "home", "love", "life", "music", "video", "tech", "app", "io", "co", "info",
  "everyone", "all", "here", "you", "us", "world", "media", "studio", "design",
  "gmail", "yahoo", "outlook", "email", "contact", "support", "admin", "instagram",
]);

function loadSkipList() {
  try {
    const doc = JSON.parse(readFileSync(join(ROOT, "seed_hashtags.json"), "utf8"));
    return new Set((doc.skip_list || []).map((s) => s.hashtag.toLowerCase()));
  } catch {
    return new Set();
  }
}

// Extract clean mention handles from one caption. Skips emails (mention preceded by a
// word char = local part) and URL/domain fragments (trailing domain TLD).
function extractMentions(caption) {
  const out = [];
  if (!caption) return out;
  for (const m of caption.matchAll(MENTION_RE)) {
    const prev = m.index > 0 ? caption[m.index - 1] : " ";
    if (/[A-Za-z0-9._]/.test(prev)) continue; // email local part / mid-word — skip
    let handle = m[1].toLowerCase().replace(/[._]+$/, ""); // strip trailing . or _
    if (handle.length < 3) continue;
    if (DOMAIN_TLD_RE.test(handle)) continue; // URL/email domain
    out.push(handle);
  }
  return out;
}

async function main() {
  const skip = loadSkipList();

  // In-catalog handles across ALL platforms (a handle may exist on both).
  const catalog = new Set((await all("SELECT handle FROM accounts")).map((r) => r.handle.toLowerCase()));

  // Gate-passing Instagram accounts and their captions.
  const gateAccounts = await all("SELECT handle FROM accounts WHERE platform='instagram' AND ai_relevance_gate=1");
  const posts = await all(
    `SELECT p.handle AS source, p.caption
     FROM posts p JOIN accounts a ON a.platform='instagram' AND a.handle=p.handle
     WHERE p.platform='instagram' AND a.ai_relevance_gate=1`
  );
  logger.info(`source accounts (gate=1): ${gateAccounts.length} | captions: ${posts.length}`);

  // Aggregate: mentioned handle -> { total, sources:Map<source,count> }.
  const agg = new Map();
  let totalMentions = 0;
  for (const { source, caption } of posts) {
    const srcLc = source.toLowerCase();
    for (const handle of extractMentions(caption)) {
      totalMentions++;
      if (handle === srcLc) continue; // self-mention
      let e = agg.get(handle);
      if (!e) { e = { total: 0, sources: new Map() }; agg.set(handle, e); }
      e.total++;
      e.sources.set(source, (e.sources.get(source) || 0) + 1);
    }
  }

  // Filter.
  const drop = { in_catalog: 0, in_skip: 0, generic: 0 };
  const candidates = [];
  for (const [handle, e] of agg) {
    if (catalog.has(handle)) { drop.in_catalog++; continue; }
    if (skip.has(handle)) { drop.in_skip++; continue; }
    if (GENERIC_BLOCKLIST.has(handle)) { drop.generic++; continue; }
    const sources = [...e.sources.keys()];
    candidates.push({ handle, distinct_sources: sources.length, total_mentions: e.total, mentioned_by: sources });
  }

  // Rank: distinct sources desc, total desc, alphabetical.
  candidates.sort(
    (a, b) =>
      b.distinct_sources - a.distinct_sources ||
      b.total_mentions - a.total_mentions ||
      a.handle.localeCompare(b.handle)
  );

  const top = candidates.slice(0, 100).map((c) => ({
    handle: `@${c.handle}`,
    distinct_sources: c.distinct_sources,
    total_mentions: c.total_mentions,
    mentioned_by: c.mentioned_by,
  }));

  const outDoc = {
    generated_at: nowIso(),
    source_accounts_analyzed: gateAccounts.length,
    total_captions_analyzed: posts.length,
    total_mentions_extracted: totalMentions,
    unique_handles_after_filtering: candidates.length,
    top_candidates: top,
  };

  const scratchDir = join(ROOT, "scratch");
  mkdirSync(scratchDir, { recursive: true });
  const outPath = join(scratchDir, "mention_candidates.json");
  writeFileSync(outPath, JSON.stringify(outDoc, null, 2) + "\n");

  logger.info("=== mention discovery summary ===");
  logger.info(`  Total mentions extracted (raw): ${totalMentions}`);
  logger.info(`  Filtered out: in_catalog=${drop.in_catalog}, in_skip=${drop.in_skip}, generic=${drop.generic}`);
  logger.info(`  Unique candidate handles after filtering: ${candidates.length}`);
  logger.info(`  Top 100 written to: ${outPath}`);
  logger.info(`  Top 25 preview (handle | distinct_sources | total_mentions):`);
  for (const c of top.slice(0, 25)) logger.info(`    ${c.handle} | ${c.distinct_sources} | ${c.total_mentions}`);
}

await main();

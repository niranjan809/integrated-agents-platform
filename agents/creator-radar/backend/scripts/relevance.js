// v0.9 AI-relevance gate runner. Computes the gate for accounts that don't yet have a
// cached result (accounts.ai_relevance_gate IS NULL) and caches it to the accounts table.
// Decoupled from classify.js — run once per account.
//
// USAGE:
//   node scripts/relevance.js --dry-run                 # render prompts, NO LLM, no writes
//   node scripts/relevance.js                           # REAL: LLM gate on all uncomputed accounts
//   node scripts/relevance.js --sample 5                # REAL: LLM on 5 accounts (mixed platforms)
//   node scripts/relevance.js --handles a,b,c           # REAL: LLM on exactly these handles
//   node scripts/relevance.js --platform tiktok         # scope to one platform
//   node scripts/relevance.js --dry-run --platform instagram --limit 1
//
// G-2 change: the DEFAULT (no --dry-run) now invokes the LLM. --dry-run STILL does not call
// the LLM — it means "show me what would be sent without spending budget". Accounts with no
// posts are skipped (the gate needs content). Errors on one account are logged and the run
// continues.

import { all } from "../src/db.js";
import { logger } from "../src/logger.js";
import { config } from "../src/config.js";
import { monthlyCount } from "../src/budget.js";
import { buildRelevancePrompt, computeRelevance, saveRelevanceResult } from "../src/ai_relevance.js";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const platformArg = argVal("--platform", "all"); // instagram | tiktok | all
const limitArg = argVal("--limit", null);
const limit = limitArg != null ? Number(limitArg) : null;
const sampleArg = argVal("--sample", null);
const sample = sampleArg != null ? Number(sampleArg) : null;
const handlesArg = argVal("--handles", null);
const handles = handlesArg ? handlesArg.split(",").map((h) => h.trim()).filter(Boolean) : null;

function safeParse(json, fallback) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

// Accounts with no cached gate result yet, filtered by --platform / --handles / --limit.
async function selectTargets() {
  const where = ["ai_relevance_gate IS NULL"];
  const args = {};
  if (platformArg !== "all") {
    where.push("platform = @platform");
    args.platform = platformArg;
  }
  if (handles && handles.length) {
    where.push(`handle IN (${handles.map((_, i) => `@h${i}`).join(", ")})`);
    handles.forEach((h, i) => (args[`h${i}`] = h));
  }
  let sql = `SELECT platform, handle, display_name, bio, external_url, follower_count
             FROM accounts WHERE ${where.join(" AND ")} ORDER BY platform, handle`;
  if (limit != null && Number.isFinite(limit)) sql += ` LIMIT ${Math.floor(limit)}`;
  return all(sql, args);
}

// Round-robin across platforms so a --sample N is a mix, not all-instagram-first.
function interleaveByPlatform(rows) {
  const groups = {};
  for (const r of rows) (groups[r.platform] ||= []).push(r);
  const buckets = Object.values(groups);
  const out = [];
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const b of buckets) {
      if (b[i]) { out.push(b[i]); added = true; }
    }
  }
  return out;
}

async function loadPosts(platform, handle) {
  const rows = await all(
    "SELECT caption, hashtags_json, posted_at FROM posts WHERE platform = @platform AND handle = @handle ORDER BY posted_at DESC LIMIT 20",
    { platform, handle }
  );
  return rows.map((p) => ({ ...p, hashtags: safeParse(p.hashtags_json, []) }));
}

function stats(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return { min: s[0], median, max: s[s.length - 1] };
}

async function main() {
  let targets = await selectTargets();
  // --sample N (only when not explicitly picking --handles): mix platforms, take N.
  if (sample != null && Number.isFinite(sample) && !handles) {
    targets = interleaveByPlatform(targets).slice(0, Math.floor(sample));
  }

  const mode = dryRun ? "DRY RUN (no LLM)" : "REAL (LLM)";
  logger.info(
    `relevance [${mode}]: ${targets.length} account(s) with ai_relevance_gate IS NULL` +
      ` (platform=${platformArg}${handles ? `, handles=${handles.join(",")}` : ""}${sample != null ? `, sample=${sample}` : ""}${limit != null ? `, limit=${limit}` : ""}).`
  );

  // ----- DRY RUN: render prompts, no LLM, no writes (unchanged from G-1) -----
  if (dryRun) {
    const lengths = [];
    const byPlatform = {};
    let firstPrompt = null;
    let queued = 0, skipped = 0;
    for (const t of targets) {
      const posts = await loadPosts(t.platform, t.handle);
      if (!posts.length) { logger.warn(`skip @${t.handle} [${t.platform}]: no posts in DB`); skipped++; continue; }
      const prompt = buildRelevancePrompt(t, posts);
      logger.info(`Would send prompt for ${t.platform}:${t.handle}, length ${prompt.length} chars`);
      lengths.push(prompt.length);
      byPlatform[t.platform] = (byPlatform[t.platform] || 0) + 1;
      if (firstPrompt === null) firstPrompt = { tag: `${t.platform}:${t.handle}`, text: prompt };
      queued++;
    }
    logger.info("=== relevance dry-run summary ===");
    logger.info(`  Total accounts queued: ${queued}${skipped ? ` (skipped ${skipped} with no posts)` : ""}`);
    logger.info(`  By platform: ${Object.entries(byPlatform).map(([p, n]) => `${p}=${n}`).join(", ") || "(none)"}`);
    const ls = stats(lengths);
    if (ls) logger.info(`  Prompt length (chars): min=${ls.min}, median=${ls.median}, max=${ls.max}`);
    if (firstPrompt) logger.info(`\n=== sample prompt (first account: ${firstPrompt.tag}) ===\n${firstPrompt.text}\n=== end sample prompt ===`);
    return;
  }

  // ----- REAL: invoke LLM, cache result, tally. Errors don't abort. -----
  let truthy = 0, falsy = 0, skipped = 0;
  const errors = [];
  const confidences = [];
  for (const t of targets) {
    try {
      const result = await computeRelevance(t.handle, t.platform);
      if (result === null) { skipped++; continue; } // no posts (warned inside computeRelevance)
      await saveRelevanceResult(t.handle, t.platform, result);
      confidences.push(result.confidence);
      if (result.primarily_ai_content) truthy++; else falsy++;
      logger.info(
        `${t.handle} (${t.platform}): ${result.primarily_ai_content} @ ${result.confidence.toFixed(2)} — ${result.reasoning.slice(0, 80)}`
      );
    } catch (e) {
      errors.push({ tag: `${t.platform}:${t.handle}`, message: e.message });
      logger.error(`gate FAILED @${t.handle} [${t.platform}]: ${e.message}`);
    }
  }

  const processed = truthy + falsy;
  const pct = (n) => (processed ? ((100 * n) / processed).toFixed(1) : "0.0");
  logger.info("=== relevance run summary ===");
  logger.info(`  Total processed: ${processed}${skipped ? ` (skipped ${skipped} with no posts)` : ""}`);
  logger.info(`  primarily_ai_content=true:  ${truthy} (${pct(truthy)}%)`);
  logger.info(`  primarily_ai_content=false: ${falsy} (${pct(falsy)}%)`);
  logger.info(`  Errors: ${errors.length}${errors.length ? " -> " + errors.map((e) => `${e.tag}: ${e.message}`).join(" | ") : ""}`);
  const cs = stats(confidences);
  if (cs) logger.info(`  Confidence: min=${cs.min.toFixed(2)}, median=${cs.median.toFixed(2)}, max=${cs.max.toFixed(2)}`);
  logger.info(`  Budget final: openrouter ${await monthlyCount("openrouter")}/${config.apiBudgetMonthly}`);
}

main();

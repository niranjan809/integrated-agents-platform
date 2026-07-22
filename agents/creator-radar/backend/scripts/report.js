// Report: writes output/report_YYYY-MM-DD.csv and prints a console summary.
// Platform-aware: --platform instagram|tiktok|all (default all).
//   single platform -> one summary section filtered to it
//   all             -> combined header + per-platform sections + per-platform budget
// Uses the LATEST classification row per (platform, handle).
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { all } from "../src/db.js";
import { config } from "../src/config.js";
import { logger } from "../src/logger.js";
import { monthlyCount, capFor } from "../src/budget.js";

const argv = process.argv.slice(2);
function argVal(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const platformArg = argVal("--platform", "all"); // instagram | tiktok | all

// CSV columns — platform is now the first data column.
const COLUMNS = [
  { key: "platform" },
  { key: "handle" },
  { key: "display_name" },
  { key: "expected_category" },
  { key: "predicted_category" },
  { key: "category_confidence" },
  { key: "expected_genuineness" },
  { key: "predicted_genuineness" },
  { key: "category_method" },
  { key: "category_rule_matched" },
  { key: "genuineness_rule_matched" },
  { key: "reasoning" },
  { key: "ai_relevance_gate" },
  { key: "ai_relevance_confidence" },
  { key: "ai_relevance_reasoning" },
  { key: "follower_count" },
  { key: "following_count" },
  { key: "follower_following_ratio" },
  { key: "is_verified", bool: true },
  { key: "is_business_account", bool: true },
  { key: "post_count" },
  { key: "ai_content_fraction" },
  { key: "engagement_rate" },
  { key: "avg_likes" },
  { key: "avg_comments" },
  { key: "posts_per_week_last_8w" },
  { key: "posts_last_90d" },
  { key: "days_since_last_post" },
  { key: "duplicate_caption_fraction" },
  { key: "bio" },
  { key: "bio_email" },
  { key: "external_url" },
];

async function getRows(platform) {
  const where = [];
  const args = {};
  if (platform !== "all") {
    where.push("a.platform = @platform");
    args.platform = platform;
  }
  return all(
    `SELECT
       a.platform AS platform, a.handle AS handle, a.display_name AS display_name,
       a.expected_category AS expected_category, c.category AS predicted_category,
       c.category_confidence AS category_confidence, a.expected_genuineness AS expected_genuineness,
       c.genuineness AS predicted_genuineness, c.category_method AS category_method,
       c.category_rule_matched AS category_rule_matched, c.genuineness_rule_matched AS genuineness_rule_matched,
       c.reasoning AS reasoning,
       a.ai_relevance_gate AS ai_relevance_gate, a.ai_relevance_confidence AS ai_relevance_confidence,
       a.ai_relevance_reasoning AS ai_relevance_reasoning,
       a.follower_count AS follower_count, a.following_count AS following_count,
       a.follower_following_ratio AS follower_following_ratio, a.is_verified AS is_verified,
       a.is_business_account AS is_business_account, a.post_count AS post_count,
       c.ai_content_fraction AS ai_content_fraction, a.engagement_rate AS engagement_rate,
       a.avg_likes AS avg_likes, a.avg_comments AS avg_comments,
       a.posts_per_week_last_8w AS posts_per_week_last_8w, a.posts_last_90d AS posts_last_90d,
       a.days_since_last_post AS days_since_last_post, a.duplicate_caption_fraction AS duplicate_caption_fraction,
       a.bio AS bio, a.bio_email AS bio_email, a.external_url AS external_url
     FROM accounts a
     JOIN classifications c ON c.platform = a.platform AND c.handle = a.handle
     JOIN (SELECT platform, handle, MAX(id) AS mid FROM classifications GROUP BY platform, handle) latest
       ON latest.platform = c.platform AND latest.handle = c.handle AND latest.mid = c.id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY a.platform, a.handle`,
    args
  );
}

// ---- CSV helpers ----
function fmt(col, v) {
  if (col.bool) return v === 1 || v === true ? "true" : v === 0 || v === false ? "false" : "";
  return v === null || v === undefined ? "" : String(v);
}
function csvEscape(s) {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(records) {
  const header = COLUMNS.map((c) => c.key).join(",");
  const lines = records.map((r) => COLUMNS.map((c) => csvEscape(fmt(c, r[c.key]))).join(","));
  return [header, ...lines].join("\n") + "\n";
}

const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) + "%" : "n/a");

// Print the 4 metric groups + disagreements for one row subset.
function summarize(rows, label) {
  console.log(`\n----- ${label} (${rows.length} classified) -----`);
  if (rows.length === 0) {
    console.log("  (no classifications)");
    return;
  }
  const catScored = rows.filter((r) => r.expected_category);
  const catAgree = catScored.filter((r) => r.predicted_category === r.expected_category).length;
  console.log(`Category agreement (excl. null expected): ${catAgree}/${catScored.length} = ${pct(catAgree, catScored.length)}`);

  const genScored = rows.filter((r) => r.expected_genuineness);
  const genAgree = genScored.filter((r) => r.predicted_genuineness === r.expected_genuineness).length;
  const flagged = rows.filter(
    (r) => r.expected_genuineness === "Genuine" && (r.predicted_genuineness === "Low-effort" || r.predicted_genuineness === "Uncertain")
  );
  console.log(`Genuineness agreement: ${genAgree}/${genScored.length} = ${pct(genAgree, genScored.length)}`);
  console.log(`  flagged non-Genuine: ${flagged.length}${flagged.length ? " -> " + flagged.map((r) => `@${r.handle}:${r.predicted_genuineness}[${r.genuineness_rule_matched}]`).join(", ") : ""}`);

  const viaRule = rows.filter((r) => r.category_method === "rule").length;
  const viaLlm = rows.filter((r) => r.category_method === "llm").length;
  const viaGate = rows.filter((r) => r.category_method === "gate").length;
  console.log(`Category method: rule ${viaRule}/${rows.length} = ${pct(viaRule, rows.length)} | llm ${viaLlm}/${rows.length} = ${pct(viaLlm, rows.length)} | gate ${viaGate}/${rows.length} = ${pct(viaGate, rows.length)}`);

  const tally = (key) => {
    const m = {};
    for (const r of rows) if (r[key]) m[r[key]] = (m[r[key]] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  console.log(`Category rules fired: ${tally("category_rule_matched").map(([id, n]) => `${id}:${n}`).join(", ") || "(none)"}`);
  console.log(`Genuineness rules fired: ${tally("genuineness_rule_matched").map(([id, n]) => `${id}:${n}`).join(", ") || "(none)"}`);

  const dis = catScored.filter((r) => r.predicted_category !== r.expected_category);
  console.log(`Category disagreements (${dis.length}):`);
  for (const r of dis) {
    console.log(`  @${r.handle}: expected "${r.expected_category}" -> "${r.predicted_category}" [${r.category_method}${r.category_rule_matched ? " " + r.category_rule_matched : ""}]`);
  }
}

// Gate-out breakdown across the given rows. Only prints when there are gate-outs.
// For gate rows, category_confidence holds the gate confidence and reasoning holds the
// gate reasoning (written by classify.js on the method="gate" path).
function gateOutSection(rows) {
  const gated = rows.filter((r) => r.category_method === "gate");
  if (!gated.length) return;
  console.log(`\n----- Gate-outs: ${gated.length} of ${rows.length} (${pct(gated.length, rows.length)}) -----`);
  const byPlat = {};
  for (const r of gated) byPlat[r.platform] = (byPlat[r.platform] || 0) + 1;
  console.log(`  By platform: ${Object.entries(byPlat).map(([p, n]) => `${p}=${n}`).join(", ")}`);
  const conf = gated.map((r) => r.category_confidence).filter((x) => x != null).sort((a, b) => a - b);
  if (conf.length) {
    const mid = Math.floor(conf.length / 2);
    const med = conf.length % 2 ? conf[mid] : (conf[mid - 1] + conf[mid]) / 2;
    console.log(`  Confidence: min=${conf[0].toFixed(2)}, median=${med.toFixed(2)}, max=${conf[conf.length - 1].toFixed(2)}`);
  }
  console.log(`  Sample reasonings:`);
  for (const r of gated.slice(0, 5)) {
    console.log(`    - @${r.handle} (${r.platform}): ${(r.reasoning || "").replace(/\s+/g, " ").slice(0, 100)}`);
  }
}

async function printBudget(platform) {
  const or = await monthlyCount("openrouter");
  console.log("\nBudget (this month):");
  if (platform === "instagram" || platform === "all") {
    console.log(`  Instagram: rapidapi ${await monthlyCount("rapidapi")}/${capFor("rapidapi")}, openrouter ${or}/${capFor("openrouter")}`);
  }
  if (platform === "tiktok" || platform === "all") {
    console.log(`  TikTok: tiktok_rapidapi ${await monthlyCount("tiktok_rapidapi")}/${capFor("tiktok_rapidapi")}, openrouter ${or}/${capFor("openrouter")} (shared)`);
  }
}

// ---- run ----
const rows = await getRows(platformArg);

mkdirSync(config.outputDir, { recursive: true });
const dateStr = new Date().toISOString().slice(0, 10);
const csvPath = resolve(config.outputDir, `report_${dateStr}.csv`);
writeFileSync(csvPath, toCsv(rows));

if (platformArg === "all") {
  const platforms = [...new Set(rows.map((r) => r.platform))].sort();
  console.log(`\n=== Creator Radar report (${dateStr}) ===`);
  console.log(`Total ${rows.length} accounts across ${platforms.length} platform(s): ${platforms.join(", ")}`);
  console.log(`CSV: ${csvPath} (${COLUMNS.length} columns)`);
  for (const p of ["instagram", "tiktok"]) {
    if (platforms.includes(p)) summarize(rows.filter((r) => r.platform === p), p);
  }
  gateOutSection(rows);
  await printBudget("all");
} else {
  console.log(`\n=== Creator Radar report (${dateStr}) — platform=${platformArg} ===`);
  console.log(`CSV: ${csvPath} (${COLUMNS.length} columns)`);
  if (rows.length === 0) logger.warn(`No classifications for platform=${platformArg} — run classify first.`);
  else {
    summarize(rows, platformArg);
    gateOutSection(rows);
  }
  await printBudget(platformArg);
}
console.log("");

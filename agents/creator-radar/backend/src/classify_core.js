// Shared per-account classification core, extracted from scripts/classify.js so it can be
// reused by the batch classify script AND the account:add curator CLI (single source of
// truth for the signals → genuineness → category-rules → LLM-fallback flow + the gate
// short-circuit). Behavior is identical to the original inline classifyOne.
import { all, get, run, nowIso } from "./db.js";
import { logger } from "./logger.js";
import { computeSignals } from "./signals.js";
import * as genuineness from "./genuineness.js";
import * as categoryRules from "./category_rules.js";
import * as categoryLlm from "./category_llm.js";
import { getCachedRelevance } from "./ai_relevance.js";

function safeParse(json, fallback) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

async function loadPosts(platform, handle) {
  const rows = await all(
    "SELECT post_id, caption, media_type, hashtags_json, likes, comments, posted_at FROM posts WHERE platform = @platform AND handle = @handle ORDER BY posted_at DESC",
    { platform, handle }
  );
  return rows.map((p) => ({ ...p, hashtags: safeParse(p.hashtags_json, []) }));
}

// Classify one account. Returns "classified" | "skipped". Idempotent unless force=true.
// Requires a cached ai_relevance gate result (run relevance first) — returns "skipped" if absent.
export async function classifyOne(platform, handle, { force = false } = {}) {
  const tag = `@${handle} [${platform}]`;
  const postCount = (await get("SELECT COUNT(*) AS n FROM posts WHERE platform = @platform AND handle = @handle", { platform, handle })).n;
  if (postCount === 0) {
    logger.warn(`skip ${tag}: no posts in DB (run fetch first)`);
    return { status: "skipped" };
  }
  if (!force && (await get("SELECT 1 AS x FROM classifications WHERE platform = @platform AND handle = @handle LIMIT 1", { platform, handle }))) {
    logger.info(`skip ${tag} (already classified; use --force to redo)`);
    return { status: "skipped" };
  }

  const signals = await computeSignals(handle, platform);
  const account = await get("SELECT * FROM accounts WHERE platform = @platform AND handle = @handle", { platform, handle });
  const posts = await loadPosts(platform, handle);

  const features = {
    handle: account.handle,
    platform,
    display_name: account.display_name,
    bio: account.bio,
    external_url: account.external_url,
    follower_count: account.follower_count,
    following_count: account.following_count,
    post_count: account.post_count,
    ...signals,
  };

  const gate = await getCachedRelevance(handle, platform);
  if (gate === null) {
    logger.warn(`skip ${tag}: no ai_relevance gate result — run 'npm run relevance' first`);
    return { status: "skipped" };
  }

  // Genuineness is an INDEPENDENT axis and always runs — a gated-out account can still be
  // flagged Low-effort/Uncertain on posting behaviour.
  const gen = genuineness.classify(features);

  let row = {
    handle,
    platform,
    genuineness: gen.label,
    genuineness_rule_matched: gen.rule_matched,
    signals_snapshot_json: JSON.stringify(features),
    created_at: nowIso(),
    prompt_version: null,
    model: null,
  };

  if (!gate.primarily_ai_content) {
    row = {
      ...row,
      category: "Uncategorized",
      category_confidence: gate.confidence,
      category_method: "gate",
      category_rule_matched: "AI_RELEVANCE_GATE_FAIL",
      ai_content_fraction: null,
      reasoning: gate.reasoning,
    };
  } else {
    const ruleHit = categoryRules.classify(features, posts);
    if (ruleHit) {
      row = {
        ...row,
        category: ruleHit.category,
        category_confidence: ruleHit.confidence,
        category_method: "rule",
        category_rule_matched: ruleHit.rule_id,
        ai_content_fraction: categoryRules.aiContentFraction(posts),
        reasoning: `Rule ${ruleHit.rule_id} matched (confidence ${ruleHit.confidence}).`,
      };
    } else {
      const llm = await categoryLlm.classify(features, posts, platform);
      row = {
        ...row,
        category: llm.category,
        category_confidence: llm.category_confidence,
        category_method: "llm",
        category_rule_matched: null,
        ai_content_fraction: llm.ai_content_fraction,
        reasoning: llm.reasoning,
        prompt_version: llm.prompt_version,
        model: llm.model,
      };
    }
  }

  await run(
    `INSERT INTO classifications
       (handle, platform, category, category_confidence, category_method, category_rule_matched,
        genuineness, genuineness_rule_matched, ai_content_fraction, reasoning,
        signals_snapshot_json, prompt_version, model, created_at)
     VALUES
       (@handle, @platform, @category, @category_confidence, @category_method, @category_rule_matched,
        @genuineness, @genuineness_rule_matched, @ai_content_fraction, @reasoning,
        @signals_snapshot_json, @prompt_version, @model, @created_at)`,
    row
  );

  logger.info(
    `${tag}: ${row.category} (${row.category_method}${row.category_rule_matched ? " " + row.category_rule_matched : ""}) | genuineness=${row.genuineness} [${row.genuineness_rule_matched}]`
  );
  return { status: "classified", row };
}

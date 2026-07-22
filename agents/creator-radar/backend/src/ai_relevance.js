// v0.9 AI-relevance gate. Determines whether an account PRIMARILY posts AI content;
// accounts that fail are classified Uncategorized (category_method="gate") downstream.
//
// Result is cached on the accounts table (ai_relevance_* columns) so the gate runs once
// per account, decoupled from classify.js (see scripts/relevance.js). Mirrors the
// category_llm.js pattern: prompt loaded from src/prompts/, single 2s retry, all LLM calls
// gated + recorded through budget.js.
//
// NOTE: getCachedRelevance/saveRelevanceResult are ASYNC (unlike the sync pseudocode in the
// G-1 spec) because the Turso/libsql DB layer (src/db.js) is async — a sync version is not
// possible. buildRelevancePrompt is sync (string building only). computeRelevance is a G-1
// stub that throws; the LLM is wired in G-2.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config, requireOpenRouter } from "./config.js";
import { all, get, run, nowIso } from "./db.js";
import { canCall, recordCall } from "./budget.js";
import { logger } from "./logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Strip accidental ``` / ```json fences before JSON.parse (mirrors category_llm.js).
function parseModelJson(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

function safeParse(json, fallback) {
  try {
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

export const PROMPT_VERSION = "v1";
export const MODEL = config.openrouter.model; // from OPENROUTER_MODEL env (google/gemini-2.5-flash)

const PROMPT_PATH = resolve(config.projectRoot, "src/prompts/ai_relevance_v1.md");
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, "utf8");

// Returns the cached gate result from the accounts table, or null if not yet computed
// (ai_relevance_gate IS NULL). Does NOT compute.
export async function getCachedRelevance(handle, platform) {
  const row = await get(
    `SELECT ai_relevance_gate, ai_relevance_confidence, ai_relevance_reasoning,
            ai_relevance_computed_at, ai_relevance_prompt_version
     FROM accounts WHERE platform = @platform AND handle = @handle`,
    { platform, handle }
  );
  if (!row || row.ai_relevance_gate == null) return null; // uncomputed
  return {
    primarily_ai_content: row.ai_relevance_gate === 1,
    confidence: row.ai_relevance_confidence,
    reasoning: row.ai_relevance_reasoning,
    computed_at: row.ai_relevance_computed_at,
    prompt_version: row.ai_relevance_prompt_version,
  };
}

// Loads the accounts row + up to 20 most-recent posts (newest first), hashtags parsed.
async function loadProfileAndPosts(handle, platform) {
  const profile = await get(
    `SELECT platform, handle, display_name, bio, external_url, follower_count
     FROM accounts WHERE platform = @platform AND handle = @handle`,
    { platform, handle }
  );
  const rows = await all(
    "SELECT caption, hashtags_json, posted_at FROM posts WHERE platform = @platform AND handle = @handle ORDER BY posted_at DESC LIMIT 20",
    { platform, handle }
  );
  const posts = rows.map((p) => ({ ...p, hashtags: safeParse(p.hashtags_json, []) }));
  return { profile, posts };
}

// Computes the gate for one account via the LLM. Returns the result object, or null if the
// account has no posts (can't be evaluated — logs a warning, matching the script's skip).
// Same OpenRouter/retry/parse contract as category_llm.js: budget-gated, single 2s retry.
export async function computeRelevance(handle, platform) {
  requireOpenRouter();
  const { profile, posts } = await loadProfileAndPosts(handle, platform);
  if (!profile) throw new Error(`account not found: ${platform}:${handle}`);
  if (!posts.length) {
    logger.warn(`skip @${handle} [${platform}]: no posts in DB`);
    return null;
  }

  const prompt = buildRelevancePrompt(profile, posts);
  const body = JSON.stringify({
    model: config.openrouter.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    // gemini-2.5-flash via OpenRouter honors json_object; belt-and-braces with the fence
    // stripping in parseModelJson in case a provider ignores it.
    response_format: { type: "json_object" },
  });
  const headers = {
    Authorization: `Bearer ${config.openrouter.key}`,
    "Content-Type": "application/json",
  };

  const maxAttempts = 2; // initial + one retry
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!(await canCall("openrouter"))) {
      throw new Error(
        `OpenRouter monthly budget (${config.apiBudgetMonthly}) exhausted — refusing gate call for @${handle}.`
      );
    }
    let status = null;
    let rawContent = null;
    try {
      const res = await fetch(config.openrouter.url, { method: "POST", headers, body });
      status = res.status;
      const text = await res.text();
      await recordCall({ provider: "openrouter", endpoint: "ai_relevance", handle, status, platform });

      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

      const envelope = JSON.parse(text);
      rawContent = envelope?.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error(`No choices/content in response: ${text.slice(0, 200)}`);

      const parsed = parseModelJson(rawContent);

      if (typeof parsed.primarily_ai_content !== "boolean") {
        throw new Error(`primarily_ai_content not a boolean: ${JSON.stringify(parsed).slice(0, 200)}`);
      }
      const confidence = Number(parsed.confidence ?? 0);
      const reasoning = String(parsed.reasoning ?? "");
      if (confidence < 0.5) {
        // Rubric tells the model to output false when uncertain; log if confidence is still low.
        logger.warn(`@${handle} [${platform}]: low confidence ${confidence.toFixed(2)} (gate=${parsed.primarily_ai_content})`);
      }

      return {
        primarily_ai_content: parsed.primarily_ai_content,
        confidence,
        reasoning,
        computed_at: nowIso(),
        prompt_version: PROMPT_VERSION,
      };
    } catch (e) {
      lastErr = e;
      if (status === null) {
        await recordCall({ provider: "openrouter", endpoint: "ai_relevance", handle, status: 0, platform });
      }
      if (attempt < maxAttempts) {
        logger.warn(`gate @${handle} attempt ${attempt} failed: ${e.message} — retrying in 2s`);
        await sleep(2000);
      } else if (rawContent) {
        // Final failure on a parse issue: surface the raw LLM output for debugging.
        lastErr = new Error(`${e.message} | raw LLM output: ${rawContent.slice(0, 300)}`);
      }
    }
  }
  throw lastErr;
}

// Persists a gate result to the accounts table. Idempotent (UPDATE, keyed on the composite
// PK). result = { primarily_ai_content, confidence, reasoning, prompt_version, computed_at }.
export async function saveRelevanceResult(handle, platform, result) {
  await run(
    `UPDATE accounts SET
       ai_relevance_gate = @gate,
       ai_relevance_confidence = @confidence,
       ai_relevance_reasoning = @reasoning,
       ai_relevance_computed_at = @computed_at,
       ai_relevance_prompt_version = @prompt_version
     WHERE platform = @platform AND handle = @handle`,
    {
      gate: result.primarily_ai_content ? 1 : 0,
      confidence: result.confidence ?? null,
      reasoning: result.reasoning ?? null,
      computed_at: result.computed_at ?? nowIso(),
      prompt_version: result.prompt_version ?? PROMPT_VERSION,
      platform,
      handle,
    }
  );
}

// Top-15 hashtags across posts, "#tag (N)" descending by frequency.
function hashtagFrequencyList(posts) {
  const counts = new Map();
  for (const p of posts) {
    for (const tag of p.hashtags || []) {
      const t = String(tag).toLowerCase();
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  if (counts.size === 0) return "(no hashtags in recent posts)";
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, n]) => `${tag.startsWith("#") ? tag : "#" + tag} (${n})`)
    .join("\n");
}

// 5 most recent captions, truncated to 200 chars: "[YYYY-MM-DD] caption…".
function captionSamples(posts) {
  if (!posts.length) return "(no recent posts available)";
  return posts
    .slice(0, 5)
    .map((p) => {
      const date = (p.posted_at || "").slice(0, 10) || "????-??-??";
      const caption = (p.caption || "").replace(/\s+/g, " ").trim().slice(0, 200);
      return `[${date}] ${caption}`.trim();
    })
    .join("\n");
}

// Fills the prompt template with real values. profile = accounts row (or subset);
// posts = array of { posted_at, caption, hashtags[] } newest-first. Exported so the
// dry-run path in relevance.js can render prompts without an LLM call.
export function buildRelevancePrompt(profile, posts = []) {
  const subs = {
    "{platform}": profile.platform ?? "",
    "{handle}": profile.handle ?? "",
    "{display_name}": profile.display_name ?? "",
    "{bio}": profile.bio ?? "",
    "{external_url}": profile.external_url ?? "(none)",
    "{follower_count}": String(profile.follower_count ?? 0),
    "{hashtag_frequency_list}": hashtagFrequencyList(posts),
    "{caption_samples}": captionSamples(posts),
  };
  let out = PROMPT_TEMPLATE;
  for (const [token, value] of Object.entries(subs)) {
    out = out.split(token).join(value);
  }
  return out;
}

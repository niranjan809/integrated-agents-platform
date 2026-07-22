// LLM category fallback (OpenRouter -> Gemini 2.5 Flash). Invoked ONLY when
// category_rules.classify() returns null. Genuineness is never sent to the LLM.
//
// Every call is gated + recorded through src/budget.js (provider="openrouter"),
// mirroring the RapidAPI enforcement pattern. Single 2s retry on non-200 or parse
// failure — no more (per CLAUDE.md).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config, requireOpenRouter } from "./config.js";
import { canCall, recordCall } from "./budget.js";
import { logger } from "./logger.js";

export const PROMPT_VERSION = "category_llm_v1";
const PROMPT_PATH = resolve(config.projectRoot, "src/prompts/category_llm_v1.md");
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, "utf8");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fmtNum(n, digits = 4) {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "n/a";
}

// One line per post: [posted_at | media_type | likes L / comments C] caption #hashtags
function formatPosts(posts) {
  if (!posts.length) return "(no recent posts available)";
  return posts
    .map((p) => {
      const date = (p.posted_at || "").slice(0, 10) || "?";
      const caption = (p.caption || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const tags = (p.hashtags || []).join(" ");
      return `[${date} | ${p.media_type} | ${p.likes}L / ${p.comments}C] ${caption} ${tags}`.trim();
    })
    .join("\n");
}

function buildPrompt(features, posts) {
  const subs = {
    "{handle}": features.handle ?? "",
    "{display_name}": features.display_name ?? "",
    "{bio}": features.bio ?? "",
    "{external_url}": features.external_url ?? "(none)",
    "{follower_count}": String(features.follower_count ?? 0),
    "{following_count}": String(features.following_count ?? 0),
    "{post_count}": String(features.post_count ?? 0),
    "{engagement_rate}": fmtNum(features.engagement_rate, 4),
    "{posts_per_week_last_8w}": fmtNum(features.posts_per_week_last_8w, 2),
    "{posts_formatted}": formatPosts(posts),
  };
  let out = PROMPT_TEMPLATE;
  for (const [token, value] of Object.entries(subs)) {
    out = out.split(token).join(value);
  }
  return out;
}

// Strip accidental ``` / ```json fences before JSON.parse.
function parseModelJson(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned);
}

// platform is plumbed through for future per-platform prompt divergence; the prompt is
// currently platform-agnostic, so it is intentionally unused for now.
export async function classify(features, posts = [], platform = "instagram") {
  requireOpenRouter();
  const prompt = buildPrompt(features, posts);

  const body = JSON.stringify({
    model: config.openrouter.model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
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
        `OpenRouter monthly budget (${config.apiBudgetMonthly}) exhausted — refusing LLM call for @${features.handle}.`
      );
    }
    let status = null;
    try {
      const res = await fetch(config.openrouter.url, { method: "POST", headers, body });
      status = res.status;
      const text = await res.text();
      await recordCall({ provider: "openrouter", endpoint: config.openrouter.model, handle: features.handle, status });

      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

      const envelope = JSON.parse(text);
      const content = envelope?.choices?.[0]?.message?.content;
      if (!content) throw new Error(`No choices/content in response: ${text.slice(0, 200)}`);

      const parsed = parseModelJson(content);
      return {
        category: parsed.category ?? "Uncategorized",
        category_confidence: Number(parsed.category_confidence ?? 0),
        ai_content_fraction: Number(parsed.ai_content_fraction ?? 0),
        reasoning: parsed.reasoning ?? "",
        prompt_version: PROMPT_VERSION,
        model: config.openrouter.model,
      };
    } catch (e) {
      lastErr = e;
      if (status === null) {
        await recordCall({ provider: "openrouter", endpoint: config.openrouter.model, handle: features.handle, status: 0 });
      }
      if (attempt < maxAttempts) {
        logger.warn(`LLM classify @${features.handle} attempt ${attempt} failed: ${e.message} — retrying in 2s`);
        await sleep(2000);
      }
    }
  }
  throw lastErr;
}

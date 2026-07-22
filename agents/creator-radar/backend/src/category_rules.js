// Rule-based category classifier. Top-down, first strong match wins. Returns
// {category, confidence, rule_id} or null when no rule clears CONF_THRESHOLD — null
// triggers the LLM fallback (src/category_llm.js).
//
// Tune by inspecting the LLM-invoked residue: if the LLM keeps returning the same
// category for a recognizable pattern, promote that pattern to a rule here.
//
// MEDIA TYPE: post.media_type is produced upstream by the adapter's deriveMediaType()
// (the single source of truth). These modules CONSUME that value and never re-derive
// __typename/product_type themselves — no duplication of the type logic. (None of
// CR1–CR6 actually key off media_type today; the field is available if a future rule
// needs it, e.g. a reel-heavy signal.)

export const CONF_THRESHOLD = 0.7;

// Tool-specific hashtags (used by CR2). Lowercase, with leading '#'. Easy to extend.
export const TOOL_HASHTAGS = new Set([
  "#chatgpt", "#gpt", "#gpt4", "#gpt4o", "#gpt5", "#openai",
  "#claude", "#anthropic",
  "#midjourney", "#dalle", "#dalle3", "#stablediffusion", "#flux",
  "#cursor", "#v0", "#windsurf", "#bolt", "#lovable", "#copilot", "#githubcopilot",
  "#gemini", "#notebooklm",
  "#sora", "#runway", "#runwayml", "#pika", "#kling", "#veo", "#heygen",
  "#perplexity", "#suno", "#elevenlabs", "#grok", "#deepseek", "#llama",
]);

// Broader AI hashtag set (used to estimate ai_content_fraction on the rule path).
export const AI_HASHTAGS = new Set([
  ...TOOL_HASHTAGS,
  "#ai", "#artificialintelligence", "#genai", "#generativeai", "#aitools",
  "#ainews", "#machinelearning", "#ml", "#llm", "#chatbot", "#aiart", "#aivideo",
  "#automation", "#aiagent", "#aiagents", "#aiengineering", "#promptengineering",
]);

function hasAny(hashtags, set) {
  return (hashtags || []).some((h) => set.has(h));
}

function toolHashtagFraction(posts) {
  if (!posts.length) return 0;
  return posts.filter((p) => hasAny(p.hashtags, TOOL_HASHTAGS)).length / posts.length;
}

function avgCaptionLength(posts) {
  if (!posts.length) return 0;
  return posts.reduce((s, p) => s + (p.caption ? p.caption.length : 0), 0) / posts.length;
}

// Fraction of shown posts that look AI-related by hashtag. Used for the rule-path
// ai_content_fraction (the LLM supplies its own value when it is invoked).
export function aiContentFraction(posts) {
  if (!posts.length) return 0;
  return posts.filter((p) => hasAny(p.hashtags, AI_HASHTAGS)).length / posts.length;
}

// features expects: handle, bio, external_url, posts_per_week_last_8w.
export function classify(features, posts = []) {
  const handle = (features.handle || "").toLowerCase();
  const bio = (features.bio || "").toLowerCase();
  const cadence = features.posts_per_week_last_8w || 0;
  const hasUrl = !!features.external_url;

  // Each block returns a candidate; we gate on CONF_THRESHOLD at the end of the block.
  // (All rule confidences are >= 0.7 by design, so a match always returns.)

  // CR1_DAILY_NEWS
  if (
    (/(daily|news|updates)/.test(handle) || /(daily ai|ai news|updates)/.test(bio)) &&
    cadence >= 5
  ) {
    return gate({ category: "AI News/Aggregator", confidence: 0.85, rule_id: "CR1_DAILY_NEWS" });
  }

  // CR4_PROMOTER_STRONG — evaluated BEFORE CR2: an explicit promoter bio is a stronger
  // signal than tool-hashtag frequency, so it should win over the tool-reviewer rule.
  if (
    /(founder|ceo|we help|book a call|our platform|try our)/.test(bio) &&
    hasUrl &&
    !/(i teach|tutorials|learn)/.test(bio)
  ) {
    return gate({ category: "AI Promoter", confidence: 0.75, rule_id: "CR4_PROMOTER_STRONG" });
  }

  // CR2_TOOL_REVIEWER — restricted to genuine tool-focused accounts. Negative guards
  // keep out Educators ("teach/tutorial/learn/guide/master/expert") and Promoters
  // ("founder/ceo/our platform/our tools/apply/book a call"), which also carry tool
  // hashtags and were being mislabeled here.
  if (
    toolHashtagFraction(posts) >= 0.5 &&
    avgCaptionLength(posts) > 100 &&
    !/teach|tutorial|learn|guide|master|expert/i.test(bio) &&
    !/founder|ceo|our platform|our tools|apply|book a call/i.test(bio)
  ) {
    return gate({ category: "AI Tool Reviewer", confidence: 0.75, rule_id: "CR2_TOOL_REVIEWER" });
  }

  // CR3_EDUCATOR_HANDLE
  if (
    /aiwith|withai|learnai|ai\.?tutorial/i.test(handle) ||
    /(i teach|learn ai|ai tutorials|ai course)/.test(bio)
  ) {
    return gate({ category: "AI Educator", confidence: 0.8, rule_id: "CR3_EDUCATOR_HANDLE" });
  }

  // CR5_HYBRID_MARKETING
  if (/(agency|we help brands|marketing|lead gen|automation for)/.test(bio) && hasUrl) {
    return gate({
      category: "Hybrid Creator+Promoter",
      confidence: 0.75,
      rule_id: "CR5_HYBRID_MARKETING",
    });
  }

  // CR6_NEWS_BROAD
  if (
    (/^the?(artificial|ai|genai)/i.test(handle) || /(everything ai|all things ai)/.test(bio)) &&
    cadence >= 3
  ) {
    return gate({ category: "AI News/Aggregator", confidence: 0.7, rule_id: "CR6_NEWS_BROAD" });
  }

  return null; // no rule matched -> LLM fallback
}

function gate(result) {
  return result.confidence >= CONF_THRESHOLD ? result : null;
}

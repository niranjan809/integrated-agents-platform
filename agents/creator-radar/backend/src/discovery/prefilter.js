// Aggressive pre-filter applied to discovered candidates BEFORE any /profile fetch —
// cheap heuristics to avoid spending RapidAPI calls on farms, dupes, and tail results.
//
// prefilter(candidate, existingHandles) -> { verdict: "accept"|"reject", reason }
// Rules evaluated in order; first reject wins.
//
// `existingHandles` is a Set of already-cataloged handles (lowercased), built ONCE per
// run with a bulk query — not queried per candidate. Defaults to empty so the function
// stays pure/testable.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FARM_USERNAME_RE = /(\d{4,}$)|(\.deals$)|(\.bot$)|(_ai_ai)|(^[A-Z_]+$)/;
const SPAM_NAME_RE = /promotion|dm for|whatsapp|telegram|free (?:money|gift)/i;

// Topical relevance tokens. Substring match (not word-boundary): "agents" contains
// "agent" → matches → kept. Verified accounts skip this check entirely.
const AI_TOKENS = [
  "ai", "gpt", "prompt", "llm", "ml", "automation", "agent",
  "chatgpt", "claude", "gemini", "sora", "midjourney", "cursor",
  "coding", "dev", "tech", "saas", "neural", "model", "bot",
  "nocode", "no-code", "genai", "anthropic", "openai",
];

// Per-seed filter overrides. "agent" is a genuine AI token globally (aiagentbuilder,
// agentops, agenticai are real AI handles) but collides on the "aiagents" seed, where
// it matches unrelated "agents" (TV shows, sports/real-estate/wedding agencies). For
// that seed only: drop "agent" from the token set AND extend the gate to verified
// accounts too. Other seeds inherit the defaults (no entry needed).
const SEED_OVERRIDES = {
  aiagents: { exclude_tokens: ["agent"], skip_verified_gate: false },
};

// P-2 Path 1 — collision hashtags. These T1 tags share a substring with a common AI token
// ("agent", "vector", "embed", "fine…") but heavily surface NON-AI accounts (P-1 data:
// insurance/real-estate agents, jiu-jitsu, disease research, fashion). For a candidate
// discovered via one of these, a single token match is NOT enough — we require a SECOND,
// independent AI signal before spending a /profile fetch on it. (rag/mcp/aiops are dropped
// from rotation entirely in seed_hashtags.json, so they don't need collision handling.)
// This LAYERS on top of SEED_OVERRIDES (aiagents keeps its override too).
const COLLISION_HASHTAGS = new Set([
  "aiagent", "aiengineering", "finetuning", "vectordb",
  "multiagent", "multiagentai", "aiagents", "ragagents",
  "embeddings", "contextengineering",
]);

// Explicit multi-word AI phrases that count as reinforcement on their own. NOTE: bio is
// unavailable at the prefilter stage (see skip_list note above), so these — and the
// reinforcement check below — run against handle + full_name only. Multi-word phrases
// rarely appear in a handle, so in practice the AI-token path does the work; the phrases
// are kept per the P-2 spec and become effective if bio is ever surfaced pre-fetch.
const AI_KEYWORD_PAIRS = [
  "ai automation", "ai agent for", "ai-powered", "ai powered",
  "built with claude", "built with gpt", "ai tool", "ai tools",
  "generative ai", "genai",
];

// Skip list loaded once at module init from seed_hashtags.json (repo root). These are
// filler / growth-hack / meta-noise terms (e.g. "motivation", "viral", "follow") that
// carry no AI signal. A candidate whose handle or display name contains any of them as a
// substring is rejected. NOTE: bio is NOT available at the prefilter stage (it's only
// fetched during the /profile call), so this matches handle + full_name only.
// Loaded defensively — a missing/malformed file leaves SKIP_TERMS empty (rule no-ops)
// so prefilter stays usable without the JSON present.
function loadSkipTerms() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const path = join(here, "..", "..", "seed_hashtags.json"); // src/discovery -> repo root
    const doc = JSON.parse(readFileSync(path, "utf8"));
    return (doc.skip_list || [])
      .map((s) => (s.hashtag || "").toLowerCase().trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}
const SKIP_TERMS = loadSkipTerms();

const reject = (reason) => ({ verdict: "reject", reason });

export function prefilter(candidate, seed = null, existingHandles = new Set()) {
  const handle = candidate.handle || "";
  const handleLc = handle.toLowerCase();
  const fullName = candidate.full_name || "";
  const isVerified = !!candidate.is_verified;
  const position = candidate.position;

  // 1. already in the main catalog (bulk-checked set)
  if (existingHandles.has(handleLc)) return reject("already_in_catalog");

  // 2. tail of the search ranking
  if (typeof position === "number" && position > 20) return reject("position_tail");

  // 3. farm-shaped username (only if unverified)
  if (FARM_USERNAME_RE.test(handle) && !isVerified) return reject("farm_username");

  // 4. empty display name, or display name that just echoes the handle
  if (!fullName.trim() || fullName.toLowerCase() === handleLc) return reject("empty_or_matching_name");

  // 5. spam tokens in display name
  if (SPAM_NAME_RE.test(fullName)) return reject("spam_tokens_in_name");

  // 5b. skip_list: handle/name contains a filler/growth-hack term (from
  // seed_hashtags.json). Substring match on handle + full_name (bio unavailable here).
  if (SKIP_TERMS.length) {
    const searchable = `${handle} ${fullName}`.toLowerCase();
    const hit = SKIP_TERMS.find((t) => searchable.includes(t));
    if (hit) return reject(`skip_list_match:${hit}`);
  }

  // 5c. collision reinforcement (P-2 Path 1): if discovered via a collision hashtag, a bare
  // token match isn't enough. Require a SECOND AI signal beyond what the hashtag itself
  // explains — an AI_TOKEN that is NOT a substring of the collision term, or an explicit AI
  // keyword phrase. E.g. via "aiagent", the tokens "ai"/"agent" are already implied by the
  // tag, so we need something like "gpt"/"llm"/"automation" in handle+name to keep it.
  // Runs on handle + full_name only (bio not available pre-fetch).
  if (seed && COLLISION_HASHTAGS.has(seed.toLowerCase())) {
    const searchable = `${handle} ${fullName}`.toLowerCase();
    const seedLc = seed.toLowerCase();
    // Tokens "explained by" the collision hashtag don't count as independent reinforcement.
    const reinforcing = AI_TOKENS.filter((t) => !seedLc.includes(t) && searchable.includes(t));
    const phraseHit = AI_KEYWORD_PAIRS.some((p) => searchable.includes(p));
    if (reinforcing.length === 0 && !phraseHit) {
      return reject(`collision_no_reinforcement:${seedLc}`);
    }
  }

  // 6. topical_mismatch: no AI-related token in handle or name. Default: only gate
  // unverified accounts, using the full AI_TOKENS set. SEED_OVERRIDES can drop specific
  // tokens and/or extend the gate to verified accounts (see the aiagents entry above).
  const override = (seed && SEED_OVERRIDES[seed]) || {};
  const effectiveTokens = AI_TOKENS.filter((t) => !(override.exclude_tokens || []).includes(t));
  const verifiedGated = override.skip_verified_gate === false; // gate verified too?
  const applyGate = verifiedGated ? true : !isVerified;
  if (applyGate) {
    const searchable = `${handle} ${fullName}`.toLowerCase();
    const matched = effectiveTokens.filter((t) => searchable.includes(t));
    if (matched.length === 0) {
      return reject(
        `topical_mismatch [seed=${seed ?? "none"}, verified_gated=${verifiedGated}]: no AI tokens in '${searchable.trim()}'`
      );
    }
  }

  return { verdict: "accept", reason: "accept" };
}

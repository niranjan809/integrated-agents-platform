// Shared ad-hoc search core, used by BOTH scripts/search_adhoc.js (CLI) and the
// POST /api/search endpoint (dashboard Search tab). Runs one /search + the existing
// prefilter and returns structured survivors — no file writes, no audit logging (those
// are caller-specific: the CLI writes a JSON file, the API logs curator_actions).
//
// Instagram only: the TikTok /search adapters aren't wired into discovery (see
// discovery_notes.md "Known gaps"). Callers should reject platform=tiktok before calling.
import { all } from "../db.js";
import { prefilter } from "./prefilter.js";
import { searchByTerm } from "../providers/rapidapi_instagram_search.js";

const reasonKey = (r) => (r || "?").split(/[:[]/)[0].trim();

// Runs the search + prefilter. Spends 1 rapidapi call (budget-gated inside searchByTerm,
// which throws if the monthly cap is exhausted — callers surface that as needed).
// Returns { query, platform, raw_count, survivors_count, reason_breakdown, candidates }.
// candidates = prefilter survivors: { handle, full_name, follower_count, position, prefilter_reason }.
// (follower_count is null — the /search response carries no follower count pre-fetch.)
export async function runAdhocSearch({ query, platform = "instagram", limit = 20 }) {
  const existing = new Set(
    (await all("SELECT handle FROM accounts WHERE platform=@p", { p: platform })).map((r) => r.handle.toLowerCase())
  );

  const result = await searchByTerm(query); // 1 rapidapi call
  const users = result.users.slice(0, limit);
  const scored = users.map((u) => ({ u, v: prefilter(u, query, existing) }));
  const survivors = scored.filter((s) => s.v.verdict === "accept");

  const tally = {};
  for (const { v } of scored) tally[reasonKey(v.reason)] = (tally[reasonKey(v.reason)] || 0) + 1;

  const candidates = survivors.map((s) => ({
    handle: s.u.handle,
    full_name: s.u.full_name,
    follower_count: null, // not present in /search results (only available after /profile fetch)
    position: s.u.position,
    prefilter_reason: s.v.reason,
  }));

  return {
    query,
    platform,
    raw_count: result.users.length,
    survivors_count: survivors.length,
    reason_breakdown: tally,
    candidates,
  };
}

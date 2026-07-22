// v0.13 shared account-add core, used by BOTH scripts/account_add.js (CLI) and the
// POST /api/accounts endpoint. Fetch → persist → AI-relevance gate (ALWAYS runs) →
// classify → audit. onProgress(stage) is called as each stage begins:
//   'fetching' → 'inserting' → 'gating' → 'classifying' → 'done'
//
// Order note (v0.13): fetch happens BEFORE any accounts insert, so a failed/empty fetch
// leaves NO row behind (clean retry from the UI). On fetch failure this logs an
// account_add audit row with fetch_status=fetch_failed and throws err.code='fetch_failed'.
// (Improves on the v0.12 CLI, which inserted a bare zombie row first — that was a flagged
// deviation; `accounts` has no fetch_status column, so the state lives in the audit row.)
import { get, run, batch, nowIso } from "../db.js";
import { fetchAccount as fetchInstagram } from "../providers/rapidapi_instagram.js";
import { fetchAccount as fetchTikTok } from "../providers/rapidapi_tiktok.js";
import { persist as persistInstagram } from "../discovery/promote.js";
import { computeRelevance, saveRelevanceResult } from "../ai_relevance.js";
import { classifyOne } from "../classify_core.js";
import { logAction } from "../curator_audit.js";

export const VALID_CATEGORIES = [
  "AI Educator", "AI Tool Reviewer", "AI News/Aggregator", "AI Business/B2B",
  "AI Trend/Viral", "AI Promoter", "Hybrid Creator+Promoter",
];
export const VALID_GENUINENESS = ["Genuine", "Low-effort", "Uncertain"];

function err(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// TikTok persist (mirrors scripts/fetch_tiktok.js). IG reuses the shared promote.persist.
async function persistTikTok(handle, discovered_via, profile, posts, raw) {
  const rawVideos = raw?.user_posts?.data?.videos ?? [];
  await batch([
    { sql: "INSERT OR IGNORE INTO accounts (handle, platform, first_seen_at) VALUES (@handle, 'tiktok', @t)", args: { handle, t: nowIso() } },
    {
      sql: `UPDATE accounts SET display_name=@display_name, bio=@bio, is_verified=@is_verified,
              is_business_account=@is_business_account, follower_count=@follower_count, following_count=@following_count,
              post_count=@post_count, external_url=@external_url, bio_email=@bio_email, sec_uid=@sec_uid,
              external_id=@external_id, raw_profile_json=@raw_profile_json, discovered_via=@discovered_via, last_refreshed_at=@t
            WHERE platform='tiktok' AND handle=@handle`,
      args: {
        handle, discovered_via, t: nowIso(),
        display_name: profile.display_name, bio: profile.bio,
        is_verified: profile.is_verified ? 1 : 0,
        is_business_account: profile.is_business_account == null ? null : profile.is_business_account ? 1 : 0,
        follower_count: profile.follower_count, following_count: profile.following_count, post_count: profile.post_count,
        external_url: profile.external_url, bio_email: profile.bio_email, sec_uid: profile.sec_uid,
        external_id: profile.external_id, raw_profile_json: JSON.stringify(raw),
      },
    },
    { sql: "DELETE FROM posts WHERE platform='tiktok' AND handle=@handle", args: { handle } },
    ...posts.map((p, i) => ({
      sql: `INSERT OR REPLACE INTO posts (post_id, handle, platform, caption, media_type, hashtags_json, likes, comments, views, shares, posted_at, raw_json)
            VALUES (@post_id, @handle, 'tiktok', @caption, @media_type, @hashtags_json, @likes, @comments, @views, @shares, @posted_at, @raw_json)`,
      args: {
        post_id: p.post_id, handle, caption: p.caption, media_type: p.media_type,
        hashtags_json: JSON.stringify(p.hashtags ?? []), likes: p.likes, comments: p.comments,
        views: p.views, shares: p.shares, posted_at: p.posted_at, raw_json: JSON.stringify(rawVideos[i] ?? null),
      },
    })),
  ]);
}

// Add one account end-to-end. Throws typed errors (err.code): 'invalid_platform',
// 'invalid_category', 'invalid_genuineness', 'duplicate', 'fetch_failed'.
// Returns { account, classification, gate }.
export async function addAccount({
  handle,
  platform,
  reason,
  actor = "anooj",
  expectedCategory = null,
  expectedGenuineness = null,
  onProgress = () => {},
}) {
  if (!handle || !platform || !reason) throw err("handle, platform, reason are required", "invalid_args");
  if (!["instagram", "tiktok"].includes(platform)) throw err(`invalid platform: ${platform}`, "invalid_platform");
  if (expectedCategory && !VALID_CATEGORIES.includes(expectedCategory)) throw err(`invalid expected_category: ${expectedCategory}`, "invalid_category");
  if (expectedGenuineness && !VALID_GENUINENESS.includes(expectedGenuineness)) throw err(`invalid expected_genuineness: ${expectedGenuineness}`, "invalid_genuineness");

  const existing = await get("SELECT handle FROM accounts WHERE platform=@platform AND handle=@handle", { platform, handle });
  if (existing) throw err(`@${handle} already exists for platform=${platform}`, "duplicate");

  const via = `manual:${reason.slice(0, 40)}`;

  // 1. Fetch FIRST (no row inserted yet — clean retry on failure).
  onProgress("fetching");
  let profile, posts, raw;
  try {
    ({ profile, posts, raw } = platform === "instagram" ? await fetchInstagram(handle) : await fetchTikTok(handle));
  } catch (e) {
    await logAction({
      action: "account_add", target_type: "account", target_id: handle, platform,
      after_state: { fetch_status: "fetch_failed", note: e.message, gate_result: null, predicted_category: null, predicted_genuineness: null },
      reason, actor,
    });
    throw err(`fetch failed: ${e.message}`, "fetch_failed");
  }
  if (!posts || posts.length === 0) {
    await logAction({
      action: "account_add", target_type: "account", target_id: handle, platform,
      after_state: { fetch_status: "fetch_failed", note: "fetched but 0 posts", gate_result: null, predicted_category: null, predicted_genuineness: null },
      reason, actor,
    });
    throw err("account has 0 posts — cannot gate/classify", "fetch_failed");
  }

  // 2. Persist (creates the accounts row + posts, tagged with the manual discovered_via).
  onProgress("inserting");
  if (platform === "instagram") await persistInstagram(handle, via, profile, posts, raw);
  else await persistTikTok(handle, via, profile, posts, raw);
  if (expectedCategory || expectedGenuineness) {
    await run("UPDATE accounts SET expected_category=@ec, expected_genuineness=@eg WHERE platform=@platform AND handle=@handle",
      { ec: expectedCategory, eg: expectedGenuineness, platform, handle });
  }

  // 3. AI-relevance gate — ALWAYS runs.
  onProgress("gating");
  const gate = await computeRelevance(handle, platform);
  if (gate === null) throw err("gate could not run (no posts) — unexpected after fetch", "gate_failed");
  await saveRelevanceResult(handle, platform, gate);

  // 4. Classify.
  onProgress("classifying");
  const classified = await classifyOne(platform, handle, { force: true });
  const row = classified.row || {};

  // 5. Audit.
  await logAction({
    action: "account_add", target_type: "account", target_id: handle, platform,
    after_state: {
      follower_count: profile.follower_count,
      gate_result: gate.primarily_ai_content,
      predicted_category: row.category ?? null,
      predicted_genuineness: row.genuineness ?? null,
    },
    reason, actor,
  });

  onProgress("done");
  const account = await get("SELECT * FROM accounts WHERE platform=@platform AND handle=@handle", { platform, handle });
  return {
    account,
    classification: row,
    gate: { primarily_ai_content: gate.primarily_ai_content, confidence: gate.confidence, reasoning: gate.reasoning },
  };
}

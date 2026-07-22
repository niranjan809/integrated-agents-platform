// Adapter: instagram-looter2 raw /profile response -> normalized { profile, posts, raw }.
//
// Provider quirk: a SINGLE /profile call returns the profile fields at the JSON root
// PLUS the 12 most-recent posts embedded under edge_owner_to_timeline_media.edges[].node
// (including comment counts and timestamps). So there is no separate posts endpoint —
// one budget-gated call per account covers everything.
//
// Field paths below are taken from an observed real response (scratch/sample_response_profile.json),
// NOT from provider docs. If the provider changes shape, fix it HERE — the rest of the
// app only sees the normalized shape.

import { config, requireRapidApi } from "../config.js";
import { canCall, recordCall } from "../budget.js";
import { logger } from "../logger.js";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Unicode-aware hashtag match: '#' followed by letters/digits/underscore (any script).
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Derive normalized media_type from the two provider signals. Exported because the
// rules modules need the exact same derivation logic (single source of truth).
//   __typename:   GraphImage | GraphVideo | GraphSidecar
//   product_type: "clips" (reel) | "feed" | "igtv" | ...
export function deriveMediaType(node) {
  if (node.product_type === "clips") return "reel";
  if (node.__typename === "GraphSidecar") return "carousel";
  if (node.__typename === "GraphVideo") return "video";
  return "image";
}

export function extractHashtags(caption) {
  if (!caption) return [];
  const matches = caption.match(HASHTAG_RE) || [];
  // Preserve leading '#', normalize case (IG hashtags are case-insensitive).
  return matches.map((h) => h.toLowerCase());
}

function count(node) {
  return node && typeof node.count === "number" ? node.count : 0;
}

// Raw provider response -> normalized shape consumed by the rest of the app.
export function normalize(handle, raw) {
  const captionOf = (n) => n?.edge_media_to_caption?.edges?.[0]?.node?.text ?? "";

  const profile = {
    handle: raw.username || handle,
    display_name: raw.full_name ?? null,
    bio: raw.biography ?? null,
    profile_pic_url: raw.profile_pic_url_hd || raw.profile_pic_url || null,
    is_verified: !!raw.is_verified,
    is_business_account: !!raw.is_business_account,
    follower_count: count(raw.edge_followed_by),
    following_count: count(raw.edge_follow),
    post_count: count(raw.edge_owner_to_timeline_media),
    external_url: raw.external_url ?? null,
    // business_email first; fall back to a regex sweep of the bio.
    bio_email: raw.business_email || raw.biography?.match(EMAIL_RE)?.[0] || null,
  };

  const edges = raw.edge_owner_to_timeline_media?.edges ?? [];
  const posts = edges.map(({ node: n }) => {
    const caption = captionOf(n);
    return {
      post_id: String(n.id ?? n.shortcode),
      caption,
      media_type: deriveMediaType(n),
      hashtags: extractHashtags(caption),
      likes: count(n.edge_liked_by) || count(n.edge_media_preview_like),
      comments: count(n.edge_media_to_comment),
      posted_at: n.taken_at_timestamp
        ? new Date(n.taken_at_timestamp * 1000).toISOString()
        : null,
    };
  });

  return { profile, posts, raw };
}

// One HTTP request with a single 2s retry (CLAUDE.md caps retries at exactly this).
// Every attempt is budget-checked and recorded — each consumes real RapidAPI quota.
async function fetchRaw(handle) {
  const url = `${config.rapidapi.baseUrl}${config.rapidapi.profilePath}?username=${encodeURIComponent(handle)}`;
  const headers = {
    "x-rapidapi-host": config.rapidapi.host,
    "x-rapidapi-key": config.rapidapi.key,
  };

  const maxAttempts = 2; // initial + one retry
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!(await canCall("rapidapi"))) {
      throw new Error(
        `RapidAPI monthly budget (${config.apiBudgetMonthly}) exhausted — refusing to call for @${handle}.`
      );
    }
    let status = null;
    try {
      const res = await fetch(url, { method: "GET", headers });
      status = res.status;
      const text = await res.text();
      await recordCall({ provider: "rapidapi", endpoint: config.rapidapi.profilePath, handle, status });

      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
      }
      // looter2 signals success with status:true; a false/absent status or a missing
      // username means the lookup failed (private/removed/rate-limited).
      if (json.status === false || !json.username) {
        throw new Error(`Provider returned no profile for @${handle}: ${text.slice(0, 200)}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      // Record network-level failures too (status never set), so quota use is visible.
      if (status === null) {
        await recordCall({ provider: "rapidapi", endpoint: config.rapidapi.profilePath, handle, status: 0 });
      }
      if (attempt < maxAttempts) {
        logger.warn(`fetch @${handle} attempt ${attempt} failed: ${e.message} — retrying in 2s`);
        await sleep(2000);
      }
    }
  }
  throw lastErr;
}

// Public entry point: fetch + normalize. Returns { profile, posts, raw }.
export async function fetchAccount(handle) {
  requireRapidApi();
  const raw = await fetchRaw(handle);
  return normalize(handle, raw);
}

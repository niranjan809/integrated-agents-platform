// Deterministic signal computation. Reads posts + profile fields from Turso, computes
// signals, writes them back to the accounts row. Idempotent — safe to re-run (it just
// overwrites the same columns and signals_computed_at). Async (backed by Turso).
//
// SAMPLE SIZE NOTE: the instagram-looter2 single-call payload returns only the 12
// most-recent posts (CLAUDE.md targeted 20). Engagement-rate and duplicate math still
// work, just noisier at N=12. Cadence is computed span-based (see posts_per_week_last_8w
// below) rather than over a fixed 56-day window, precisely so the 12-post payload does
// not artificially cap it.
import { get, all, run, nowIso } from "./db.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_90D_MS = 90 * DAY_MS;
const CAPTION_SAMPLE = 20; // consider up to the last 20 captions for duplicate check

// Normalize a caption for exact-match duplicate detection: lowercase, strip URLs,
// strip emoji (+ ZWJ / variation selectors / keycaps), collapse whitespace. Simple,
// not fuzzy — two captions are "duplicate" only if these normalized forms are equal.
function normCaption(c) {
  if (!c) return "";
  return c
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/www\.\S+/g, "")
    .replace(/[\p{Extended_Pictographic}‍️⃣]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mean(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

// Platform-aware engagement rate (pure — unit-testable).
//   instagram: (avg_likes + avg_comments) / follower_count           (0 if no followers)
//   tiktok:    (avg_likes + avg_comments + avg_shares) / avg_views    (views-based),
//              falling back to / max(follower_count, 1) when no views are present.
export function engagementRate(platform, { avg_likes = 0, avg_comments = 0, avg_shares = 0, avg_views = 0, follower_count = 0 }) {
  if (platform === "tiktok") {
    if (avg_views > 0) return (avg_likes + avg_comments + avg_shares) / Math.max(avg_views, 1);
    return (avg_likes + avg_comments) / Math.max(follower_count, 1);
  }
  // instagram (and default): unchanged from prior behavior
  return follower_count > 0 ? (avg_likes + avg_comments) / follower_count : 0;
}

export async function computeSignals(handle, platform = "instagram") {
  const account = await get(
    "SELECT follower_count, following_count, post_count FROM accounts WHERE platform = @platform AND handle = @handle",
    { platform, handle }
  );
  if (!account) throw new Error(`computeSignals: no account row for @${handle} on ${platform} (seed first).`);

  const posts = await all(
    "SELECT caption, likes, comments, views, shares, posted_at FROM posts WHERE platform = @platform AND handle = @handle ORDER BY posted_at DESC",
    { platform, handle }
  );
  const now = Date.now();

  const avg_likes = mean(posts.map((p) => p.likes || 0));
  const avg_comments = mean(posts.map((p) => p.comments || 0));
  const avg_views = mean(posts.map((p) => p.views ?? 0));
  const avg_shares = mean(posts.map((p) => p.shares ?? 0));

  const follower_count = account.follower_count || 0;
  const following_count = account.following_count || 0;

  const engagement_rate = engagementRate(platform, { avg_likes, avg_comments, avg_views, avg_shares, follower_count });
  const follower_following_ratio = follower_count / Math.max(following_count, 1);

  // Timestamps of posts that have a valid posted_at.
  const times = posts
    .map((p) => (p.posted_at ? new Date(p.posted_at).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));

  const days_since_last_post = times.length
    ? Math.floor((now - Math.max(...times)) / DAY_MS)
    : null;
  const posts_last_90d = times.filter((t) => now - t <= WINDOW_90D_MS).length;

  // Cadence in posts/week, computed from the time span of the recent N posts
  // returned by the provider (N≈12 for instagram-looter2). Better proxy for
  // current cadence than a fixed 56-day window given the 12-post payload.
  // Null when fewer than 3 posts (insufficient data) — cadence-based rules then
  // simply don't fire; such accounts are caught by R1_ONE_POST_WONDER anyway.
  let posts_per_week_last_8w;
  if (times.length < 3) {
    posts_per_week_last_8w = null;
  } else {
    const asc = [...times].sort((a, b) => a - b);
    const span_days = (asc[asc.length - 1] - asc[0]) / DAY_MS;
    posts_per_week_last_8w = span_days === 0 ? times.length * 7 : (times.length / span_days) * 7;
  }

  // Duplicate caption fraction over the last CAPTION_SAMPLE posts.
  const captions = posts.slice(0, CAPTION_SAMPLE).map((p) => normCaption(p.caption));
  const freq = {};
  for (const c of captions) if (c) freq[c] = (freq[c] || 0) + 1;
  const dupCount = captions.filter((c) => c && freq[c] > 1).length;
  const duplicate_caption_fraction = captions.length ? dupCount / captions.length : 0;

  const signals = {
    engagement_rate,
    follower_following_ratio,
    days_since_last_post,
    posts_last_90d,
    posts_per_week_last_8w,
    duplicate_caption_fraction,
    avg_likes,
    avg_comments,
  };

  await run(
    `UPDATE accounts SET
       engagement_rate = @engagement_rate,
       follower_following_ratio = @follower_following_ratio,
       days_since_last_post = @days_since_last_post,
       posts_last_90d = @posts_last_90d,
       posts_per_week_last_8w = @posts_per_week_last_8w,
       duplicate_caption_fraction = @duplicate_caption_fraction,
       avg_likes = @avg_likes,
       avg_comments = @avg_comments,
       signals_computed_at = @signals_computed_at
     WHERE platform = @platform AND handle = @handle`,
    { platform, handle, ...signals, signals_computed_at: nowIso() }
  );

  return signals;
}

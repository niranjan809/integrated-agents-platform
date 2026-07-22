// Adapter for tiktok-scraper7 — profile + posts. Mirrors the Instagram adapter's
// { profile, posts, raw } shape. Two sequential budget-gated calls: /user/info then
// /user/posts (posts embed only a minimal author, so profile needs /user/info).
//
// Success contract (Phase A recon): HTTP 200 with body.code === 0. Enforced in
// tiktokRequest(). Single 2s retry there; throws on terminal failure (no partial data).
import { requireTikTok } from "../config.js";
import { tiktokRequest, extractEmail, extractHashtags } from "./_shared.js";

// Raw /user/info + /user/posts -> normalized shape. Exported for offline unit checks.
export function normalize(unique_id, userInfoRaw, userPostsRaw) {
  const u = userInfoRaw?.data?.user ?? {};
  const stats = userInfoRaw?.data?.stats ?? {};
  const bio = u.signature ?? null;

  const profile = {
    platform: "tiktok",
    handle: u.uniqueId || unique_id,
    display_name: u.nickname ?? null,
    bio,
    follower_count: stats.followerCount ?? 0,
    following_count: stats.followingCount ?? 0,
    post_count: stats.videoCount ?? 0,
    is_verified: !!u.verified,
    is_business_account: null, // TikTok has no direct equivalent
    external_url: u.bioLink?.link ?? null,
    bio_email: extractEmail(bio),
    sec_uid: u.secUid ?? null,
    external_id: u.id != null ? String(u.id) : null, // numeric id — needed for snowball
  };

  const videos = userPostsRaw?.data?.videos ?? [];
  const posts = videos.map((v) => {
    const caption = v.title ?? v.content_desc ?? "";
    return {
      post_id: String(v.aweme_id ?? v.video_id),
      caption,
      hashtags: extractHashtags(caption), // no dedicated field — parsed from title
      likes: v.digg_count ?? 0,
      comments: v.comment_count ?? 0,
      views: v.play_count ?? 0,
      shares: v.share_count ?? 0,
      posted_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
      media_type: "video",
    };
  });

  return { profile, posts, raw: { user_info: userInfoRaw, user_posts: userPostsRaw } };
}

// Public entry: fetch profile + posts for a unique_id (handle).
export async function fetchAccount(unique_id) {
  requireTikTok();
  const userInfo = await tiktokRequest("/user/info", { unique_id }, unique_id);
  const userPosts = await tiktokRequest("/user/posts", { unique_id, count: 20, cursor: 0 }, unique_id);
  return normalize(unique_id, userInfo, userPosts);
}

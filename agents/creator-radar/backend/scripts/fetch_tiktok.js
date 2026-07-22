// Fetches profile + posts for platform='tiktok' accounts via the TikTok adapter and
// writes them to Turso. Mirrors fetch.js, but each account costs TWO tiktok_rapidapi
// calls (/user/info + /user/posts). Stores sec_uid + external_id (snowball) and
// views/shares on posts.
//
// Idempotency: like fetch.js, skips accounts that already have posts (there is no
// posts_fetched_at column; posts-existence is the established "already fetched" signal).
//
// Usage:
//   node scripts/fetch_tiktok.js                 # all tiktok accounts missing posts
//   node scripts/fetch_tiktok.js garyvee         # only this handle
//   node scripts/fetch_tiktok.js garyvee --force # refetch even if posts exist
import { all, get, batch, nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";
import { fetchAccount } from "../src/providers/rapidapi_tiktok.js";
import { canCall, printStatus } from "../src/budget.js";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const handleArgs = argv.filter((a) => !a.startsWith("--"));
const PLATFORM = "tiktok";

async function selectHandles() {
  if (handleArgs.length) return handleArgs;
  return (await all("SELECT handle FROM accounts WHERE platform = @p ORDER BY handle", { p: PLATFORM })).map((r) => r.handle);
}

async function countPosts(handle) {
  return (await get("SELECT COUNT(*) AS n FROM posts WHERE platform = @p AND handle = @handle", { p: PLATFORM, handle })).n;
}

// Persist one TikTok adapter result atomically (profile + posts) in a single batch.
async function persist(handle, profile, posts, raw) {
  const rawVideos = raw?.user_posts?.data?.videos ?? [];
  const statements = [
    {
      sql: "INSERT OR IGNORE INTO accounts (handle, platform, first_seen_at) VALUES (@handle, 'tiktok', @first_seen_at)",
      args: { handle, first_seen_at: nowIso() },
    },
    {
      sql: `UPDATE accounts SET
              display_name = @display_name,
              bio = @bio,
              is_verified = @is_verified,
              is_business_account = @is_business_account,
              follower_count = @follower_count,
              following_count = @following_count,
              post_count = @post_count,
              external_url = @external_url,
              bio_email = @bio_email,
              sec_uid = @sec_uid,
              external_id = @external_id,
              raw_profile_json = @raw_profile_json,
              last_refreshed_at = @last_refreshed_at
            WHERE platform = 'tiktok' AND handle = @handle`,
      args: {
        handle,
        display_name: profile.display_name,
        bio: profile.bio,
        is_verified: profile.is_verified ? 1 : 0,
        is_business_account: profile.is_business_account == null ? null : profile.is_business_account ? 1 : 0,
        follower_count: profile.follower_count,
        following_count: profile.following_count,
        post_count: profile.post_count,
        external_url: profile.external_url,
        bio_email: profile.bio_email,
        sec_uid: profile.sec_uid,
        external_id: profile.external_id,
        raw_profile_json: JSON.stringify(raw),
        last_refreshed_at: nowIso(),
      },
    },
    { sql: "DELETE FROM posts WHERE platform = 'tiktok' AND handle = @handle", args: { handle } },
    ...posts.map((p, i) => ({
      sql: `INSERT OR REPLACE INTO posts
              (post_id, handle, platform, caption, media_type, hashtags_json, likes, comments, views, shares, posted_at, raw_json)
            VALUES
              (@post_id, @handle, 'tiktok', @caption, @media_type, @hashtags_json, @likes, @comments, @views, @shares, @posted_at, @raw_json)`,
      args: {
        post_id: p.post_id,
        handle,
        caption: p.caption,
        media_type: p.media_type,
        hashtags_json: JSON.stringify(p.hashtags ?? []),
        likes: p.likes,
        comments: p.comments,
        views: p.views,
        shares: p.shares,
        posted_at: p.posted_at,
        raw_json: JSON.stringify(rawVideos[i] ?? null),
      },
    })),
  ];
  await batch(statements);
}

async function main() {
  const handles = await selectHandles();
  logger.info(`fetch:tiktok: ${handles.length} handle(s) in scope${force ? " (--force)" : ""}.`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;
  let stopped = false;

  for (const handle of handles) {
    if (!force && (await countPosts(handle)) > 0) {
      logger.info(`skip @${handle} (already has posts)`);
      skipped++;
      continue;
    }
    // 2 calls per account; ensure headroom before starting one.
    if (!(await canCall("tiktok_rapidapi"))) {
      logger.warn("tiktok_rapidapi budget cap reached — stopping cleanly.");
      stopped = true;
      break;
    }
    try {
      const { profile, posts, raw } = await fetchAccount(handle);
      await persist(handle, profile, posts, raw);
      logger.info(`fetched @${handle}: ${profile.follower_count} followers, ${posts.length} posts, external_id=${profile.external_id}`);
      fetched++;
    } catch (e) {
      logger.error(`failed @${handle}: ${e.message}`);
      failed++;
    }
  }

  logger.info(`fetch:tiktok done. fetched=${fetched} skipped=${skipped} failed=${failed}${stopped ? " (stopped at budget cap)" : ""}`);
  await printStatus();
}

await main();

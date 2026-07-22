// Fetches profile + posts for seeded accounts via the RapidAPI adapter and writes
// them to Turso. One budget-gated call per account (the provider returns profile +
// 12 posts in a single /profile response).
//
// Idempotent: skips accounts that already have posts in the DB. Re-run freely.
//
// Usage:
//   node scripts/fetch.js                 # all seeded accounts missing posts
//   node scripts/fetch.js dailyaionly     # only this handle (still skips if it has posts)
//   node scripts/fetch.js dailyaionly --force   # refetch even if posts exist
import { all, get, batch, nowIso } from "../src/db.js";
import { logger } from "../src/logger.js";
import { fetchAccount } from "../src/providers/rapidapi_instagram.js";
import { printStatus } from "../src/budget.js";

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const handleArgs = argv.filter((a) => !a.startsWith("--"));

// This is the Instagram fetch path — all reads/writes scoped to platform='instagram'.
// (Phase C adds scripts/fetch_tiktok.js for platform='tiktok'.)
async function selectHandles() {
  if (handleArgs.length) return handleArgs;
  return (await all("SELECT handle FROM accounts WHERE platform='instagram' ORDER BY handle")).map((r) => r.handle);
}

async function countPosts(handle) {
  return (await get("SELECT COUNT(*) AS n FROM posts WHERE platform='instagram' AND handle = @handle", { handle })).n;
}

// Persist one adapter result atomically: ensure account row, update profile, replace
// posts. All statements run in a single write transaction via batch().
async function persist(handle, profile, posts, raw) {
  const rawEdges = raw?.edge_owner_to_timeline_media?.edges ?? [];
  const statements = [
    {
      sql: "INSERT OR IGNORE INTO accounts (handle, platform, first_seen_at) VALUES (@handle, 'instagram', @first_seen_at)",
      args: { handle, first_seen_at: nowIso() },
    },
    {
      sql: `UPDATE accounts SET
              display_name = @display_name,
              bio = @bio,
              profile_pic_url = @profile_pic_url,
              is_verified = @is_verified,
              is_business_account = @is_business_account,
              follower_count = @follower_count,
              following_count = @following_count,
              post_count = @post_count,
              external_url = @external_url,
              bio_email = @bio_email,
              raw_profile_json = @raw_profile_json,
              last_refreshed_at = @last_refreshed_at
            WHERE platform = 'instagram' AND handle = @handle`,
      args: {
        handle,
        display_name: profile.display_name,
        bio: profile.bio,
        profile_pic_url: profile.profile_pic_url,
        is_verified: profile.is_verified ? 1 : 0,
        is_business_account: profile.is_business_account ? 1 : 0,
        follower_count: profile.follower_count,
        following_count: profile.following_count,
        post_count: profile.post_count,
        external_url: profile.external_url,
        bio_email: profile.bio_email,
        raw_profile_json: JSON.stringify(raw),
        last_refreshed_at: nowIso(),
      },
    },
    { sql: "DELETE FROM posts WHERE platform = 'instagram' AND handle = @handle", args: { handle } },
    ...posts.map((p, i) => ({
      sql: `INSERT OR REPLACE INTO posts
              (post_id, handle, platform, caption, media_type, hashtags_json, likes, comments, posted_at, raw_json)
            VALUES
              (@post_id, @handle, 'instagram', @caption, @media_type, @hashtags_json, @likes, @comments, @posted_at, @raw_json)`,
      args: {
        post_id: p.post_id,
        handle,
        caption: p.caption,
        media_type: p.media_type,
        hashtags_json: JSON.stringify(p.hashtags ?? []),
        likes: p.likes,
        comments: p.comments,
        posted_at: p.posted_at,
        raw_json: JSON.stringify(rawEdges[i]?.node ?? null),
      },
    })),
  ];
  await batch(statements);
}

async function main() {
  const handles = await selectHandles();
  logger.info(`fetch: ${handles.length} handle(s) in scope${force ? " (--force)" : ""}.`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const handle of handles) {
    if (!force && (await countPosts(handle)) > 0) {
      logger.info(`skip @${handle} (already has posts)`);
      skipped++;
      continue;
    }
    try {
      const { profile, posts, raw } = await fetchAccount(handle);
      await persist(handle, profile, posts, raw);
      logger.info(`fetched @${handle}: ${profile.follower_count} followers, ${posts.length} posts`);
      fetched++;
    } catch (e) {
      logger.error(`failed @${handle}: ${e.message}`);
      failed++;
    }
  }

  logger.info(`fetch done. fetched=${fetched} skipped=${skipped} failed=${failed}`);
  await printStatus();
}

await main();

// Shared candidate promotion: fetch one accepted candidate's /profile, apply the 0-post
// guard, and (if it has posts) promote it into the accounts table tagged with its
// discovered_via. Updates the candidate_accounts status row either way.
//
// Extracted from scripts/fetch_candidates.js so the selective-fetch step can be reused by
// both the standalone fetch script AND scripts/discover_hashtag.js --from-list. Behavior
// is identical to the original inline logic.
//
// Budget: fetchAccount() self-guards (canCall) and records every RapidAPI call. Callers
// should still check canCall("rapidapi") before invoking, to stop cleanly at the cap.
import { run, batch, nowIso } from "../db.js";
import { fetchAccount } from "../providers/rapidapi_instagram.js";

// Mirror of fetch.js persist, plus stamping accounts.discovered_via. One atomic batch.
export async function persist(handle, discovered_via, profile, posts, raw) {
  const rawEdges = raw?.edge_owner_to_timeline_media?.edges ?? [];
  const stmts = [
    {
      sql: "INSERT OR IGNORE INTO accounts (handle, platform, first_seen_at) VALUES (@handle, 'instagram', @t)",
      args: { handle, t: nowIso() },
    },
    {
      sql: `UPDATE accounts SET
              display_name=@display_name, bio=@bio, profile_pic_url=@profile_pic_url,
              is_verified=@is_verified, is_business_account=@is_business_account,
              follower_count=@follower_count, following_count=@following_count, post_count=@post_count,
              external_url=@external_url, bio_email=@bio_email, raw_profile_json=@raw_profile_json,
              discovered_via=@discovered_via, last_refreshed_at=@last_refreshed_at
            WHERE platform='instagram' AND handle=@handle`,
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
        discovered_via,
        last_refreshed_at: nowIso(),
      },
    },
    { sql: "DELETE FROM posts WHERE platform='instagram' AND handle=@handle", args: { handle } },
    ...posts.map((p, i) => ({
      sql: `INSERT OR REPLACE INTO posts
              (post_id, handle, platform, caption, media_type, hashtags_json, likes, comments, posted_at, raw_json)
            VALUES (@post_id, @handle, 'instagram', @caption, @media_type, @hashtags_json, @likes, @comments, @posted_at, @raw_json)`,
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
  await batch(stmts);
}

// Fetch + promote a single candidate row { id, handle, discovered_via }.
// Returns { status, profile, posts } where status is one of:
//   "fetched"       — had posts, promoted into accounts
//   "fetched_empty" — 0 posts, NOT promoted (candidate row marked fetched_empty)
//   "failed"        — fetch threw (candidate row marked failed); error on result.error
// The RapidAPI call is spent in all non-failed cases (and possibly on failure too).
export async function fetchAndPromote(candidate) {
  const now = nowIso();
  try {
    const { profile, posts, raw } = await fetchAccount(candidate.handle);

    // 0-post guard: an account with no posts can't be classified (classify skips it),
    // so don't promote it. Record that we saw it as 'fetched_empty'.
    if (posts.length === 0) {
      await run(
        `UPDATE candidate_accounts
         SET fetch_status='fetched_empty', fetched_at=@t, promoted_to_accounts=0
         WHERE id=@id`,
        { t: now, id: candidate.id }
      );
      return { status: "fetched_empty", profile, posts };
    }

    await persist(candidate.handle, candidate.discovered_via, profile, posts, raw);
    await run(
      `UPDATE candidate_accounts
       SET fetch_status='fetched', fetched_at=@t, promoted_to_accounts=1, promoted_at=@t
       WHERE id=@id`,
      { t: now, id: candidate.id }
    );
    return { status: "fetched", profile, posts };
  } catch (e) {
    await run("UPDATE candidate_accounts SET fetch_status='failed', fetched_at=@t WHERE id=@id", {
      t: now,
      id: candidate.id,
    });
    return { status: "failed", error: e };
  }
}

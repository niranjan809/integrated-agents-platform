// v0.13 shared account-remove core, used by BOTH scripts/account_remove.js (CLI, which
// keeps its own interactive confirmation prompt) and the DELETE /api/accounts/:handle
// endpoint (the dashboard confirm modal is the confirmation there). Captures a full
// before_state snapshot, cascade-deletes children first, preserves api_calls, and audits.
import { get, run } from "../db.js";
import { logAction } from "../curator_audit.js";

function err(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Captures the account's full state (accounts row + child counts + gate) WITHOUT deleting.
// Used by the CLI to show the confirmation prompt and by the API to populate the modal.
// Returns null if the account doesn't exist.
export async function captureState(handle, platform) {
  const account = await get("SELECT * FROM accounts WHERE platform=@platform AND handle=@handle", { platform, handle });
  if (!account) return null;
  const posts_count = (await get("SELECT COUNT(*) AS n FROM posts WHERE platform=@platform AND handle=@handle", { platform, handle })).n;
  const classifications_count = (await get("SELECT COUNT(*) AS n FROM classifications WHERE platform=@platform AND handle=@handle", { platform, handle })).n;
  const candidate_accounts_count = (await get("SELECT COUNT(*) AS n FROM candidate_accounts WHERE platform=@platform AND handle=@handle", { platform, handle })).n;
  return { account, posts_count, classifications_count, candidate_accounts_count, ai_relevance_gate: account.ai_relevance_gate };
}

// Cascade-delete one account (children first). api_calls is intentionally preserved.
// Returns { removed, before_state, audit_id, deleted:{classifications,posts,candidate_accounts,accounts} }.
export async function removeAccount({ handle, platform, reason, actor = "anooj" }) {
  if (!handle || !platform || !reason) throw err("handle, platform, reason are required", "invalid_args");
  if (!["instagram", "tiktok"].includes(platform)) throw err(`invalid platform: ${platform}`, "invalid_platform");

  const before_state = await captureState(handle, platform);
  if (!before_state) throw err(`@${handle} [${platform}] not found`, "not_found");

  const delClass = (await run("DELETE FROM classifications WHERE platform=@platform AND handle=@handle", { platform, handle })).rowsAffected;
  const delPosts = (await run("DELETE FROM posts WHERE platform=@platform AND handle=@handle", { platform, handle })).rowsAffected;
  const delCand = (await run("DELETE FROM candidate_accounts WHERE platform=@platform AND handle=@handle", { platform, handle })).rowsAffected;
  const delAcct = (await run("DELETE FROM accounts WHERE platform=@platform AND handle=@handle", { platform, handle })).rowsAffected;

  const audit_id = await logAction({
    action: "account_remove", target_type: "account", target_id: handle, platform,
    before_state, after_state: null, reason, actor,
  });

  return {
    removed: true,
    before_state,
    audit_id,
    deleted: { classifications: delClass, posts: delPosts, candidate_accounts: delCand, accounts: delAcct },
  };
}

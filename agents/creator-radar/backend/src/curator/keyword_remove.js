// v0.13 shared keyword-remove core, used by BOTH scripts/keyword_remove.js (CLI) and the
// DELETE /api/keywords/:hashtag endpoint. SOFT removal: pulls the hashtag from its active
// tier and appends a record to removed_from_rotation (never hard-deletes). Audits.
//
// Throws typed errors (err.code): 'invalid_args', 'invalid_reason', 'not_found'.
// (The min-10-char reason rule is enforced at the endpoint layer; the core only requires
// a non-empty reason, matching the pre-existing CLI behavior.)
import { nowIso } from "../db.js";
import { logAction } from "../curator_audit.js";
import * as seed from "../seed_hashtags.js";

function err(message, code) {
  const e = new Error(message);
  e.code = code;
  return e;
}

export async function removeKeyword({ hashtag, reason, actor = "anooj" }) {
  const h = (hashtag || "").replace(/^#/, "").trim().toLowerCase();
  if (!h) throw err("hashtag is required", "invalid_args");
  if (!reason) throw err("reason is required", "invalid_reason");

  const doc = seed.load();
  const tier = seed.activeHashtagIndex(doc).get(h);
  if (!tier) throw err(`hashtag "${h}" not found in any active tier`, "not_found");

  const arr = seed.getTierArray(doc, tier);
  const pos = arr.findIndex((e) => e.hashtag && e.hashtag.toLowerCase() === h);
  const [entry] = arr.splice(pos, 1);

  const removed_at = nowIso();
  if (!doc.removed_from_rotation) {
    doc.removed_from_rotation = { removed_at, reason: "Soft-removed via keyword:remove (see per-entry reasons).", hashtags: [] };
  }
  if (!Array.isArray(doc.removed_from_rotation.hashtags)) doc.removed_from_rotation.hashtags = [];
  doc.removed_from_rotation.hashtags.push({ hashtag: h, from_tier: tier, reason, removed_at });

  seed.save(doc);

  const audit_id = await logAction({
    action: "keyword_remove", target_type: "keyword", target_id: h,
    before_state: { tier, entry }, after_state: null, reason, actor,
  });

  return { removed: true, from_tier: tier, entry, audit_id };
}

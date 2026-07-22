// v0.13 shared keyword-add core, used by BOTH scripts/keyword_add.js (CLI) and the
// POST /api/keywords endpoint. Validates against active tiers / skip_list /
// removed_from_rotation, adds the entry, and audits. Restoring a soft-removed hashtag
// requires force=true (explicit override of a prior removal decision).
//
// Throws typed errors (err.code): 'invalid_args', 'invalid_tier', 'duplicate' (err.extra.tier),
// 'in_skip_list', 'already_removed' (err.extra = {removed_at, reason}).
import { logAction } from "../curator_audit.js";
import * as seed from "../seed_hashtags.js";

export const KNOWN_TIERS = ["T1", "T2", "T3", "T2_discovered", "T_voice"];

function err(message, code, extra) {
  const e = new Error(message);
  e.code = code;
  if (extra) e.extra = extra;
  return e;
}

// Ensure a tier's array exists (for known tiers that might be absent, or new tiers via create).
function ensureTierArray(doc, tier) {
  let arr = seed.getTierArray(doc, tier);
  if (arr) return arr;
  if (["T1", "T2", "T3"].includes(tier)) {
    doc.tiers ||= {};
    doc.tiers[tier] = [];
  } else {
    doc[tier] = [];
  }
  return seed.getTierArray(doc, tier);
}

export async function addKeyword({ hashtag, tier, subCluster = "", notes = "", force = false, create = false, actor = "anooj" }) {
  const h = (hashtag || "").replace(/^#/, "").trim().toLowerCase();
  if (!h) throw err("hashtag is required", "invalid_args");
  if (!tier) throw err("tier is required", "invalid_args");
  if (!create && !KNOWN_TIERS.includes(tier)) throw err(`invalid tier: ${tier}`, "invalid_tier", { allowed: KNOWN_TIERS });

  const doc = seed.load();

  const idx = seed.activeHashtagIndex(doc);
  if (idx.has(h)) throw err(`already in ${idx.get(h)}`, "duplicate", { tier: idx.get(h) });

  const skip = new Set((doc.skip_list || []).map((s) => s.hashtag.toLowerCase()));
  if (skip.has(h)) throw err("hashtag is in skip_list", "in_skip_list");

  let restored = false;
  if (seed.removedHashtagSet(doc).has(h)) {
    if (!force) {
      const entry = seed.removedList(doc).find((e) => seed.removedHashtagOf(e) === h);
      const removed_at = (typeof entry === "object" && entry.removed_at) || doc.removed_from_rotation?.removed_at || "unknown";
      const reason = (typeof entry === "object" && entry.reason) || doc.removed_from_rotation?.reason || "unknown";
      throw err("hashtag is in removed_from_rotation", "already_removed", { removed_at, reason });
    }
    doc.removed_from_rotation.hashtags = seed.removedList(doc).filter((e) => seed.removedHashtagOf(e) !== h);
    restored = true;
  }

  const entry = { hashtag: h, sub_cluster: subCluster || "", notes: notes || "" };
  ensureTierArray(doc, tier).push(entry);
  seed.save(doc);

  const audit_id = await logAction({
    action: "keyword_add", target_type: "keyword", target_id: h,
    after_state: { tier, sub_cluster: entry.sub_cluster, notes: entry.notes, restored_from_removed: restored },
    reason: restored ? "restore-from-removed (force)" : null,
    actor,
  });

  return { hashtag: h, tier, entry, restored, audit_id };
}

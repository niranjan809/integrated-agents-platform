// v0.12 shared helpers for reading/writing seed_hashtags.json — used by the keyword:add /
// keyword:remove curator scripts so tier lookup and removed_from_rotation handling stay
// consistent between them.
//
// Tier shapes in seed_hashtags.json:
//   - Curator tiers:      doc.tiers.{T1,T2,T3}      → array of {hashtag, sub_cluster, notes}
//   - Discovered section: doc.T2_discovered          → bare array of {hashtag, ...}
//   - Voice section:      doc.T_voice                → object { ..., hashtags: [ {hashtag,...} ] }
//
// removed_from_rotation.hashtags is a MIXED list: legacy plain strings (v0.11 batch:
// "rag","mcp","aiops") AND newer per-entry objects {hashtag, from_tier, reason, removed_at}.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const SEED_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "seed_hashtags.json");

// Top-level keys that are NOT active tiers, even though some (skip_list, removed_from_rotation)
// structurally look like a tier to getTierArray. Active-tier lookups must skip these.
const RESERVED_KEYS = new Set(["version", "generated_at", "source", "tiers", "removed_from_rotation", "skip_list"]);

export function load() {
  return JSON.parse(readFileSync(SEED_PATH, "utf8"));
}
export function save(doc) {
  writeFileSync(SEED_PATH, JSON.stringify(doc, null, 2) + "\n");
}

// Returns the mutable array of entries for a tier, or null if the tier doesn't exist.
// Handles all three shapes above.
export function getTierArray(doc, tier) {
  if (doc.tiers && Array.isArray(doc.tiers[tier])) return doc.tiers[tier];
  const top = doc[tier];
  if (Array.isArray(top)) return top;
  if (top && Array.isArray(top.hashtags)) return top.hashtags;
  return null;
}

// True if `tier` names an existing active tier/section (excludes reserved keys like
// removed_from_rotation / skip_list, which getTierArray would otherwise match structurally).
export function tierExists(doc, tier) {
  if (RESERVED_KEYS.has(tier)) return false;
  return getTierArray(doc, tier) !== null;
}

// Map of hashtag(lowercased) -> tier name, across every ACTIVE tier/section only.
// Reserved keys (removed_from_rotation, skip_list) are intentionally excluded so a
// soft-removed or skip-listed hashtag does NOT read as "present in an active tier".
export function activeHashtagIndex(doc) {
  const idx = new Map();
  const push = (tier, arr) => {
    for (const e of arr) if (e && e.hashtag) idx.set(e.hashtag.toLowerCase(), tier);
  };
  for (const t of ["T1", "T2", "T3"]) {
    const a = doc.tiers?.[t];
    if (Array.isArray(a)) push(t, a);
  }
  for (const k of Object.keys(doc)) {
    if (RESERVED_KEYS.has(k)) continue;
    const arr = getTierArray(doc, k);
    if (arr) push(k, arr);
  }
  return idx;
}

// Normalize a removed_from_rotation entry (string or object) to its hashtag string.
export function removedHashtagOf(entry) {
  return (typeof entry === "string" ? entry : entry?.hashtag || "").toLowerCase();
}

// The removed_from_rotation.hashtags list (mixed strings/objects), or [] if absent.
export function removedList(doc) {
  return doc.removed_from_rotation?.hashtags || [];
}

// Set of removed hashtags (lowercased), normalized across mixed entry shapes.
export function removedHashtagSet(doc) {
  return new Set(removedList(doc).map(removedHashtagOf).filter(Boolean));
}

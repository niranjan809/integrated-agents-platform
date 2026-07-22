// Rule-based genuineness classifier. Top-down, first match wins. No LLM — every
// signal here is quantitative and deterministic (that's the deliberate MVP thesis).
//
// classify(features) is pure: it reads a plain object and returns {label, rule_matched}.
// classify.js is responsible for assembling `features` (profile + computed signals)
// and for snapshotting them onto the classification row.

// Thresholds — tune here, then re-run `classify --force` (free, no API calls).
export const THRESHOLDS = {
  MIN_POST_COUNT: 10, // R1: total posts on profile below this = one-post-wonder
  MIN_POSTS_90D: 3, // R3
  DEAD_ER: 0.001, // R4
  BOTLIKE_ER: 0.3, // R5
  LARGE_FOLLOWERS: 50000, // R6 (paired with LARGE_LOW_ER)
  LARGE_LOW_ER: 0.005, // R6
  PURCHASED_FOLLOWERS: 10000, // R7 (paired with PURCHASED_RATIO)
  PURCHASED_RATIO: 5000, // R7 — large creators routinely sit at 500–2000 (follow-few,
  // be-followed-by-many); 5000 catches only extreme cases (e.g. dailyaionly ~12.5k).
  TEMPLATE_DUP_FRAC: 0.5, // R8 (paired with TEMPLATE_ENGAGEMENT_MAX)
  // Accounts with >3% engagement are real creators regardless of templated CTAs —
  // R8 catches template farms, not stylistic repetition.
  TEMPLATE_ENGAGEMENT_MAX: 0.03, // R8 engagement guard
};

// R2 dormancy is platform-keyed (v0.7, Phase F): TikTok's posting-cadence norm is
// tighter than Instagram's, so a 90d silence reads as dormant sooner there. Rule ID
// stays "R2_DORMANT" — only the threshold varies. Same pattern is the template for any
// future platform-specific threshold (e.g. R7 follower cap). Falls back to 90 if a
// platform key is missing.
export const R2_DORMANT_DAYS = {
  instagram: 90,
  tiktok: 60,
};
const R2_DORMANT_DAYS_DEFAULT = 90;

const LOW = "Low-effort";
const UNCERTAIN = "Uncertain";
const GENUINE = "Genuine";

// features expects: post_count, days_since_last_post, posts_last_90d, engagement_rate,
// follower_count, follower_following_ratio, duplicate_caption_fraction.
export function classify(f) {
  const T = THRESHOLDS;

  if ((f.post_count ?? 0) < T.MIN_POST_COUNT)
    return { label: LOW, rule_matched: "R1_ONE_POST_WONDER" };

  const dormantDays = R2_DORMANT_DAYS[f.platform] ?? R2_DORMANT_DAYS_DEFAULT;
  if (f.days_since_last_post != null && f.days_since_last_post > dormantDays)
    return { label: LOW, rule_matched: "R2_DORMANT" };

  if ((f.posts_last_90d ?? 0) < T.MIN_POSTS_90D)
    return { label: LOW, rule_matched: "R3_LOW_CADENCE" };

  if ((f.engagement_rate ?? 0) < T.DEAD_ER)
    return { label: LOW, rule_matched: "R4_DEAD_ENGAGEMENT" };

  if ((f.engagement_rate ?? 0) > T.BOTLIKE_ER)
    return { label: UNCERTAIN, rule_matched: "R5_BOTLIKE_ENGAGEMENT" };

  if ((f.follower_count ?? 0) > T.LARGE_FOLLOWERS && (f.engagement_rate ?? 0) < T.LARGE_LOW_ER)
    return { label: UNCERTAIN, rule_matched: "R6_LARGE_LOW_ER" };

  if (
    (f.follower_count ?? 0) > T.PURCHASED_FOLLOWERS &&
    (f.follower_following_ratio ?? 0) > T.PURCHASED_RATIO
  )
    return { label: UNCERTAIN, rule_matched: "R7_PURCHASED_LIKE" };

  if (
    (f.duplicate_caption_fraction ?? 0) > T.TEMPLATE_DUP_FRAC &&
    (f.engagement_rate ?? 0) < T.TEMPLATE_ENGAGEMENT_MAX
  )
    return { label: LOW, rule_matched: "R8_TEMPLATE_FARM" };

  return { label: GENUINE, rule_matched: "DEFAULT" };
}

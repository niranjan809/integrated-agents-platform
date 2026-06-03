/**
 * Promotion type classifier for X accounts.
 * Phase 1: Bio/profile keyword analysis (free, no API).
 * Phase 2: Tweet content analysis via AI (requires API call).
 *
 * promotion_type values:
 *   'explicit'  — confirmed paid promoter (bio or tweets prove it)
 *   'inferred'  — likely paid promoter (tweet patterns, lifestyle creator)
 *   'unknown'   — insufficient data
 */

// ── Phase 1: Bio-based explicit detection ────────────────────────────────────
// Strict patterns that CONFIRM paid work exists
const EXPLICIT_PATTERNS = [
  // Direct offer language
  /dm.*paid/i, /paid.*collab/i, /paid.*promo/i, /paid.*partner/i,
  /sponsor(ed|ship)/i, /media kit/i, /rate card/i, /rate sheet/i,
  /brand deal/i, /brand deals/i,
  // Business contact for paid work
  /collab@/i, /partnerships@/i, /pr@/i, /business@/i,
  // Creator economy explicit terms
  /ugc creator/i, /ugc$/i, /\bugc\b/i,
  /content creator for hire/i, /available for brand/i,
  /open to paid/i, /paid review/i,
  // Ad disclosure
  /#ad\b/i, /#sponsored/i, /#gifted/i,
];

// Lifestyle/creator bio patterns that STRONGLY suggest paid work
const INFERRED_STRONG = [
  /lifestyle (creator|blogger|influencer)/i,
  /content creator/i, /digital creator/i,
  /nano.?influencer/i, /micro.?influencer/i, /macro.?influencer/i,
  /brand ambassador/i, /affiliate/i,
  /youtuber/i, /vlogger/i, /tiktoker/i, /tiktok creator/i,
  /opinions (are |)my own/i, /views (are |)my own/i,
  /links? in bio/i,
];

// Lifestyle keywords (softer signals — need 2+ to qualify)
const INFERRED_SOFT = [
  'lifestyle', 'travel blogger', 'food blogger', 'fashion', 'beauty guru',
  'fitness', 'wellness', 'gaming', 'streamer', 'reviewer', 'unboxing',
  'entrepreneur', 'personal brand', 'growing my',
];

// Academic/technical — clearly NOT a paid promoter
const NOT_PAID_PATTERNS = [
  /\bphd\b/i, /\bdr\.\s/i, /professor/i, /researcher/i, /scientist/i,
  /research (engineer|scientist|lead)/i,
  /ml researcher/i, /ai researcher/i, /nlp researcher/i,
  /principal (engineer|scientist)/i,
  /faculty/i, /postdoc/i, /thesis/i,
];

/**
 * Classify from bio alone — returns result if confident, null if needs tweet check
 */
function classifyFromBio(bio, name, account_type) {
  const b = (bio || '').toLowerCase();
  const n = (name || '').toLowerCase();
  const text = b + ' ' + n;

  // PR/Brand pages are always "none" (ads only, not collab)
  if (account_type === 'PR Page' || account_type === 'Brand Page') {
    return null; // don't classify promotions for B-track types
  }

  // Check explicit patterns
  for (const pat of EXPLICIT_PATTERNS) {
    if (pat.test(text)) {
      const matched = text.match(pat)?.[0] || pat.toString().slice(1, 20);
      return {
        promotion_type: 'explicit',
        promotion_confidence: 92,
        promotion_signals: [`Explicit signal: "${matched}" in profile`],
        needs_tweet_check: false,
      };
    }
  }

  // Check strong inferred patterns
  for (const pat of INFERRED_STRONG) {
    if (pat.test(text)) {
      const matched = text.match(pat)?.[0] || '';
      return {
        promotion_type: 'inferred',
        promotion_confidence: 75,
        promotion_signals: [`Creator pattern: "${matched}" in bio`],
        needs_tweet_check: true, // still check tweets to upgrade to explicit if found
      };
    }
  }

  // Check soft inferred (need 2+)
  const softHits = INFERRED_SOFT.filter(k => b.includes(k));
  if (softHits.length >= 2) {
    return {
      promotion_type: 'inferred',
      promotion_confidence: 55,
      promotion_signals: softHits.slice(0, 3).map(k => `"${k}" lifestyle signal`),
      needs_tweet_check: true,
    };
  }

  // Check not-paid patterns (academic/technical)
  for (const pat of NOT_PAID_PATTERNS) {
    if (pat.test(b)) {
      return null; // don't show in Track A promotion filters — let tweet check decide
    }
  }

  // Short or empty bio — need tweet check
  if (b.length < 30) {
    return { promotion_type: 'unknown', promotion_confidence: 0, promotion_signals: [], needs_tweet_check: true };
  }

  // Default — needs tweet analysis
  return { promotion_type: 'unknown', promotion_confidence: 0, promotion_signals: [], needs_tweet_check: true };
}

/**
 * Build AI prompt for tweet analysis
 */
function buildTweetAnalysisPrompt(handle, bio, tweets) {
  const tweetText = tweets.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return `Analyse if @${handle} does PAID PROMOTIONS based on their tweets and bio.

Bio: "${bio || '(empty)'}"

Recent tweets:
${tweetText || '(no tweets available)'}

PAID PROMOTION SIGNALS TO LOOK FOR:
Explicit: #ad, #sponsored, #gifted, "use code [X]", "discount code", "I partnered with [Brand]",
  "Thank you [Brand] for sending", "collab with [Brand]", "ad |", "| ad", "sponsored by"
Inferred: Product reviews with brand names, "honest review of [product]", unboxing content,
  giveaway posts with brands, "link in bio" + brand mention, multiple DIFFERENT brand mentions,
  posts that look like paid reviews (detailed product features, CTA to buy)

Return ONLY JSON:
{"promotion_type":"explicit"|"inferred"|"none","confidence":0-100,"signals":["signal1","signal2"]}

- "explicit": tweet has clear paid disclosure (ad tag, sponsored, discount code)
- "inferred": tweet PATTERN looks paid but no explicit tag (review + brand + CTA)
- "none": tweets are purely educational/technical/personal, no brand promotion`;
}

module.exports = { classifyFromBio, buildTweetAnalysisPrompt, EXPLICIT_PATTERNS };

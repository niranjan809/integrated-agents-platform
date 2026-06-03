/**
 * Promotion type classifier for X accounts.
 *
 * The KEY question: is this account AVAILABLE for paid collabs with KiteAI?
 *
 * A1 (explicit) = bio clearly signals they are OPEN to NEW paid partnerships
 * A2 (inferred) = tweet patterns suggest they do paid work but haven't said so
 *
 * IMPORTANT DISTINCTION:
 * - "DM for collabs" / "open to brand deals" = A1 (available for US)
 * - "Brand Ambassador for X" = NOT A1 — they work exclusively for one brand
 * - "Official X Ambassador" = NOT A1 — single-brand exclusive
 * - Ambassador/Official roles = skip from paid classification
 */

// ── EXCLUSION LIST: These patterns mean single-brand exclusive or unavailable ──
// Check FIRST — if matched, skip from A1 classification
const EXCLUSIVE_PATTERNS = [
  /official.*ambassador/i,
  /ambassador.*of\b/i,
  /ambassador.*for\b/i,
  /brand ambassador for/i,
  /\bofficial\b.*\bpartner\b/i,
  /exclusive.*partner/i,
  /partner.*of.*(?:official|only)/i,
];

// ── A1: Bio signals they are OPEN to paid work with ANYONE (including KiteAI) ──
const EXPLICIT_PATTERNS = [
  // Direct offer / DM invitation
  /dm.*paid/i,
  /dm.*collab/i,
  /dm.*sponsor/i,
  /dm.*promotion/i,
  /dm.*promo/i,
  /dm.*deal/i,
  /paid.*collab/i,
  /paid.*promo/i,
  /paid.*partnership/i,
  /paid.*promotion/i,
  /open to collab/i,
  /open to paid/i,
  /open to sponsor/i,
  /open to brand/i,
  /available for collab/i,
  /available for brand/i,
  /available for sponsor/i,
  // Business tools for collabs
  /media kit/i,
  /rate card/i,
  /rate sheet/i,
  // Contact specifically for sponsorships (not brand ambassador)
  /collab@/i,
  /partnerships@/i,
  /sponsor@/i,
  // Explicit creator-for-hire
  /ugc creator/i,
  /\bugc\b.*creator/i,
  /content creator for hire/i,
  /for brand (deal|collab|sponsor)/i,
  // Ad disclosure on THEIR posts (proves they actively do paid work)
  /#ad\b/i,
  /#sponsored/i,
  // Explicit sponsorship/deal language
  /sponsorship inquir/i,
  /brand deal/i,
  /for paid/i,
];

// ── A2 STRONG: Profile pattern strongly suggests paid work ──────────────────
// BUT check EXCLUSION list first
const INFERRED_STRONG = [
  /lifestyle (creator|blogger)/i,
  /content creator/i,
  /digital creator/i,
  /nano.?influencer/i,
  /micro.?influencer/i,
  /macro.?influencer/i,
  /affiliate(| creator| marketer)/i,
  /youtuber/i,
  /vlogger/i,
  /tiktoker/i,
  /tiktok creator/i,
  /opinions (are |)my own/i,
  /views (are |)my own/i,
  /links? in bio/i,
];

// ── A2 SOFT: Softer signals — need 2+ to qualify ──────────────────────────
const INFERRED_SOFT = [
  'lifestyle', 'travel blogger', 'food blogger', 'fashion blogger', 'beauty',
  'fitness', 'wellness', 'gaming content', 'streamer', 'reviewer', 'unboxing',
  'personal brand', 'growing my audience',
];

// ── Technical/academic — clearly NOT a paid promoter ─────────────────────────
const NOT_PAID_PATTERNS = [
  /\bphd\b/i, /\bdr\.\s/i, /professor/i, /researcher/i, /research scientist/i,
  /ml researcher/i, /ai researcher/i, /nlp researcher/i,
  /principal (engineer|scientist)/i, /staff (engineer|scientist)/i,
  /faculty/i, /postdoc/i, /phd student/i, /thesis/i,
  /open source (developer|maintainer)/i,
];

/**
 * Classify from bio alone.
 * Returns classification object or null if needs tweet check.
 */
function classifyFromBio(bio, name, account_type) {
  const b = (bio || '').toLowerCase();
  const n = (name || '').toLowerCase();
  const text = b + ' ' + n;

  // PR/Brand pages → skip (Track B, handled separately)
  if (account_type === 'PR Page' || account_type === 'Brand Page') {
    return null;
  }

  // ── STEP 1: Check exclusions first ────────────────────────────────────────
  // "Official ambassador", "Brand ambassador for X" = single-brand exclusive
  // These people promote ONE brand only — NOT available for KiteAI collab
  for (const pat of EXCLUSIVE_PATTERNS) {
    if (pat.test(text)) {
      // Don't put them in A1 or A2 — leave as unknown for tweet analysis
      return { promotion_type: 'unknown', promotion_confidence: 0, promotion_signals: [], needs_tweet_check: false };
    }
  }

  // ── STEP 2: Check explicit A1 patterns ───────────────────────────────────
  // These mean: "I am available for paid work with anyone"
  const explicitHits = EXPLICIT_PATTERNS.filter(p => p.test(text));
  if (explicitHits.length >= 1) {
    const matched = text.match(explicitHits[0])?.[0] || String(explicitHits[0]).slice(1, 25);
    return {
      promotion_type:       'explicit',
      promotion_confidence: Math.min(95, 65 + explicitHits.length * 10),
      promotion_signals:    [`Open collab signal: "${matched}" in bio`],
      needs_tweet_check:    false,
    };
  }

  // ── STEP 3: Check not-paid (academic/technical) ───────────────────────────
  const notPaidHits = NOT_PAID_PATTERNS.filter(p => p.test(b));
  if (notPaidHits.length >= 1) {
    // Technical accounts — skip A1/A2, let tweet analysis decide
    return { promotion_type: 'unknown', promotion_confidence: 0, promotion_signals: [], needs_tweet_check: false };
  }

  // ── STEP 4: Check inferred strong ────────────────────────────────────────
  for (const pat of INFERRED_STRONG) {
    if (pat.test(text)) {
      const matched = text.match(pat)?.[0] || '';
      return {
        promotion_type:       'inferred',
        promotion_confidence: 65,
        promotion_signals:    [`Creator pattern: "${matched}"`],
        needs_tweet_check:    true,
      };
    }
  }

  // ── STEP 5: Check inferred soft (2+ needed) ──────────────────────────────
  const softHits = INFERRED_SOFT.filter(k => b.includes(k));
  if (softHits.length >= 2) {
    return {
      promotion_type:       'inferred',
      promotion_confidence: 50,
      promotion_signals:    softHits.slice(0, 3).map(k => `"${k}" lifestyle signal`),
      needs_tweet_check:    true,
    };
  }

  // Default: needs tweet check
  return { promotion_type: 'unknown', promotion_confidence: 0, promotion_signals: [], needs_tweet_check: true };
}

/**
 * Build AI prompt for tweet analysis
 */
function buildTweetAnalysisPrompt(handle, bio, tweets) {
  const tweetText = tweets.map((t, i) => `${i + 1}. ${t}`).join('\n');
  return `Is @${handle} AVAILABLE for paid brand collaborations with new brands?

Bio: "${bio || '(empty)'}"

Recent tweets:
${tweetText || '(no tweets available)'}

KEY QUESTION: Does this account actively do paid promotions with MULTIPLE brands (i.e., available to work with us)?
NOT what we want: accounts that exclusively represent one brand (official ambassadors).

Explicit paid signals: #ad, #sponsored, #gifted, discount codes ("use code X"), "I partnered with [Brand]",
  "Thank you [Brand] for sending", honest product reviews with CTA to buy, affiliate links
Inferred signals: Review-style posts about multiple DIFFERENT brands, unboxing content with multiple brands,
  giveaway posts, product features with CTAs, "link in bio" + brand names

Return ONLY JSON (no markdown):
{"promotion_type":"explicit"|"inferred"|"none","confidence":0-100,"signals":["..."]}

- "explicit": clear paid disclosure (#ad, sponsored, discount code, "gifted")
- "inferred": tweet PATTERN looks like paid but no explicit tag (product review + brand + CTA)
- "none": purely educational/technical/personal, no brand promotion pattern`;
}

module.exports = { classifyFromBio, buildTweetAnalysisPrompt, EXPLICIT_PATTERNS, EXCLUSIVE_PATTERNS };

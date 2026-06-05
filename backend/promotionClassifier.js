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

// ══════════════════════════════════════════════════════════════════════════
// PAID-POST PATTERN DETECTOR
// Instead of asking "is this account paid?", we define what a PAID POST looks
// like, scan each recent post for those signals (free regex), then let the AI
// make an evidence-based verdict. This raises recall without lowering quality:
// A2 requires a concrete promotional post (code / affiliate link / multi-brand
// pattern) — never a guess.
// ══════════════════════════════════════════════════════════════════════════

// Tier 1 — disclosed sponsorship (→ explicit / A1)
const POST_DISCLOSURE = [
  /#ad\b/i, /#sponsored\b/i, /#spon\b/i, /#paidpartnership/i, /#paidpartner/i,
  /#partner\b/i, /#gifted\b/i, /#promotion\b/i, /#sponsor\b/i,
  /paid partnership/i, /in partnership with/i, /sponsored by/i,
  /thanks?[^.]{0,25}for sponsoring/i, /\bsponsoring this\b/i, /this (is|video|post)[^.]{0,12}\bad\b/i,
];
// Tier 2 — discount / promo codes (→ inferred / A2, or A1 with disclosure)
const POST_CODE = [
  /\buse (my )?code\b/i, /\bcode[:]?\s*[A-Z0-9]{3,12}\b/, /\b\d{1,3}%\s*off\b/i,
  /promo code/i, /discount code/i, /\bcoupon\b/i, /save \d{1,3}%/i,
];
// Tier 2 — affiliate / referral links (→ inferred / A2)
const POST_AFFILIATE = [
  /[?&](ref|via|aff|affiliate|utm_source|utm_campaign|partner)=/i,
  /link in bio/i, /shop my/i, /amzn\.to/i, /\bbit\.ly\//i,
  /\baffiliate link/i, /earn(ed)? a commission/i,
];
// Brand giveaways (→ inferred / A2)
const POST_GIVEAWAY = [
  /\bgiveaway\b/i, /\brt (to|and|&) (win|enter)/i, /retweet to win/i,
  /\benter to win\b/i, /tag (a friend|\d+ friends)/i,
];
// Call-to-action verbs — paired with a brand @mention = promotional post
const CTA_VERBS = /\b(try|sign ?up|get yours|check (it|them) out|grab|download|join|shop|buy now|order|claim|book now)\b/i;

/**
 * Cheap regex scan of recent posts. Returns counts + evidence + brand spread.
 * No API/AI cost. Used both as a pre-filter and as a quality backstop.
 */
function scanPostsForSignals(tweets = []) {
  const r = { disclosure: 0, code: 0, affiliate: 0, giveaway: 0, brandCta: 0, promoPosts: 0, evidence: [] };
  const brands = new Set();
  for (const raw of tweets) {
    const t = String(raw || '');
    if (!t) continue;
    let promo = false;
    const note = (label) => { if (r.evidence.length < 6) r.evidence.push(`${label}: "${t.slice(0, 90)}"`); };

    if (POST_DISCLOSURE.some(p => p.test(t))) { r.disclosure++; promo = true; note('disclosure'); }
    if (POST_CODE.some(p => p.test(t)))       { r.code++;       promo = true; note('discount-code'); }
    if (POST_AFFILIATE.some(p => p.test(t)))  { r.affiliate++;  promo = true; note('affiliate-link'); }
    if (POST_GIVEAWAY.some(p => p.test(t)))   { r.giveaway++;   promo = true; note('giveaway'); }

    const mentions = t.match(/@\w{2,15}/g) || [];
    if (mentions.length && CTA_VERBS.test(t)) { r.brandCta++; promo = true; note('brand+CTA'); }

    if (promo) { r.promoPosts++; mentions.forEach(m => brands.add(m.toLowerCase())); }
  }
  return {
    ...r,
    brandCount: brands.size,
    brands: [...brands].slice(0, 8),
    hasExplicit: r.disclosure > 0,
    hasStrong:   r.disclosure > 0 || r.code > 0 || r.affiliate > 0,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// AUTHENTICITY / CONTENT-QUALITY SCAN
// For accounts that ARE promoters, rank how GENUINE their product content reads.
// Genuine = first-person lived experience, specific, honest/balanced, human voice.
// Salesy/low = hype overload, templated praise, pure CTA, robotic tone.
// Regex provides a backstop hint; Gemini is the primary judge.
// ══════════════════════════════════════════════════════════════════════════
const GENUINE_FIRSTPERSON = [
  /\bi(?:'ve| have)?\s+(tried|been using|switched to|used|tested|started using|set up|built with)\b/i,
  /\bmy\s+(experience|setup|workflow|honest|take|go-to)\b/i,
  /\bi\s+(love|really like|prefer|ended up|was skeptical|didn'?t expect)\b/i,
  /\bafter\s+(using|trying|a (week|month)|\d+)\b/i,
];
const GENUINE_SPECIFIC = [
  /\b\d+\s*(weeks?|days?|months?|years?|hours?|mins?|minutes?)\b/i,
  /\b\d+%/, /\b\d+x\b/i, /\bv\d/i, /\b\d{2,}\b/,
];
const GENUINE_HONEST = [
  /\b(downside|drawback|not perfect|wish it|skeptical|the catch|honestly|to be fair|caveat|the only (issue|gripe|thing))\b/i,
];
const HYPE_WORDS = [
  /\bgame.?changer\b/i, /\bbest\b.{0,14}\bever\b/i, /\babsolute(ly)?\b/i, /\binsane(ly)?\b/i,
  /\bmind.?blow/i, /\brevolutionary\b/i, /\bmust.?have\b/i, /\bunbelievable\b/i,
  /\bblown away\b/i, /\b10\/10\b/, /\bGOAT\b/, /\bno.?brainer\b/i,
];
const CTA_SPAM = [
  /\b(buy now|sign up now|grab yours|don'?t miss|act now|limited time|hurry)\b/i,
  /link in bio/i,
];

function scanAuthenticitySignals(tweets = []) {
  let firstPerson = 0, specific = 0, honest = 0, hype = 0, ctaSpam = 0, emojiTotal = 0, capsBursts = 0;
  let genuineExample = '';
  for (const raw of tweets) {
    const t = String(raw || '');
    if (!t) continue;
    const fp = GENUINE_FIRSTPERSON.some(p => p.test(t));
    const sp = GENUINE_SPECIFIC.some(p => p.test(t));
    const hn = GENUINE_HONEST.some(p => p.test(t));
    if (fp) firstPerson++;
    if (sp) specific++;
    if (hn) honest++;
    if (HYPE_WORDS.some(p => p.test(t))) hype++;
    if (CTA_SPAM.some(p => p.test(t))) ctaSpam++;
    emojiTotal += (t.match(/\p{Extended_Pictographic}/gu) || []).length;
    if (/\b[A-Z]{3,}\b[^a-z]*\b[A-Z]{3,}\b/.test(t)) capsBursts++; // 2+ ALL-CAPS words
    if (!genuineExample && fp && (sp || hn) && t.length > 80) genuineExample = t.slice(0, 180);
  }
  const n = Math.max(tweets.length, 1);
  const genuineRate = (firstPerson + specific + honest) / n;
  const salesyRate  = (hype + ctaSpam + capsBursts + emojiTotal / 4) / n;
  const hint = Math.round(Math.max(0, Math.min(100, 50 + genuineRate * 28 - salesyRate * 28)));
  return { firstPerson, specific, honest, hype, ctaSpam, emojiTotal, capsBursts, genuineExample, hint };
}

/**
 * Build the evidence-based paid-pattern prompt. Few-shot examples teach the
 * model the shape of a paid post; rules force a quoted-evidence verdict and
 * exclude own-brand founders (not hireable promoters). Also asks for an
 * authenticity score so genuine creators rank above salesy/templated ones.
 */
function buildPaidPatternPrompt(handle, bio, tweets, signals) {
  const tweetText = tweets.map((t, i) => `${i + 1}. ${String(t).replace(/\n/g, ' ').slice(0, 220)}`).join('\n');
  const sig = signals
    ? `Auto-detected signals → disclosures:${signals.disclosure} codes:${signals.code} affiliate-links:${signals.affiliate} giveaways:${signals.giveaway} brand+CTA:${signals.brandCta} | distinct brands promoted:${signals.brandCount}`
    : '';
  return `You are a sponsored-content detector for KiteAI (a voice-AI company that HIRES influencers for PAID promotions).

GOAL: Decide if @${handle} is a paid promoter we could hire — i.e. they take money/products to promote OTHER companies' products.

Bio: "${bio || '(empty)'}"
${sig}

Recent posts:
${tweetText || '(no posts available)'}

=== HOW A PAID POST LOOKS (learn this pattern) ===
PAID:
  • "Loving my setup from @brandX — use code SAVE20 for 20% off, link in bio  #ad"        → explicit (disclosure + code)
  • "Huge thanks to @toolY for sponsoring this. Sign up free: site.com/?ref=me"            → explicit (sponsor + affiliate)
  • "Been testing @appA and @appB this month, both great — try them 👇 (links)"            → inferred (multiple brands + CTA, no tag)
  • "Giveaway! RT + follow @gadgetZ to win one 🎁"                                          → inferred (brand giveaway)
NOT PAID:
  • "Spent the weekend debugging our inference stack — here's what I learned 🧵"            → none (technical)
  • "We just shipped v2 of OUR product 🚀 try it"                                           → none (promoting THEIR OWN company, not for hire)
  • "New paper on speech models is wild, breaking it down"                                  → none (researcher/journalist)

=== RULES (do NOT compromise) ===
- "explicit": ≥1 post has a clear paid DISCLOSURE (#ad / #sponsored / "paid partnership" / "sponsored by") OR a discount code / affiliate link promoting SOMEONE ELSE.
- "inferred": no explicit tag, but a clear PATTERN — promotes ≥2 DIFFERENT brands with CTAs/links, repeated product-review+link structure, or brand giveaways.
- "none": purely technical/research/journalism/personal, OR only promotes their OWN product/company (a founder is NOT a hireable promoter).
- "unknown": too few posts or no signal either way — do NOT guess.
- EVERY "explicit"/"inferred" verdict MUST quote the exact post text that proves it.

=== CONTENT AUTHENTICITY (only when promotion_type is "explicit" or "inferred") ===
Rate how GENUINE & high-quality this creator's product content reads — would an audience
trust it as a real personal experience, or dismiss it as a paid ad? We want creators whose
promo posts feel authentic, not salesy or AI/templated.
authenticity_score 0-100:
  70-100 (GENUINE): first-person lived experience ("I've been using…", "switched to…"),
    specific details (features, timeframes, real use-case), honest/balanced (admits a
    downside), natural conversational voice, real reasoning.
  40-69 (MIXED): some genuine signal but generic, thin, or partly promotional.
  0-39 (SALESY/LOW): hype-only ("BEST EVER 🚀🔥"), templated/interchangeable praise,
    pure CTA / link-dump, robotic uniform tone, no specifics or personal voice.
authenticity_reason: one short phrase explaining the score.
authenticity_example: quote the single most genuine post (or "" if none).
(If promotion_type is "none"/"unknown", set authenticity_score 0, reason "", example "".)

Return ONLY JSON (no markdown):
{"promotion_type":"explicit"|"inferred"|"none"|"unknown","confidence":0-100,"signals":["<short reason + quoted post>"],"brands":["@brand1","@brand2"],"authenticity_score":0-100,"authenticity_reason":"<short why>","authenticity_example":"<most genuine post or empty>"}`;
}

module.exports = {
  classifyFromBio, buildTweetAnalysisPrompt, EXPLICIT_PATTERNS, EXCLUSIVE_PATTERNS,
  scanPostsForSignals, buildPaidPatternPrompt, scanAuthenticitySignals,
};

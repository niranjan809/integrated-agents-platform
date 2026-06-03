const axios = require('axios');

// ── Model config ──────────────────────────────────────────────────────────────
// Top model: Claude Opus 4.5 — most capable, best classification accuracy
const SCORING_MODEL = 'anthropic/claude-opus-4-5';

const MODEL_CHAIN = [
  'anthropic/claude-opus-4-5',
];

// Batch size — how many accounts to score in one AI call
const BATCH_SIZE = 6;

function getKey() {
  const k = process.env.OPENROUTER_API_KEY;
  return k && k !== 'your_openrouter_key_here' ? k : null;
}

// ── Low-level OpenRouter call ─────────────────────────────────────────────────
async function callOpenRouter(messages, { maxTokens = 400, temperature = 0.1, model = SCORING_MODEL } = {}) {
  const key = getKey();
  if (!key) return { success: false, error: 'OPENROUTER_API_KEY not set in .env' };

  // Only Opus 4.5 — best classification accuracy
  const tryModels = [SCORING_MODEL];

  for (const m of tryModels) {
    try {
      const resp = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: m, messages, max_tokens: maxTokens, temperature },
        {
          headers: {
            'Authorization': `Bearer ${key}`,
            'HTTP-Referer':  'https://kiteai.com',
            'X-Title':       'KiteAI X Agent',
            'Content-Type':  'application/json',
          },
          timeout: 25000,
        }
      );
      const content = resp.data.choices?.[0]?.message?.content || '';
      return { success: true, content, model: m };
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) return { success: false, error: 'Invalid OpenRouter API key', status };
      if (status === 400) return { success: false, error: `Bad request on ${m}`, status };
      console.warn(`[OpenRouter] ${m} failed (${status || err.message}), trying next…`);
    }
  }
  return { success: false, error: 'All models exhausted' };
}

// ── Batch scoring — scores up to BATCH_SIZE accounts in ONE AI call ───────────
// This is the main scoring function. One call replaces N individual calls.
//
// Scoring rubric (passed to model):
//   D2 Collab Intent: how open to partnerships/DMs/collab?
//   D3 AI Relevance:  how AI/voice/LLM focused is their content?
//   type:  Influencer | PR Page | AI Media | Brand Page | Account
//   track: A (collab pipeline) | B (ads audience only)
async function aiScoreBatch(accounts) {
  if (!accounts.length) return [];

  const key = getKey();
  if (!key) return null; // no AI key — caller falls back to keyword scores

  const lines = accounts.map((a, i) => {
    const bio = (a.bio || '').slice(0, 160).replace(/\n/g, ' ');
    return `${i + 1}. @${a.handle} | ${a.name} | ${(a.followers || 0).toLocaleString()} followers | verified:${a.verified ? 'yes' : 'no'} | website:${a.website ? 'yes' : 'no'} | bio: ${bio || '(empty)'}`;
  }).join('\n');

  const prompt = `KiteAI — voice AI company. Score these X accounts for influencer/PR outreach.

RULES:
D2 Collab Intent (0-100): 90+=DM open/media kit/email in bio; 65-89=website/biz inquiries; 35-64=personal no signals; 10-34=news/corp brand; 0-9=bot/spam
D3 AI Relevance (0-100): 90+=voice AI/LLM/Vapi/ElevenLabs builder; 65-89=AI founder/SaaS/creator; 35-64=general tech; 10-34=adjacent; 0-9=none
type: "Influencer" | "PR Page" | "AI Media" | "Brand Page" | "Account"
track: "A"=collab pipeline | "B"=ads audience only

PROMOTION DETECTION (for Track A accounts):
promotion_type:
  "explicit" = bio clearly states paid work: "DM for sponsorships", "collab@email", "media kit", "paid partnerships", rates, business email
  "inferred" = profile PATTERN suggests paid work without saying it: creator/reviewer + multiple brand-friendly content signals, discount code mentions, "gifted by", lifestyle + product review pattern
  "none"     = clearly not a paid promoter: pure technical/researcher, journalist, corporate brand
  "unknown"  = insufficient signals to determine
promotion_confidence: 0-100 (how sure you are)
promotion_signals: array of up to 3 specific signals you detected (short phrases)

ACCOUNTS:
${lines}

Return ONLY a JSON array with ${accounts.length} objects in the SAME ORDER. No markdown.
Example: [{"d2":72,"d3":85,"type":"Influencer","track":"A","promotion_type":"inferred","promotion_confidence":75,"promotion_signals":["lifestyle creator pattern","brand-friendly content","product review style"]}]`;

  const result = await callOpenRouter(
    [{ role: 'user', content: prompt }],
    { maxTokens: Math.max(750, 120 * accounts.length), temperature: 0.1 }
  );

  if (!result.success) {
    console.warn('[OpenRouter] batch score failed:', result.error);
    return null;
  }

  try {
    const clean = result.content.replace(/```json|```/g, '').trim();
    const arr   = JSON.parse(clean);
    if (!Array.isArray(arr)) return null;

    // Map back — if AI returned fewer items than expected, pad with nulls
    return accounts.map((_, i) => {
      const item = arr[i];
      if (!item) return null;
      return {
        d2:    Math.max(0, Math.min(100, Number(item.d2)  || 0)),
        d3:    Math.max(0, Math.min(100, Number(item.d3)  || 0)),
        type:  item.type  || null,
        track: item.track || null,
        promotion_type:       ['explicit','inferred','none','unknown'].includes(item.promotion_type) ? item.promotion_type : 'unknown',
        promotion_confidence: Math.max(0, Math.min(100, Number(item.promotion_confidence) || 0)),
        promotion_signals:    Array.isArray(item.promotion_signals) ? item.promotion_signals.slice(0,3) : [],
        model: result.model,
      };
    });
  } catch (e) {
    console.warn('[OpenRouter] batch parse failed:', e.message, '| raw:', result.content.slice(0, 200));
    return null;
  }
}

/**
 * Analyse tweet content to determine promotion type.
 * Called for accounts where bio analysis was inconclusive.
 * Returns { promotion_type, confidence, signals } or null on failure.
 */
async function aiAnalyseTweets(handle, bio, tweets) {
  const { buildTweetAnalysisPrompt } = require('./promotionClassifier');
  const key = getKey();
  if (!key || !tweets.length) return null;

  const prompt = buildTweetAnalysisPrompt(handle, bio, tweets);
  const result = await callOpenRouter(
    [{ role: 'user', content: prompt }],
    { maxTokens: 200, temperature: 0.1 }
  );

  if (!result.success) return null;
  try {
    const clean  = result.content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      promotion_type:       ['explicit','inferred','none'].includes(parsed.promotion_type) ? parsed.promotion_type : 'unknown',
      promotion_confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      promotion_signals:    Array.isArray(parsed.signals) ? parsed.signals.slice(0, 3) : [],
      source: 'tweet_analysis',
    };
  } catch { return null; }
}

module.exports = { callOpenRouter, aiScoreBatch, aiAnalyseTweets, getKey, MODEL_CHAIN, BATCH_SIZE, SCORING_MODEL };

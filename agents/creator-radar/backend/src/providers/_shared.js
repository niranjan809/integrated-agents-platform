// Shared provider helpers.
//
// NOTE: the Instagram adapter (rapidapi_instagram.js) keeps its own inline copies of
// the email/hashtag regexes — it was deliberately NOT refactored to import from here,
// to avoid touching a verified Instagram file during the TikTok expansion. The TikTok
// adapters use these shared helpers. (Minor duplication, flagged.)
import { config } from "../config.js";
import { canCall, recordCall } from "../budget.js";
import { logger } from "../logger.js";

export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
export function extractEmail(text) {
  if (!text) return null;
  return text.match(EMAIL_RE)?.[0] ?? null;
}

// Unicode-aware hashtag match: '#' + letters/digits/underscore (any script), lowercased.
export const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
export function extractHashtags(caption) {
  if (!caption) return [];
  return (caption.match(HASHTAG_RE) || []).map((h) => h.toLowerCase());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROVIDER = "tiktok_rapidapi";
const PLATFORM = "tiktok";

// Budget-gated GET against tiktok-scraper7 with the code:0 success contract:
// HTTP 200 AND body.code === 0 is success; anything else is failure. Single 2s retry;
// every attempt is budget-checked + recorded (each consumes real TikTok quota).
export async function tiktokRequest(path, params = {}, label = "") {
  const qs = new URLSearchParams(params).toString();
  const url = `${config.tiktok.base}${path}${qs ? `?${qs}` : ""}`;
  const headers = { "x-rapidapi-host": config.tiktok.host, "x-rapidapi-key": config.tiktok.key };

  const maxAttempts = 2; // initial + one retry
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!(await canCall(PROVIDER))) {
      throw new Error(
        `TikTok monthly budget (${config.tiktokApiBudgetMonthly}) exhausted — refusing ${path} for "${label}".`
      );
    }
    let status = null;
    try {
      const res = await fetch(url, { method: "GET", headers });
      status = res.status;
      const text = await res.text();
      await recordCall({ provider: PROVIDER, endpoint: path, handle: label, status, platform: PLATFORM });

      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
      }
      if (json.code !== 0) {
        throw new Error(`provider code=${json.code} msg=${JSON.stringify(json.msg)}: ${text.slice(0, 150)}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      if (status === null) {
        await recordCall({ provider: PROVIDER, endpoint: path, handle: label, status: 0, platform: PLATFORM });
      }
      if (attempt < maxAttempts) {
        logger.warn(`TikTok ${path} "${label}" attempt ${attempt} failed: ${e.message} — retrying in 2s`);
        await sleep(2000);
      }
    }
  }
  throw lastErr;
}

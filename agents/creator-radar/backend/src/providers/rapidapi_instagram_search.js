// Adapter for instagram-looter2 /search — SEPARATE from rapidapi_instagram.js because
// /search has a different response shape (hashtags + places + users) than /profile.
//
// /search?query=<term> returns candidate accounts (users[]) and related hashtags[].
// No # prefix; `query` is a plain string. Budget-gated via budget.js (endpoint="/search"),
// same single-2s-retry pattern as the profile adapter.
import { config, requireRapidApi } from "../config.js";
import { canCall, recordCall } from "../budget.js";
import { logger } from "../logger.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Raw /search response -> { term, users, hashtags, raw }. Exported so the mapping can
// be unit-checked against a saved sample without spending an API call.
//   users[]:    { position, user:{ username, pk, full_name, is_verified, ... } }
//   hashtags[]: { position, hashtag:{ name, media_count, id } }
export function normalizeSearch(term, raw) {
  const users = (raw.users ?? [])
    .map((u) => {
      const usr = u.user ?? u;
      return {
        handle: usr.username,
        pk: usr.pk != null ? String(usr.pk) : null,
        full_name: usr.full_name ?? null,
        is_verified: !!usr.is_verified,
        position: typeof u.position === "number" ? u.position : null,
      };
    })
    .filter((u) => u.handle);

  const hashtags = (raw.hashtags ?? [])
    .map((h) => {
      const tag = h.hashtag ?? h;
      return {
        name: tag.name,
        media_count: tag.media_count ?? null,
        id: tag.id != null ? String(tag.id) : null, // may exceed 2^53 — keep as string
        position: typeof h.position === "number" ? h.position : null,
      };
    })
    .filter((h) => h.name);

  return { term, users, hashtags, raw };
}

async function fetchRaw(term) {
  const url = `${config.rapidapi.baseUrl}/search?query=${encodeURIComponent(term)}`;
  const headers = {
    "x-rapidapi-host": config.rapidapi.host,
    "x-rapidapi-key": config.rapidapi.key,
  };

  const maxAttempts = 2; // initial + one retry
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!(await canCall("rapidapi"))) {
      throw new Error(
        `RapidAPI monthly budget (${config.apiBudgetMonthly}) exhausted — refusing /search for "${term}".`
      );
    }
    let status = null;
    try {
      const res = await fetch(url, { method: "GET", headers });
      status = res.status;
      const text = await res.text();
      await recordCall({ provider: "rapidapi", endpoint: "/search", handle: term, status });

      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
      }
      // /search returns HTTP 200 with { status:false } on bad input — check the flag.
      if (json.status === false) {
        throw new Error(`Provider returned status:false for "${term}": ${text.slice(0, 200)}`);
      }
      return json;
    } catch (e) {
      lastErr = e;
      if (status === null) {
        await recordCall({ provider: "rapidapi", endpoint: "/search", handle: term, status: 0 });
      }
      if (attempt < maxAttempts) {
        logger.warn(`/search "${term}" attempt ${attempt} failed: ${e.message} — retrying in 2s`);
        await sleep(2000);
      }
    }
  }
  throw lastErr;
}

// Public entry: fetch + normalize.
export async function searchByTerm(term) {
  requireRapidApi();
  const raw = await fetchRaw(term);
  return normalizeSearch(term, raw);
}

const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 GTMIntelBot/0.1";

export interface FetchTextResult {
  ok: boolean;
  status: number;
  url: string;
  text: string;
  contentType: string;
}

// In-memory, 24h TTL — most of what this hits (sitemap.xml, marketplace
// search pages, partner/resource pages discovered via sitemap) rarely
// changes within a day, so re-analyzing the same company repeatedly (e.g.
// after tweaking a keyword) was re-fetching every one of those from scratch
// every time. Deliberately NOT applied to Playwright-rendered fetches
// (homepage, pricing, careers, tech stack) — those are exactly the pages
// most likely to reflect something that just changed, so freshness matters
// more than speed there. Process-lifetime only (resets on server restart),
// which is fine for this use case — it's a speed optimization, not a
// correctness guarantee.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; result: FetchTextResult }>();

export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<FetchTextResult> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const result = await fetchTextUncached(url, timeoutMs);
  // Only cache real successes — a transient failure shouldn't be "sticky"
  // for 24h just because it happened to be the first attempt.
  if (result.ok) cache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, result });
  return result;
}

async function fetchTextUncached(url: string, timeoutMs: number): Promise<FetchTextResult> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      url: res.url,
      text,
      contentType: res.headers.get("content-type") ?? "",
    };
  } catch {
    // one retry on network error / timeout
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        url: res.url,
        text,
        contentType: res.headers.get("content-type") ?? "",
      };
    } catch {
      return { ok: false, status: 0, url, text: "", contentType: "" };
    }
  }
}

export function truncateSnippet(text: string, maxLen = 400): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed;
}

export { USER_AGENT };

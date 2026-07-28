import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";
import { resolveUrl } from "./textUtils.js";

const MAX_SUB_SITEMAPS = 6;
const MAX_URLS = 500;

// Common non-English locale path prefixes (e.g. retellai.com/da/partners,
// /el/partners, /ar/partners, ...) — without this, a sitemap crawl pulls in
// the same page duplicated across every language as separate "evidence."
const LOCALE_PATH_PREFIXES = new Set([
  "de", "fr", "es", "it", "pt", "pt-br", "nl", "sv", "da", "no", "nb", "fi",
  "pl", "ru", "ja", "zh", "zh-cn", "zh-tw", "ko", "ar", "el", "tr", "cs",
  "hu", "ro", "uk", "he", "th", "vi", "id", "hi",
]);

function isLocaleVariant(url: string): boolean {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return segments.length > 0 && LOCALE_PATH_PREFIXES.has(segments[0].toLowerCase());
  } catch {
    return false;
  }
}

function parseLocs(xml: string): string[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
}

/** Per the sitemap protocol, a sitemap-index document's root element is
 *  literally <sitemapindex> (a leaf sitemap's root is <urlset>) — the only
 *  reliable way to tell them apart. Guessing from the sub-sitemap URL shape
 *  (e.g. "does it end in .xml?") breaks on real sites: openai.com names its
 *  sub-sitemaps "/sitemap.xml/webinar/" etc. with no .xml suffix at all,
 *  which previously caused those sub-sitemap descriptor URLs to be treated
 *  as real content pages — fetching one returns raw XML (URL/lastmod pairs),
 *  which then got dumped into an evidence snippet as if it were page text. */
function isSitemapIndexXml(xml: string): boolean {
  return cheerio.load(xml, { xmlMode: true })("sitemapindex").length > 0;
}

/**
 * Crawls sitemap.xml (following one level of sub-sitemaps if present) to
 * discover real page URLs, instead of guessing fixed paths like "/partners"
 * and silently getting nothing on a 404. `hintKeywords` (the same keywords
 * the caller uses to filter discovered URLs) lets large multi-sitemap sites
 * (e.g. openai.com splits into 30+ per-section sub-sitemaps) prioritize the
 * sub-sitemaps most likely to be relevant instead of only ever crawling
 * whichever few happen to come first in the index.
 */
export async function fetchSitemapUrls(website: string, hintKeywords: string[] = []): Promise<string[]> {
  for (const path of ["/sitemap.xml", "/sitemap_index.xml"]) {
    const res = await fetchText(resolveUrl(website, path), 8000);
    if (!res.ok || !res.text) continue;

    if (!isSitemapIndexXml(res.text)) {
      const locs = parseLocs(res.text);
      if (locs.length > 0) return locs.filter((url) => !isLocaleVariant(url)).slice(0, MAX_URLS);
      continue;
    }

    const subSitemaps = parseLocs(res.text);
    if (subSitemaps.length === 0) continue;

    const lowerHints = hintKeywords.map((k) => k.toLowerCase());
    const prioritized = lowerHints.length
      ? [...subSitemaps].sort((a, b) => {
          const aMatch = lowerHints.some((h) => a.toLowerCase().includes(h)) ? 0 : 1;
          const bMatch = lowerHints.some((h) => b.toLowerCase().includes(h)) ? 0 : 1;
          return aMatch - bMatch;
        })
      : subSitemaps;

    const urls: string[] = [];
    for (const subSitemap of prioritized.slice(0, MAX_SUB_SITEMAPS)) {
      const subRes = await fetchText(subSitemap, 8000);
      if (subRes.ok && subRes.text) urls.push(...parseLocs(subRes.text));
      if (urls.length >= MAX_URLS) break;
    }
    const filtered = urls.filter((url) => !isLocaleVariant(url));
    if (filtered.length > 0) return filtered.slice(0, MAX_URLS);
  }

  return [];
}

/** Filters a sitemap URL list down to ones whose path looks relevant to the given keywords. */
export function filterUrlsByKeywords(urls: string[], keywords: string[]): string[] {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  return urls.filter((url) => {
    try {
      const path = new URL(url).pathname.toLowerCase();
      return lowerKeywords.some((kw) => path.includes(kw));
    } catch {
      return false;
    }
  });
}

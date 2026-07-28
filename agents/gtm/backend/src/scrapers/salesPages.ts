import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";
import { resolveUrl, normalizeWhitespace, extractVisibleText, nowIso } from "./textUtils.js";
import { getCustomPaths } from "./customRules.js";
import { extractArticleSnippet } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "sales_pages";

// A dedicated sales-conversation-gated page (vs. a CTA button alone) is
// itself Sales-Led evidence — the company built a whole page around routing
// visitors into a sales conversation rather than a self-serve flow.
export const PATHS = ["/contact-sales", "/book-demo", "/demo", "/request-demo", "/enterprise"];

async function scrapeCandidate(url: string, path: string): Promise<EvidenceCandidate | null> {
  const res = await fetchText(url);
  if (!res.ok || !res.text) return null;

  const articleText = await extractArticleSnippet(url, res.text);
  const bodyText = articleText ?? normalizeWhitespace(extractVisibleText(cheerio.load(res.text))).slice(0, 300);
  if (!bodyText) return null;

  return {
    sourceUrl: url,
    sourceType: "sales_led_page",
    title: `Sales-led page found: ${path}`,
    snippet: bodyText,
    scrapedAt: nowIso(),
  };
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const customPaths = await getCustomPaths(SCRAPER_NAME, ctx.companyId);
  const candidateUrls = [...PATHS, ...customPaths].map((path) => ({ url: resolveUrl(ctx.website, path), path }));

  const seen = new Set<string>();
  const candidates: EvidenceCandidate[] = [];

  const results = await Promise.allSettled(candidateUrls.map(({ url, path }) => scrapeCandidate(url, path)));

  for (const result of results) {
    if (result.status === "fulfilled" && result.value && !seen.has(result.value.sourceUrl)) {
      seen.add(result.value.sourceUrl);
      candidates.push(result.value);
    }
  }

  return candidates;
}

export const salesPagesScraper: Scraper = { name: SCRAPER_NAME, run };

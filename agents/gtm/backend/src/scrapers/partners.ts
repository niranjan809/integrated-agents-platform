import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";
import { resolveUrl, normalizeWhitespace, extractVisibleText, nowIso } from "./textUtils.js";
import { getCustomPaths } from "./customRules.js";
import { fetchSitemapUrls, filterUrlsByKeywords } from "./sitemap.js";
import { extractArticleSnippet } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "partners";

// Broadened default paths (#1).
export const PATHS = [
  "/partners",
  "/partnerships",
  "/become-a-partner",
  "/technology-partners",
  "/affiliates",
  "/partner-program",
  "/alliances",
  "/reseller-program",
  "/ecosystem/partners",
];

const SITEMAP_KEYWORDS = [
  "partner",
  "alliance",
  "reseller",
  "affiliate",
  "channel",
  "co-sell",
  "system-integrator",
  "global-partner",
  "technology-partner",
  "strategic-partner",
  "integration-partner",
  "agency-partner",
  "referral-partner",
  "marketplace-partner",
  "cloud-partner",
  "oem",
  "consulting-partner",
  "implementation-partner",
  "co-marketing",
  "joint-webinar",
  "joint-event",
  "certified-partner",
  "ambassador",
  "creator-program",
  "revenue-share",
  "referral",
];

async function scrapeCandidate(url: string, label: string): Promise<EvidenceCandidate | null> {
  const res = await fetchText(url);
  if (!res.ok || !res.text) return null;

  // Readability first — it identifies the actual content block and discards
  // nav/menu text, which a tag blacklist alone can miss on sites that build
  // their menu out of plain <div>s. Fall back to raw visible text if
  // Readability can't find an "article" on what might be a simple info page.
  const articleText = await extractArticleSnippet(url, res.text);
  const bodyText = articleText ?? normalizeWhitespace(extractVisibleText(cheerio.load(res.text))).slice(0, 300);
  if (!bodyText) return null;

  return {
    sourceUrl: url,
    sourceType: "partners_page",
    title: label,
    snippet: bodyText,
    scrapedAt: nowIso(),
  };
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const customPaths = await getCustomPaths(SCRAPER_NAME, ctx.companyId);
  const guessedUrls = [...PATHS, ...customPaths].map((path) => ({
    url: resolveUrl(ctx.website, path),
    label: `Page found: ${path}`,
  }));

  // Sitemap-discovered URLs (#2) catch real partner pages that don't live at
  // any of the guessed paths above (e.g. a site's actual partner page is at
  // "/why-partner-with-us" instead of "/partners").
  const sitemapUrls = await fetchSitemapUrls(ctx.website, SITEMAP_KEYWORDS);
  const relevantSitemapUrls = filterUrlsByKeywords(sitemapUrls, SITEMAP_KEYWORDS).map((url) => ({
    url,
    label: "Discovered via sitemap",
  }));

  const seen = new Set<string>();
  const candidates: EvidenceCandidate[] = [];

  const results = await Promise.allSettled(
    [...guessedUrls, ...relevantSitemapUrls].map(({ url, label }) => scrapeCandidate(url, label))
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value && !seen.has(result.value.sourceUrl)) {
      seen.add(result.value.sourceUrl);
      candidates.push(result.value);
    }
  }

  return candidates;
}

export const partnersScraper: Scraper = { name: SCRAPER_NAME, run };

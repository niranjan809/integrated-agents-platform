import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";
import { resolveUrl, normalizeWhitespace, extractVisibleText, nowIso } from "./textUtils.js";
import { getCustomPaths } from "./customRules.js";
import { extractArticleSnippet } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "plg_pages";

// Self-serve PLG surfaces that live outside /pricing and /signup — a real
// playground/sandbox/quickstart page is itself PLG evidence (try-before-buy,
// no sales conversation required), independent of what the CTA text says.
export const PATHS = [
  "/playground",
  "/sandbox",
  "/quickstart",
  "/get-started",
  "/start",
  "/templates",
  "/onboarding",
  "/studio",
  "/examples",
];

async function scrapeCandidate(url: string, path: string): Promise<EvidenceCandidate | null> {
  const res = await fetchText(url);
  if (!res.ok || !res.text) return null;

  const articleText = await extractArticleSnippet(url, res.text);
  const bodyText = articleText ?? normalizeWhitespace(extractVisibleText(cheerio.load(res.text))).slice(0, 300);
  if (!bodyText) return null;

  return {
    sourceUrl: url,
    sourceType: "plg_page",
    title: `Self-serve page found: ${path}`,
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

export const plgPagesScraper: Scraper = { name: SCRAPER_NAME, run };

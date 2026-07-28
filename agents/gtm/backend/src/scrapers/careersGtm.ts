import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { resolveUrl, normalizeWhitespace, nowIso } from "./textUtils.js";
import { getCustomKeywords } from "./customRules.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "careers_gtm";

// Broadened default role keywords (#1).
export const ROLE_KEYWORDS = [
  "account executive",
  "sales development representative",
  "solutions engineer",
  "growth engineer",
  "plg",
  "sdr",
  "enterprise account executive",
  "customer success",
  "revenue operations",
  "demand generation",
  "field marketing",
  "partnerships manager",
  "channel manager",
  "product marketing",
  "sales engineer",
  "business development",
  "developer advocate",
  "developer relations",
  "devrel",
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const url = resolveUrl(ctx.website, "/careers");
  // Rendered fetch — most job boards (Greenhouse/Lever/Ashby embeds) only
  // populate their listings client-side; a plain fetch sees an empty shell.
  const res = await fetchRendered(url);
  if (!res.ok || !res.html) return [];

  const customKeywords = await getCustomKeywords(SCRAPER_NAME, ctx.companyId);
  const allKeywords = [...ROLE_KEYWORDS, ...customKeywords.map((k) => k.toLowerCase())];

  const $ = cheerio.load(res.html);
  const candidates: EvidenceCandidate[] = [];
  const seen = new Set<string>();

  $("a, li, h2, h3").each((_, el) => {
    const text = normalizeWhitespace($(el).text());
    if (!text || text.length > 100) return;
    const lower = text.toLowerCase();
    const matched = allKeywords.find((kw) => lower.includes(kw));
    if (matched && !seen.has(lower)) {
      seen.add(lower);
      candidates.push({
        sourceUrl: url,
        sourceType: "careers_page",
        title: "GTM role listing",
        snippet: `Job listing found: "${text}"`,
        scrapedAt: nowIso(),
      });
    }
  });

  return candidates.slice(0, 10);
}

export const careersGtmScraper: Scraper = { name: SCRAPER_NAME, run };

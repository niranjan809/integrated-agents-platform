import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { normalizeWhitespace, nowIso } from "./textUtils.js";
import { getCustomKeywords } from "./customRules.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "homepage_cta";

// Broadened default CTA phrasing (#1) — more phrasing variants directly
// increase how often a real CTA gets matched.
export const PLG_CTA_PATTERNS = [
  /get started free/i,
  /try (it )?for free/i,
  /sign up free/i,
  /start for free/i,
  /start free trial/i,
  /start building/i,
  /create free account/i,
  /start now/i,
  /try (it )?now/i,
  /build for free/i,
  /invite a teammate/i,
  /share workspace/i,
  /bring your own key/i,
  /\bbyok\b/i,
  /launch app/i,
  /instant access/i,
  /one[- ]click signup/i,
  /self[- ]serve/i,
  /self[- ]service/i,
  /use for free/i,
  /create workspace/i,
  /open playground/i,
  /generate api key/i,
  /start free/i,
  /try free/i,
  /get started/i,
  /create account/i,
  /join waitlist/i,
  /get api key/i,
  /refer a friend/i,
  /invite friends/i,
  /refer (&|and) earn/i,
  /voice demo/i,
  /chat demo/i,
  /image demo/i,
];
export const SALES_CTA_PATTERNS = [
  /contact sales/i,
  /talk to sales/i,
  /book a demo/i,
  /request a demo/i,
  /get a demo/i,
  /speak (with|to) (an? )?sales/i,
  /schedule a demo/i,
  /get in touch/i,
  /request pricing/i,
  /book a call/i,
  /talk to an expert/i,
  /request custom demo/i,
  /enterprise inquiry/i,
  /contact enterprise sales/i,
  /request (a )?quote/i,
  /speak to (an? )?expert/i,
  /consult sales/i,
  /meet sales/i,
  /schedule demo/i,
  /book demo/i,
  /request demo/i,
  /talk to expert/i,
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  // Rendered fetch (not a plain fetch()) — many marketing homepages are
  // React/Next.js SPAs whose CTA buttons only exist after client-side render.
  const res = await fetchRendered(ctx.website);
  if (!res.ok || !res.html) return [];

  const customKeywords = await getCustomKeywords(SCRAPER_NAME, ctx.companyId);

  const $ = cheerio.load(res.html);
  const candidates: EvidenceCandidate[] = [];
  const seen = new Set<string>();

  $("a, button").each((_, el) => {
    // Skip wrapper elements (e.g. mega-menu triggers) that contain nested
    // a/button descendants — .text() on those concatenates every nested
    // link's label into one garbled string instead of a single real CTA.
    if ($(el).find("a, button").length > 0) return;

    const text = normalizeWhitespace($(el).text());
    if (!text || text.length > 60 || seen.has(text.toLowerCase())) return;

    const isPlg = PLG_CTA_PATTERNS.some((p) => p.test(text));
    const isSales = SALES_CTA_PATTERNS.some((p) => p.test(text));
    const isCustom = customKeywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
    if (!isPlg && !isSales && !isCustom) return;

    seen.add(text.toLowerCase());
    candidates.push({
      sourceUrl: ctx.website,
      sourceType: SCRAPER_NAME,
      title: null,
      snippet: `Primary CTA: "${text}"`,
      scrapedAt: nowIso(),
    });
  });

  return candidates;
}

export const homepageCtaScraper: Scraper = { name: SCRAPER_NAME, run };

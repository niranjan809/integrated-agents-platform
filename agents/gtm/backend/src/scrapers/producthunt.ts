import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { normalizeWhitespace, nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  if (!ctx.phSlug) return [];

  const url = `https://www.producthunt.com/products/${ctx.phSlug}`;
  // Rendered fetch — Product Hunt's product pages are a React SPA; a plain
  // fetch returns an empty shell with no title/tagline in the markup.
  const res = await fetchRendered(url);
  if (!res.ok || !res.html) return [];

  const $ = cheerio.load(res.html);
  const title = normalizeWhitespace($("h1").first().text());
  const tagline = normalizeWhitespace($("h2").first().text());

  if (!title) return [];

  return [
    {
      sourceUrl: url,
      sourceType: "launch_producthunt",
      title: "Product Hunt launch",
      snippet: `${title}${tagline ? ` — ${tagline}` : ""}`,
      scrapedAt: nowIso(),
    },
  ];
}

export const producthuntScraper: Scraper = { name: "producthunt", run };

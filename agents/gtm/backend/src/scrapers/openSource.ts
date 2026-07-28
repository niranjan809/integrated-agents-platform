import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { extractVisibleText, normalizeWhitespace, snippetAroundKeyword, nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "open_source";

// Openness-as-GTM language. Multi-word/specific so it doesn't false-match, and
// distinct from Ecosystem (integrations) or Launch (announcements) — this is
// about giving the code/model away as a distribution & adoption motion.
export const OPEN_SOURCE_KEYWORDS = [
  "open source",
  "open-source",
  "open weights",
  "open-weights",
  "open model",
  "open-model",
  "open models",
  "self-host",
  "self host",
  "self-hosted",
  "run locally",
  "weights available",
  "open dataset",
  "apache 2.0",
  "apache license",
  "mit license",
  "commercially licensed",
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const res = await fetchRendered(ctx.website);
  if (!res.ok || !res.html) return [];

  const $ = cheerio.load(res.html);
  const candidates: EvidenceCandidate[] = [];

  // Primary signal: real open-source/open-weights language in the visible
  // homepage text. Gate everything on this — a company merely linking to
  // GitHub (a footer social icon) is NOT an open-source GTM signal on its own.
  const text = normalizeWhitespace(extractVisibleText($));
  const snippet = snippetAroundKeyword(text, OPEN_SOURCE_KEYWORDS);
  if (!snippet) return [];

  candidates.push({
    sourceUrl: ctx.website,
    sourceType: SCRAPER_NAME,
    title: "Open-source / open-weights signal",
    snippet,
    scrapedAt: nowIso(),
  });

  // Supporting evidence: public code/model repositories linked from the page.
  // Only surfaced alongside the language signal above, so it stays grounded in
  // a genuine open-source posture rather than an incidental GitHub link.
  const repos = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").split("?")[0];
    if (/^https?:\/\/(www\.)?github\.com\/[^/]+/i.test(href) || /^https?:\/\/huggingface\.co\/[^/]+/i.test(href)) {
      repos.add(href.replace(/\/$/, ""));
    }
  });
  if (repos.size > 0) {
    const sample = Array.from(repos).slice(0, 5).join(", ");
    candidates.push({
      sourceUrl: ctx.website,
      sourceType: SCRAPER_NAME,
      title: "Public code / model repositories",
      snippet: `Homepage links to public code/model repositories: ${sample}.`,
      scrapedAt: nowIso(),
    });
  }

  return candidates;
}

export const openSourceScraper: Scraper = { name: SCRAPER_NAME, run };

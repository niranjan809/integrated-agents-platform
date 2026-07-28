import { webSearch } from "./search.js";
import { normalizeWhitespace, nowIso } from "./textUtils.js";
import { getCustomKeywords } from "./customRules.js";
import { extractArticleSnippet } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "press_release";

// Exported so defaultRules.ts can surface these on the Categories page.
export const PARTNERSHIP_PRESS_KEYWORDS = ["strategic partnership", "partners with"];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const customKeywords = await getCustomKeywords(SCRAPER_NAME, ctx.companyId);
  const extraTerms = customKeywords.map((kw) => `OR "${kw}"`).join(" ");
  const pressTerms = PARTNERSHIP_PRESS_KEYWORDS.map((kw) => `"${kw}"`).join(" OR ");
  const query = `"${ctx.companyName}" ${pressTerms} site:businesswire.com OR site:prnewswire.com ${extraTerms}`.trim();

  const results = await webSearch(query);

  const relevant = results.filter((r) =>
    `${r.title} ${r.snippet}`.toLowerCase().includes(ctx.companyName.toLowerCase())
  );

  const candidates = await Promise.all(
    relevant.slice(0, 6).map(async (r): Promise<EvidenceCandidate | null> => {
      // Prefer the real press release body over the search engine's short
      // blurb — a full paragraph is proof, a one-line snippet just looks like
      // a keyword match.
      const articleSnippet = await extractArticleSnippet(r.url);
      const snippet = articleSnippet ?? normalizeWhitespace(r.snippet || r.title);
      if (!snippet) return null;

      return {
        sourceUrl: r.url,
        sourceType: SCRAPER_NAME,
        title: r.title,
        snippet,
        scrapedAt: nowIso(),
      };
    })
  );

  return candidates.filter((c): c is EvidenceCandidate => c !== null);
}

export const pressReleaseScraper: Scraper = { name: SCRAPER_NAME, run };

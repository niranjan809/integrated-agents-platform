import { webSearch } from "./search.js";
import { normalizeWhitespace, nowIso } from "./textUtils.js";
import { getCustomKeywords } from "./customRules.js";
import { extractArticleSnippet, isTrustedMentionSource } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "news";

// Exported so defaultRules.ts can surface these on the Categories page.
export const LAUNCH_KEYWORDS = [
  "launch",
  "now available",
  "announcing",
  "early access",
  "waitlist",
  "public beta",
  "release notes",
  "launch week",
  "product hunt",
  "new release",
  "closed beta",
  "open beta",
  "public preview",
  "coming soon",
  "launch event",
  "changelog",
  "feature release",
  "roadmap",
  "sneak peek",
  "launch webinar",
  "release video",
  "huggingface",
  "open weights",
  "mit license",
  "apache license",
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const customKeywords = await getCustomKeywords(SCRAPER_NAME, ctx.companyId);
  const extraTerms = customKeywords.map((kw) => `OR "${kw}"`).join(" ");
  const launchTerms = LAUNCH_KEYWORDS.map((kw) => (kw.includes(" ") ? `"${kw}"` : kw)).join(" OR ");
  const query = `"${ctx.companyName}" ${launchTerms} ${extraTerms}`.trim();

  const results = await webSearch(query);

  // Two-layer filter: the result must both mention the company AND come from
  // a trusted domain (own site or known press outlet) — mentioning the name
  // alone isn't enough, since generic domains/mirrors/homonyms also do that.
  const relevant = results.filter(
    (r) =>
      `${r.title} ${r.snippet}`.toLowerCase().includes(ctx.companyName.toLowerCase()) &&
      isTrustedMentionSource(r.url, ctx.website)
  );
  const top = relevant.slice(0, 5);

  const candidates = await Promise.all(
    top.map(async (r): Promise<EvidenceCandidate | null> => {
      const articleSnippet = await extractArticleSnippet(r.url);
      const snippet = articleSnippet ?? normalizeWhitespace(r.snippet || r.title);
      if (!snippet) return null;

      return {
        sourceUrl: r.url,
        sourceType: "news_article",
        title: r.title,
        snippet,
        scrapedAt: nowIso(),
      };
    })
  );

  return candidates.filter((c): c is EvidenceCandidate => c !== null);
}

export const newsScraper: Scraper = { name: SCRAPER_NAME, run };

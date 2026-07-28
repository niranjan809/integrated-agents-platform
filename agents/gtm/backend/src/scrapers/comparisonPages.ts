import { webSearch } from "./search.js";
import { normalizeWhitespace, nowIso } from "./textUtils.js";
import { getCustomKeywords } from "./customRules.js";
import { extractArticleSnippet, isTrustedMentionSource } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "comparison_pages";

// Exported so defaultRules.ts can surface these on the Categories page —
// single source of truth instead of duplicating the term list there.
export const OWN_SITE_KEYWORDS = [
  "vs",
  "alternative",
  "compare",
  "switch from",
  "migrate from",
  "better than",
  "why choose",
  "feature matrix",
  "migration tool",
  "switch guide",
  "competitor",
  "versus",
  "comparison table",
];
export const THIRD_PARTY_KEYWORDS = [
  "vs",
  "alternative to",
  "compared to",
  "alternatives to",
  "feature comparison",
  "versus",
];

async function toCandidate(
  r: { url: string; title: string; snippet: string },
  sourceType: string
): Promise<EvidenceCandidate | null> {
  const articleSnippet = await extractArticleSnippet(r.url);
  const snippet = articleSnippet ?? normalizeWhitespace(r.snippet || r.title);
  if (!snippet) return null;
  return { sourceUrl: r.url, sourceType, title: r.title, snippet, scrapedAt: nowIso() };
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  let host: string;
  try {
    host = new URL(ctx.website).hostname;
  } catch {
    return [];
  }

  const customKeywords = await getCustomKeywords(SCRAPER_NAME, ctx.companyId);
  const extraTerms = customKeywords.map((kw) => `OR "${kw}"`).join(" ");

  // Pass 1: pages the company published itself (their own "X vs Y" pages).
  const ownSiteTerms = OWN_SITE_KEYWORDS.map((kw) => `"${kw}"`).join(" OR ");
  const ownSiteQuery = `site:${host} ${ownSiteTerms} ${extraTerms}`.trim();
  // Pass 2: third-party comparisons/reviews — not restricted to their own
  // site, so a competitor's or a review site's "X vs Y" content gets found
  // too, not just what the company says about itself. Bounded to a trusted
  // domain allowlist (G2, Capterra, TrustRadius, Reddit, press outlets, etc.)
  // to keep out low-quality/unrelated results.
  const thirdPartyTerms = THIRD_PARTY_KEYWORDS.map((kw) => `"${kw}"`).join(" OR ");
  const thirdPartyQuery = `"${ctx.companyName}" ${thirdPartyTerms} ${extraTerms}`.trim();

  const [ownResults, thirdPartyResults] = await Promise.all([webSearch(ownSiteQuery), webSearch(thirdPartyQuery)]);

  const ownMatches = ownResults.filter((r) => {
    try {
      return new URL(r.url).hostname.endsWith(host);
    } catch {
      return false;
    }
  });

  const thirdPartyMatches = thirdPartyResults.filter(
    (r) =>
      `${r.title} ${r.snippet}`.toLowerCase().includes(ctx.companyName.toLowerCase()) &&
      isTrustedMentionSource(r.url, ctx.website) &&
      !new URL(r.url).hostname.endsWith(host) // avoid double-counting pass 1's own-site hits
  );

  const seen = new Set<string>();
  const candidates: EvidenceCandidate[] = [];

  const results = await Promise.all(
    [...ownMatches.slice(0, 8), ...thirdPartyMatches.slice(0, 8)].map((r) => toCandidate(r, "comparison_page"))
  );

  for (const candidate of results) {
    if (candidate && !seen.has(candidate.sourceUrl)) {
      seen.add(candidate.sourceUrl);
      candidates.push(candidate);
    }
  }

  return candidates;
}

export const comparisonPagesScraper: Scraper = { name: SCRAPER_NAME, run };

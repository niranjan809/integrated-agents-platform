import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";
import { normalizeWhitespace, snippetAroundKeyword, extractVisibleText, nowIso } from "./textUtils.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface MarketplaceTarget {
  label: string;
  urlFor: (slug: string) => string;
}

// Exported so defaultRules.ts can surface which marketplaces are checked on
// the Categories page.
export const TARGETS: MarketplaceTarget[] = [
  { label: "Zapier", urlFor: (slug) => `https://zapier.com/apps/${slug}/integrations` },
  { label: "Make", urlFor: (slug) => `https://www.make.com/en/integrations/${slug}` },
  { label: "n8n", urlFor: (slug) => `https://n8n.io/integrations/${slug}` },
  { label: "Slack App Directory", urlFor: (slug) => `https://slack.com/apps/search?q=${slug}` },
  {
    label: "HubSpot Marketplace",
    urlFor: (slug) => `https://ecosystem.hubspot.com/marketplace/apps?search=${slug}`,
  },
  // AI-specific marketplaces — relevant to this agent's AI-company focus.
  // Some of these (Azure/GCP/Databricks) render their search UI client-side,
  // so a plain fetch may see an empty shell; that's fine, the company-name
  // check below just yields no evidence rather than a false positive.
  { label: "GitHub Marketplace", urlFor: (slug) => `https://github.com/marketplace?query=${slug}` },
  { label: "Hugging Face", urlFor: (slug) => `https://huggingface.co/${slug}` },
  {
    label: "Azure Marketplace",
    urlFor: (slug) => `https://azuremarketplace.microsoft.com/en-us/marketplace/apps?search=${slug}`,
  },
  { label: "Google Cloud Marketplace", urlFor: (slug) => `https://cloud.google.com/marketplace/browse?q=${slug}` },
  { label: "Databricks Marketplace", urlFor: (slug) => `https://marketplace.databricks.com/?searchKey=${slug}` },
  { label: "AWS Marketplace", urlFor: (slug) => `https://aws.amazon.com/marketplace/search/results?searchTerms=${slug}` },
  {
    label: "Salesforce AppExchange",
    urlFor: (slug) => `https://appexchange.salesforce.com/appxSearchKeywordResults?keywords=${slug}`,
  },
  {
    label: "Microsoft AppSource",
    urlFor: (slug) => `https://appsource.microsoft.com/en-us/marketplace/apps?search=${slug}`,
  },
  { label: "Shopify App Store", urlFor: (slug) => `https://apps.shopify.com/search?q=${slug}` },
  { label: "Atlassian Marketplace", urlFor: (slug) => `https://marketplace.atlassian.com/search?query=${slug}` },
  {
    label: "VS Code Marketplace",
    urlFor: (slug) => `https://marketplace.visualstudio.com/search?term=${slug}&target=VSCode`,
  },
  { label: "Chrome Web Store", urlFor: (slug) => `https://chromewebstore.google.com/search/${slug}` },
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const slug = slugify(ctx.companyName);
  const candidates: EvidenceCandidate[] = [];

  const results = await Promise.allSettled(
    TARGETS.map(async (target) => {
      const url = target.urlFor(slug);
      const res = await fetchText(url);
      if (!res.ok || !res.text) return null;

      // Script-aware extraction — a plain regex tag-stripper leaves <script>
      // contents (JSON-LD SEO markup) in place, which is what leaked raw
      // "{"@context":...}" JSON into evidence before this fix.
      const visibleText = extractVisibleText(cheerio.load(res.text));
      if (!visibleText.toLowerCase().includes(ctx.companyName.toLowerCase())) return null;

      // Never fabricate a sentence claiming what the page shows — if we can't
      // extract real surrounding text for the match, there's no evidence here.
      const snippet = snippetAroundKeyword(visibleText, [ctx.companyName]);
      if (!snippet) return null;

      const candidate: EvidenceCandidate = {
        sourceUrl: res.url,
        sourceType: "marketplace",
        title: `${target.label} listing`,
        snippet: normalizeWhitespace(snippet),
        scrapedAt: nowIso(),
      };
      return candidate;
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value) candidates.push(result.value);
  }

  return candidates;
}

export const marketplaceScraper: Scraper = { name: "marketplace", run };

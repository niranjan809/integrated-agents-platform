import { withPage } from "./browser.js";
import { resolveUrl, snippetAroundKeyword, nowIso } from "./textUtils.js";
import { getCustomKeywords } from "./customRules.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "pricing";

// Broadened default keyword lists (#1) — more phrasing variants directly
// increase how often real pricing signals get matched.
export const FREE_TIER_KEYWORDS = [
  "free forever",
  "no credit card required",
  "start for free",
  "free plan",
  "$0",
  "free tier",
  "always free",
  "build for free",
  "free to start",
  "free tokens",
  "credits on signup",
  "developer sandbox",
  "playground",
  "bring your own key",
  "individual plan",
  "starter plan",
  "community plan",
  "developer plan",
  "quickstart",
  "guided setup",
  "interactive demo",
  "demo workspace",
  "free credits",
  "magic link",
  "getting started",
  "clone project",
  "deploy now",
  "build in minutes",
  "import example",
  "sample project",
  "product tour",
  "guided tour",
  "interactive onboarding",
  "free trial",
  "no credit card",
  "quick start",
  "self signup",
  "prompt playground",
  "example gallery",
  "public sandbox",
  "guided onboarding",
  "interactive walkthrough",
  "import wizard",
  "migration wizard",
  "sample data",
  "starter kit",
  "free api key",
];
export const USAGE_BASED_KEYWORDS = [
  "per minute",
  "per api call",
  "per token",
  "per million tokens",
  "per compute hour",
  "pay per",
  "pay as you go",
  "usage-based",
  "credits",
  "per request",
  "per generation",
  "metered billing",
  "metered pricing",
  "per seat",
  "per user",
  "billed annually",
  "monthly plan",
  "overage fees",
  "hard limit",
  "soft cap",
  "unlimited generation",
  "add-on features",
  "top up",
  "spend limit",
  "platform fee",
  "pricing calculator",
  "consumption pricing",
  "credit-based",
  "credit based",
  "usage credits",
  "usage meter",
  "credit wallet",
  "pay yearly",
  "billing dashboard",
  "usage based",
  "overage",
];
export const ENTERPRISE_KEYWORDS = [
  "custom pricing",
  "contact us for pricing",
  "contact sales",
  "get a quote",
  "talk to sales",
  "speak to sales",
  "book a call",
  "request pricing",
  "custom terms",
  "procurement",
  "volume discounts",
  "custom sla",
  "dedicated instance",
  "private cloud deployment",
  "soc 2",
  "soc2",
  "iso 27001",
  "iso27001",
  "hipaa",
  "msa",
  "legal review",
  "pilot program",
  "proof of concept",
  "solutions engineer",
  "dedicated support",
  "dedicated csm",
  "professional services",
  "enterprise pricing",
  "sales team",
  "enterprise success",
  "customer success",
  "request quote",
  "single sign-on",
  "saml",
  "scim",
  "vpc",
];

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const url = resolveUrl(ctx.website, "/pricing");
  const customKeywords = await getCustomKeywords(SCRAPER_NAME, ctx.companyId);

  return withPage(async (page) => {
    const candidates: EvidenceCandidate[] = [];
    const response = await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" }).catch(() => null);
    if (!response || !response.ok()) return [];

    const text = await page.innerText("body").catch(() => "");
    if (!text) return [];

    const freeSnippet = snippetAroundKeyword(text, FREE_TIER_KEYWORDS);
    if (freeSnippet) {
      candidates.push({ sourceUrl: url, sourceType: "pricing_page", title: "Free tier", snippet: freeSnippet, scrapedAt: nowIso() });
    }

    const usageSnippet = snippetAroundKeyword(text, USAGE_BASED_KEYWORDS);
    if (usageSnippet) {
      candidates.push({ sourceUrl: url, sourceType: "pricing_page", title: "Usage-based pricing", snippet: usageSnippet, scrapedAt: nowIso() });
    }

    const enterpriseSnippet = snippetAroundKeyword(text, ENTERPRISE_KEYWORDS);
    if (enterpriseSnippet) {
      candidates.push({ sourceUrl: url, sourceType: "pricing_page", title: "Enterprise / custom pricing", snippet: enterpriseSnippet, scrapedAt: nowIso() });
    }

    if (customKeywords.length > 0) {
      const customSnippet = snippetAroundKeyword(text, customKeywords);
      if (customSnippet) {
        candidates.push({ sourceUrl: url, sourceType: "pricing_page", title: "Custom pricing signal", snippet: customSnippet, scrapedAt: nowIso() });
      }
    }

    return candidates;
  });
}

export const pricingScraper: Scraper = { name: SCRAPER_NAME, run };

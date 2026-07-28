import * as cheerio from "cheerio";
import { fetchText } from "./httpClient.js";
import { resolveUrl, normalizeWhitespace, extractVisibleText, nowIso } from "./textUtils.js";
import { getCustomPaths } from "./customRules.js";
import { fetchSitemapUrls, filterUrlsByKeywords } from "./sitemap.js";
import { extractArticleSnippet } from "./articleText.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "resources";

// Broadened default paths (#1).
export const PATHS: Array<{ path: string; sourceType: string; label: string }> = [
  { path: "/case-studies", sourceType: "case_studies", label: "Case studies" },
  { path: "/customers", sourceType: "case_studies", label: "Customer stories" },
  { path: "/roi", sourceType: "roi_calculator", label: "ROI calculator" },
  { path: "/security", sourceType: "trust_page", label: "Security / trust page" },
  { path: "/resources", sourceType: "sales_resources", label: "Sales resource hub" },
  { path: "/trust-center", sourceType: "trust_page", label: "Trust center" },
  { path: "/whitepapers", sourceType: "sales_resources", label: "Whitepapers" },
  { path: "/guides", sourceType: "sales_resources", label: "Guides" },
  { path: "/solutions", sourceType: "sales_resources", label: "Solutions" },
  { path: "/compliance", sourceType: "trust_page", label: "Compliance" },
  { path: "/webinars", sourceType: "demand_gen", label: "Webinars" },
  { path: "/events", sourceType: "demand_gen", label: "Events" },
  { path: "/reports", sourceType: "sales_resources", label: "Reports" },
  { path: "/datasheets", sourceType: "sales_resources", label: "Datasheets" },
  { path: "/media-kit", sourceType: "sales_resources", label: "Media kit" },
  { path: "/playbooks", sourceType: "demand_gen", label: "Playbooks" },
  { path: "/checklists", sourceType: "demand_gen", label: "Checklists" },
  { path: "/newsletter", sourceType: "demand_gen", label: "Newsletter" },
];

// Which of these actually signal Demand Generation rather than Sales
// Enablement — used below to tag sitemap-discovered pages accurately instead
// of lumping every sitemap hit under "sales_resources".
const DEMAND_GEN_SITEMAP_KEYWORDS = [
  "webinar",
  "ebook",
  "playbook",
  "checklist",
  "workbook",
  "toolkit",
  "newsletter",
  "assessment",
  "benchmark-report",
  "research-report",
  "industry-report",
  "cheat-sheet",
  "workshop",
  "masterclass",
  "roundtable",
  "office-hours",
  "free-consultation",
  "conference",
  "summit",
  "meetup",
  "hackathon",
  "roadshow",
  "fireside-chat",
  "virtual-event",
  "academy",
  "certification",
  "course",
  "tutorial",
  "learning-center",
];

const SITEMAP_KEYWORDS = [
  "case-stud",
  "customer-stor",
  "success-stor",
  "security",
  "trust",
  "roi",
  "solutions",
  "tco",
  "gdpr",
  "hipaa",
  "compliance",
  "buyer",
  "datasheet",
  "solution-brief",
  "one-pager",
  "media-kit",
  "migration-guide",
  "business-case",
  "implementation-guide",
  "technical-guide",
  "architecture-guide",
  "executive-summary",
  "business-value",
  "procurement-kit",
  "enterprise-guide",
  "whitepaper",
  "testimonial",
  "industr",
  "vertical",
  ...DEMAND_GEN_SITEMAP_KEYWORDS,
];

async function scrapeCandidate(
  url: string,
  label: string,
  sourceType: string
): Promise<EvidenceCandidate | null> {
  const res = await fetchText(url);
  if (!res.ok || !res.text) return null;

  const articleText = await extractArticleSnippet(url, res.text);
  const bodyText = articleText ?? normalizeWhitespace(extractVisibleText(cheerio.load(res.text))).slice(0, 300);
  if (!bodyText) return null;

  return { sourceUrl: url, sourceType, title: label, snippet: bodyText, scrapedAt: nowIso() };
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const customPaths = await getCustomPaths(SCRAPER_NAME, ctx.companyId);
  const guessed = [
    ...PATHS,
    ...customPaths.map((path) => ({ path, sourceType: "sales_resources", label: `Custom path: ${path}` })),
  ].map(({ path, sourceType, label }) => ({ url: resolveUrl(ctx.website, path), sourceType, label }));

  // Sitemap-discovered URLs (#2) find the real page even when it's not at any
  // guessed path (e.g. "/our-customers" instead of "/customers").
  const sitemapUrls = await fetchSitemapUrls(ctx.website, SITEMAP_KEYWORDS);
  const relevant = filterUrlsByKeywords(sitemapUrls, SITEMAP_KEYWORDS).map((url) => {
    const isDemandGen = DEMAND_GEN_SITEMAP_KEYWORDS.some((kw) => url.toLowerCase().includes(kw));
    return { url, sourceType: isDemandGen ? "demand_gen" : "sales_resources", label: "Discovered via sitemap" };
  });

  const seen = new Set<string>();
  const candidates: EvidenceCandidate[] = [];

  const results = await Promise.allSettled(
    [...guessed, ...relevant].map(({ url, sourceType, label }) => scrapeCandidate(url, label, sourceType))
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value && !seen.has(result.value.sourceUrl)) {
      seen.add(result.value.sourceUrl);
      candidates.push(result.value);
    }
  }

  return candidates;
}

export const resourcesScraper: Scraper = { name: SCRAPER_NAME, run };

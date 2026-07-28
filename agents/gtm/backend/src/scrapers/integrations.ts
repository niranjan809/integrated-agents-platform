import * as cheerio from "cheerio";
import { fetchRendered } from "./browserFetch.js";
import { resolveUrl, normalizeWhitespace, extractVisibleText, nowIso } from "./textUtils.js";
import { getCustomPaths } from "./customRules.js";
import type { EvidenceCandidate, Scraper, ScraperContext } from "../types.js";

const SCRAPER_NAME = "integrations";

// Broadened default paths (#1) — some sites call this page "/apps" or
// "/marketplace" instead of "/integrations".
export const PATHS = [
  "/integrations",
  "/apps",
  "/marketplace",
  "/connectors",
  "/plugins",
  "/developers",
  "/webhooks",
  "/templates",
  "/extensions",
  "/mcp",
  "/sdk",
];

// Named ecosystem platforms — a fallback for pages that list integrations as
// plain text/links rather than logo grids with alt text (the primary check
// below), so a page built without <img alt> tags still yields real evidence.
const NAMED_PLATFORMS = [
  "Zapier",
  "Make",
  "n8n",
  "Slack",
  "HubSpot",
  "Salesforce",
  "Microsoft Teams",
  "Notion",
  "Model Context Protocol",
  "MCP",
  "OpenAPI",
  "GraphQL",
  "Python SDK",
  "Node SDK",
  "Java SDK",
];

async function scrapeCandidate(url: string): Promise<EvidenceCandidate | null> {
  // Rendered fetch — integration directories are frequently client-rendered
  // grids that a plain fetch would see as an empty container.
  const res = await fetchRendered(url);
  if (!res.ok || !res.html) return null;

  const $ = cheerio.load(res.html);
  const names = new Set<string>();

  $("img[alt]").each((_, el) => {
    const alt = normalizeWhitespace($(el).attr("alt") ?? "");
    if (alt && alt.length < 40 && !/logo|icon/i.test(alt)) names.add(alt);
  });

  if (names.size > 0) {
    const sample = Array.from(names).slice(0, 15).join(", ");
    return {
      sourceUrl: url,
      sourceType: "integrations_page",
      title: "Integration ecosystem",
      snippet: `Integrations page lists ${names.size}+ integrations, including: ${sample}.`,
      scrapedAt: nowIso(),
    };
  }

  // Fallback: no logo grid found — check for named platforms mentioned in
  // the page's visible text instead.
  const bodyText = extractVisibleText($);
  const mentioned = NAMED_PLATFORMS.filter((name) => bodyText.toLowerCase().includes(name.toLowerCase()));
  if (mentioned.length === 0) return null;

  return {
    sourceUrl: url,
    sourceType: "integrations_page",
    title: "Integration ecosystem",
    snippet: `Page mentions integration/ecosystem support for: ${mentioned.join(", ")}.`,
    scrapedAt: nowIso(),
  };
}

async function run(ctx: ScraperContext): Promise<EvidenceCandidate[]> {
  const customPaths = await getCustomPaths(SCRAPER_NAME, ctx.companyId);
  const candidateUrls = [...PATHS, ...customPaths].map((path) => resolveUrl(ctx.website, path));

  for (const url of candidateUrls) {
    const result = await scrapeCandidate(url);
    if (result) return [result];
  }

  return [];
}

export const integrationsScraper: Scraper = { name: SCRAPER_NAME, run };

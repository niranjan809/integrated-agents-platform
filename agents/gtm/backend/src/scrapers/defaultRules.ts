import { FREE_TIER_KEYWORDS, USAGE_BASED_KEYWORDS, ENTERPRISE_KEYWORDS } from "./pricing.js";
import { PLG_CTA_PATTERNS, SALES_CTA_PATTERNS } from "./homepageCta.js";
import { ROLE_KEYWORDS } from "./careersGtm.js";
import { PATHS as PARTNER_PATHS } from "./partners.js";
import { PATHS as RESOURCE_PATHS } from "./resources.js";
import { PATHS as INTEGRATION_PATHS } from "./integrations.js";
import { PATHS as PLG_PATHS } from "./plgPages.js";
import { PATHS as SALES_PATHS } from "./salesPages.js";
import { TOOL_SIGNATURES } from "./techStack.js";
import { OWN_SITE_KEYWORDS, THIRD_PARTY_KEYWORDS } from "./comparisonPages.js";
import { LAUNCH_KEYWORDS } from "./news.js";
import { PARTNERSHIP_PRESS_KEYWORDS } from "./pressRelease.js";
import { TARGETS as MARKETPLACE_TARGETS } from "./marketplace.js";
import { PERSONA_TARGETS } from "./personaTargeting.js";
import { OPEN_SOURCE_KEYWORDS } from "./openSource.js";

export interface DefaultRule {
  scraperName: string;
  ruleType: "keyword" | "path";
  value: string;
  label?: string;
  // Which GTM category(ies) this keyword/path feeds — a rule can belong to
  // more than one category (e.g. a "free tier" pricing keyword is both PLG
  // and Pricing & Packaging evidence). Empty when a scraper's list is too
  // mixed to attribute to specific categories (e.g. GTM job-role keywords
  // span several categories at once).
  categories: string[];
}

function keywords(scraperName: string, values: string[], categories: string[], label?: string): DefaultRule[] {
  return values.map((value) => ({ scraperName, ruleType: "keyword", value, label, categories }));
}

function paths(scraperName: string, values: string[], categories: string[]): DefaultRule[] {
  return values.map((value) => ({ scraperName, ruleType: "path", value, categories }));
}

// Sales Enablement content lives at most resource paths; a "demand_gen"
// sourceType marks the handful (webinars, playbooks, newsletter…) that are
// really Demand Generation instead.
const RESOURCE_RULES: DefaultRule[] = RESOURCE_PATHS.map(({ path, sourceType }) => ({
  scraperName: "resources",
  ruleType: "path",
  value: path,
  categories: [sourceType === "demand_gen" ? "Demand Generation" : "Sales Enablement"],
}));

const TECH_STACK_RULES: DefaultRule[] = TOOL_SIGNATURES.map((tool) => ({
  scraperName: "tech_stack",
  ruleType: "keyword",
  value: tool.label,
  label: `Third-party tool (${tool.hint})`,
  categories: [tool.category],
}));

const COMPARISON_KEYWORDS = Array.from(new Set([...OWN_SITE_KEYWORDS, ...THIRD_PARTY_KEYWORDS]));

// Built-in keyword/path lists already hardcoded in each scraper — these are
// what actually run today. Detection Rules added via the UI only ever add to
// this list, never replace it.
export const DEFAULT_RULES: DefaultRule[] = [
  ...keywords("pricing", FREE_TIER_KEYWORDS, ["Product-Led Growth", "Pricing & Packaging Strategy"], "Free tier"),
  ...keywords(
    "pricing",
    USAGE_BASED_KEYWORDS,
    ["Product-Led Growth", "Pricing & Packaging Strategy"],
    "Usage-based pricing"
  ),
  ...keywords(
    "pricing",
    ENTERPRISE_KEYWORDS,
    ["Sales-Led Growth", "Pricing & Packaging Strategy"],
    "Enterprise / custom pricing"
  ),
  ...keywords(
    "homepage_cta",
    PLG_CTA_PATTERNS.map((p) => p.source.replace(/\\/g, "")),
    ["Product-Led Growth"],
    "PLG CTA"
  ),
  ...keywords(
    "homepage_cta",
    SALES_CTA_PATTERNS.map((p) => p.source.replace(/\\/g, "")),
    ["Sales-Led Growth"],
    "Sales CTA"
  ),
  // GTM job listings span several motions at once (an SDR role is Sales-Led,
  // a Growth Engineer role is PLG, a Partnerships Manager role is
  // Partnership Marketing) — tagged with every category it can signal.
  ...keywords(
    "careers_gtm",
    ROLE_KEYWORDS,
    ["Sales-Led Growth", "Product-Led Growth", "Partnership Marketing", "Demand Generation"]
  ),
  ...paths("partners", PARTNER_PATHS, ["Partnership Marketing"]),
  ...RESOURCE_RULES,
  ...paths("integrations", INTEGRATION_PATHS, ["Ecosystem & Integration Marketing"]),
  ...paths("plg_pages", PLG_PATHS, ["Product-Led Growth"]),
  ...paths("sales_pages", SALES_PATHS, ["Sales-Led Growth"]),
  ...TECH_STACK_RULES,
  ...keywords("comparison_pages", COMPARISON_KEYWORDS, ["Competitive Positioning"]),
  ...keywords("news", LAUNCH_KEYWORDS, ["Launch Marketing"]),
  ...keywords("press_release", PARTNERSHIP_PRESS_KEYWORDS, ["Partnership Marketing"]),
  ...keywords("persona_targeting", PERSONA_TARGETS, ["Buyer Persona Targeting"]),
  ...keywords("open_source", OPEN_SOURCE_KEYWORDS, ["Open-Source & Open-Weights GTM"]),
  ...paths(
    "marketplace",
    MARKETPLACE_TARGETS.map((t) => t.label),
    ["Marketplace Marketing"]
  ),
];

// GTM categories are now stored in the gtm_categories table and editable at
// runtime (see db/categories.repo.ts), so the name is just a string, not a
// fixed literal union. This is the seed list used to populate that table the
// first time the app runs — it is not the authoritative list afterward.
export type GtmCategoryName = string;

export const DEFAULT_GTM_CATEGORIES: string[] = [
  "Product-Led Growth",
  "Sales-Led Growth",
  "Pricing & Packaging Strategy",
  "Launch Marketing",
  "Ecosystem & Integration Marketing",
  "Marketplace Marketing",
  "Partnership Marketing",
  "Competitive Positioning",
  "Demand Generation",
  "Sales Enablement",
  "Buyer Persona Targeting",
  "Open-Source & Open-Weights GTM",
];

export interface GtmCategory {
  id: string;
  name: string;
  createdAt: string;
}

export type CompanyStatus =
  | "pending"
  | "discovering"
  | "scraping"
  | "classifying"
  | "aggregating"
  | "done"
  | "failed";

export type CompanyScope = "Global" | "Regional";

export interface Company {
  id: string;
  name: string;
  website: string | null;
  segment: string | null;
  phSlug: string | null;
  scope: CompanyScope | null;
  hqCountry: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string | null;
}

export interface Evidence {
  id: string;
  companyId: string;
  sourceUrl: string;
  sourceType: string;
  title: string | null;
  snippet: string;
  scrapedAt: string;
  gtmCategory: GtmCategoryName | null;
  confidence: number | null;
  classificationReasoning: string | null;
}

export interface GtmStrategy {
  id: string;
  companyId: string;
  categoryName: GtmCategoryName;
  evidenceCount: number;
  firstSeen: string | null;
  lastUpdated: string | null;
}

export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobStep = "discovering" | "scraping" | "classifying" | "aggregating" | "done";

export interface ScrapeJob {
  id: string;
  companyId: string;
  status: JobStatus;
  currentStep: JobStep | null;
  startedAt: string | null;
  completedAt: string | null;
  errorMsg: string | null;
}

// --- Scraper contract ---

export interface EvidenceCandidate {
  sourceUrl: string;
  sourceType: string;
  title: string | null;
  snippet: string; // raw text only, no LLM involvement at this stage
  scrapedAt: string;
}

export interface ScraperContext {
  companyId: string;
  companyName: string;
  website: string;
  phSlug: string | null;
}

export interface Scraper {
  name: string;
  run(ctx: ScraperContext): Promise<EvidenceCandidate[]>;
}

// --- Detection rules (user-added scraper keyword/path extensions) ---

export type RuleType = "keyword" | "path";

export interface DetectionRule {
  id: string;
  scraperName: string;
  ruleType: RuleType;
  value: string;
  category: GtmCategoryName | null;
  companyId: string | null; // null = applies to every company
  createdAt: string;
}

// --- Classifier contract ---

export interface ClassificationResult {
  gtmCategory: GtmCategoryName | null;
  confidence: number;
  reasoning: string;
}

// --- Editable LLM prompt templates ---

export interface Prompt {
  id: string;
  key: string;
  name: string;
  template: string;
  updatedAt: string;
}

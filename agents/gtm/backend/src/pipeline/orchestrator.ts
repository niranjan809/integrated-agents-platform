import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import { scrapers } from "../scrapers/index.js";
import { discoverCompany } from "../scrapers/discovery.js";
import { fetchRendered } from "../scrapers/browserFetch.js";
import { normalizeWhitespace, isLikelyNonEnglish } from "../scrapers/textUtils.js";
import { classifyBatch } from "../classifier/classifyBatch.js";
import { classifyCompanyScope } from "../classifier/scope.js";
import { classifyCompanySegment } from "../classifier/segment.js";
import { classifyCompanyCountry } from "../classifier/country.js";
import { config } from "../config.js";
import * as companiesRepo from "../db/companies.repo.js";
import * as evidenceRepo from "../db/evidence.repo.js";
import * as gtmStrategiesRepo from "../db/gtmStrategies.repo.js";
import * as scrapeJobsRepo from "../db/scrapeJobs.repo.js";
import type { EvidenceCandidate, GtmCategoryName } from "../types.js";
import type { ClassifiedEvidence } from "../db/evidence.repo.js";

const SCRAPER_CONCURRENCY = 8;

/** Same evidence appearing under different sources (e.g. a press release
 *  syndicated across multiple sites, or the same phrase caught by two
 *  scrapers) collapses into one row — keeps the first occurrence found. */
function dedupeCandidatesByText(candidates: EvidenceCandidate[]): EvidenceCandidate[] {
  const seen = new Set<string>();
  const deduped: EvidenceCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeWhitespace(candidate.snippet).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

export async function runAnalysis(companyId: string): Promise<void> {
  const jobId = randomUUID();
  await scrapeJobsRepo.create({ id: jobId, companyId, status: "running", currentStep: "discovering" });
  await companiesRepo.updateCompanyStatus(companyId, "discovering");

  try {
    const company = await companiesRepo.getCompany(companyId);
    if (!company) throw new Error(`Company ${companyId} not found`);

    // 1. discovering
    const ctx = await discoverCompany(companyId, company.name, company.website);
    await scrapeJobsRepo.updateStep(jobId, "scraping");
    await companiesRepo.updateCompanyStatus(companyId, "scraping");

    // 2. scraping — isolated failures via allSettled, capped concurrency.
    // The homepage is also fetched once here (concurrently, not sequentially)
    // as one input to scope/segment classification below.
    const scraperLimit = pLimit(SCRAPER_CONCURRENCY);
    const [results, homepage] = await Promise.all([
      Promise.allSettled(scrapers.map((s) => scraperLimit(() => s.run(ctx)))),
      // Generous timeout + retries: this competes for the same global
      // Playwright page-slot limit as the scrapers above, so under load a
      // page load can time out waiting its turn rather than the site itself
      // being slow. Some sites (e.g. openai.com) also return 403 to any
      // headless browser regardless of retries — that's the site's own
      // anti-bot policy, not something worth working around here. Either
      // way, a null result just means the homepage contributes nothing to
      // scope/segment below; the other scraped sources still can.
      fetchRendered(ctx.website, 25_000, 2).catch(() => null),
    ]);

    const rawCandidates: EvidenceCandidate[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        rawCandidates.push(...result.value);
      } else {
        console.warn(`Scraper "${scrapers[i].name}" failed:`, result.reason);
      }
    });
    // Drop evidence dominated by a non-Latin script (Arabic, CJK, Cyrillic,
    // Hebrew, Thai, Devanagari...) before it ever reaches classification —
    // catches a homepage whose default content is simply in another
    // language, or a non-English press/news search result, neither of which
    // the sitemap's locale-*path* filter (partners.ts/resources.ts) covers.
    const englishCandidates = rawCandidates.filter((c) => !isLikelyNonEnglish(c.snippet));
    const candidates = dedupeCandidatesByText(englishCandidates);

    // Scope/segment classification reads homepage text PLUS a sample of
    // everything else scraped (careers, news, marketplace, GitHub, etc.) —
    // not homepage-only. This matters most exactly when the homepage alone
    // is unavailable (e.g. blocked by anti-bot protection) but other public
    // sources we successfully scraped still carry a real geographic or
    // product-category signal.
    const homepageText = homepage?.ok ? homepage.text : "";
    const supplementalText = candidates
      .slice(0, 20)
      .map((c) => c.snippet)
      .join(" ");
    const companyText = normalizeWhitespace(`${homepageText} ${supplementalText}`);

    const [scope, segment, hqCountry] = await Promise.all([
      classifyCompanyScope(ctx.companyName, companyText).catch(() => null),
      classifyCompanySegment(ctx.companyName, companyText).catch(() => null),
      classifyCompanyCountry(ctx.companyName, companyText).catch(() => null),
    ]);
    await companiesRepo.updateCompanyScope(companyId, scope);
    await companiesRepo.updateCompanySegmentIfMissing(companyId, segment);
    await companiesRepo.updateCompanyCountryIfMissing(companyId, hqCountry);

    // 3. classifying
    await scrapeJobsRepo.updateStep(jobId, "classifying");
    await companiesRepo.updateCompanyStatus(companyId, "classifying");
    const classified: ClassifiedEvidence[] = await classifyBatch(ctx, candidates);

    // clear previous evidence/strategies so re-analysis doesn't duplicate
    await evidenceRepo.deleteByCompany(companyId);
    await gtmStrategiesRepo.deleteByCompany(companyId);
    await evidenceRepo.insertMany(companyId, classified);

    // 4. aggregating — only confidence >= threshold rolls into gtm_strategies
    await scrapeJobsRepo.updateStep(jobId, "aggregating");
    await companiesRepo.updateCompanyStatus(companyId, "aggregating");

    const counts = new Map<GtmCategoryName, number>();
    for (const item of classified) {
      const { gtmCategory, confidence } = item.classification;
      if (gtmCategory && confidence >= config.confidenceThreshold) {
        counts.set(gtmCategory, (counts.get(gtmCategory) ?? 0) + 1);
      }
    }
    for (const [category, count] of counts) {
      await gtmStrategiesRepo.upsertStrategy(companyId, category, count);
    }

    await scrapeJobsRepo.complete(jobId, "done");
    await companiesRepo.updateCompanyStatus(companyId, "done");
  } catch (err) {
    await scrapeJobsRepo.fail(jobId, String(err));
    await companiesRepo.updateCompanyStatus(companyId, "failed");
  }
}

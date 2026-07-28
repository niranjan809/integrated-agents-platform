import * as detectionRulesRepo from "../db/detectionRules.repo.js";

export async function getCustomKeywords(scraperName: string, companyId?: string): Promise<string[]> {
  return detectionRulesRepo.listByScraperAndType(scraperName, "keyword", companyId);
}

export async function getCustomPaths(scraperName: string, companyId?: string): Promise<string[]> {
  return detectionRulesRepo.listByScraperAndType(scraperName, "path", companyId);
}

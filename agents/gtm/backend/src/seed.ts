import { randomUUID } from "node:crypto";
import { KNOWN_COMPANIES } from "./knownCompanies.js";
import * as companiesRepo from "./db/companies.repo.js";
import { runAnalysis } from "./pipeline/orchestrator.js";

/**
 * Ensures the hardcoded demo companies exist and kicks off analysis for any
 * that haven't completed yet, so the dashboard is populated without requiring
 * manual "Add company" clicks.
 */
export async function seedKnownCompanies(): Promise<void> {
  const existing = await companiesRepo.listCompanies();

  for (const known of KNOWN_COMPANIES) {
    let company = existing.find((c) => c.name.toLowerCase() === known.name.toLowerCase());

    if (!company) {
      company = await companiesRepo.insertCompany({ id: randomUUID(), name: known.name, segment: known.segment });
      await companiesRepo.updateCompanyDiscovery(company.id, { website: known.website });
    }

    // Any non-"done" status is safe to re-trigger on a fresh process boot: no
    // prior in-flight runAnalysis() promise can still be running, since Node
    // processes (and any work they were doing) don't survive a restart. This
    // also recovers companies left stuck mid-pipeline by a dev-server reload.
    if (company.status !== "done") {
      void runAnalysis(company.id).catch((err) => {
        console.error(`Seed analysis failed for ${known.name}:`, err);
      });
    }
  }
}

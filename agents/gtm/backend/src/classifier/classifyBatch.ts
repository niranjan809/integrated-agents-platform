import pLimit from "p-limit";
import { classifyEvidence } from "./classify.js";
import * as categoriesRepo from "../db/categories.repo.js";
import type { EvidenceCandidate, ScraperContext } from "../types.js";
import type { ClassifiedEvidence } from "../db/evidence.repo.js";

const CLASSIFY_CONCURRENCY = 5;

export async function classifyBatch(
  ctx: ScraperContext,
  candidates: EvidenceCandidate[]
): Promise<ClassifiedEvidence[]> {
  // Fetched once per batch (not per item) — the category list rarely changes
  // mid-run, and this avoids hundreds of redundant DB round trips.
  const categoryNames = await categoriesRepo.listNames();

  const limit = pLimit(CLASSIFY_CONCURRENCY);
  return Promise.all(
    candidates.map((candidate) =>
      limit(async () => ({
        candidate,
        classification: await classifyEvidence(ctx, candidate, categoryNames),
      }))
    )
  );
}

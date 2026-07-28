import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import * as categoriesRepo from "../db/categories.repo.js";
import { KNOWN_COMPANIES } from "../knownCompanies.js";
import { scrapers } from "../scrapers/index.js";

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/meta", async () => {
    return {
      llmModel: config.llmModel,
      confidenceThreshold: config.confidenceThreshold,
      categories: await categoriesRepo.listNames(),
      knownCompanies: KNOWN_COMPANIES,
      scrapers: scrapers.map((s) => s.name),
    };
  });
}

import type { FastifyInstance } from "fastify";
import * as gtmStrategiesRepo from "../db/gtmStrategies.repo.js";
import * as evidenceRepo from "../db/evidence.repo.js";
import { CompanyIdParamsSchema, StrategyCategoryParamsSchema } from "../schemas/api.schemas.js";

export async function strategiesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/companies/:id/strategies", async (req) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    return gtmStrategiesRepo.listByCompany(id);
  });

  app.get("/api/companies/:id/strategies/:cat", async (req) => {
    const { id, cat } = StrategyCategoryParamsSchema.parse(req.params);
    return evidenceRepo.listByCategory(id, cat);
  });
}

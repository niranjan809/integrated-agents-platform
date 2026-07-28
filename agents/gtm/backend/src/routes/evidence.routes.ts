import type { FastifyInstance } from "fastify";
import * as evidenceRepo from "../db/evidence.repo.js";
import { CompanyIdParamsSchema, EvidenceQuerySchema, EvidenceSearchQuerySchema } from "../schemas/api.schemas.js";

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/companies/:id/evidence", async (req) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    const { limit, offset } = EvidenceQuerySchema.parse(req.query);
    return evidenceRepo.listByCompany(id, { limit, offset });
  });

  // Cross-company search over already-classified evidence — answers
  // "which companies mention X" instead of only ever drilling into one
  // company at a time.
  app.get("/api/evidence/search", async (req) => {
    const { q, category, sourceType, limit } = EvidenceSearchQuerySchema.parse(req.query);
    return evidenceRepo.searchAcrossCompanies({ q, category, sourceType, limit });
  });
}

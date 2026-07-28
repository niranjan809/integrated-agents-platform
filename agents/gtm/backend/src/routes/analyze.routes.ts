import type { FastifyInstance } from "fastify";
import * as companiesRepo from "../db/companies.repo.js";
import { runAnalysis } from "../pipeline/orchestrator.js";
import { CompanyIdParamsSchema } from "../schemas/api.schemas.js";

export async function analyzeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/companies/:id/analyze", async (req, reply) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    const company = await companiesRepo.getCompany(id);
    if (!company) return reply.code(404).send({ error: "Company not found" });

    // Fire-and-forget: runAnalysis handles its own try/catch and writes failures to scrape_jobs.
    void runAnalysis(id).catch((err) => {
      app.log.error(err, `Unexpected error running analysis for company ${id}`);
    });

    return reply.code(202).send({ message: "Analysis started", companyId: id });
  });
}

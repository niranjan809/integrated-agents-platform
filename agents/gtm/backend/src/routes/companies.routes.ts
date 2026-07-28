import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import * as companiesRepo from "../db/companies.repo.js";
import * as scrapeJobsRepo from "../db/scrapeJobs.repo.js";
import * as evidenceRepo from "../db/evidence.repo.js";
import * as gtmStrategiesRepo from "../db/gtmStrategies.repo.js";
import * as detectionRulesRepo from "../db/detectionRules.repo.js";
import { CreateCompanySchema, CompanyIdParamsSchema, UpdateCompanySchema } from "../schemas/api.schemas.js";

export async function companiesRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/companies", async (req, reply) => {
    const body = CreateCompanySchema.parse(req.body);
    const company = await companiesRepo.insertCompany({
      id: randomUUID(),
      name: body.name,
      segment: body.segment,
      website: body.website,
    });
    return reply.code(201).send(company);
  });

  app.get("/api/companies", async () => {
    return companiesRepo.listCompanies();
  });

  app.get("/api/companies/:id", async (req, reply) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    const company = await companiesRepo.getCompany(id);
    if (!company) return reply.code(404).send({ error: "Company not found" });
    return company;
  });

  app.patch("/api/companies/:id", async (req, reply) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    const body = UpdateCompanySchema.parse(req.body);

    const existing = await companiesRepo.getCompany(id);
    if (!existing) return reply.code(404).send({ error: "Company not found" });

    await companiesRepo.updateCompanyDetails(id, body);
    return companiesRepo.getCompany(id);
  });

  app.delete("/api/companies/:id", async (req, reply) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    const existing = await companiesRepo.getCompany(id);
    if (!existing) return reply.code(404).send({ error: "Company not found" });

    // Cascade: SQLite doesn't enforce ON DELETE CASCADE here, so clear
    // dependent rows explicitly before removing the company itself.
    await evidenceRepo.deleteByCompany(id);
    await gtmStrategiesRepo.deleteByCompany(id);
    await scrapeJobsRepo.deleteByCompany(id);
    await detectionRulesRepo.deleteByCompany(id);
    await companiesRepo.deleteCompany(id);

    return reply.code(204).send();
  });

  app.get("/api/companies/:id/status", async (req, reply) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    const job = await scrapeJobsRepo.getLatestForCompany(id);
    if (!job) return reply.code(404).send({ error: "No job found for this company" });
    return job;
  });
}

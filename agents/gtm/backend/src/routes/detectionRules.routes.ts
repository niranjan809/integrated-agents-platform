import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as detectionRulesRepo from "../db/detectionRules.repo.js";
import * as companiesRepo from "../db/companies.repo.js";
import type { GtmCategoryName } from "../types.js";
import { scrapers } from "../scrapers/index.js";
import { DEFAULT_RULES } from "../scrapers/defaultRules.js";

const ScraperNameSchema = z.enum(scrapers.map((s) => s.name) as [string, ...string[]]);

const CreateRuleSchema = z.object({
  scraperName: ScraperNameSchema,
  ruleType: z.enum(["keyword", "path"]),
  value: z.string().min(1).max(200),
  // Categories are user-editable (see categories.routes.ts), so this is a
  // plain string, not a compile-time enum — it's informational only anyway,
  // it never gates what the LLM classifier is allowed to choose.
  category: z.string().nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
});

const RuleIdParamsSchema = z.object({ id: z.string().min(1) });
const CompanyIdParamsSchema = z.object({ id: z.string().min(1) });

export async function detectionRulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/detection-rules", async () => {
    return detectionRulesRepo.listAll();
  });

  app.post("/api/detection-rules", async (req, reply) => {
    const body = CreateRuleSchema.parse(req.body);

    if (body.companyId) {
      const company = await companiesRepo.getCompany(body.companyId);
      if (!company) return reply.code(404).send({ error: "Company not found" });
    }

    const rule = await detectionRulesRepo.insert({
      scraperName: body.scraperName,
      ruleType: body.ruleType,
      value: body.value.trim(),
      category: (body.category ?? null) as GtmCategoryName | null,
      companyId: body.companyId ?? null,
    });
    return reply.code(201).send(rule);
  });

  app.delete("/api/detection-rules/:id", async (req, reply) => {
    const { id } = RuleIdParamsSchema.parse(req.params);
    await detectionRulesRepo.remove(id);
    return reply.code(204).send();
  });

  app.get("/api/detection-rules/scrapers", async () => {
    return { scrapers: scrapers.map((s) => s.name) };
  });

  app.get("/api/detection-rules/defaults", async () => {
    return DEFAULT_RULES;
  });

  app.get("/api/companies/:id/detection-rules", async (req) => {
    const { id } = CompanyIdParamsSchema.parse(req.params);
    return detectionRulesRepo.listByCompany(id);
  });
}

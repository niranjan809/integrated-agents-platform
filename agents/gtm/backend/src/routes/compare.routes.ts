import type { FastifyInstance } from "fastify";
import * as companiesRepo from "../db/companies.repo.js";
import * as gtmStrategiesRepo from "../db/gtmStrategies.repo.js";
import * as categoriesRepo from "../db/categories.repo.js";
import { CompareQuerySchema } from "../schemas/api.schemas.js";

export async function compareRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/compare", async (req, reply) => {
    const { ids } = CompareQuerySchema.parse(req.query);
    const companyIds = ids.split(",").map((s) => s.trim()).filter(Boolean);

    const companies = await Promise.all(companyIds.map((id) => companiesRepo.getCompany(id)));
    const validCompanies = companies.filter((c): c is NonNullable<typeof c> => c !== null);
    if (validCompanies.length === 0) return reply.code(404).send({ error: "No matching companies found" });

    const [matrix, categoryNames] = await Promise.all([
      Promise.all(
        validCompanies.map(async (company) => {
          const strategies = await gtmStrategiesRepo.listByCompany(company.id);
          const byCategory: Record<string, number> = {};
          for (const s of strategies) byCategory[s.categoryName] = s.evidenceCount;
          return { companyId: company.id, companyName: company.name, categories: byCategory };
        })
      ),
      categoriesRepo.listNames(),
    ]);

    return { categories: categoryNames, companies: matrix };
  });

  app.get("/api/gtm/categories", async () => {
    return { categories: await categoriesRepo.listNames() };
  });
}

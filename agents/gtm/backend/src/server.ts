import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { migrate } from "./db/migrate.js";
import { markStaleRunningAsFailed } from "./db/scrapeJobs.repo.js";
import { companiesRoutes } from "./routes/companies.routes.js";
import { analyzeRoutes } from "./routes/analyze.routes.js";
import { strategiesRoutes } from "./routes/strategies.routes.js";
import { evidenceRoutes } from "./routes/evidence.routes.js";
import { compareRoutes } from "./routes/compare.routes.js";
import { metaRoutes } from "./routes/meta.routes.js";
import { detectionRulesRoutes } from "./routes/detectionRules.routes.js";
import { categoriesRoutes } from "./routes/categories.routes.js";
import { promptsRoutes } from "./routes/prompts.routes.js";
import { seedKnownCompanies } from "./seed.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Platform gate: when GTM_INTERNAL_SECRET is set (i.e. deployed behind the KiteAI
  // platform proxy), every /api request must carry the matching X-Internal-Secret
  // header — the proxy injects it server-side, so the browser never sees it. This
  // keeps GTM's otherwise-open API from being callable directly in production.
  // When the secret is NOT set (local/standalone dev), the API stays fully open.
  const INTERNAL_SECRET = process.env.GTM_INTERNAL_SECRET;
  if (INTERNAL_SECRET) {
    app.addHook("onRequest", async (req, reply) => {
      const path = (req.url || "").split("?")[0];
      if (path === "/health") return; // health probe stays open
      if (req.headers["x-internal-secret"] === INTERNAL_SECRET) return; // trusted proxy
      reply.code(401).send({ error: "Unauthorized" });
    });
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "Validation error", details: err.flatten() });
    }
    // Preserve a genuine 4xx from Fastify itself (e.g. malformed request body)
    // instead of masking it as a generic 500 — that's what made the real
    // "empty JSON body" bug look like an opaque server error to the client.
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ error: err instanceof Error ? err.message : "Bad request" });
    }
    app.log.error(err);
    return reply.code(500).send({ error: "Internal server error" });
  });

  await migrate();
  await markStaleRunningAsFailed(30);

  await app.register(companiesRoutes);
  await app.register(analyzeRoutes);
  await app.register(strategiesRoutes);
  await app.register(evidenceRoutes);
  await app.register(compareRoutes);
  await app.register(metaRoutes);
  await app.register(detectionRulesRoutes);
  await app.register(categoriesRoutes);
  await app.register(promptsRoutes);

  app.get("/health", async () => ({ status: "ok" }));

  void seedKnownCompanies().catch((err) => app.log.error(err, "Failed to seed known companies"));

  return app;
}

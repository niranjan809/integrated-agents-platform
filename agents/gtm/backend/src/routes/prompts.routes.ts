import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as promptsRepo from "../db/prompts.repo.js";
import { HARDCODED_PROMPTS } from "../classifier/hardcodedPrompts.js";

const PromptKeyParamsSchema = z.object({ key: z.string().min(1) });
const UpdatePromptSchema = z.object({ template: z.string().min(1) });

export async function promptsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/prompts", async () => {
    return promptsRepo.listAll();
  });

  // Prompts hardcoded in the discovery/classifier code (not DB-backed, so not
  // editable) — surfaced so the Prompts page can show them read-only.
  app.get("/api/prompts/hardcoded", async () => {
    return HARDCODED_PROMPTS;
  });

  app.patch("/api/prompts/:key", async (req, reply) => {
    const { key } = PromptKeyParamsSchema.parse(req.params);
    const { template } = UpdatePromptSchema.parse(req.body);

    const existing = await promptsRepo.getByKey(key);
    if (!existing) return reply.code(404).send({ error: "Prompt not found" });

    return promptsRepo.updateTemplate(key, template);
  });
}

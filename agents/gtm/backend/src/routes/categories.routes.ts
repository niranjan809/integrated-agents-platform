import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as categoriesRepo from "../db/categories.repo.js";

const CreateCategorySchema = z.object({ name: z.string().min(1).max(80) });
const UpdateCategorySchema = z.object({ name: z.string().min(1).max(80) });
const CategoryIdParamsSchema = z.object({ id: z.string().min(1) });

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/categories", async () => {
    return categoriesRepo.listAll();
  });

  app.post("/api/categories", async (req, reply) => {
    const body = CreateCategorySchema.parse(req.body);
    const existing = await categoriesRepo.listAll();
    if (existing.some((c) => c.name.toLowerCase() === body.name.trim().toLowerCase())) {
      return reply.code(409).send({ error: "A category with this name already exists" });
    }
    const category = await categoriesRepo.insert(body.name.trim());
    return reply.code(201).send(category);
  });

  app.patch("/api/categories/:id", async (req, reply) => {
    const { id } = CategoryIdParamsSchema.parse(req.params);
    const body = UpdateCategorySchema.parse(req.body);

    const existing = await categoriesRepo.getById(id);
    if (!existing) return reply.code(404).send({ error: "Category not found" });

    const newName = body.name.trim();
    const all = await categoriesRepo.listAll();
    if (all.some((c) => c.id !== id && c.name.toLowerCase() === newName.toLowerCase())) {
      return reply.code(409).send({ error: "A category with this name already exists" });
    }

    await categoriesRepo.rename(id, newName, existing.name);
    return categoriesRepo.getById(id);
  });

  app.delete("/api/categories/:id", async (req, reply) => {
    const { id } = CategoryIdParamsSchema.parse(req.params);
    const existing = await categoriesRepo.getById(id);
    if (!existing) return reply.code(404).send({ error: "Category not found" });

    await categoriesRepo.remove(id, existing.name);
    return reply.code(204).send();
  });
}

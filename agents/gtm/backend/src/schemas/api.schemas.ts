import { z } from "zod";

export const CreateCompanySchema = z.object({
  name: z.string().min(1),
  segment: z.string().optional(),
  website: z.string().url().optional(),
});

export const CompanyIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const UpdateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  segment: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  hqCountry: z.string().max(60).nullable().optional(),
});

export const StrategyCategoryParamsSchema = z.object({
  id: z.string().min(1),
  cat: z.string().min(1),
});

export const EvidenceQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const CompareQuerySchema = z.object({
  ids: z.string().min(1),
});

export const EvidenceSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: z.string().max(100).optional(),
  sourceType: z.string().max(100).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

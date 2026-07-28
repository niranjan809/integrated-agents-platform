import * as promptsRepo from "../db/prompts.repo.js";
import { renderTemplate } from "./renderTemplate.js";
import { GTM_CLASSIFICATION_KEY, DEFAULT_GTM_CLASSIFICATION_TEMPLATE } from "./defaultPrompts.js";
import type { EvidenceCandidate, ScraperContext } from "../types.js";

export async function buildClassificationPrompt(
  ctx: ScraperContext,
  candidate: EvidenceCandidate,
  categoryNames: string[]
): Promise<string> {
  const prompt = await promptsRepo.getByKey(GTM_CLASSIFICATION_KEY);
  const template = prompt?.template ?? DEFAULT_GTM_CLASSIFICATION_TEMPLATE;

  return renderTemplate(template, {
    companyName: ctx.companyName,
    sourceUrl: candidate.sourceUrl,
    sourceType: candidate.sourceType,
    title: candidate.title ?? "(none)",
    snippet: candidate.snippet,
    categoryList: categoryNames.map((name) => `  "${name}"`).join("\n"),
    exampleCategory: categoryNames[0] ?? "Product-Led Growth",
  });
}

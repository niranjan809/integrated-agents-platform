import { z } from "zod";
import { llmClient } from "./llmClient.js";
import { extractJson } from "./extractJson.js";
import { renderTemplate } from "./renderTemplate.js";
import * as promptsRepo from "../db/prompts.repo.js";
import { COMPANY_SCOPE_KEY, DEFAULT_COMPANY_SCOPE_TEMPLATE } from "./defaultPrompts.js";
import { config } from "../config.js";
import type { CompanyScope } from "../types.js";

const SCOPE_VALUES = ["Global", "Regional"] as const;

const ScopeSchema = z.object({
  scope: z.enum(SCOPE_VALUES).nullable(),
  reasoning: z.string(),
});

/** Classifies a company's geographic market reach from real scraped text
 *  (homepage plus a sample of everything else scraped) — same evidence-first
 *  discipline as GTM classification: the model only reads what was actually
 *  scraped, never guesses from the company name. `companyText` is passed in
 *  by the orchestrator (shared with classifyCompanySegment) rather than
 *  fetched here. The prompt's {{homepageText}} placeholder name is kept as
 *  originally seeded, even though the content is now broader than the
 *  homepage alone — renaming it would silently break any prompt template
 *  already customized via the Prompts page. */
export async function classifyCompanyScope(companyName: string, companyText: string): Promise<CompanyScope | null> {
  if (!companyText) return null;

  const promptRow = await promptsRepo.getByKey(COMPANY_SCOPE_KEY);
  const template = promptRow?.template ?? DEFAULT_COMPANY_SCOPE_TEMPLATE;
  const prompt = renderTemplate(template, {
    companyName,
    homepageText: companyText.slice(0, 4000),
  });

  try {
    const response = await llmClient.chat.completions.create({
      model: config.llmModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const parsed = ScopeSchema.parse(extractJson(text));
    return parsed.scope;
  } catch (err) {
    console.warn(`Scope classification LLM call failed for ${companyName}:`, err);
    return null;
  }
}

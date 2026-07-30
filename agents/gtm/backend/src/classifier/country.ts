import { z } from "zod";
import { llmClient, llmCallWithRetry } from "./llmClient.js";
import { extractJson } from "./extractJson.js";
import { renderTemplate } from "./renderTemplate.js";
import * as promptsRepo from "../db/prompts.repo.js";
import { COMPANY_COUNTRY_KEY, DEFAULT_COMPANY_COUNTRY_TEMPLATE } from "./defaultPrompts.js";
import { config } from "../config.js";

const CountrySchema = z.object({
  country: z.string().max(60).nullable(),
  reasoning: z.string(),
});

/** Classifies a company's headquarters country from real scraped text (same
 *  companyText passed to classifyCompanyScope/classifyCompanySegment) — same
 *  evidence-first discipline: only an explicit office/HQ mention counts, no
 *  guessing from domain TLD or company name. HQ location is a much weaker
 *  public-text signal than "is this company globally known," so expect more
 *  nulls here than for scope. */
export async function classifyCompanyCountry(companyName: string, companyText: string): Promise<string | null> {
  if (!companyText) return null;

  const promptRow = await promptsRepo.getByKey(COMPANY_COUNTRY_KEY);
  const template = promptRow?.template ?? DEFAULT_COMPANY_COUNTRY_TEMPLATE;
  const prompt = renderTemplate(template, {
    companyName,
    homepageText: companyText.slice(0, 4000),
  });

  try {
    const response = await llmCallWithRetry(() =>
      llmClient.chat.completions.create({
        model: config.llmModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      })
    );

    const text = response.choices[0]?.message?.content ?? "";
    const parsed = CountrySchema.parse(extractJson(text));
    return parsed.country;
  } catch (err) {
    console.warn(`Country classification LLM call failed for ${companyName}:`, err);
    return null;
  }
}

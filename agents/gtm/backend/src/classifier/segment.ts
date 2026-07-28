import { z } from "zod";
import { llmClient } from "./llmClient.js";
import { extractJson } from "./extractJson.js";
import { renderTemplate } from "./renderTemplate.js";
import * as promptsRepo from "../db/prompts.repo.js";
import { COMPANY_SEGMENT_KEY, DEFAULT_COMPANY_SEGMENT_TEMPLATE } from "./defaultPrompts.js";
import { config } from "../config.js";

const SegmentSchema = z.object({
  segment: z.string().max(60).nullable(),
  reasoning: z.string(),
});

/** Classifies a short product-segment label ("Voice AI", "LLM Platform", ...)
 *  from real scraped text (homepage plus a sample of everything else
 *  scraped) — same discipline as scope/GTM classification. `companyText` is
 *  passed in by the orchestrator (shared with classifyCompanyScope). The
 *  prompt's {{homepageText}} placeholder name is kept as originally seeded
 *  even though the content is broader now, to avoid silently breaking any
 *  prompt template already customized via the Prompts page. */
export async function classifyCompanySegment(companyName: string, companyText: string): Promise<string | null> {
  if (!companyText) return null;

  const promptRow = await promptsRepo.getByKey(COMPANY_SEGMENT_KEY);
  const template = promptRow?.template ?? DEFAULT_COMPANY_SEGMENT_TEMPLATE;
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
    const parsed = SegmentSchema.parse(extractJson(text));
    return parsed.segment;
  } catch (err) {
    console.warn(`Segment classification LLM call failed for ${companyName}:`, err);
    return null;
  }
}

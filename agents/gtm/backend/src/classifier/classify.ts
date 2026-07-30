import { z } from "zod";
import { llmClient, llmCallWithRetry } from "./llmClient.js";
import { buildClassificationPrompt } from "./prompt.js";
import { extractJson } from "./extractJson.js";
import { config } from "../config.js";
import type { ClassificationResult, EvidenceCandidate, ScraperContext } from "../types.js";

const RawClassificationSchema = z.object({
  gtm_category: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const FALLBACK: ClassificationResult = {
  gtmCategory: null,
  confidence: 0,
  reasoning: "Could not parse a valid classification from the model response.",
};

export async function classifyEvidence(
  ctx: ScraperContext,
  candidate: EvidenceCandidate,
  categoryNames: string[]
): Promise<ClassificationResult> {
  try {
    const prompt = await buildClassificationPrompt(ctx, candidate, categoryNames);
    const response = await llmCallWithRetry(() =>
      llmClient.chat.completions.create({
        model: config.llmModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      })
    );

    const text = response.choices[0]?.message?.content ?? "";
    const raw = extractJson(text);
    const parsed = RawClassificationSchema.parse(raw);

    // Categories are user-editable, so validate membership programmatically
    // instead of a compile-time enum — a category the model invents (or one
    // that was deleted/renamed mid-run) is treated as unclassifiable.
    if (parsed.gtm_category !== null && !categoryNames.includes(parsed.gtm_category)) {
      return { ...FALLBACK, reasoning: `Model returned an unknown category: "${parsed.gtm_category}"` };
    }

    return {
      gtmCategory: parsed.gtm_category,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    return { ...FALLBACK, reasoning: `${FALLBACK.reasoning} (${String(err)})` };
  }
}

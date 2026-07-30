import { z } from "zod";
import { llmClient, llmCallWithRetry } from "./llmClient.js";
import { extractJson } from "./extractJson.js";
import { config } from "../config.js";

export interface WebsiteCandidate {
  url: string;
  title: string;
  snippet: string;
}

const Schema = z.object({
  url: z.string().nullable(),
  reasoning: z.string().optional(),
});

// Hardcoded (not stored in the editable prompts table) — the candidate list is
// assembled at runtime, so this prompt is part of the discovery logic rather
// than a user-tunable template. Exported so the Admin › Prompts page can show
// it read-only alongside the editable classification prompts.
export const WEBSITE_SELECTOR_KEY = "website_selector";
export const WEBSITE_SELECTOR_NAME = "Website Selector (grounded, hardcoded)";
export const WEBSITE_SELECTOR_PROMPT = `You are identifying the OFFICIAL homepage of a company from a list of real candidate pages that were already fetched from the web.

Company name: "{{companyName}}"

Candidates (URL, the page's real title, and a snippet of the page's real text):
{{candidateList}}

Rules:
- Choose the ONE url that is the company's own official website homepage.
- You may ONLY pick a url from the list above. Never invent or modify a url.
- Ignore directories, marketplaces, news sites, social media, app stores, and unrelated companies that merely share a word in the name.
- If none of them is clearly this company's official site, return null.

Return ONLY JSON: {"url": "<one of the candidate urls exactly, or null>", "reasoning": "<one short sentence>"}`;

/** Grounded selector: given real, already-fetched candidate pages (URL + the
 *  page's actual <title> and a snippet of its real text), asks the LLM which
 *  one is the company's official homepage. The model may ONLY choose from the
 *  provided URLs — it never invents one — and its answer is validated back
 *  against the candidate set, so this stays consistent with the app's
 *  evidence-first, no-hallucination guarantee. Returns null if the model
 *  abstains or returns anything not in the list. */
export async function selectOfficialWebsite(
  companyName: string,
  candidates: WebsiteCandidate[]
): Promise<string | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].url;

  const list = candidates
    .map(
      (c, i) =>
        `${i + 1}. ${c.url}\n   title: ${c.title || "(none)"}\n   text: ${c.snippet || "(none)"}`
    )
    .join("\n");

  const prompt = WEBSITE_SELECTOR_PROMPT.replace("{{companyName}}", companyName).replace("{{candidateList}}", list);

  try {
    const response = await llmCallWithRetry(() =>
      llmClient.chat.completions.create({
        model: config.llmModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      })
    );
    const text = response.choices[0]?.message?.content ?? "";
    const parsed = Schema.parse(extractJson(text));
    if (!parsed.url) return null;
    // Guard against hallucination — the answer must be exactly one of the
    // candidate URLs we actually fetched.
    const match = candidates.find((c) => c.url === parsed.url);
    return match ? match.url : null;
  } catch {
    return null;
  }
}

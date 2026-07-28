import { WEBSITE_SELECTOR_KEY, WEBSITE_SELECTOR_NAME, WEBSITE_SELECTOR_PROMPT } from "./selectWebsite.js";

export interface HardcodedPrompt {
  key: string;
  name: string;
  template: string;
  description: string;
}

// Prompts sent to the LLM that are NOT stored in the editable prompts table —
// their inputs (e.g. a candidate list) are assembled at runtime, so they're
// part of the discovery logic rather than user-tunable templates. Surfaced
// read-only on the Prompts page for transparency. {{...}} tokens are filled in
// at call time.
export const HARDCODED_PROMPTS: HardcodedPrompt[] = [
  {
    key: WEBSITE_SELECTOR_KEY,
    name: WEBSITE_SELECTOR_NAME,
    template: WEBSITE_SELECTOR_PROMPT,
    description:
      "Picks a company's official homepage from real, already-fetched candidate pages during discovery. Grounded — the model may only choose from the provided URLs, never invent one.",
  },
];

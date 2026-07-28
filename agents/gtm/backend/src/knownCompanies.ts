export interface KnownCompany {
  name: string;
  website: string;
  segment: string;
}

/**
 * Hardcoded seed list. Bypasses the DDG/Bing discovery heuristic entirely for
 * these companies — that heuristic previously mis-resolved "Vapi" to the
 * parked domain vapi.com instead of vapi.ai, since the .com guess is tried
 * first and merely checks for a 200 response, not real ownership.
 */
export const KNOWN_COMPANIES: KnownCompany[] = [
  { name: "ElevenLabs", website: "https://elevenlabs.io", segment: "Voice AI" },
  { name: "Vapi", website: "https://vapi.ai", segment: "Voice AI" },
  { name: "OpenAI", website: "https://openai.com", segment: "LLM Platform" },
  { name: "Microsoft", website: "https://microsoft.com", segment: "Big Tech / Cloud AI" },
  { name: "Anthropic", website: "https://anthropic.com", segment: "LLM Platform" },
];

export function findKnownWebsite(companyName: string): string | null {
  const match = KNOWN_COMPANIES.find((c) => c.name.toLowerCase() === companyName.trim().toLowerCase());
  return match ? match.website : null;
}

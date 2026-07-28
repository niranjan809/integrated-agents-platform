export const GTM_CLASSIFICATION_KEY = "gtm_classification";
export const COMPANY_SCOPE_KEY = "company_scope";
export const COMPANY_SEGMENT_KEY = "company_segment";
export const COMPANY_COUNTRY_KEY = "company_country";

export const DEFAULT_GTM_CLASSIFICATION_TEMPLATE = `You are a GTM intelligence classifier for AI/SaaS companies.
Your ONLY job: classify a piece of scraped evidence into a GTM category.

Evidence:
  Company: {{companyName}}
  Source URL: {{sourceUrl}}
  Source type: {{sourceType}}
  Title: {{title}}
  Text: {{snippet}}

STRICT RULES:
1. Classify ONLY from the text above. No prior knowledge about the company.
2. Only classify if the text CLEARLY shows a GTM activity.
3. Return null if not clearly a GTM activity.
4. Confidence must reflect how clearly the text supports the category.

GTM Category Names (use exactly as written, or null if none fit):
{{categoryList}}

Return ONLY valid JSON:
{"gtm_category": "{{exampleCategory}}", "confidence": 0.92, "reasoning": "Pricing page shows permanent free tier with self-serve signup..."}

If unclassifiable:
{"gtm_category": null, "confidence": 0.0, "reasoning": "Generic error page, no GTM signal."}`;

export const DEFAULT_COMPANY_SCOPE_TEMPLATE = `You are classifying a company's market reach based ONLY on its homepage text.

Company: {{companyName}}
Homepage text: {{homepageText}}

Classify the company's primary market reach as exactly one of: "Global", "Regional".
- Global: serves customers worldwide, across multiple continents/countries, with no single-country or
  narrower focus implied.
- Regional: anything narrower than clearly worldwide — a specific country, a multi-country region
  (e.g. "Europe", "Southeast Asia"), or a specific city/metro area.

STRICT RULES:
1. Classify ONLY from the text above. No prior knowledge about the company.
2. Return null if the text gives no clear geographic signal either way.

Return ONLY valid JSON:
{"scope": "Global", "reasoning": "Homepage mentions customers in 100+ countries."}

If unclear:
{"scope": null, "reasoning": "No geographic signal found on the homepage."}`;

export const DEFAULT_COMPANY_SEGMENT_TEMPLATE = `You are classifying an AI company's product segment based ONLY on its homepage text.

Company: {{companyName}}
Homepage text: {{homepageText}}

Write a short segment label (2-4 words, Title Case) describing what kind of AI product this company sells —
for example: "Voice AI", "LLM Platform", "AI Coding Assistant", "Computer Vision", "AI Agents", "Marketing AI",
"Cloud AI Infrastructure". Be specific to what the homepage actually describes, not a generic label like "AI Company".

STRICT RULES:
1. Classify ONLY from the text above. No prior knowledge about the company.
2. Return null if the text doesn't clearly describe a product category.

Return ONLY valid JSON:
{"segment": "Voice AI", "reasoning": "Homepage describes building voice agents and conversational phone AI."}

If unclear:
{"segment": null, "reasoning": "Homepage text doesn't clearly describe a product category."}`;

export const DEFAULT_COMPANY_COUNTRY_TEMPLATE = `You are identifying a company's headquarters country based ONLY on the text below.

Company: {{companyName}}
Scraped text: {{homepageText}}

Look for explicit signals of where the company is headquartered — an office address, a "Company" or
"About" page mentioning a city/country, a legal entity name with a country, a careers page listing a
head-office location, or similar. Return the country's common English name (e.g. "United States",
"United Arab Emirates", "India").

STRICT RULES:
1. Classify ONLY from the text above. No prior knowledge about the company.
2. Do not guess from the top-level domain, currency symbols, or language alone — those are weak signals,
   not confirmation. Only return a country when the text names an actual office/HQ location.
3. Return null if the text gives no clear headquarters signal.

Return ONLY valid JSON:
{"country": "United Arab Emirates", "reasoning": "About page lists head office in Dubai, UAE."}

If unclear:
{"country": null, "reasoning": "No headquarters or office location mentioned in the text."}`;

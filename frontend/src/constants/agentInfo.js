// Static info-panel copy for the Brand Visibility X pages (Full Path 2).
//
// The scheduler-help and keyword-class text is also served from the Node gateway
// (GET /x/scheduler-help, GET /x/keywords-help) — those endpoints are the source
// of truth. The mirrors below let the Scheduler and Keywords pages render
// immediately and degrade gracefully if the fetch fails. manualRunPurpose,
// tweetsSourceNote and promptPurposeText are used directly by their pages.

// Per-field help for the Sweep Scheduler (keyed by the schedule field name so a
// tooltip can be looked up next to each control). Mirrors SCHEDULER_HELP in
// backend/routes/brand-visibility-config.js.
export const schedulerHelp = {
  mode: 'Which stage(s) of the pipeline the sweep runs. "all" does the full ' +
    'keyword→influencer→classify cycle; the others isolate one stage for targeted re-runs.',
  class_filter: 'Restrict the sweep to specific lexicon classes (comma-separated codes ' +
    'A–K, NOISE). Blank sweeps every enabled class.',
  since_hours: 'Only fetch posts newer than this many hours. Blank means no recency limit. ' +
    'Lower values keep sweeps cheap and focused on fresh signal.',
  max_pages: 'How many result pages to pull per search query (1–10). Each extra page costs ' +
    'one more RapidAPI call, so raise it only when you need deeper coverage.',
  max_keywords: 'Upper bound on how many enabled keyword queries run in a single sweep ' +
    '(1–1000). Caps sweep breadth independent of how many keywords are enabled.',
  max_api_calls: 'Hard per-sweep RapidAPI budget (1–1000). Once hit, the run stops scraping ' +
    'and finishes classifying what it already fetched — protects your monthly quota.',
};

// The 7 active lexicon classes (H/I/J dead classes omitted). Mirrors
// KEYWORD_CLASSES in the Node gateway.
export const keywordClasses = [
  { id: 'A', name: 'AI Models',
    description: 'Macro AI signal — foundation models & LLMs (GPT, Claude, Gemini, Llama), ' +
      'inference stacks and LLM developers. Priority P2.' },
  { id: 'B', name: 'Orchestration',
    description: 'Agent frameworks and workflow tooling — LangChain, n8n, vector databases, ' +
      'MCP servers, RAG pipelines and agentic automation. Priority P2.' },
  { id: 'C', name: 'Voice AI Stack',
    description: 'The core target — voice-AI builders and infrastructure: Vapi, ElevenLabs, ' +
      'Deepgram, Cartesia, LiveKit, TTS/STT, conversational and phone agents. Priority P1.' },
  { id: 'E', name: 'Language Moat',
    description: 'Multilingual and regional voice/NLP — Gulf Arabic, Hinglish, SEA languages. ' +
      "KiteAI's language differentiation. Priority P1." },
  { id: 'F', name: 'Vertical AI',
    description: 'Vertical integrators and agencies shipping industry AI — dental, real estate, ' +
      'GoHighLevel, white-label AI SaaS founders. Priority P1.' },
  { id: 'H', name: 'Influencer',
    description: 'Accounts that shape the conversation — AI content creators, reviewers, ' +
      'newsletters and tech YouTubers. Priority P1.' },
  { id: 'K', name: 'Product Keywords',
    description: 'High-intent product & competitor terms — "vapi alternative", "voice ai ' +
      'pricing", "openai voice api" and direct brand mentions. Priority P1.' },
];

// "About Manual Runs" panel copy.
export const manualRunPurpose = {
  why: 'A manual run triggers a sweep immediately instead of waiting for the scheduled tick. ' +
    'Use it to pull fresh signal on demand — after adding keywords, tuning the classifier ' +
    'prompt, or when a topic is breaking and you want coverage now.',
  overrides: 'The config below starts from your saved Scheduler settings but any change here ' +
    'applies to this run only — it is never written back to the Scheduler. Great for a one-off ' +
    'deep sweep (raise Max pages / API calls) or a narrow test (set a Class filter) without ' +
    'disturbing the standing schedule.',
};

// Minimal provenance note for the Tweets feed.
export const tweetsSourceNote =
  'Data source: X (Twitter) via the twitter241 RapidAPI provider. ' +
  'Classification via OpenRouter (Gemini 2.5 Flash).';

// "Prompt Context" panel copy (admin-only). Mirrors PROMPT_PURPOSE in the gateway.
export const promptPurposeText =
  'This prompt drives the classifier that reads each scraped X post and assigns a lexicon ' +
  'class (A–K or NOISE), a relevance score (0–100) and a priority flag. It is the single ' +
  'lever that controls signal quality — tightening it reduces noise, loosening it widens ' +
  'coverage. Edits take effect on the next classification pass.';

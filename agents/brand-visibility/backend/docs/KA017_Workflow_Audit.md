# KA017 Workflow Audit

**Prepared for:** Managing Director  
**Audit date:** June 2026  
**Codebase version:** v3.1  
**Auditor:** Technical review of source code and live database

---

## 1. One-paragraph summary

KA017 is a market-intelligence tool that monitors public conversations on X (formerly Twitter) for signals about builders — developers and companies building software — who are experiencing pain with voice-AI infrastructure. It watches two sources: a curated list of 58 search queries covering topics like AI inference cost, voice quality, and multilingual support, and a watchlist of 32 influential people in the AI field whose posts KiteAI wants to track closely. When it finds tweets matching these signals, it saves them to a local database. From there, an AI model (Claude Haiku, a cheaper fast model) is supposed to read each tweet and score it for relevance and quality. High-scoring tweets cluster into themes, and a second AI model (Claude Sonnet, a more capable model used sparingly) drafts potential posts for KiteAI's own @KiteAI X account based on those themes. A human reviewer then approves or edits any draft before anything is posted — the agent never posts to X on its own.

---

## 2. The pipeline, end to end

**Stage 1: Keyword sweep** — The scraper reads `config/genesis_lexicon.json` and runs each of its 58 search queries against the twitter-api45 API (`https://twitter-api45.p.rapidapi.com/search.php`). Each query returns up to 100 recent tweets. Results land in the `scraped_tweets` table in `data/ka017_memory.db`. Failure modes: 429 rate-limit responses (the code sleeps and retries via the `tenacity` library, up to 5 attempts), 401 authentication errors if the RapidAPI key is invalid, network timeouts (30-second timeout per request). Per-query state (the last tweet ID seen) is saved to `query_state` so duplicate scraping is minimized on future runs.

**Stage 2: Influencer sweep** — The scraper separately fetches the recent timeline of each of the 32 tracked handles (`https://twitter-api45.p.rapidapi.com/timeline.php`). This runs on a tier schedule: Tier 1 handles (15 people) every tick, Tier 2 (13 people) every 4 ticks, Tier 3 (4 people) every 24 ticks. Results go into the same `scraped_tweets` table with `source_type = 'INFLUENCER_POST'`. Failure modes: same as Stage 1.

**Stage 3: Reply-tree expansion** — After influencer posts are classified and scored (Stage 4), the scraper picks the top-scoring influencer posts and fetches their reply threads (`https://twitter-api45.p.rapidapi.com/latest_replies.php`). This surfaces conversations happening around high-signal content and tags those replies `INFLUENCER_REPLY` with the highest priority flag. In the current database, this stage has not run yet because classification hasn't happened (see Section 7).

**Stage 4: Classification** — The classifier reads tweets with `status = 'PENDING'` from the database (up to 50 per run), sends each one to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) using Claude Haiku, and asks it to assign a class (A through G or NOISE), an intent signal, a quality score from 0–10, and a one-line summary. Results are written back to the same `scraped_tweets` row, and the status changes to `CLASSIFIED`. Token cost is logged to `llm_costs`. Failure modes: OpenRouter HTTP errors (retried once), malformed JSON from the model (tweet is marked `REJECTED`), API key exhaustion.

**Stage 5: Theme clustering** — The drafter scans `CLASSIFIED` tweets from the last 7 days with quality scores of 6 or higher, groups them by shared theme tags (e.g., five tweets all tagged "latency" in the same class form a cluster), and writes each cluster to the `content_themes` table. The minimum cluster size is 5 tweets. No external API is called here — it is pure in-memory grouping.

**Stage 6: Draft generation** — For each undrafted theme cluster, the drafter sends the cluster summary and up to 5 anonymized representative tweets to OpenRouter using Claude Sonnet, which returns a single post or a thread (3–7 posts) for @KiteAI's account. The draft is saved to `content_themes.draft_post`. Token cost is logged. Failure modes: same as classification.

**Stage 7: Human review** — A team member opens the Streamlit dashboard (`streamlit run output/dashboard.py`, available at `http://localhost:8501`) and sees the drafts in the Content Pipeline tab. They can approve, reject, or edit each draft. Once approved, they post it manually to @KiteAI and paste the live URL back into the dashboard to mark it as posted. The agent takes no action in this stage — it only reads.

---

## 3. External services in use

| Service | Purpose | Endpoint URL(s) | Auth | Cost model |
|---|---|---|---|---|
| RapidAPI — twitter-api45 | Scrape public tweets | `https://twitter-api45.p.rapidapi.com/search.php` (keyword search)<br>`https://twitter-api45.p.rapidapi.com/timeline.php` (user timelines)<br>`https://twitter-api45.p.rapidapi.com/latest_replies.php` (reply threads) | `x-rapidapi-host` and `x-rapidapi-key` headers | Varies by plan; a free tier exists at ~1,000 calls/month |
| OpenRouter | LLM gateway (routes to Anthropic models) | `https://openrouter.ai/api/v1/chat/completions` | `Authorization: Bearer <key>` header | Per-token; see Section 4 |

The official X API v2 (`https://api.x.com/2`) is implemented in the code as an alternative backend but is not currently active. The database shows 6 failed 401 authentication attempts against it, indicating it was tested but the bearer token was not valid at the time.

---

## 4. AI models in use

### Classifier — Claude Haiku (`anthropic/claude-haiku-4.5-20251001`)

Used for: Scoring every scraped tweet for relevance, quality, and category. This is called once per tweet.

**System prompt sent verbatim:**

```
You are classifying tweets for a voice-AI infrastructure company's market research pipeline. You are NOT writing replies or marketing copy. You categorize signal.

Given a tweet, the author's bio, and the keyword that surfaced it, return strict JSON matching the schema. Be conservative — when in doubt, lower the quality_score or mark NOISE. False positives waste reviewer time.

Class definitions:
- A: Macro AI model / inference pain (latency, cost, reliability of GPT/Claude/Gemini/Llama/etc.)
- B: Orchestration & agent frameworks (LangChain, CrewAI, MCP, vector DBs, RAG)
- C: Voice AI stack (Vapi, Retell, Deepgram, ElevenLabs, Cartesia, LiveKit, voice agent UX)
- D: Unit economics (cost, margin, per-minute pricing, GPU economics)
- E: Language moat (non-English, dialect, code-switching voice AI)
- F: Vertical integrators (dental/real estate/HVAC AI receptionists, AI agencies, BPO)
- G: AI terminology / discussion (foundational concepts, AGI debates, philosophy)
- NOISE: doesn't fit any class, or is generic / not about voice or AI infra

Score quality 0-10 based on: specificity (vague complaint = lower), recency of the concern, whether the author sounds like a builder vs. a commentator, whether the post is actionable signal.

Return only the JSON object. No markdown, no commentary.
```

**Output shape:** Pydantic model `ClassifierOutput`

```python
confirmed_class: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "NOISE"
intent_signal:   "venting" | "seeking_solution" | "comparing_tools" |
                 "recommending" | "announcing_build" | "discussing" | "NONE"
quality_score:   int (0–10)
is_builder:      bool
competitor_mentioned: list[str]
theme_tags:      list[str]
summary_one_line: str
```

**Approximate cost per call:** ~$0.0001–0.0003 per tweet at Haiku pricing ($0.80 input / $4.00 output per million tokens). Classifying the current 2,219 PENDING tweets would cost approximately $0.50–$1.50 total.

> **Note:** There is a bug in the classifier's cost-logging code. The `usage` variable is assigned an empty dict (`usage = {}`) before the API response usage is extracted, meaning all `llm_costs` rows for classification will record 0 tokens and $0.00. This does not affect classification correctness — only the cost ledger.

---

### Drafter — Claude Sonnet (`anthropic/claude-sonnet-4.5`)

Used for: Writing draft posts for @KiteAI's X account from theme clusters. Called once per theme cluster, not per tweet — much lower volume.

**System prompt sent verbatim:**

```
You are drafting a post for @KiteAI's own X account. KiteAI builds voice-AI infrastructure with a focus on edge deployment and multilingual support (Arabic dialects, Indian languages, SEA languages).

You are writing as KiteAI, openly. This is marketing content, but it must earn attention by being technically substantive — not by being clever or salesy. Imagine the reader is a senior engineer who will close the tab the moment they smell a pitch.

Given the theme cluster below, draft a single X post (under 280 chars) OR a thread (3-7 posts, each under 280 chars) that:

1. States the technical problem precisely, in the words a builder would use
2. Offers a real observation, decomposition, or data point about it
3. Mentions KiteAI's relevant capability only if it follows naturally from the technical content — never as a CTA, never with a link in the same post
4. Ends with a question or hook that invites reply, not a sales close

Forbidden:
- Marketing voice ("excited to announce", "we're thrilled")
- Hashtags
- Emoji except where technically clarifying
- Links in the main post
- Claiming benchmarks you haven't run
- Naming competitors negatively
- Mentioning specific individuals from the source tweets

Return JSON: { "format": "single" | "thread", "posts": ["..."], "rationale": "..." }
```

**Output shape:** Pydantic model `DraftOutput`

```python
format:    "single" | "thread"
posts:     list[str]   # each post under 280 characters
rationale: str         # why this angle was chosen
```

**Approximate cost per call:** ~$0.01–0.05 per theme cluster at Sonnet pricing ($3.00 input / $15.00 output per million tokens). Content drafting runs approximately once per day (every 48 ticks), so monthly cost here is very low — likely under $2.

---

## 5. Data and storage

**Current database:** Local SQLite file at `data/ka017_memory.db` on Anooj's Windows laptop. This is not yet Turso (a cloud-hosted SQLite service intended for multi-agent sharing). The Turso migration has not happened.

**Current data volume:** 3.5 MB file. The database was populated in a single session on May 28, 2026.

| Table | Rows | What it stores |
|---|---|---|
| `scraped_tweets` | 2,219 | Every tweet the scraper has pulled; classification results written back in-place |
| `query_state` | 57 | The last tweet ID seen per search query, used to avoid re-scraping the same content |
| `content_themes` | 0 | Clustered themes and AI-drafted posts; empty because classification hasn't run yet |
| `llm_costs` | 0 | Token counts and estimated USD cost per LLM call; empty for the same reason |
| `api_log` | 90 | Every HTTP call made to the scraping API, including status codes and error notes |

**Status of scraped tweets:** All 2,219 tweets are status `PENDING`. None have been classified. The pipeline has scraped successfully but has not yet proceeded past Stage 1.

**Breakdown by keyword class:** Class A (AI inference pain) 455 tweets, Class B (orchestration) 239, Class C (voice AI stack) 440, Class D (unit economics) 197, Class E (language/multilingual) 459, Class F (vertical integrators) 72, Class G (general AI discussion) 207. 150 tweets are from influencer timelines with no matched class (correct — they are not keyword-triggered).

**Known data quality issue:** All 150 INFLUENCER_POST tweets have a blank `author_handle` field. The twitter-api45 `timeline.php` endpoint does not include the account's own handle in the response — the code has no fallback for this case. The source account that was queried is stored correctly in `source_handle`, so the data is not lost, but the signal feed's "Handle" column will be blank for these rows.

**Data leaving team control:** No. The database sits on a local machine. The only data sent externally is tweet text + author bio sent to OpenRouter for classification — Anthropic processes that under standard API terms.

---

## 6. How results are shown

**Streamlit dashboard** at `output/dashboard.py`. Run with `streamlit run output/dashboard.py` to open it at `http://localhost:8501`. Requires the local database to exist. Dark-themed.

**Tab 1 — Signal Feed:** Shows classified tweets with filters for class, priority, source type, quality score range, date range, and follower count. Sortable columns include handle, follower count, class, intent signal, quality score, velocity (engagement per minute), tweet text, one-line summary, competitors mentioned, and a direct link to the original tweet on X. A "group by author" toggle collapses multiple tweets from the same person into a single row. At the current moment this tab would show zero rows because no tweets have been classified yet.

**Tab 2 — Content Pipeline:** Shows draft posts awaiting human review. Each card shows the theme tags, how many tweets triggered the theme, links to up to 5 source tweets, the full draft text (or thread posts numbered sequentially), and the AI's rationale for the angle chosen. Three action buttons: Approve (sets status to `APPROVED`), Reject (sets to `SKIPPED`), and Edit & Approve (opens a text area for manual editing before approving). Below the draft queue, approved posts waiting to be published show a URL input field — the team pastes the live X post URL after manually posting, which marks it as `POSTED` in the database.

**Tab 3 — System Health:** Shows API call counts, estimated quota remaining (hardcoded daily ceiling of 5,760 calls), LLM cost today and this month, tweet volume by class in the last 24 hours, and a log of recent API errors.

**Day-to-day workflow:** Open the dashboard, go to Signal Feed to browse new intelligence, go to Content Pipeline when drafts are ready to review. The agent is not running on a schedule — the team triggers it manually (see Section 8).

There is also a Next.js dashboard in a sibling folder for cross-agent management. KA017's runtime data will appear there after the Turso migration, which has not been built yet.

---

## 7. What's working, what's not — be honest

### Working

- **Scraper (twitter-api45 backend).** Successfully pulled 2,219 tweets in one session using 84 successful API calls to twitter-api45. The keyword sweep covered 57 of 58 configured queries. The influencer sweep pulled 150 posts from 15 tracked accounts across the Tier 1 list.
- **Database schema and upsert logic.** The `ON CONFLICT DO UPDATE` pattern correctly refreshes engagement metrics on re-encounters without overwriting classification results. The WAL journal mode prevents read/write conflicts when the dashboard and scraper run simultaneously.
- **Provider abstraction.** The code can swap between twitter-api45 and the official X API v2 via a single env variable, with no other code changes. The 10 unit tests covering this abstraction all pass.
- **Lexicon coverage.** 58 queries across 7 topic classes, 32 tracked handles across 3 tiers. The query chunking logic keeps all queries under the 500-character limit required by the API.
- **Streamlit dashboard.** Renders correctly. All three tabs load. Filters work. The approve/reject/edit flow works at the UI level (though there are no content_themes rows to act on yet since drafting hasn't run).

### Stubbed or partial

- **Classification has not run end-to-end.** The classifier code is complete and correct, but it has never been executed against the live database. All 2,219 scraped tweets remain PENDING. This means the Signal Feed tab in the dashboard currently shows nothing.
- **Cost logging in the classifier is broken.** The token usage from the OpenRouter response is never read — `usage = {}` is hardcoded before the log call. Classification will run correctly but all cost entries will record 0 tokens and $0.00. This is a one-line fix but it hasn't been made.
- **Author handle blank for influencer posts.** As noted above, the `author_handle` column is empty for all 150 INFLUENCER_POST rows. The `source_handle` column is correct, but the Signal Feed displays `author_handle`, so those rows will appear with no handle shown.
- **twitter-api45 post-hoc filtering is approximate.** The `min_faves:`, `-is:retweet`, `-is:reply`, and `lang:` operators from the lexicon queries are stripped before sending to the API and re-applied in Python afterward. This means some tweets that should have been excluded pass through (e.g., `lang:en` filtering relies on the `lang` field in the API response, which is sometimes absent or incorrect).

### Not yet built

- **Automatic scheduling.** The agent has no Windows service, no Task Scheduler entry, no cron job. It runs only when someone types `python orchestrator.py` in a terminal. The `--loop` flag for continuous 30-minute ticks exists in code but requires the terminal to stay open.
- **Quota hard-stop.** The System Health tab displays a "quota remaining" estimate (hardcoded at 5,760 API calls per day), but there is no code anywhere that blocks the scraper when quota is low. If the monthly API limit is reached, calls will simply fail with 429 errors and be retried — no advance warning or graceful shutdown.
- **Multi-language verification.** Class E keywords include non-English terms for Arabic, Hindi, and Southeast Asian dialects, and the lexicon intent is to capture non-English content. However, the `lang:` operator that would filter for these is in the "stripped and re-applied post-hoc" category, and the twitter-api45 `lang` field is unreliable. Whether the 459 Class E tweets in the database are actually in target languages has not been verified.
- **The Next.js dashboard integration.** KA017's data does not appear in the cross-agent management dashboard. That integration requires the Turso (cloud SQLite) migration, which hasn't been built.
- **Tests for classifier and drafter.** The `tests/` folder contains only `test_provider_abstraction.py` (provider-layer tests). There are no tests for the classifier, the drafter, the theme clustering logic, or the dashboard. The `tests/golden_tweets.json` file referenced in `CLAUDE.md` does not exist.

---

## 8. Operational mechanics

**Who runs it:** Anooj manually, from a Windows laptop, by opening a terminal in the project folder and running `python orchestrator.py`.

**How often:** No fixed schedule. The database shows one scraping session on May 28, 2026. There have been no runs since.

**If it crashes mid-run:** The orchestrator saves tick state to `data/tick_state.json` after each stage. If it crashes, the next run picks up from the saved tick number. Individual tweet upserts are idempotent, so a partial scrape can be safely re-run without duplicating data. That said, if the process crashes mid-query, that query's `since_id` is only saved after the query completes, so the last partial query would be re-fetched from scratch on the next run — minor duplication at worst.

**Monthly cost estimate at current usage:**  
- twitter-api45: depends on plan. The free tier is approximately 1,000 calls/month. A full run of all 58 keyword queries + 15 tier-1 influencer handles = ~73 API calls per tick. Running the agent once per day (48 ticks/month) = ~3,500 calls/month, which exceeds the free tier.  
- OpenRouter (classification): approximately $0.50–$1.50 to classify the current backlog of 2,219 tweets. At steady state with ~100 new tweets/day, roughly $0.03–$0.10/day.  
- OpenRouter (drafting): approximately $0.01–$0.05 per theme cluster, once per day. Likely under $2/month.  
- Total steady-state estimate: **$20–$50/month** (dominated by the RapidAPI subscription cost, not LLM cost).

---

## 9. What an MD should ask about next

**"Can you show me a real run end-to-end?"**  
The scraper has run and produced 2,219 tweets. The rest of the pipeline (classifier → dashboard) has never been demonstrated. Running `python orchestrator.py --once --mode classify` would classify the backlog and make the Signal Feed meaningful, but this hasn't been done yet and would require a valid OpenRouter key in `.env`.

**"What happens when we hit the twitter-api45 free tier limit?"**  
The scraper will start receiving 429 errors. The `tenacity` retry logic will sleep and retry up to 5 times per query, then log the failure and move on. There is no advance warning, no dashboard alert, and no automatic stop. You would notice it by seeing the error count rise in the System Health tab. A paid RapidAPI plan would be needed for regular daily runs.

**"If a tweet is misclassified, how do we correct it?"**  
Currently, there is no UI for this. You would need to open the SQLite database directly (with a tool like DB Browser for SQLite) and manually update the `confirmed_class` and `quality_score` fields, then change `status` back to `CLASSIFIED`. Adding a "reclassify" button to the dashboard is a straightforward feature but hasn't been built.

**"How do we add a new keyword or tracked handle?"**  
Edit `scripts/generate_lexicon.py` (a Python script with the keyword lists hardcoded), re-run it with `python scripts/generate_lexicon.py` to regenerate `config/genesis_lexicon.json`, and the next scrape will pick up the new queries automatically. No database changes needed. New handles go in the same script under the appropriate tier list.

**"What's the path to having this run automatically every 30 minutes?"**  
The `python orchestrator.py --loop` command already implements the 30-minute loop in code — it just needs to stay running. For reliability, you would set this up as a Windows Task Scheduler entry or move it to a small cloud VM (a $5/month VPS would be sufficient). The Turso migration would also be needed to share the data with the Next.js dashboard without manual file copies.

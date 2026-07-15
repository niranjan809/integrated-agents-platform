# KA017 — State & Health Audit

**Prepared for:** KA017 maintainer (engineering hand-off)
**Audit date:** 2026-06-03
**Audit type:** Read-only pre-production audit. No code, config, or data was modified.
**Auditor scope:** Full read access to source, config, and the live Turso database (read-only queries only).

> **Honesty note up front.** KA017 was pushed hard over the last 48 hours to be demo-ready: a provider swap (twitter241), a classifier swap (Gemini Flash 2.5), a SQLite→Turso migration, and a full dashboard rebuild all landed in rapid succession. The core scrape→classify→store→view loop is genuinely working and was exercised against live APIs today. But several things were rushed, and at least one subsystem (the drafter) is now broken by a signature change it never got updated for. This document does not gloss over that.

---

## Section 1 — Executive technical summary

- **Pipeline:** scrape → classify → (cluster → draft) → view. **Steps 1–2 (scrape, classify) are verified working** against live twitter241 + Gemini Flash 2.5 as of 2026-06-03. Steps 3–4 (cluster, draft) have **never run** and the drafter has a **latent crash bug** (see P0-1).
- **Data:** **385 tweets** in Turso `scraped_tweets` — **202 CLASSIFIED, 183 PENDING**. All 385 are `source_type='KEYWORD'` (no influencer posts captured yet). Last successful **scrape** completed 2026-06-03 05:58 UTC (run #7, 87 calls, 341 new tweets). Last successful **classify** completed 2026-06-03 07:06 UTC (run #11).
- **Models in use:** Gemini Flash 2.5 (`google/gemini-2.5-flash`) for classification — **201 successful calls, ~$0.12 spent**. Claude Sonnet 4.5 (`anthropic/claude-sonnet-4.5`) configured for drafting but **never invoked and unverified**.
- **Provider:** `twitter241` active and verified. `twitter_api45` and `x_official` retained as fallbacks (not currently used; `twitter_api45` would mis-read `RAPIDAPI_HOST` if switched to — see Section 3).
- **Budget:** `MAX_API_CALLS_PER_RUN=130` (live in `.env`). The most recent keyword sweep used only 87 calls because the lexicon currently produces ~87 query chunks — the budget ceiling was not the limiting factor.
- **Critical concerns:**
  1. **Drafter is broken** — `post_drafter.py` calls `log_llm_cost(related_id=…)` but that parameter was renamed to `run_id`; the drafter will raise `TypeError` the first time it runs (P0-1).
  2. **Embedded-replica corruption is real and recent** — the libsql local replica corrupted **today** (2026-06-03 11:51 and 11:55) with `wal_insert_begin failed` and `invalid local state: metadata file exists but db file does not`. It recovered, but this is a live recurring risk, not theoretical (P0-2 / Section 8).
  3. **Run accounting is unreliable** — 3 runs are stuck in `running` state and today's two crashes were **never recorded as `failed`** because the DB write itself was failing. "0 failed runs" in the table is misleading (P1).
- **Verified end-to-end:** Full `--mode all` tick verified 2026-06-02 (scrape→store→classify→run-tracking, budget stop confirmed). Scrape and classify independently re-verified at scale 2026-06-03 (385 tweets, 202 classified). Dashboard 6 pages render exception-free (AppTest, 2026-06-03). Cluster/draft **not** verified.

---

## Section 2 — File inventory

Repository root: `c:\Users\anooj\KiteAI KA017`. **Not a git repository** — there is no version history to audit; all "last modified" data is filesystem mtime. The absence of git is itself a risk (Section 9).

### `ingestion/` — scraper + data layer

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `ingestion/db.py` | Turso data-access layer (libsql embedded replica); all reads/writes | 2026-06-02 | 642 | ACTIVE |
| `ingestion/x_scraper.py` | Provider-agnostic sweep logic (keywords/influencers/replies), budget enforcement | 2026-06-02 | 471 | ACTIVE |
| `ingestion/lexicon.py` | Lexicon loader: Turso primary, `genesis_lexicon.json` fallback; query chunking | 2026-06-01 | 129 | ACTIVE |
| `ingestion/providers/__init__.py` | `NormalizedTweet`, `ProviderCapabilities`, `ScraperProvider` base | 2026-05-27 | 75 | ACTIVE |
| `ingestion/providers/_http.py` | `safe_get` HTTP helper (tenacity retry/backoff) | 2026-05-27 | 49 | ACTIVE |
| `ingestion/providers/twitter241.py` | **Active provider** — RapidAPI twitter241; response normalization | 2026-06-02 | 393 | ACTIVE |
| `ingestion/providers/twitter_api45.py` | Fallback provider (RapidAPI twitter-api45) | 2026-05-27 | 271 | FALLBACK |
| `ingestion/providers/x_official.py` | Fallback provider (official X API v2) | 2026-05-27 | 184 | FALLBACK |

### `processing/` — classifier

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `processing/classifier.py` | Gemini Flash 2.5 classifier; `ClassifierOutput` schema; `classify_pending` | 2026-06-02 | 219 | ACTIVE |

### `output/` — dashboard + drafter

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `output/dashboard.py` | Streamlit 6-page demo dashboard (read-only) | 2026-06-03 | 858 | ACTIVE |
| `output/dashboard_queries.py` | Cached Turso read queries + `format_count` | 2026-06-03 | 324 | ACTIVE |
| `output/dashboard_styles.py` | CSS + per-class colour palette + badge helpers | 2026-06-03 | 234 | ACTIVE |
| `output/post_drafter.py` | Theme clustering + Sonnet 4.5 drafting | 2026-05-26 | 288 | **BROKEN** (P0-1; never updated post-migration) |

### `config/`

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `config/settings.py` | Central config; env loading; defaults | 2026-06-02 | 67 | ACTIVE |
| `config/genesis_lexicon.json` | Fallback lexicon (7 classes A–G, 32 handles) | 2026-05-26 | 145 | FALLBACK (stale vs Turso — see note) |

> **Note:** the fallback `genesis_lexicon.json` holds **7 classes (A–G) and 32 handles**, but Turso now holds **9 classes (A–K) and 42 influencers**. If Turso is unreachable and the agent falls back to the file, it will run a smaller, older lexicon. Not wrong, but degraded.

### `scripts/`

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `scripts/generate_lexicon.py` | Generates `genesis_lexicon.json` from hardcoded keyword lists | 2026-05-26 | 1254 | UNCLEAR — predates Turso lexicon; likely superseded by the Next.js dashboard as the keyword source of truth |
| `scripts/migrate_local_to_turso.py` | One-shot local SQLite → Turso migration (libsql, schema-intersected) | 2026-06-02 | 141 | ACTIVE (one-shot; not yet run for the 2,219-row archive) |

### `tests/`

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `tests/test_provider_abstraction.py` | 10 tests over the provider factory + capabilities | 2026-05-27 | 237 | ACTIVE — **all 10 pass** (verified read-only this audit) |

**Test coverage gap:** there are **no tests** for the classifier, drafter, clustering, db layer, lexicon loader, or dashboard. `tests/golden_tweets.json` (referenced in `CLAUDE.md` as the classifier golden set) **does not exist** — `[NOT FOUND]`.

### `data/` (gitignored)

| File | Size | Modified | Notes |
|---|---|---|---|
| `ka017_memory.db` | 3.69 MB | 2026-05-28 | Original local SQLite archive (2,219 tweets). Source of truth pre-migration; now an archive. |
| `ka017_memory_backup_2026-06-01.db` | 3.69 MB | 2026-05-28 | Manual backup of the above. |
| `ka017_replica.db` (+ `-wal`, `-shm`, `-info`) | ~1.25 MB + WAL | 2026-06-03 | libsql embedded-replica cache of Turso. **Corrupted & recovered today** (Section 8). |
| `kiteai.db` | 0 bytes | 2026-05-28 | **Empty / vestigial.** Not referenced by any active code. Candidate for deletion. |
| `ka017.log` | 89 KB | 2026-06-03 | Rotating app log. Contains today's replica-corruption errors. |
| `tick_state.json` | 67 B | 2026-06-03 | Orchestrator tick counter. |

### `docs/`

| File | Description | Status |
|---|---|---|
| `docs/KA017_Workflow_Audit.md` | Earlier MD-facing audit (v3.1 era — pre-twitter241, pre-Gemini, pre-Turso) | STALE — describes the old twitter-api45 + Haiku + local-SQLite system |
| `docs/SCRAPER_PROVIDER_NOTES.md` | Provider operator-compatibility matrix | ACTIVE |
| `docs/audit/*` | This audit (3 docs) | NEW |

### Root

| File | Description | Modified | LOC | Status |
|---|---|---|---|---|
| `orchestrator.py` | CLI + interactive menu + `tick()` orchestration + run tracking | 2026-06-02 | 287 | ACTIVE |
| `demo_dashboard.py` | **Old** Streamlit dashboard ("KiteAI Agent Control Plane") reading **local sqlite3** | 2026-05-28 | 101 | **DEPRECATED** — superseded by `output/dashboard.py`; reads local DB, not Turso |
| `README.md` | Quick-start + demo dashboard section | 2026-06-03 | 66 | ACTIVE |
| `CLAUDE.md` | Project context/conventions for Claude Code | 2026-06-02 | 144 | ACTIVE |
| `requirements.txt` | Deps (`libsql>=0.1.11`, streamlit, pydantic v2, …) | 2026-06-02 | 8 | ACTIVE |
| `.env.example` | Template env | 2026-06-02 | 24 | ACTIVE (some stale values — Section 3) |
| `.gitignore` | Ignores data/, .env, replicas | 2026-06-01 | 11 | ACTIVE (but repo is not under git) |

**Flagged for cleanup:** `demo_dashboard.py` (deprecated duplicate dashboard), `data/kiteai.db` (empty vestige), `scripts/generate_lexicon.py` (likely superseded). None are dangerous; all add confusion.

---

## Section 3 — Configuration audit

Values read from `.env` (secrets masked). Code references from `config/settings.py` unless noted.

| Variable | In `.env.example`? | In `.env`? | Code ref | Default matches example? | Status |
|---|---|---|---|---|---|
| `SCRAPER_PROVIDER` | yes (`twitter241`) | yes (`twitter241`) | settings.py:15; x_scraper.py:70,448 | yes | **ALIGNED** |
| `RAPIDAPI_KEY` | yes (blank) | yes (`a7e1…REDACTED`) | settings.py:25; twitter241.py:256 | n/a (secret) | ALIGNED (present) |
| `RAPIDAPI_HOST` | yes (`twitter-api45.p.rapidapi.com`) | yes (`twitter241.p.rapidapi.com`) | settings.py:26; twitter_api45.py:149 | **no** | **MISMATCHED** (see below) |
| `OPENROUTER_API_KEY` | yes (blank) | yes (`sk-or-v1-7aa…REDACTED`) | settings.py:24 | n/a (secret) | ALIGNED (present) |
| `OPENROUTER_MODEL_CLASSIFIER` | yes (`google/gemini-2.5-flash`) | yes (`google/gemini-2.5-flash`) | settings.py:29 | yes | **ALIGNED** (verified working) |
| `OPENROUTER_MODEL_DRAFTER` | yes (`anthropic/claude-sonnet-4.5`) | yes (`anthropic/claude-sonnet-4.5`) | settings.py:30 | yes | ALIGNED — but `[UNVERIFIED]`: never called; model ID validity against OpenRouter not confirmed |
| `TURSO_DATABASE_URL` | yes (placeholder) | yes (`libsql://baeline…REDACTED`) | settings.py:59 | n/a | ALIGNED (present) |
| `TURSO_AUTH_TOKEN` | yes (blank) | yes (`eyJ…REDACTED`) | settings.py:60 | n/a (secret) | ALIGNED (present) |
| `MAX_API_CALLS_PER_RUN` | yes (`12`) | yes (`130`) | settings.py:67 | **no** (example 12, live 130) | **MISMATCHED** (example stale vs the "130" decision) |
| `SCRAPE_SLEEP_SECONDS` | yes (`5`) | **no** | settings.py:42 — **hardcoded `= 5`, NOT read from env** | n/a | **LATENT GAP** (env value is ignored) |
| `LLM_SLEEP_SECONDS` | **no** | no | settings.py:43 — hardcoded `= 3` | n/a | MISSING_FROM_EXAMPLE; hardcoded |
| `X_BEARER_TOKEN` | yes (blank) | yes (blank) | settings.py:23 | yes | ALIGNED (unused while on twitter241) |
| `LOG_LEVEL` | yes (`INFO`) | yes (`INFO`) | settings.py:54 | yes | ALIGNED |
| `ENVIRONMENT` | yes (`dev`) | yes (`dev`) | settings.py:55 | yes | ALIGNED |
| `TURSO_SYNC_INTERVAL` | **no** | no | settings.py:66 — hardcoded `= 60` | n/a | MISSING_FROM_EXAMPLE; hardcoded |

### Detailed findings

- **`RAPIDAPI_HOST` is a trap.** The active `twitter241` provider **hardcodes** its host (`twitter241.p.rapidapi.com` in `BASE_URL` and request headers) and ignores `RAPIDAPI_HOST` entirely. The **fallback** `twitter_api45` provider *does* read `RAPIDAPI_HOST` (twitter_api45.py:149) and expects `twitter-api45.p.rapidapi.com`. The live `.env` sets it to `twitter241.p.rapidapi.com`. **Consequence:** if anyone switches `SCRAPER_PROVIDER=twitter_api45` as a fallback, it will call the wrong host and fail. The code default and `.env.example` still say `twitter-api45…`, so they're internally consistent but inconsistent with the live `.env`.
- **`SCRAPE_SLEEP_SECONDS` is documented but not wired.** `.env.example` and `CLAUDE.md` imply it's configurable, but `settings.py:42` hardcodes `5`. Editing it in `.env` does nothing. (Currently harmless because the hardcode equals the intended value, 5.)
- **`MAX_API_CALLS_PER_RUN` decision drift.** Live value is 130; `.env.example` still shows 12; code default is 12. Anyone bootstrapping from the example gets 12.

**Env vars referenced in code but absent from `.env.example`:** `LLM_SLEEP_SECONDS` (hardcoded), `TURSO_SYNC_INTERVAL` (hardcoded). No `os.getenv`/`os.environ` reads exist that lack an example entry *and* a code default — i.e., no var will crash for being unset; the gaps above are silent, not fatal.

---

## Section 4 — Database schema audit

Connected via `Database()` (read-only). Turso holds **15 tables**.

| Table | Rows | Indexes | Status |
|---|---|---|---|
| `scraped_tweets` | 385 | author, priority, class, status, +pk | **AGENT_OWNED** |
| `agent_runs` | 11 | agent, started | AGENT_OWNED (shared visibility) |
| `agent_activity` | 35 | agent, run | AGENT_OWNED (shared visibility) |
| `llm_costs` | 201 | agent, date | AGENT_OWNED |
| `api_log` | 121 | agent, month | AGENT_OWNED |
| `query_state` | 83 | +pk | AGENT_OWNED |
| `content_themes` | 0 | +pk | AGENT_OWNED (empty — drafter never run) |
| `user_id_cache` | 0 | +pk | AGENT_OWNED (empty — no influencer sweep ran) |
| `keywords` | 1506 | priority, class | DASHBOARD_OWNED (KA017 reads) |
| `keyword_classes` | 9 | — | DASHBOARD_OWNED (KA017 reads) |
| `influencers` | 42 | priority | DASHBOARD_OWNED (KA017 reads) |
| `classification_rules` | 29 | — | DASHBOARD_OWNED (KA017 does **not** read or write — see anomaly) |
| `settings` | 30 | — | DASHBOARD_OWNED (KA017 does not read) |
| `api_key_status` | 17 | — | DASHBOARD_OWNED (KA017 does not write) |
| `sqlite_sequence` | 4 | — | INTERNAL (SQLite autoincrement bookkeeping) |

**`scraped_tweets` columns (33):** tweet_id, created_at, author_id, author_handle, author_followers, author_bio, text, like_count, reply_count, retweet_count, quote_count, impression_count, lang, source_type, matched_class, matched_query, source_handle, conversation_id, ingested_at, last_seen_at, velocity, priority_flag, classified_at, confirmed_class, intent_signal, quality_score, is_builder, theme_tags, competitor_mentioned, summary_one_line, relevance_score, noise_reason, status.

### Anomalies

- **No teammate tables present.** The audit brief anticipated `accounts` / `account_scores` from the sibling account-scoring agent. **`[NOT FOUND]`** — those tables do not exist in this Turso instance yet. Either the teammate hasn't deployed, or uses a different DB/table names. Coordination doc flags this.
- **`classification_rules` (29 rows) is read by nobody in KA017.** It's dashboard-owned and presumably intended to drive classifier behaviour, but `classifier.py` uses a hardcoded `SYSTEM_PROMPT` and does not consult this table. Either a future integration point or dead config. `[NEEDS USER INPUT: is classification_rules meant to feed the classifier?]`
- **`user_id_cache` empty.** Consistent with the fact that no influencer sweep has successfully run; all 385 tweets are keyword-sourced.
- **No columns referenced in code are missing from tables** (verified: the v2 columns `relevance_score`, `noise_reason` exist; `api_log`/`llm_costs`/`agent_runs` writes match their real columns after the migration fixes).
- **`settings` and `api_key_status`** are dashboard-owned and untouched by KA017 — correct separation.

---

## Section 5 — Data integrity check

All queries read-only. Run 2026-06-03.

**Tweet status distribution**
```
CLASSIFIED  202
PENDING     183
```
*Interpretation:* 52% classified. The 183 PENDING is expected backlog from the 341-tweet sweep (run #7) that outpaced classification. Not a problem; just unprocessed.

**Recent runs (last 10)**
```
id  started (UTC)        ended                mode        status     calls  new
11  06-03 06:59:50       06-03 07:06:39       classify    completed   0      0
10  06-03 06:52:59       06-03 06:59:27       classify    completed   0      0
 9  06-03 06:26:47       06-03 06:33:14       classify    completed   0      0
 8  06-03 06:15:20       06-03 06:21:44       classify    completed   0      0
 7  06-03 05:40:28       06-03 05:58:48       keywords    completed  87    341
 6  06-03 05:31:15       06-03 05:33:53       keywords    completed  12     34
 5  06-02 10:27:02       (none)               classify    running     0      0
 4  06-02 10:24:48       (none)               classify    running     0      0
 3  06-02 10:20:34       06-02 10:23:03       keywords    completed  12     33
 2  06-02 09:49:14       (none)               keywords    running     0      0
```
*Interpretation:* runs **2, 4, 5 are orphaned** (`running`, no `ended_at`) — processes that died before `finish_run`. Run #7 is the big sweep (87 calls → 341 tweets). `classify` runs correctly show `calls_used=0` (no scrape) and `records_new=0` (classify updates rows, doesn't insert). The `mode` shown here is parsed from `triggered_by` (`orchestrator:<mode>`) since there is no `mode` column.

**Relevance score bands (classified)**
```
80-100      41
60-79       64
40-59       29
0-39 NOISE  68
```
*Interpretation:* healthy spread. ~34% (68/202) graded NOISE — consistent with a deliberately strict classifier. ~52% (105/202) scored ≥60 (genuine signal). This is a believable distribution, not a degenerate one (it's not all-NOISE or all-100).

**LLM cost**
```
purpose   model                    calls  est_usd
classify  google/gemini-2.5-flash  201    $0.12462
```
*Interpretation:* **drafting cost = $0** (never run). **Cost is an estimate, not actuals** — `classifier.py:195` hardcodes 400 input / 200 output tokens per call regardless of real usage. Treat $0.1246 as approximate; real OpenRouter billing may differ.

**Failed runs (status='failed')**
```
(none)
```
*Interpretation:* **misleading — see Section 8.** The log shows real failures today (11:51, 11:55) that could not be persisted as `failed` because the DB write itself was failing. "Zero failed runs" reflects un-recordable failures, not a clean record.

**Keyword class diversity (matched_class, classified)**
```
A 75 | C 35 | G 26 | B 24 | D 19 | E 18 | F 5
```
*Interpretation:* Class A (Macro AI/inference) dominates inbound matches; F (vertical integrators) is thin. No H (influencers — expected, no influencer sweep) and no K matches.

**Classifier output health (noise_reason)**
```
noise_without_reason  0
noise_with_reason     68
non_noise             134
```
*Interpretation:* **excellent — 100% of NOISE-graded tweets have a populated `noise_reason`.** The field the team relies on for keyword pruning is working as designed.

**AI class vs matched class**
```
confirmed_class != matched_class : 102 of 202 (50%)
```
*Interpretation:* half of all classified tweets were assigned an AI class different from the keyword class that surfaced them (e.g. matched on a Class-A query but judged Class-C). This is a **useful signal**, not an error, and validates keeping both columns in the dashboard.

**confirmed_class distribution**
```
NOISE 70 | A 56 | C 24 | E 20 | B 17 | D 6 | G 5 | F 4
```
*Note:* `confirmed_class='NOISE'` = 70, but `relevance_score<40` = 68. A 2-row discrepancy: 2 tweets were labelled NOISE class while scoring ≥40 (or vice-versa). Minor classifier inconsistency, not material.

**source_type distribution**
```
KEYWORD 385
```
*Interpretation:* **no influencer posts and no replies have ever been captured.** The influencer and reply-tree pipelines are unexercised in production data.

**user_id_cache count**
```
0
```
*Interpretation:* confirms the influencer sweep has never run to completion (it populates this cache).

---

## Section 6 — Pipeline verification

### Scraper (twitter241) — **VERIFIED WORKING**
- **Endpoints:** `GET /search-v2?type=Latest&count=20&query=…`; `/user?username=…`; `/user-tweets?user=<id>&count=…`; `/user-replies-v2?user=<id>&count=…` (base `https://twitter241.p.rapidapi.com`).
- **Auth:** `x-rapidapi-key` + `x-rapidapi-host` headers; key from `RAPIDAPI_KEY` env (twitter241.py:256). Host hardcoded.
- **Rate-limit handling:** `_http.safe_get` with tenacity exponential backoff; `SCRAPE_SLEEP_SECONDS` (5) sleep between calls.
- **Normalization:** `_extract_tweets_from_response` walks the GraphQL `instructions → entries → content.itemContent.tweet_results.result` envelope; `_normalize` reads `legacy.*` for tweet fields and `core.user_results.result.core.screen_name` for the handle (this was the empirically-fixed author-handle path). **Verified producing correct handles, engagement, and IDs** against live responses today.
- **Budget enforcement:** module-level counter reset by orchestrator to `MAX_API_CALLS_PER_RUN`; checked before each call in all three sweep functions; stops cleanly (verified — budget-stop fired at 3/3 and at 12/12 in earlier tests; run #7 stopped at 87 by exhausting query chunks, under the 130 ceiling).
- **Known wart:** one query today logged `found 1 instructions but extracted 0 tweets` (a zero-result or shape-variant chunk). Non-fatal; the sweep continued.

### Lexicon loader — **VERIFIED WORKING**
- Primary: Turso `keyword_classes` + `keywords` (enabled=1) + `influencers` (enabled=1). Live load reports **8 enabled classes, ~87 query chunks, 42 handles** (class H has 0 enabled keywords by design).
- Fallback: `genesis_lexicon.json` (7 classes, 32 handles — stale, smaller).
- Chunking: ≤18 keywords per OR'd chunk, `<500` chars, operator suffix `min_faves:1 -is:retweet -is:reply -is:nullcast lang:en` (Class E omits `lang`).

### Classifier (Gemini Flash 2.5) — **VERIFIED WORKING**
- Model: `google/gemini-2.5-flash` (confirmed live; 201 successful calls).
- Batch: `limit=50` per `classify_pending` call; `LLM_SLEEP_SECONDS=3` between calls; `temperature=0.1`, `max_tokens=500`, `response_format=json_object`.
- Output schema (`ClassifierOutput`): `relevance_score:int(0-100)`, `confirmed_class:str`, `intent_signal:str`, `is_builder:int(0-1)`, `quality_score:int(0-10)`, `theme_tags:list[str]`, `competitor_mentioned:list[str]`, `summary_one_line:str`, `noise_reason:str`.
- Cost: **estimated**, not actual — fixed 400/200 token assumption (classifier.py:195). Real usage ignored.
- `relevance_score`/`noise_reason` persisted via a direct `UPDATE` using `db._conn()` (classifier reaches into a "private" helper — minor coupling).

**Verbatim `SYSTEM_PROMPT` (processing/classifier.py):**
```
You are an analyst for KiteAI, a voice-AI infrastructure company building multilingual AI agents (with focus on Arabic, Hindi, and underserved-language markets).

You score X (Twitter) posts for relevance to KiteAI's market. The market is:
- Voice AI infrastructure (Vapi, Retell, Bland, Deepgram, ElevenLabs, Cartesia, LiveKit, Pipecat)
- LLM inference cost and latency (model choice, GPU optimization, deployment)
- Agent frameworks and orchestration (LangChain, LangGraph, CrewAI, OpenAI Agents SDK)
- Multilingual AI especially Arabic/Hindi/SEA dialects (Whisper accents, Sarvam, regional LLMs)
- Agency-builder economics (people building voice AI for clients -- dental offices, real estate, etc.)
- Unit economics of AI products

For each tweet, output a single JSON object with these fields:
{
  "relevance_score": <0-100>,
  "confirmed_class": "<A-K or NOISE>",
  "intent_signal": "<BUILDER_PAIN | BUILDER_QUESTION | RECOMMENDATION | OBSERVATION | MARKETING>",
  "is_builder": <0 or 1>,
  "quality_score": <0-10>,
  "theme_tags": ["voice-latency", "vapi"],
  "competitor_mentioned": ["Vapi", "Retell"],
  "summary_one_line": "Brief one-liner under 140 chars",
  "noise_reason": "If relevance_score < 40, explain why in 25 words or less. Otherwise empty string."
}

Class definitions:
A = Macro AI Models and Inference (frontier model pain, cost, latency)
B = Orchestration and Agent Frameworks
C = Voice AI Stack (most important -- KiteAI core)
D = Unit Economics and Margins
E = Language Moat (Arabic, Hindi, multilingual -- KiteAI differentiator)
F = Vertical Integrators (agency builders, niche industry voice AI)
G = AI Terminology (foundational concepts -- usually low priority, often NOISE)
H = Influencer accounts (special handling at scraper level)
K = Product-Based Keywords (high buying intent)
NOISE = unrelated to KiteAI market

Scoring guide:
- 80-100: Builder describing a specific KiteAI-market problem with a concrete model/vendor name
- 60-79: Builder discussing a related topic without specific market relevance
- 40-59: Tangential -- touches our market but author or context unclear
- 0-39: NOISE. ALWAYS fill noise_reason explaining what made this irrelevant

Be strict. KiteAI team would rather miss a marginal signal than waste time on noise.
```

### Drafter (Sonnet 4.5) — **BROKEN (latent)**
- Code exists (`output/post_drafter.py`), **never run** (`content_themes`=0, zero draft costs).
- **Crash bug:** `draft_post` (post_drafter.py:230) calls `db.log_llm_cost(..., related_id=theme_id)`, but `log_llm_cost`'s signature was changed during the Turso migration to accept **`run_id`**, not `related_id`. First real draft will `save_draft` successfully and then raise `TypeError: log_llm_cost() got an unexpected keyword argument 'related_id'`. In orchestrator `--mode draft` this is swallowed as a failed phase; standalone it crashes with a traceback. **P0-1.**
- **Relevance gap:** clustering (`cluster_themes` / `get_for_clustering`) keys off `quality_score >= 6` and `confirmed_class != 'NOISE'`. It does **not** use the new `relevance_score` or `noise_reason`. This is the documented "drafter not updated for the classifier changes" gap. **P1.**
- **Verbatim `DRAFTER_SYSTEM_PROMPT` (output/post_drafter.py):**
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

### Orchestrator — **VERIFIED WORKING (with caveats)**
- Modes: `keywords`, `influencers`, `reply_trees`, `classify`, `cluster`, `draft`, `all`. Interactive numbered menu present.
- Run tracking: `start_run` / `finish_run` / `log_activity` write to `agent_runs` + `agent_activity` (visible to dashboard). `mode` is folded into `triggered_by` as `orchestrator:<mode>` (there is no `mode` column — this was an intentional fix after the earlier "no column named mode" crash).
- Tick state persisted to `data/tick_state.json`.
- **Caveat:** when the underlying DB write fails (replica corruption), `finish_run(status='failed')` also fails, leaving runs stuck `running` and no failure recorded (Section 8).

---

## Section 7 — Dashboard audit

### 1. Streamlit demo dashboard — `output/dashboard.py` (read-only, 6 pages)

All 6 pages render exception-free under Streamlit AppTest (verified 2026-06-03). It uses `ingestion.db.Database` only — no external calls, no writes.

| Page | Reads | Status |
|---|---|---|
| Overview | `agent_runs`, `scraped_tweets` (metrics, top signals) | VERIFIED WORKING |
| Signal Feed | `scraped_tweets` (21 fields incl. matched_class/query, engagement) | VERIFIED WORKING |
| Workflow | live `config.settings` values + `keywords`/`influencers` counts | VERIFIED WORKING |
| Run Agent | `agent_runs` (display only; **shows CLI commands, never executes**) | VERIFIED WORKING |
| Keywords | `keyword_classes`, `keywords` (hit_count), `scraped_tweets` aggregates | VERIFIED WORKING |
| Costs & Health | `llm_costs`, `api_log`, `agent_runs` (failures) | VERIFIED WORKING |

- **Schema dependencies all satisfied** — every column the dashboard reads exists in Section 4's inventory (notably `relevance_score`, `noise_reason`, `matched_class`, `matched_query`, `hit_count`).
- **Recently fixed bugs (this build):** Keywords page raw-HTML rendering (single-quote collision from inlining the monospace font stack — fixed); engagement now uses native `st.metric`; tweet links now use the full `/status/<tweet_id>` URL via a dedicated "Open" column.
- **Demo caveats:**
  - The **Workflow page reads `MAX_API_CALLS_PER_RUN` live = 130**, not 12. Correct, but worth knowing before narrating.
  - **Recent-runs tables will show 3 "Running" rows** (orphaned runs 2/4/5) that never completed. Cosmetic but visible on Overview and Run Agent.
  - Data is **sparse-ish**: 202 classified tweets, 0 content themes (Content/themes views will be empty), no influencer rows.

### 2. Next.js team dashboard — NOT in this repo
- Reads the **same Turso DB**. Integration points: `agent_runs` + `agent_activity` (to show KA017 activity) and owns the `keywords`/`keyword_classes`/`influencers`/`settings`/`classification_rules`/`api_key_status` tables. Not audited here.

### 3. Teammate account-scoring dashboard — NOT in this repo
- Also reads the same Turso. No `accounts`/`account_scores` tables exist yet (Section 4). Integration is currently one-directional/absent. Not audited.

---

## Section 8 — Known issues and edge cases

1. **libsql embedded-replica corruption — OBSERVED TODAY.**
   - *Symptoms (from `data/ka017.log`):* `2026-06-03 11:51 ValueError: wal_insert_begin failed` (classify_pending failed) and `2026-06-03 11:55 ValueError: sync error: invalid local state: metadata file exists but db file does not` (single tick failed).
   - *Root cause:* the local replica (`data/ka017_replica.db` + `-wal`/`-shm`/`-info`) can desync/corrupt — likely from concurrent access (dashboard + orchestrator both opening the replica) or an interrupted sync.
   - *Recovery:* stop all processes, delete `data/ka017_replica.db*` (db, -wal, -shm, -info), re-run — the replica rebuilds from Turso on next `Database()`. The system recovered today (replica.db present and healthy at audit time).
   - *Severity:* **this is the single most likely thing to break the demo.** If it corrupts mid-demo, every page errors until the replica files are deleted.

2. **Failures that can't record themselves.** When the DB write path is the thing failing, `finish_run(status='failed')` also fails. Result: orphaned `running` rows and an empty `failed` set. The `agent_runs` table therefore **understates** failures. Cross-check the log, not just the table.

3. **Historical model-ID errors (resolved).** The log shows large bursts of `400 anthropic/claude-haiku-4-5-20251001 is not a valid model ID` and `404 google/gemini-2.0-flash-001 No endpoints found` on 2026-06-02 — both from earlier wrong classifier model settings. Resolved: current `google/gemini-2.5-flash` works (201 successful calls). Tweets that errored stayed PENDING and were later classified.

4. **`MAX_API_CALLS_PER_RUN` was missing earlier**, causing the budget to fall back to the default 12. Now explicitly set to 130 in `.env`. `.env.example` not updated.

5. **twitter241 response shape is empirically determined,** not from official docs. A provider-side shape change would silently yield `extracted 0 tweets` (already seen once today on one chunk). Normalization has fallbacks but is inherently fragile to upstream changes.

6. **Class H (influencers) has 0 enabled keywords** — correct and intentional (influencers are handled at the scraper level, not via keyword matching).

7. **`save_draft` precedes cost logging in the drafter** — so even after the P0-1 `related_id` crash, a draft row would already be saved; only the cost log fails. (Currently moot — drafter never runs.)

---

## Section 9 — Risk register

| Risk | Probability | Impact | Mitigation (exists / needed) |
|---|---|---|---|
| Embedded-replica corruption | **Medium-High** (fired today) | High (dashboard + agent down) | *Exists:* delete `data/ka017_replica.db*` and restart. *Needed:* avoid concurrent replica access; consider HTTP-only client or a documented "don't run agent + dashboard against the same replica simultaneously" rule. |
| Drafter crash on first run | **Certain if invoked** | Medium (content pipeline dead; demo of drafting impossible) | *Needed:* one-line fix `related_id=`→`run_id=` (P0-1). |
| No version control (not a git repo) | High (already true) | High (no rollback, no history, no diff review) | *Needed:* `git init`, commit, push to a private remote. |
| No automated tests beyond provider layer | High | Medium (regressions ship silently) | *Needed:* golden-set classifier tests; db smoke tests. |
| twitter241 response-shape change | Low | High (scraper returns 0 tweets) | *Exists:* defensive multi-path normalization + warnings. *Needed:* an alert when extract rate drops to 0. |
| OpenRouter rate limit / cost run-up | Low at current scale | Low-Medium | Per-call sleep exists; cost is only estimated, so real spend is unmonitored — *needed:* log real token usage. |
| Turso free-tier limits (rows / monthly reads) | Low now, rises with scale | Medium | 385 rows today; at ~340 tweets/sweep × several sweeps/day this grows fast. *Needed:* monitor row count and Turso plan limits. |
| Shared RapidAPI key contention with teammate | Medium | Medium (combined volume may exceed plan) | *Needed:* agree a monthly call-budget split (see Coordination doc). |
| Single-machine operation (Anooj's laptop) | High | High (agent stops when laptop off) | *Needed:* move to a small always-on VM + scheduler for autonomous running. |
| Stale fallback lexicon | Low | Low (degraded coverage on Turso outage) | *Needed:* regenerate `genesis_lexicon.json` from Turso, or drop the file fallback. |

---

## Section 10 — Prioritized fix list

### P0 — Blockers for unsupervised production

- **P0-1 · Drafter `log_llm_cost` signature crash.** `output/post_drafter.py:230` passes `related_id=theme_id`; the method now takes `run_id`. *Effort:* 15 min. *Risk if unfixed:* the entire content-draft pipeline is dead; any `--mode draft`/`--mode all` weekly run fails the draft phase. *Fix:* change `related_id=theme_id` → `run_id=None` (or thread the real run_id through `draft_posts_for_new_themes`).
- **P0-2 · Replica corruption has no guard.** Concurrent replica access corrupts the local cache (observed 2026-06-03). *Effort:* half-day. *Risk if unfixed:* recurring hard outages of both agent and dashboard. *Fix approach:* document and enforce "one process per replica," or move the dashboard to a read-only HTTP Turso client separate from the agent's replica file; add a startup self-heal that deletes a corrupt replica and re-syncs.

### P1 — Important, not blocking the demo

- **P1-1 · Run accounting unreliable.** Orphaned `running` rows (#2,4,5) and unrecordable failures. *Effort:* half-day. *Fix:* on `Database()` init, mark stale `running` runs (no `ended_at`, older than N min) as `failed`; wrap `finish_run` so a failure path that itself fails is at least logged to a file-based fallback.
- **P1-2 · Drafter ignores `relevance_score`/`noise_reason`.** Clustering still keys on `quality_score>=6`. *Effort:* 1 hr. *Fix:* decide whether clustering should gate on `relevance_score>=60` instead of/in addition to `quality_score`; update `get_for_clustering`.
- **P1-3 · `.env.example` drift.** `MAX_API_CALLS_PER_RUN=12` (should reflect 130 decision), `RAPIDAPI_HOST=twitter-api45…` (mismatched with active provider). *Effort:* 15 min. *Fix:* update example; add `LLM_SLEEP_SECONDS`, `TURSO_SYNC_INTERVAL`.
- **P1-4 · `SCRAPE_SLEEP_SECONDS` not wired to env.** Hardcoded in `settings.py:42` despite being in `.env.example`. *Effort:* 15 min. *Fix:* `int(os.getenv("SCRAPE_SLEEP_SECONDS","5"))`. Same for `LLM_SLEEP_SECONDS`.
- **P1-5 · No git.** *Effort:* 15 min. *Fix:* `git init`, `.gitignore` already present, commit, push private remote.

### P2 — Nice-to-have

- **P2-1 · Real token-cost logging.** Classifier uses fixed 400/200 estimate. *Effort:* 1 hr. *Fix:* read `usage` from the OpenRouter response (already returned) and log actuals.
- **P2-2 · Remove vestigial files.** `demo_dashboard.py` (deprecated), `data/kiteai.db` (empty). *Effort:* 15 min. *Risk:* confusion only.
- **P2-3 · Regenerate/retire fallback lexicon.** 7 classes/32 handles vs Turso's 9/42. *Effort:* 1 hr.
- **P2-4 · Decide `classification_rules` integration.** 29 rows read by nobody. *Effort:* varies. `[NEEDS USER INPUT]`.

### P3 — Future

- **P3-1 · Influencer + reply-tree pipelines unexercised.** No production data; `user_id_cache` empty. Validate before relying on them. *Effort:* half-day.
- **P3-2 · Autonomous scheduling** (VM + cron/Task Scheduler) for unattended running. *Effort:* day+.
- **P3-3 · Classifier golden-set tests** (`tests/golden_tweets.json` referenced but missing). *Effort:* half-day.

---

## Section 11 — Verified-working assertions (demo-readiness checklist)

- [x] **Scrape:** twitter241 `/search-v2`, budget-enforced; run #7 fetched 341 tweets in 87 calls. *Last verified:* 2026-06-03 05:58 UTC.
- [x] **Classifier:** Gemini Flash 2.5 returns valid JSON with `relevance_score` + `confirmed_class` + `noise_reason`; 201 successful calls; noise_reason 100% populated. *Last verified:* 2026-06-03 07:06 UTC.
- [x] **Turso write/read cycle:** tweets land in `scraped_tweets`; classification `UPDATE`s apply; dashboard reads succeed. *Last verified:* 2026-06-03 (this audit's read queries).
- [x] **Dashboard:** 6 pages render exception-free (AppTest); Signal Feed shows classified tweets; tweet links use `/status/<id>`. *Last verified:* 2026-06-03.
- [x] **Budget:** `MAX_API_CALLS_PER_RUN` enforced; budget-stop fired in controlled tests (3/3, 12/12). *Last verified:* 2026-06-02; not separately re-tested at 130 (run #7 hit the chunk ceiling at 87 first).
- [~] **End-to-end `--mode all`:** verified 2026-06-02 for scrape→classify→track. **Cluster/draft NOT included** (drafter broken).
- [?] **Drafter (Sonnet 4.5):** `[UNVERIFIED — WILL FAIL]` Never run; has P0-1 crash bug; model ID validity unconfirmed. To verify: fix P0-1, run `--mode cluster` then `--mode draft` against ≥5-tweet clusters.
- [?] **Influencer sweep:** `[UNVERIFIED]` No INFLUENCER_POST rows exist; `user_id_cache` empty. To verify: run `--mode influencers` and confirm cache + rows populate.
- [?] **Reply-tree expansion:** `[UNVERIFIED]` No reply rows exist.
- [?] **Budget at 130 specifically:** `[UNVERIFIED]` would require a lexicon with >130 chunks to exercise the ceiling.

**Bottom line:** the demo's spine — scrape, classify, store, and view — is real and was exercised today. The drafting half of the product is not demo-ready and should not be shown live without the P0-1 fix. The replica-corruption risk (P0-2) is the most likely on-stage failure; rehearse the recovery (delete `data/ka017_replica.db*`, restart) before the meeting.

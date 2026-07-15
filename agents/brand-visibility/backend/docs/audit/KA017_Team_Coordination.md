# KA017 — Team Coordination & Shared Resources

**Date:** 3 June 2026
**For:** The engineer building the sibling account-scoring agent
**Purpose:** Document what KA017 shares with your agent, what it consumes, and what it promises not to touch — so we don't step on each other.

---

## Shared infrastructure

Both agents share three external resources:

### 1. Turso database (one instance, shared)
Both agents read and write the **same Turso libSQL database**. KA017 connects via a local embedded replica (`data/ka017_replica.db`) that syncs to Turso.

**Tables KA017 READS (does not modify) — owned by the dashboard side:**
- `keywords` (1,506 rows), `keyword_classes` (9 rows), `influencers` (42 rows) — the lexicon KA017 scrapes from.

**Tables KA017 OWNS (reads + writes):**
- `scraped_tweets` (385 rows) — captured tweets + classifications
- `agent_runs` (11 rows), `agent_activity` (35 rows) — run history (shared *visibility* for dashboards)
- `llm_costs` (201 rows), `api_log` (121 rows) — cost + API call ledgers
- `query_state` (83 rows) — per-query dedup cursors
- `content_themes` (0 rows) — drafted-post pipeline
- `user_id_cache` (0 rows) — handle→ID cache for influencer sweeps

> **Heads-up:** I looked for your agent's tables (`accounts`, `account_scores`, or similar) and **did not find them** in this Turso instance. Either you haven't deployed yet, you're on a different database, or you use different names. Worth confirming we're actually on the same DB — if so, please tell me your table names so KA017's audit can mark them off-limits explicitly.

### 2. RapidAPI key (shared account)
Both agents use the **same `RAPIDAPI_KEY`**. KA017 currently calls the **twitter241** product (`twitter241.p.rapidapi.com`). If your agent calls a different RapidAPI product on the same key, our usage still pools under one subscription/quota.

### 3. OpenRouter account (shared)
Both agents bill to the **same OpenRouter account**. KA017 uses **Gemini Flash 2.5** (classification, high volume) and **Claude Sonnet 4.5** (drafting, low volume — not yet active). Your account-scoring agent reportedly uses **Claude Opus 4.5**. OpenRouter rate limits are **per-account, per-second**, so simultaneous bursts from both agents compete.

---

## Resource consumption by KA017

**RapidAPI (twitter241):**
- Budget per run: `MAX_API_CALLS_PER_RUN = 130` (configurable). In practice the current lexicon only generates ~87 query chunks, so a full keyword sweep uses **~87 calls**, not 130.
- Today's actual: one sweep = 87 calls → 341 tweets.
- Projection: at, say, 4 sweeps/day × ~87 = **~350 calls/day ≈ ~10,500 calls/month** if run continuously. Influencer/reply sweeps would add to this once enabled.

**OpenRouter:**
- ~$0.12 spent to date (201 classification calls). This is an internal estimate, not billed actuals.
- Projection: **a few dollars/month** at a few hundred tweets/day. Drafting (Sonnet) is weekly and small.

**Turso:**
- `scraped_tweets` at **385 rows**, growing ~**340 rows per keyword sweep**. At several sweeps/day this is the fastest-growing table. Worth jointly watching against Turso plan limits (row count + monthly read/write quotas).

---

## What KA017 does NOT touch

- KA017 does **not** write to `accounts`, `account_scores`, or any table in your domain. (It currently doesn't know they exist.)
- KA017 **only reads** `keywords`, `keyword_classes`, `influencers`. It never edits them — those are edited via the Next.js dashboard.
- KA017 does **not** modify `settings`, `classification_rules`, or `api_key_status`.
- KA017 stamps its identity as **`agent_id = 'KA017'`** in every `agent_runs` and `agent_activity` row, so you can filter our activity out of yours (and vice-versa, if your agent writes to those shared tables).

---

## Potential conflicts to coordinate

1. **Combined RapidAPI volume.** If both agents run at full scale on the shared key, combined calls could approach or exceed the subscription tier (e.g., a 100K/month Pro tier). KA017 alone is ~10K/month at 4 sweeps/day; your agent's volume adds on top.
2. **OpenRouter per-second rate limits.** If both agents fire large batches at the same moment, one will get throttled. KA017 classifies in batches of 50 with a 3-second pause between calls, so it's a steady trickle, not a burst — but a simultaneous Opus batch from your side could still collide.
3. **Shared Turso + local replicas.** Each agent keeps its own local replica. Schema changes from either side (new columns/tables) propagate to both. KA017 had a real incident **today** where its local replica corrupted (`wal_insert_begin failed`) — if your agent also keeps a replica, be aware the same class of failure can hit you, and that heavy concurrent writes increase the risk.
4. **Schema migrations.** KA017's data layer runs idempotent `ALTER TABLE ADD COLUMN` migrations on startup against shared tables it owns. If either agent adds columns to a *shared* table, the other must tolerate them. (KA017 reads its tables by explicit column name, so extra columns are safe for it.)

---

## Coordination recommendations

1. **Monthly RapidAPI call budget split.** Propose **60K KA017 / 40K teammate** as a starting point — KA017's per-sweep cost is fixed (~87 calls) and it's the higher-frequency poller. Adjust once your agent's real cadence is known. Whoever is about to scale up should flag it first.
2. **Announce schema changes.** Any new table or column on the shared Turso DB → a quick message before deploying, so the other agent's startup migrations and dashboard reads don't break. Suggest a shared channel (Slack/whatever the team uses) with a pinned "Turso schema changelog."
3. **Stagger run schedules.** Avoid both agents running heavy phases at the same minute to reduce OpenRouter throttling and Turso write contention. E.g., KA017 on the hour, account-scoring on the half-hour.
4. **Confirm we're on the same Turso instance.** Since I couldn't find your tables, step one is literally confirming the database URL matches. If we're on separate DBs, most of the contention concerns above (Turso) drop away and only the RapidAPI + OpenRouter sharing remains.
5. **Tag everything with `agent_id`.** KA017 already does. If your agent writes to `agent_runs`/`agent_activity` for unified dashboard visibility, please use a distinct `agent_id` so neither side's history is ambiguous.

---

*Questions on any of the above: the full technical detail is in `docs/audit/KA017_State_and_Health.md` (Sections 3, 4, and 9 cover config, schema, and shared-resource risk).*

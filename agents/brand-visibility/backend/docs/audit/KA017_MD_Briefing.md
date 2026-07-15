# KA017 — Briefing for the MD

**Date:** 3 June 2026
**Prepared by:** Engineering audit (read-only review)
**Read time:** ~5 minutes

---

## What KA017 is

KA017 is a market-intelligence agent for KiteAI. It continuously scans public conversations on X (Twitter) for signals from builders — developers and companies — who are running into the kinds of problems KiteAI's voice-AI infrastructure solves: voice quality, latency, multilingual support, inference cost, and agent tooling. It pulls those tweets in, uses an AI model to score and categorise each one, and presents the results in a dashboard. From the strongest recurring themes it can also draft posts for KiteAI's own X account — but a human always reviews and posts those. The agent never posts on its own and never replies to anyone.

---

## Status as of 3 June 2026

**Verified working:**
- The scraper is live on the twitter241 data source and pulled **341 tweets in a single run this morning**.
- The classifier (Google's Gemini Flash 2.5 model) has scored **202 tweets** so far, with sensible spread — roughly a third graded as noise, half as genuine signal.
- The dashboard runs cleanly across all six pages and shows the classified tweets, their scores, and links back to the original posts.

**In progress / expected backlog:**
- **183 tweets are waiting to be classified.** This is normal — the scraper pulled in more than the classifier has worked through yet. Not a problem.
- The **draft-writing feature has not been switched on yet** and is not ready (see "known issues").

**Known issues (honest list):**
- The **post-drafting feature has a bug** and will fail if run today. It is a small, known fix, but it is not demo-ready.
- The system uses a **local cache of the shared database that corrupted once today** and had to be rebuilt. It recovered, but this is the most likely thing to wobble during a live demo.
- A few past runs are **recorded as "still running"** because the process was interrupted; cosmetic, but visible on the dashboard.

---

## What this audit found

- **All critical configuration is in place** — the data source, the AI models, and the database connection are correctly set up and the right model (Gemini Flash 2.5) is confirmed running.
- **The classifier is doing real work.** 202 tweets classified at a total cost of about **12 cents**. Its quality field — the short reason it gives when it rejects a tweet as noise — is being filled in **100% of the time**, which is exactly what we need to refine our keywords later.
- **Half of all tweets get re-categorised by the AI** versus the keyword that found them. That's a feature, not a bug: it tells us when a keyword is pulling in tweets that are really about something else.
- **There are 183 unclassified tweets** still queued. Expected; just unprocessed.
- **The drafting half of the product is not ready.** The code exists but has never successfully run and currently contains a bug. Showing it live today is not advised.
- **The whole system runs on one laptop and is not yet under version control or scheduled to run automatically.** Fine for a demo; not yet fine for unattended production.

---

## Recommended next steps

1. **Fix the drafting bug before showing that feature** (a few minutes of work). Until then, demo the scraping, classifying, and dashboard — which are solid.
2. **Rehearse the database-recovery step before the meeting** so that if the local cache hiccups on stage, recovery is a 30-second, known procedure rather than a scramble.
3. **Put the project under version control** (it currently has no history/backup of the code) and **push it to a private remote.**
4. **Set the agent to run on a schedule on an always-on machine** (instead of manually on a laptop) once the demo is past.
5. **Review the classifier's output for the first week** and prune any keywords that produce mostly noise — the data to do this is already being collected.
6. **Agree a shared-usage budget with the teammate** running the sibling account-scoring agent, since both share the same data sources and accounts.

---

## Cost outlook

Spending so far is **about $0.12** to classify 202 tweets — roughly **two-thirds of a cent per ten tweets**. At a realistic steady state (a few hundred new tweets a day), classification cost is on the order of **a few dollars a month**. The draft-writing model (Claude Sonnet) is more expensive per call but runs only occasionally (weekly), so it adds little. The dominant cost is not the AI — it's the **monthly subscription to the twitter241 data source**, which is shared with the teammate's agent and should be sized for both. Net: the AI portion of this system is inexpensive; the data-feed subscription is the line item to watch.

> One caveat for accuracy: the 12-cent figure is an **estimate** the system computes itself, not a billed amount. It's in the right ballpark, but treat it as approximate until we log actual usage.

---

## Things you might reasonably ask

**"Can I see it work end to end, live?"**
Yes for scrape → classify → dashboard — that's real and was run today. Not for the draft-writing step — that has a known bug and should be fixed first.

**"Is it posting anything to X?"**
No. By design it never posts, never replies, and never impersonates anyone. Any drafted content is for human review only. That boundary is enforced in the dashboard too — the dashboard can only *show* commands, it can't trigger the agent.

**"What happens if it breaks during the demo?"**
The most likely glitch is the local database cache, which corrupted once today and was rebuilt in under a minute. We'll have the recovery steps ready. Everything else degrades gracefully — a page shows an error banner rather than crashing the whole app.

**"How much human work does it save, and is the AI any good?"**
It triages a high-volume stream no person could read in full, and it's being strict (rejecting ~a third as noise) rather than flooding us with marginal hits. We recommend one week of spot-checking its scores before trusting it unattended — the system already records why it rejects each tweet, which makes that review fast.

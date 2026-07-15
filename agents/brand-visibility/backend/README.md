# KA017 — KiteAI Market Intelligence Agent v3.1

Scrapes X for voice-AI builder signals, classifies them, and drafts posts for @KiteAI's own account.

## Quick start

```bash
cp .env.example .env
# Fill in X_BEARER_TOKEN and OPENROUTER_API_KEY

pip install -r requirements.txt

# Generate lexicon (first time only)
python scripts/generate_lexicon.py

# Run one full tick
python orchestrator.py --once

# Launch dashboard
streamlit run output/dashboard.py
```

## Architecture

See `CLAUDE.md` for full context and conventions.

## Demo Dashboard

The Streamlit demo dashboard is a **read-only** viewer of agent activity. It is
safe to run during a live demo — it makes no external API calls, never triggers
the agent, and never writes to Turso.

To start:

```bash
streamlit run output/dashboard.py
```

Then open http://localhost:8501

Pages:
- **Overview** — high-level metrics + recent runs + top signals
- **Signal Feed** — filterable, selectable table of classified tweets
- **Workflow** — pipeline diagram + per-stage explanation (reads live config)
- **Run Agent** — CLI commands for triggering each phase (does not execute)
- **Keywords** — taxonomy view (1,506 keywords / 9 classes) with hit counts
- **Costs & Health** — OpenRouter spend, API status codes, run failures

Files: `output/dashboard.py` (UI), `output/dashboard_queries.py` (cached Turso
reads), `output/dashboard_styles.py` (CSS + class palette).

### What each tweet shows

For every tweet captured by the agent, the dashboard displays:
- Author handle (clickable, opens tweet on X)
- Full tweet text
- Engagement: likes, replies, retweets, quotes, views
- Matched class (A-K) + the keyword query that triggered the match
- Relevance score (0-100) from the AI classifier
- Intent signal (builder pain / question / recommendation / observation / marketing)
- Theme tags and competitor mentions extracted by the classifier
- AI-generated one-line summary
- noise_reason (for low-scoring tweets)

> For a demo: start the dashboard **before** the meeting. If Turso has a hiccup,
> each page degrades to an error banner rather than crashing the app.

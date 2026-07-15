# KiteAI Brand Visibility Agent

Standalone repo for Brand Visibility X (Twitter) and LinkedIn intelligence agents. Split from Intergrated_agents for independent development per team coordination.

## Structure

- `backend/` — FastAPI Python agent (formerly `backend-python/` in Intergrated_agents). Handles X sweeps, LinkedIn scraping, classification pipeline, and dashboard API.
- `frontend/` — Minimal test dashboard for local development against the backend. Not intended for production — Intergrated_agents' main frontend integrates the production UI.
- `.github/workflows/x-agent-cron.yml` — Twice-daily automated X sweep

## Local development

### Backend

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # then fill in secrets
uvicorn api.main:app --reload
```

Backend serves on http://localhost:8000

### Frontend

```
cd frontend
npm install
npm run dev
```

Frontend serves on http://localhost:5173

## Deployment

Backend deploys to Railway from this repo. Service: `intergratedagents-production.up.railway.app` (owned by KiteAI Railway workspace via botntglobal GitHub install).

Env vars required on Railway:
- TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
- OPENROUTER_API_KEY
- RAPIDAPI_KEY (host: twitter241.p.rapidapi.com)
- LINKEDIN_RAPIDAPI_KEY
- X_CRON_SECRET (matches GitHub Actions secret)
- USE_V2_LEXICON=1
- LOG_LEVEL=INFO
- Plus other config per backend/.env.example

## Team coordination

This repo is where I develop the Brand Visibility agent independently. Yathu (@Yathukrishnan) integrates selected commits into `Yathukrishnan/Intergrated_agents` when ready. He has read access to this repo.

## Related repos

- `Yathukrishnan/Intergrated_agents` — main shell + auth + leaderboard + frontend for all agents
- Prior origin: agent code was migrated FROM `Intergrated_agents/backend-python/` (at commit a58e707 as of Jul 9 2026)

## Data layer status (as of Jul 9 2026)

Turso free tier sync-storage quota exceeded. Reads blocked until Aug 1 or plan upgrade. AWS DB migration under team discussion. Backend deploys still fire, but data endpoints will 500 until DB is unblocked or migrated.

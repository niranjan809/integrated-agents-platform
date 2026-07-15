# AI Leaderboard Agent

A master directory of AI leaderboards — discover, explore, and compare every leaderboard tracking model performance across voice, speech, language, coding, and any other AI domain. Designed to run locally, be hosted anywhere, and integrate as a data source into larger multi-agent platforms.

---

## Features

- **Master directory** — all leaderboards in one table with metadata (publisher, domain, type, scope, metrics, availability)
- **Live rankings** — click any leaderboard to fetch the latest rankings; cached for 14 days, re-scannable on demand
- **Domain categories** — filter and browse by domain (STT, TTS, Voice Assistants, LLM, Coding AI, etc.)
- **Search** — full-text search across leaderboard names, publishers, models, and companies
- **Compare** — side-by-side leaderboard comparison, and cross-leaderboard model/company lookup
- **Admin dashboard** — add, edit, and delete leaderboards; Gemini auto-fills metadata from the scraped page
- **Scheduled rescans** — APScheduler runs every 14 days locally; GitHub Actions cron runs on Render in production
- **REST API** — all data exposed via a documented FastAPI backend, ready to wire into any agent or platform

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS |
| Backend | Python 3.11 + FastAPI + APScheduler |
| Database | Turso (libSQL / SQLite-compatible) |
| Scraping | httpx + BeautifulSoup4 + Playwright (JS-heavy sites) |
| AI normalization | Gemini 2.5 Flash via OpenRouter (metadata only, never ranking data) |
| Auth | JWT (7-day sessions, single login) |
| Frontend deploy | Vercel |
| Backend deploy | Render |

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Playwright browsers: `playwright install chromium`

### Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# Edit .env — fill in your credentials

uvicorn main:app --reload
```

API runs at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Edit .env.local — set VITE_API_URL=http://localhost:8000

npm run dev
```

UI runs at `http://localhost:5173`.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `TURSO_URL` | Yes (prod) | libSQL database URL from turso.tech |
| `TURSO_AUTH_TOKEN` | Yes (prod) | Turso auth token |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for Gemini normalization |
| `JWT_SECRET` | Yes | Random secret for signing JWTs — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `APP_USERNAME` | Yes | Login username |
| `APP_PASSWORD` | Yes | Login password |

Local dev without Turso: omit `TURSO_URL` and `TURSO_AUTH_TOKEN` — the app falls back to a local SQLite file (`leaderboard.db`).

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (default: `http://localhost:8000`) |

---

## Deployment

### Backend — Render

1. Connect the repo in Render, set root directory to `backend/`
2. Build command: `pip install -r requirements.txt && playwright install chromium --with-deps`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Set all environment variables in the Render dashboard
5. Add GitHub Actions secrets for the scheduled rescan (see below)

### Frontend — Vercel

1. Connect the repo, set root directory to `frontend/`
2. Set `VITE_API_URL` to your Render backend URL in the Vercel environment variables

### Scheduled Rescans — GitHub Actions

The workflow at `.github/workflows/rescan-leaderboards.yml` runs on the 1st and 15th of each month and can also be triggered manually from the GitHub Actions tab. Add these secrets to your GitHub repo:

| Secret | Value |
|---|---|
| `LEADERBOARD_BACKEND_URL` | Your Render backend URL |
| `LEADERBOARD_USERNAME` | Same as `APP_USERNAME` |
| `LEADERBOARD_PASSWORD` | Same as `APP_PASSWORD` |

---

## API Reference

All endpoints require a Bearer token from `POST /auth/login`. Interactive docs at `/docs` when the server is running.

### Authentication

```
POST /auth/login
Body: { "username": "...", "password": "..." }
Returns: { "access_token": "..." }
```

### Core Endpoints

```
GET  /leaderboards                    List all leaderboards (filterable, sortable)
GET  /leaderboards/{id}               Get leaderboard metadata
GET  /leaderboards/{id}/rankings      Get cached rankings (scrapes if stale)
POST /leaderboards/{id}/rescan        Force a fresh scrape
GET  /leaderboards/{id}/scan-logs     Scan history
GET  /domain-categories               List domain categories
GET  /search?q=...                    Search leaderboards, models, companies
GET  /compare/leaderboards?ids=1,2    Side-by-side comparison
GET  /compare/models?model=...        Model performance across leaderboards
```

### Admin Endpoints

```
GET    /admin/leaderboards              List all leaderboards (full detail)
POST   /admin/leaderboards              Add a leaderboard (triggers normalization + initial scrape)
PUT    /admin/leaderboards/{id}         Update leaderboard fields
DELETE /admin/leaderboards/{id}         Delete leaderboard and all its data
POST   /admin/leaderboards/{id}/renormalize  Re-run Gemini normalization
GET    /admin/status                    Counts and error summary
GET    /admin/prompts                   List editable Gemini prompts
PUT    /admin/prompts/{key}             Update a prompt
POST   /admin/prompts/{key}/reset       Reset prompt to default
```

---

## Integrating with Other Agents

This backend is a standard REST API — any agent or platform can call it with a Bearer token.

**Fetch all leaderboards:**
```python
import httpx

token = httpx.post("https://your-backend.onrender.com/auth/login",
    json={"username": "...", "password": "..."}).json()["access_token"]

leaderboards = httpx.get("https://your-backend.onrender.com/leaderboards",
    headers={"Authorization": f"Bearer {token}"}).json()
```

**Get rankings for a leaderboard:**
```python
rankings = httpx.get("https://your-backend.onrender.com/leaderboards/3/rankings",
    headers={"Authorization": f"Bearer {token}"}).json()
# { "entries": [{"rank": 1, "model_name": "...", "scores": {...}}, ...] }
```

The `/leaderboards` and `/leaderboards/{id}/rankings` endpoints are the primary data feeds for downstream agents.

---

## Project Structure

```
voice-ai/
├── backend/
│   ├── main.py               # FastAPI app, startup, scheduler
│   ├── models.py             # SQLAlchemy models
│   ├── database.py           # DB connection (Turso / SQLite)
│   ├── turso_dbapi.py        # Custom libSQL HTTP adapter
│   ├── seed_data.py          # Initial leaderboard data
│   ├── scan_state.py         # Shared scan progress state
│   ├── model_normalize.py    # Model name matching utilities
│   ├── agent/
│   │   ├── scraper.py        # Leaderboard scraper (httpx + Playwright)
│   │   ├── normalizer.py     # Gemini metadata normalization
│   │   └── prompt_store.py   # Editable Gemini prompts
│   ├── routers/
│   │   ├── auth.py           # JWT login
│   │   ├── leaderboards.py   # Rankings and scan endpoints
│   │   ├── admin.py          # Admin CRUD
│   │   ├── domain_categories.py
│   │   ├── search.py
│   │   └── compare.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Routes
│   │   ├── lib/api.ts        # API client
│   │   ├── lib/auth.tsx      # Auth context
│   │   ├── pages/            # Home, Leaderboard, Admin, Compare, Search
│   │   └── components/       # Layout, tables, UI
│   ├── .env.example
│   └── vercel.json
└── .github/workflows/
    └── rescan-leaderboards.yml
```

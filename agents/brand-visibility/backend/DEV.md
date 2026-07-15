# Local Dev — Brand Visibility Agent (Python / FastAPI)

Runs the LinkedIn + X dashboards (`/dashboard/linkedin`, `/dashboard/x`) and the
`/api/*` endpoints locally. The Render deployment
(`https://kiteai-brand-visibility-py.onrender.com`) stays live as a fallback but
is no longer the frontend's target — local is now canonical (Railway migration
planned).

> This service = `backend-python/` only. The Node backend (`backend/`, auth +
> X-agent Node dashboard) and the Vite frontend (`frontend/`) run separately —
> see `frontend/DEV.md`.

## Prerequisites
- **Python 3.12** (3.11+ works)
- Turso credentials, an OpenRouter key, and RapidAPI keys (see `.env.example`)

## First-time setup

```bash
cd backend-python

# 1. Virtualenv
python -m venv venv
#   Windows (PowerShell):
.\venv\Scripts\Activate.ps1
#   macOS/Linux:
source venv/bin/activate

# 2. Dependencies
pip install -r requirements.txt

# 3. Environment
cp .env.example .env        # Windows: copy .env.example .env
#   Then edit .env and fill in the real secrets (see "Credentials" below).
```

### Credentials (what to put in `.env`)
| Var | Where to get it |
|-----|-----------------|
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Turso dashboard (turso.tech) — **same values as the KiteAI dashboard's `.env.local`**. Ask a teammate if unsure. |
| `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| `RAPIDAPI_KEY` | RapidAPI account (twitter241 subscription) |
| `LINKEDIN_RAPIDAPI_KEY` | RapidAPI account (Fresh LinkedIn Scraper API) |

Budgets (`MAX_API_CALLS_PER_RUN`, `X_MONTHLY_API_BUDGET`, `LINKEDIN_MONTHLY_BUDGET`)
have sane defaults in `.env.example` — leave them unless you know why.

## Run

```bash
# from backend-python/, venv active:
uvicorn api.main:app --reload --port 8000
```

Expected startup log: `Initializing schema...` → `X DB init OK (scraped_tweets: N rows)`
→ `Application startup complete.` → `Uvicorn running on http://127.0.0.1:8000`.

## Verify it's running

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"brand-visibility-agent-api","version":"0.1.0"}

# Full dashboards (HTML):
curl -s http://localhost:8000/dashboard/linkedin | head
curl -s http://localhost:8000/dashboard/x | head

# JSON sanity:
curl http://localhost:8000/api/x/stats
curl http://localhost:8000/api/linkedin/stats
```

## Troubleshooting

- **`RuntimeError: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set`** —
  `.env` missing or not loaded. Confirm you copied `.env.example` → `.env` and
  filled both, and that you're running from `backend-python/`.
- **Turso auth failure / `SERVER_ERROR` on startup** — token expired or wrong DB
  URL. Re-copy the current values from the Turso dashboard.
- **Port 8000 already in use** — run on another port (`--port 8001`) and set
  `VITE_PYTHON_URL=http://localhost:8001` in `frontend/.env.local` to match.
- **Dashboard loads but iframe is blank in the frontend** — the Python server
  isn't running, or `frontend/.env.local`'s `VITE_PYTHON_URL` points elsewhere.
- **libsql WAL / replica errors** — don't run a manual script against the same
  Turso replica while uvicorn is running (concurrent replica access). Stop one.

## Notes
- CORS origins come from `ALLOWED_ORIGINS` (comma-separated), default `"*"` —
  local dev needs no change. Tighten during the Railway migration.
- The old Streamlit dashboard (`output/dashboard.py`, `README.md`) is a separate,
  legacy read-only viewer — **not** what the frontend embeds. The frontend embeds
  the FastAPI HTML dashboards documented here.

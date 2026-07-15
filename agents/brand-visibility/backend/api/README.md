# Brand Visibility Agent API

FastAPI backend for the Brand Visibility Agent. **Phase 1** — skeleton only:
two metadata endpoints and the structure to add data endpoints + dashboards
later.

## Run locally

From the `python-backend/` directory (so the `api` package is importable):

```bash
uvicorn api.main:app --reload --port 8000
```

The app starts at <http://localhost:8000>. Interactive docs at
<http://localhost:8000/docs>.

## Endpoints

| Method | Path          | Purpose                                              |
|--------|---------------|------------------------------------------------------|
| GET    | `/health`     | Liveness check                                       |
| GET    | `/agent/info` | Agent + platform metadata for the React selector     |

## Test

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"brand-visibility-agent-api","version":"0.1.0"}

curl http://localhost:8000/agent/info
# {"slug":"brand-visibility","name":"Brand Visibility Agent", ... "platforms":[...]}
```

`agent/info` returns **relative** `dashboard_url`s (`/dashboard/x`,
`/dashboard/linkedin`); the frontend joins them with the API base URL to build
iframe sources.

## Structure

```
api/
├── main.py        # FastAPI app + /health, /agent/info
├── routers/       # future endpoint groups (empty in Phase 1)
├── templates/     # future Jinja2 HTML (empty in Phase 1)
└── static/        # future static assets (empty in Phase 1)
```

## Schema initialization

- **Schema is initialized at API startup, not per-request.** The app's lifespan
  handler instantiates `LinkedInDatabase()` once (default `skip_schema_init=False`)
  so `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` run a single time.
- Request handlers use `LinkedInDatabase(skip_schema_init=True)` via `Depends`, so
  no schema DDL replays on every request (avoids wasted work + transient Hrana
  protocol errors).
- **Use `skip_schema_init=False` only outside the FastAPI app** (orchestrator,
  scripts, Streamlit dashboard) — those rely on schema init running.
- To apply a manual schema migration, restart the API, or run:
  `python -c 'from agents.brand_visibility.linkedin.db import LinkedInDatabase; LinkedInDatabase()'`

## Dashboards (server-rendered HTML)

- **`GET /dashboard/linkedin`** renders the LinkedIn dashboard UI (Jinja2), with
  KPI data fetched server-side so the page has real numbers on first paint.
- Templates live in **`api/templates/`** (`linkedin_dashboard.html`).
- Styles live in **`api/static/css/`** (`dashboard.css`).
- The design is a **placeholder**: all colors/sizes are CSS variables in
  `:root`, so the real design tokens can re-skin it by overriding those values.
- Phase 4a = static shell (KPIs + filter-sidebar placeholders + posts-table
  placeholder). Interactivity (live filtering) arrives in Phase 4b.

## Notes

- **CORS** is wide open (`allow_origins=["*"]`, no credentials) — to be tightened
  to the frontend's URL later.
- Phase 1 = skeleton; Phase 2 = LinkedIn read endpoints; write endpoints + X
  platform come in later phases.

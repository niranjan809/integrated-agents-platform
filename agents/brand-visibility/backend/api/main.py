"""
Brand Visibility Agent API — FastAPI entrypoint (Phase 1 skeleton).

Run locally (from python-backend/):
    uvicorn api.main:app --reload --port 8000

Phase 1 exposes only /health and /agent/info. Data endpoints (X, LinkedIn) are
served as JSON under /api/*.
"""
from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agents.brand_visibility.linkedin.db import LinkedInDatabase
from agents.brand_visibility.x.db import Database as XDatabase
from shared.db.postgres_client import close_pool
from api.deps import verify_cron_secret
from api.routers import config as config_router
from api.routers import linkedin as linkedin_router
from api.routers import x as x_router

API_VERSION = "0.1.0"

# Configure root logging so application module loggers (getLogger(__name__) in
# orchestrator/x_scraper/classifier) reach stdout under uvicorn. Without this,
# root has no handler in the API process and INFO messages are silently dropped
# (only uvicorn's own loggers are configured). Level from LOG_LEVEL (default INFO).
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    stream=sys.stdout,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# uvicorn's logger so lifespan messages appear in the server output.
logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the LinkedIn schema ONCE at startup, not per request.

    Request handlers use LinkedInDatabase(skip_schema_init=True); this is the
    single place schema DDL runs while the API is up.
    """
    logger.info("Initializing schema...")
    db = LinkedInDatabase()  # default skip_schema_init=False -> runs DDL once
    try:
        conn = getattr(db, "_conn_obj", None)
        if conn is not None and hasattr(conn, "close"):
            conn.close()
    except Exception:  # best-effort; libsql may not require an explicit close
        pass
    logger.info("Schema initialization complete")

    # Initialize X (KA017) schema ONCE at startup (skip_schema_init=False). This
    # creates x_active_prompt and runs the one-time file->DB prompt migration
    # (Sub-phase X3); existing X tables use CREATE/ALTER IF NOT EXISTS, so they
    # are untouched. Request handlers use XDatabase(skip_schema_init=True).
    try:
        xdb = XDatabase()  # default skip_schema_init=False -> runs DDL + migration once
        logger.info("X DB init OK (scraped_tweets: %s rows)", xdb.count_posts())
        xconn = getattr(xdb, "_conn_obj", None)
        if xconn is not None and hasattr(xconn, "close"):
            xconn.close()
    except Exception:
        logger.exception("X DB init/connectivity check FAILED (dashboard /dashboard/x may error)")

    # Orphan-run cleanup. A container restart kills the in-process BackgroundTask
    # that owned any in-flight sweep, leaving its agent_runs row stuck at
    # 'running' — which blocks the run-now 409 already_running guard until it ages
    # out (30 min). Nothing can be sweeping while we start up, so mark such rows
    # failed now. Runs AFTER the DB is reachable, BEFORE uvicorn accepts requests.
    try:
        orphan_ids = XDatabase(skip_schema_init=True).mark_orphan_runs_failed()
        logger.info("Startup cleanup: marked %d orphan runs failed (ids=%s)",
                    len(orphan_ids), orphan_ids)
    except Exception:
        logger.exception("Startup orphan-run cleanup FAILED (non-fatal, continuing)")

    yield
    # Shutdown: close the shared Postgres connection pool cleanly.
    close_pool()
    logger.info("API shutdown complete")

app = FastAPI(title="Brand Visibility Agent API", version=API_VERSION, lifespan=lifespan)

# CORS: origins come from ALLOWED_ORIGINS (comma-separated) env var. P0 lockdown —
# set an EXPLICIT allowlist in production (see .env.example); "*" is a dev-only
# fallback. Auth is header-based (X-Cron-Secret on writes), so allow_credentials
# stays False (also required — "*" + credentials is an invalid CORS combo).
_origins_env = os.getenv("ALLOWED_ORIGINS", "*").strip()
_allowed_origins = (
    ["*"] if _origins_env in ("", "*")
    else [o.strip() for o in _origins_env.split(",") if o.strip()]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Platform routers
app.include_router(linkedin_router.router, prefix="/api/linkedin", tags=["linkedin"])
app.include_router(x_router.router, prefix="/api/x", tags=["x"])
app.include_router(config_router.router, prefix="/api/config", tags=["config"])


@app.get("/health")
def health() -> dict:
    # RAILWAY_GIT_COMMIT_SHA is auto-injected by Railway; exposes the running
    # build so a single curl confirms which commit is live (defaults to "dev").
    commit = os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev")[:7]
    return {
        "status": "ok",
        "service": "brand-visibility-agent-api",
        "version": API_VERSION,
        "commit": commit,
    }


@app.get("/agent/info", dependencies=[Depends(verify_cron_secret)])
def agent_info() -> dict:
    """Agent metadata consumed by the React Level-2 platform selector.

    dashboard_url values are RELATIVE — the frontend joins them with the API base
    URL to build iframe sources.
    """
    return {
        "slug": "brand-visibility",
        "name": "Brand Visibility Agent",
        "description": "Voice AI builder signals from X and LinkedIn",
        "has_platforms": True,
        "platforms": [
            {"slug": "x", "name": "X", "dashboard_url": "/dashboard/x"},
            {"slug": "linkedin", "name": "LinkedIn", "dashboard_url": "/dashboard/linkedin"},
        ],
    }


@app.get("/api/stats", dependencies=[Depends(verify_cron_secret)])
def stats() -> dict:
    """Read-only DB row counts + connection status for the platform admin console.
    Public (no keys returned) — used by the KiteAI admin to show data totals."""
    from shared.db.postgres_client import get_connection

    # One round trip instead of nine: Postgres evaluates the per-table COUNT
    # subqueries internally, far faster than sequential SELECTs against the
    # remote RDS instance. Column order/names mirror the previous table list, so
    # the {"counts": {...}} response shape is unchanged for the frontend.
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM scraped_tweets)    AS scraped_tweets,
                        (SELECT COUNT(*) FROM agent_runs)        AS agent_runs,
                        (SELECT COUNT(*) FROM content_themes)    AS content_themes,
                        (SELECT COUNT(*) FROM useful_promoters)  AS useful_promoters,
                        (SELECT COUNT(*) FROM influencers)       AS influencers,
                        (SELECT COUNT(*) FROM keywords)          AS keywords,
                        (SELECT COUNT(*) FROM linkedin_posts)    AS linkedin_posts,
                        (SELECT COUNT(*) FROM linkedin_runs)     AS linkedin_runs,
                        (SELECT COUNT(*) FROM linkedin_keywords) AS linkedin_keywords
                    """
                )
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description]
                counts = dict(zip(columns, row))
        return {"db": "connected", "counts": counts}
    except Exception as e:  # noqa: BLE001
        return {"db": "error", "error": str(e)[:200], "counts": {}}

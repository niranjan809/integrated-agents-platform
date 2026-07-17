"""
X (KA017) API endpoints — Sub-phase X1 (reads only).

Mirrors api/routers/linkedin.py: GET endpoints under /api/x backed by the
existing X `Database`. No writes, no schedule, no prompt editing, no run-now in
this sub-phase — those land in X3/X4. Endpoints return the DB read-helper dicts
directly (FastAPI serializes), which are the single source of truth the HTML
dashboard partials also consume.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from agents.brand_visibility.x.db import Database
from api.deps import verify_cron_secret

router = APIRouter()

logger = logging.getLogger("uvicorn.error")

# Monthly RapidAPI scrape-call cap for run-now's budget guard. Default 5000
# (twitter-api45 paid-plan capacity). Override via env if the plan changes.
X_MONTHLY_API_BUDGET = int(os.getenv("X_MONTHLY_API_BUDGET", "5000"))

# Shared secret between the GitHub Actions cron and this service. Read once at
# module load. run-now requires the X-Cron-Secret header to match it.
_X_CRON_SECRET = os.getenv("X_CRON_SECRET")


def _run_sweep_task(run_id: int, config: dict) -> None:
    """Background worker for run-now. Owns a dedicated Database with
    sync_interval=None (WAL safety: no background sync mid-write). post_enabled is
    hardcoded False — the API never drafts/posts. Flushes to remote Turso with an
    explicit sync() in finally, since background sync is disabled."""
    from agents.brand_visibility.x.db import Database
    from agents.brand_visibility.x.orchestrator import run_sweep

    # Own writer replica file (per run + pid), so the sweep's writes never share
    # the default replica with concurrent reader connections (get_x_db) — that
    # sharing is what caused the WAL-lock crashes.
    task_replica_path = f"/tmp/ka017_run_{run_id}_pid_{os.getpid()}.db"
    task_db = Database(
        sync_interval=None,
        skip_schema_init=True,
        replica_path=task_replica_path,
    )
    try:
        stats = run_sweep(task_db, run_id, config, post_enabled=False)
        task_db.finish_run(
            run_id, status=stats["status"],
            calls_used=stats["api_calls_used"],
            records_new=stats["posts_fetched"],
            records_updated=stats["posts_classified"],
            summary=stats["summary"],
        )
        task_db.set_last_run("ok")
        logger.info("run-now %s %s", run_id, stats["status"])
    except Exception as exc:
        logger.exception("run-now %s failed", run_id)
        try:
            task_db.finish_run(run_id, status="failed", error_message=str(exc),
                               summary={"error": str(exc)})
            task_db.set_last_run("failed")
        except Exception:
            logger.exception("run-now %s: could not record failure", run_id)
    finally:
        try:
            task_db.sync()  # explicit flush — sync_interval=None disables auto-sync
        except Exception:
            logger.exception("run-now %s: final Turso sync failed", run_id)

        # Clean up per-run replica file so it doesn't accumulate on disk
        try:
            for path in [task_replica_path, task_replica_path + '-shm', task_replica_path + '-wal']:
                if os.path.exists(path):
                    os.remove(path)
        except Exception:
            logger.exception("run-now %s: replica cleanup failed", run_id)


class UpdatePromptRequest(BaseModel):
    """Body for POST /api/x/active-prompt. Length bounds match the DB validation;
    whitespace-only content is rejected by db.set_active_prompt (-> 422)."""
    prompt_text: str = Field(min_length=1, max_length=50_000)
    prompt_version: str = Field(min_length=1, max_length=64)


class UpdateScheduleRequest(BaseModel):
    """Body for PUT /api/x/schedule — any subset of editable sweep-config fields.
    Field-level validation (ranges, enums) lives in db.update_schedule (-> 422).
    Only fields actually sent are updated (exclude_unset)."""
    mode: Optional[str] = None
    sweep_type: Optional[str] = None
    max_pages: Optional[int] = None
    max_keywords: Optional[int] = None
    class_filter: Optional[str] = None
    since_hours: Optional[int] = None
    max_api_calls: Optional[int] = None


class RunNowRequest(BaseModel):
    """Optional body for POST /api/x/run-now — per-run overrides of the saved
    sweep config. Field names mirror UpdateScheduleRequest exactly. Any field
    left None falls back to the stored x_schedule value; overrides are merged
    for this run only and never written back to the DB. Values are validated via
    db._validate_schedule_field (same ranges as the schedule editor -> 400)."""
    mode: Optional[str] = None
    sweep_type: Optional[str] = None
    max_pages: Optional[int] = None
    max_keywords: Optional[int] = None
    max_api_calls: Optional[int] = None
    since_hours: Optional[int] = None
    class_filter: Optional[str] = None


def get_x_db() -> Database:
    """One X Database per request. skip_schema_init=True: the X tables already
    exist in Turso, so dashboard reads never replay schema DDL.
    sync_interval=None: read-only requests sync once at connection open; no
    background sync mid-request. Prevents WAL conflicts with the concurrent
    run-now background task (which also uses sync_interval=None)."""
    return Database(skip_schema_init=True, sync_interval=None)


@router.get("/stats")
def stats(db: Database = Depends(get_x_db)) -> dict:
    return db.kpi_stats()


@router.get("/posts")
def posts(
    db: Database = Depends(get_x_db),
    cls: Optional[list[str]] = Query(None, alias="class"),
    search: Optional[str] = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sort_by: str = Query("priority_then_quality"),
    priority_flag: Optional[list[str]] = Query(None, alias="priority_flag"),
) -> list[dict]:
    return db.list_posts(
        class_filter=cls or None, search=search or None,
        offset=offset, limit=limit, sort_by=sort_by,
        priority_flags=priority_flag or None,
    )


@router.get("/runs")
def runs(db: Database = Depends(get_x_db), limit: int = Query(20, ge=1, le=100)) -> list[dict]:
    return db.get_recent_runs(limit=limit)


@router.get("/cost-summary")
def cost_summary(db: Database = Depends(get_x_db)) -> dict:
    return db.cost_summary()


@router.get("/active-prompt")
def active_prompt(db: Database = Depends(get_x_db)) -> dict:
    return db.get_active_prompt()


@router.post("/active-prompt", dependencies=[Depends(verify_cron_secret)])
def update_active_prompt(payload: UpdatePromptRequest, db: Database = Depends(get_x_db)) -> dict:
    """Save a new active prompt version (Sub-phase X3). Mirrors LinkedIn's
    POST /api/linkedin/active-prompt: deactivates the current active row and
    inserts a new active version. Returns the new row."""
    try:
        return db.set_active_prompt(payload.prompt_version, payload.prompt_text)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.get("/schedule")
def schedule(db: Database = Depends(get_x_db)) -> dict:
    return db.get_schedule()


@router.put("/schedule", dependencies=[Depends(verify_cron_secret)])
def update_schedule(payload: UpdateScheduleRequest, db: Database = Depends(get_x_db)) -> dict:
    """Partial update of the single-row sweep config (Sub-phase X4). Config-only —
    Render Cron owns cadence. Only fields present in the body are changed."""
    fields = payload.model_dump(exclude_unset=True)
    try:
        return db.update_schedule(**fields)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _start_x_run(
    background_tasks: BackgroundTasks,
    db: Database,
    config: dict | None = None,
) -> dict:
    """Guards + start logic for a run-now sweep (Sub-phase X5). Trusted internal
    entry with NO auth — shared by the public run_now endpoint (which adds the
    X-Cron-Secret check) and the dashboard wrapper (server-side, already trusted).
    Scrape+classify ONLY (post_enabled never True). Raises 409 if a run is
    already 'running', 429 if it could exceed the monthly scrape-call budget.

    config: the effective sweep config for this run. None (the default, used by
    the dashboard wrapper) re-reads the stored schedule; run_now passes the saved
    schedule already merged with any per-run overrides. Either way it is used for
    the budget guard and threaded to the background task — never written back."""
    existing = db.get_running_run()
    if existing:
        raise HTTPException(status_code=409, detail={
            "reason": "already_running",
            "run_id": existing["id"],
            "started_at": existing["started_at"],
        })

    schedule = dict(config) if config is not None else db.get_schedule()
    this_month_calls = db.api_calls_this_month()
    requested = int(schedule.get("max_api_calls") or 0)
    if this_month_calls + requested > X_MONTHLY_API_BUDGET:
        raise HTTPException(status_code=429, detail={
            "reason": "budget_would_exceed",
            "current_calls": this_month_calls,
            "requested_max": requested,
            "monthly_budget": X_MONTHLY_API_BUDGET,
        })

    run_id = db.start_run(mode=schedule.get("mode") or "all", triggered_by="dashboard")
    db.sync()  # push the new 'running' row so the bg task + pollers see it immediately
    background_tasks.add_task(_run_sweep_task, run_id, dict(schedule))
    logger.info("run-now accepted: run_id=%s mode=%s budget=%s",
                run_id, schedule.get("mode"), requested)
    return {"run_id": run_id, "status": "started"}


@router.post("/run-now", status_code=202)
async def run_now(
    request: Request,
    override: RunNowRequest | None = None,
    background_tasks: BackgroundTasks = None,
    db: Database = Depends(get_x_db),
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
) -> dict:
    """Public run-now endpoint (GitHub Actions cron + any external caller).
    Requires the X-Cron-Secret header to match the X_CRON_SECRET env var, then
    delegates to _start_x_run. 500 if the secret isn't configured server-side,
    401 if the header is missing or wrong.

    Optional JSON body (RunNowRequest) overrides individual sweep-config fields
    for this run only — the stored x_schedule row is never changed. No body (or
    an all-None body) preserves the original behavior of running the saved
    config. Each provided field is validated against the same ranges as the
    schedule editor; a bad value returns 400 before any run is started."""
    if not _X_CRON_SECRET:
        raise HTTPException(status_code=500, detail={
            "reason": "server_misconfigured",
            "message": "X_CRON_SECRET env var not set on server",
        })
    if x_cron_secret != _X_CRON_SECRET:
        raise HTTPException(status_code=401, detail={"reason": "invalid_cron_secret"})

    # Start from the saved schedule, then layer on any per-run overrides. Each
    # override is coerced + range-checked by the same validator the schedule
    # editor uses; an invalid value is a client error (400), not a 422/500.
    config = dict(db.get_schedule())
    if override is not None:
        for field, value in override.model_dump(exclude_none=True).items():
            try:
                config[field] = db._validate_schedule_field(field, value)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

    return _start_x_run(background_tasks, db, config=config)


@router.get("/run-status/{run_id}")
def run_status(run_id: int, db: Database = Depends(get_x_db)) -> dict:
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"run {run_id} not found")
    return run

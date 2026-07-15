"""
LinkedIn (KA018) API endpoints — Phase 2 (reads) + Phase 3 (writes).

GET endpoints under /api/linkedin are read-only. Phase 3 adds POST/PUT writes
(active-prompt, schedule) and a background-task sweep trigger (run-now /
run-status). All backed by the existing LinkedInDatabase.

Schema note: the spec's `scraped_at` maps to the real column `ingested_at`
(linkedin_posts has no scraped_at). Responses expose it as `scraped_at`.
"""
from __future__ import annotations

import logging
import os
import re
from enum import Enum
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator

from agents.brand_visibility.linkedin.db import LinkedInDatabase

router = APIRouter()

# uvicorn logger so write-endpoint logs surface in server output.
logger = logging.getLogger("uvicorn.error")

MONTHLY_BUDGET = int(os.getenv("LINKEDIN_MONTHLY_BUDGET", "50"))
_TIERS = ["TIER_1_ENGAGE", "TIER_2_WATCH", "TIER_3_SIGNAL", "TIER_4_NOISE"]


def get_db() -> LinkedInDatabase:
    """One LinkedInDatabase per request (read-mostly, sync_interval=60). Not a
    module-global on purpose — avoids sharing a libsql replica handle across
    FastAPI worker threads. skip_schema_init=True: schema DDL runs once at API
    startup (see api/main.py lifespan), never per request."""
    return LinkedInDatabase(sync_interval=60, skip_schema_init=True)


# --------------------------------------------------------------------------
# Response models
# --------------------------------------------------------------------------

class MonthlyBudget(BaseModel):
    limit: int
    used_this_month: int
    remaining: int


class TierCounts(BaseModel):
    TIER_1_ENGAGE: int = 0
    TIER_2_WATCH: int = 0
    TIER_3_SIGNAL: int = 0
    TIER_4_NOISE: int = 0
    unclassified: int = 0


class LinkedinStatsResponse(BaseModel):
    total_posts: int
    unique_authors: int
    most_recent_scrape: Optional[str]
    monthly_api_budget: MonthlyBudget
    tier_counts: TierCounts


class LinkedinClassification(BaseModel):
    tier: str
    relevance_voice_ai: int
    commercial_fit: int
    relationship_value: int
    engagement_safety: int
    noise_flags: list[str]
    one_line_reason: Optional[str]


class LinkedinPost(BaseModel):
    id: int
    post_url: Optional[str]
    author_name: Optional[str]
    author_headline: Optional[str]
    text: Optional[str]
    posted_at: Optional[str]
    scraped_at: Optional[str]            # maps to linkedin_posts.ingested_at
    matched_keyword: Optional[str]
    matched_category: Optional[str]
    source_class: Optional[str]
    like_count: Optional[int]
    comment_count: Optional[int]
    repost_count: Optional[int]
    classification: Optional[LinkedinClassification]


class LinkedinPostListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    posts: list[LinkedinPost]


class LinkedinRun(BaseModel):
    id: int
    started_at: Optional[str]
    completed_at: Optional[str]
    mode: Optional[str]
    keywords_queried: Optional[int]
    api_calls_made: Optional[int]
    posts_ingested: Optional[int]
    posts_classified: Optional[int]
    error_count: Optional[int]
    notes: Optional[str]


class LinkedinRunListResponse(BaseModel):
    runs: list[LinkedinRun]


class ActivePromptResponse(BaseModel):
    prompt_version: str
    prompt_text: str
    updated_at: Optional[str]


class ScheduleResponse(BaseModel):
    enabled: bool
    interval_minutes: Optional[int]
    max_keywords: Optional[int]
    max_pages: Optional[int]
    categories: Optional[str]
    min_volume: Optional[str]
    date_posted: Optional[str]
    sort_by: Optional[str]
    last_run_at: Optional[str]
    next_run_at: Optional[str]
    updated_at: Optional[str]


class CostByModel(BaseModel):
    model: str
    total_cost_usd: float
    post_count: int


class CostSummaryResponse(BaseModel):
    this_month_total_usd: float
    all_time_total_usd: float
    by_model: list[CostByModel]
    post_count: int


class PostSort(str, Enum):
    scraped_at_desc = "scraped_at_desc"
    posted_at_desc = "posted_at_desc"
    like_count_desc = "like_count_desc"
    commercial_fit_desc = "commercial_fit_desc"
    tier_asc_then_fit = "tier_asc_then_fit"


_ORDER_BY = {
    PostSort.tier_asc_then_fit: (
        "CASE classification_class WHEN 'TIER_1_ENGAGE' THEN 1 WHEN 'TIER_2_WATCH' THEN 2 "
        "WHEN 'TIER_3_SIGNAL' THEN 3 WHEN 'TIER_4_NOISE' THEN 4 ELSE 5 END, "
        "commercial_fit_score DESC NULLS LAST"
    ),
    PostSort.scraped_at_desc: "ingested_at DESC",
    PostSort.posted_at_desc: "posted_at DESC NULLS LAST",
    PostSort.like_count_desc: "like_count DESC",
    PostSort.commercial_fit_desc: "commercial_fit_score DESC NULLS LAST",
}


# --------------------------------------------------------------------------
# Phase 3 — write request/response models
# --------------------------------------------------------------------------

class UpdatePromptRequest(BaseModel):
    prompt_text: str = Field(min_length=1, max_length=50_000)
    prompt_version: Optional[str] = Field(default=None, max_length=32, pattern=r"^[a-zA-Z0-9._-]+$")


class UpdatePromptResponse(BaseModel):
    prompt_version: str
    updated_at: Optional[str]


class UpdateScheduleRequest(BaseModel):
    enabled: Optional[bool] = None
    interval_minutes: Optional[int] = Field(default=None, ge=60, le=43_200)
    max_keywords: Optional[int] = Field(default=None, ge=1, le=100)
    max_pages: Optional[int] = Field(default=None, ge=1, le=10)
    categories: Optional[str] = None
    min_volume: Optional[str] = Field(default=None, pattern=r"^(HIGH|MEDIUM|LOW)$")
    date_posted: Optional[str] = Field(default=None, pattern=r"^(past_24h|past_week|past_month)$")
    sort_by: Optional[str] = Field(default=None, pattern=r"^(date_posted|relevance)$")

    @model_validator(mode="after")
    def _require_one(self):
        if all(getattr(self, f) is None for f in self.model_fields):
            raise ValueError("at least one field must be provided")
        return self


class RunNowRequest(BaseModel):
    max_keywords: Optional[int] = Field(default=None, ge=1, le=100)
    max_pages: Optional[int] = Field(default=None, ge=1, le=10)
    categories: Optional[str] = None            # comma-separated; falls back to schedule
    min_volume: Optional[str] = Field(default=None, pattern=r"^(HIGH|MEDIUM|LOW)$")
    min_source_count: Optional[int] = Field(default=None, ge=1)
    date_posted: Optional[str] = Field(default=None, pattern=r"^(past_24h|past_week|past_month)$")
    sort_by: Optional[str] = Field(default=None, pattern=r"^(date_posted|relevance)$")


class RunNowResponse(BaseModel):
    run_id: int
    status: str
    message: str


class RunStats(BaseModel):
    keywords_queried: Optional[int]
    api_calls_made: Optional[int]
    posts_ingested: Optional[int]
    posts_classified: Optional[int]
    error_count: Optional[int]


class RunStatusResponse(BaseModel):
    run_id: int
    status: str
    started_at: Optional[str]
    completed_at: Optional[str]
    stats: RunStats
    notes: Optional[str]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _scalar(db: LinkedInDatabase, sql: str, params: tuple = (), default=0):
    rows = db.query(sql, params)
    if not rows:
        return default
    val = next(iter(rows[0].values()))
    return val if val is not None else default


def _to_int(v) -> int:
    return int(round(v)) if v is not None else 0


def _classification(row: dict) -> Optional[LinkedinClassification]:
    tier = row.get("classification_class")
    if not tier:
        return None
    flags = [f.strip() for f in (row.get("intent_signal") or "").split(",") if f.strip()]
    return LinkedinClassification(
        tier=tier,
        relevance_voice_ai=_to_int(row.get("relevance_score")),
        commercial_fit=_to_int(row.get("commercial_fit_score")),
        relationship_value=_to_int(row.get("relationship_value_score")),
        engagement_safety=_to_int(row.get("engagement_safety_score")),
        noise_flags=flags,
        one_line_reason=row.get("summary_one_line"),
    )


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/stats", response_model=LinkedinStatsResponse)
def stats(db: LinkedInDatabase = Depends(get_db)) -> LinkedinStatsResponse:
    total_posts = _scalar(db, "SELECT COUNT(*) FROM linkedin_posts")
    unique_authors = _scalar(db, "SELECT COUNT(DISTINCT author_name) FROM linkedin_posts")
    most_recent = _scalar(db, "SELECT MAX(ingested_at) FROM linkedin_posts", default=None)
    used = int(_scalar(
        db,
        "SELECT COALESCE(SUM(api_calls_made), 0) FROM linkedin_runs "
        "WHERE to_char(started_at, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')",
    ))

    counts = {r["classification_class"]: r["c"] for r in db.query(
        "SELECT classification_class, COUNT(*) AS c FROM linkedin_posts "
        "GROUP BY classification_class"
    )}
    tier_counts = TierCounts(
        TIER_1_ENGAGE=counts.get("TIER_1_ENGAGE", 0),
        TIER_2_WATCH=counts.get("TIER_2_WATCH", 0),
        TIER_3_SIGNAL=counts.get("TIER_3_SIGNAL", 0),
        TIER_4_NOISE=counts.get("TIER_4_NOISE", 0),
        unclassified=counts.get(None, 0),
    )
    return LinkedinStatsResponse(
        total_posts=total_posts,
        unique_authors=unique_authors,
        most_recent_scrape=most_recent,
        monthly_api_budget=MonthlyBudget(
            limit=MONTHLY_BUDGET, used_this_month=used,
            remaining=max(0, MONTHLY_BUDGET - used),
        ),
        tier_counts=tier_counts,
    )


@router.get("/posts", response_model=LinkedinPostListResponse)
def posts(
    db: LinkedInDatabase = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tier: Optional[list[str]] = Query(None),
    category: Optional[str] = Query(None),
    source_class: Optional[str] = Query(None),
    sort_by: PostSort = Query(PostSort.tier_asc_then_fit),
) -> LinkedinPostListResponse:
    where: list[str] = []
    params: list = []
    if tier:
        where.append(f"classification_class IN ({', '.join('%s' for _ in tier)})")
        params.extend(tier)
    if category:
        where.append("matched_category = %s")
        params.append(category)
    if source_class:
        where.append("source_class = %s")
        params.append(source_class)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    total = int(_scalar(db, f"SELECT COUNT(*) FROM linkedin_posts{where_sql}", tuple(params)))
    rows = db.query(
        f"SELECT * FROM linkedin_posts{where_sql} ORDER BY {_ORDER_BY[sort_by]} "
        f"LIMIT %s OFFSET %s",
        tuple(params + [limit, offset]),
    )
    items = [
        LinkedinPost(
            id=r["id"],
            post_url=r.get("post_url"),
            author_name=r.get("author_name"),
            author_headline=r.get("author_headline"),
            text=r.get("text"),
            posted_at=r.get("posted_at"),
            scraped_at=r.get("ingested_at"),
            matched_keyword=r.get("matched_keyword"),
            matched_category=r.get("matched_category"),
            source_class=r.get("source_class"),
            like_count=r.get("like_count"),
            comment_count=r.get("comment_count"),
            repost_count=r.get("repost_count"),
            classification=_classification(r),
        )
        for r in rows
    ]
    return LinkedinPostListResponse(total=total, limit=limit, offset=offset, posts=items)


@router.get("/runs", response_model=LinkedinRunListResponse)
def runs(
    db: LinkedInDatabase = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
) -> LinkedinRunListResponse:
    rows = db.query(
        "SELECT id, started_at, completed_at, mode, keywords_queried, api_calls_made, "
        "posts_ingested, posts_classified, error_count, notes "
        "FROM linkedin_runs ORDER BY started_at DESC LIMIT %s",
        (limit,),
    )
    return LinkedinRunListResponse(runs=[LinkedinRun(**r) for r in rows])


@router.get("/active-prompt", response_model=ActivePromptResponse)
def active_prompt(db: LinkedInDatabase = Depends(get_db)) -> ActivePromptResponse:
    row = db.get_active_prompt()
    if not row:
        raise HTTPException(status_code=404, detail="No active prompt set")
    return ActivePromptResponse(
        prompt_version=row.get("prompt_version"),
        prompt_text=row.get("prompt_text"),
        updated_at=row.get("updated_at"),
    )


@router.get("/schedule", response_model=ScheduleResponse)
def schedule(db: LinkedInDatabase = Depends(get_db)) -> ScheduleResponse:
    row = db.get_schedule()
    return ScheduleResponse(
        enabled=bool(row.get("enabled")),
        interval_minutes=row.get("interval_minutes"),
        max_keywords=row.get("max_keywords"),
        max_pages=row.get("max_pages"),
        categories=row.get("categories"),
        min_volume=row.get("min_volume"),
        date_posted=row.get("date_posted"),
        sort_by=row.get("sort_by"),
        last_run_at=row.get("last_run_at"),
        next_run_at=row.get("next_run_at"),
        updated_at=row.get("updated_at"),
    )


@router.get("/cost-summary", response_model=CostSummaryResponse)
def cost_summary(db: LinkedInDatabase = Depends(get_db)) -> CostSummaryResponse:
    this_month = round(float(db.total_cost_this_month()), 6)
    all_time = round(float(_scalar(
        db, "SELECT COALESCE(SUM(cost_usd), 0) FROM linkedin_classification_costs"
    )), 6)
    by_model = [
        CostByModel(model=m, total_cost_usd=round(float(total), 6), post_count=cnt)
        for (m, total, cnt) in db.cost_summary_by_model()
    ]
    post_count = int(_scalar(
        db, "SELECT COUNT(DISTINCT post_id) FROM linkedin_classification_costs"
    ))
    return CostSummaryResponse(
        this_month_total_usd=this_month,
        all_time_total_usd=all_time,
        by_model=by_model,
        post_count=post_count,
    )


# --------------------------------------------------------------------------
# Phase 3 — write helpers
# --------------------------------------------------------------------------

def _next_prompt_version(db: LinkedInDatabase) -> str:
    """Increment the current 'vN' prompt version, or 'v1' if none/unrecognized."""
    cur = db.get_active_prompt()
    if cur and cur.get("prompt_version"):
        m = re.match(r"^v(\d+)$", str(cur["prompt_version"]))
        if m:
            return f"v{int(m.group(1)) + 1}"
    return "v1"


def _csv_to_list(value: Optional[str]) -> Optional[list[str]]:
    if not value:
        return None
    items = [v.strip() for v in value.split(",") if v.strip()]
    return items or None


def _run_sweep_bg(run_id: int, params: dict) -> None:
    """Background wrapper: own the write-heavy db lifecycle + finalization around
    the shared orchestrator.run_sweep() loop (single source of truth).

    The run row was already created by the request handler; this updates it.
    """
    from agents.brand_visibility.linkedin.orchestrator import run_sweep

    db = LinkedInDatabase(sync_interval=None, skip_schema_init=True)
    db.sync()  # pull state
    try:
        stats = run_sweep(
            db, run_id,
            max_keywords=params["max_keywords"], max_pages=params["max_pages"],
            categories=params["categories"], min_volume=params["min_volume"],
            min_source_count=params["min_source_count"],
            date_posted=params["date_posted"], sort_by=params["sort_by"],
        )
        db.finish_run(
            run_id,
            keywords_queried=stats["keywords_queried"],
            api_calls_made=stats["api_calls_made"],
            posts_ingested=stats["posts_ingested"],
            error_count=stats["errors"],
            notes=f"api run-now; {stats['notes']}",
        )
        logger.info("run-now %s done: kw=%d calls=%d posts=%d errors=%d", run_id,
                    stats["keywords_queried"], stats["api_calls_made"],
                    stats["posts_ingested"], stats["errors"])
    except Exception as exc:
        logger.exception("run-now %s crashed", run_id)
        try:
            db.finish_run(run_id, keywords_queried=0, api_calls_made=0,
                          posts_ingested=0, error_count=1,
                          notes=f"run-now failed: {exc}")
        except Exception:
            pass
    finally:
        db.sync()  # push writes


# --------------------------------------------------------------------------
# Phase 3 — write endpoints
# --------------------------------------------------------------------------

@router.post("/active-prompt", response_model=UpdatePromptResponse)
def update_active_prompt(
    payload: UpdatePromptRequest,
    db: LinkedInDatabase = Depends(get_db),
) -> UpdatePromptResponse:
    version = payload.prompt_version or _next_prompt_version(db)
    db.set_active_prompt(payload.prompt_text, version)
    db.sync()
    row = db.get_active_prompt() or {}
    logger.info("active-prompt updated -> version=%s (%d chars)", version, len(payload.prompt_text))
    return UpdatePromptResponse(
        prompt_version=row.get("prompt_version", version),
        updated_at=row.get("updated_at"),
    )


@router.put("/schedule", response_model=ScheduleResponse)
def update_schedule_endpoint(
    payload: UpdateScheduleRequest,
    db: LinkedInDatabase = Depends(get_db),
) -> ScheduleResponse:
    kwargs = payload.model_dump(exclude_none=True)
    if "enabled" in kwargs:
        kwargs["enabled"] = int(bool(kwargs["enabled"]))  # store bool as 0/1
    db.update_schedule(**kwargs)
    db.sync()
    logger.info("schedule updated: %s", kwargs)
    return schedule(db)  # reuse the GET handler to return the full updated row


@router.post("/run-now", response_model=RunNowResponse, status_code=202)
def run_now(
    background_tasks: BackgroundTasks,
    payload: Optional[RunNowRequest] = Body(default=None),
    db: LinkedInDatabase = Depends(get_db),
) -> RunNowResponse:
    payload = payload or RunNowRequest()

    used = int(_scalar(
        db,
        "SELECT COALESCE(SUM(api_calls_made), 0) FROM linkedin_runs "
        "WHERE to_char(started_at, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')",
    ))
    if MONTHLY_BUDGET - used <= 0:
        raise HTTPException(
            status_code=429,
            detail=f"Monthly API budget exhausted (used {used}/{MONTHLY_BUDGET} this month)",
        )

    if db.query(
        "SELECT id FROM linkedin_runs WHERE completed_at IS NULL "
        "AND started_at > NOW() - INTERVAL '1 hour' LIMIT 1"
    ):
        raise HTTPException(status_code=409, detail="A sweep is already in progress")

    sched = db.get_schedule() or {}

    def _pick(req_val, sched_key, default):
        if req_val is not None:
            return req_val
        sv = sched.get(sched_key)
        return sv if sv is not None else default

    p = {
        "max_keywords": _pick(payload.max_keywords, "max_keywords", 5),
        "max_pages": _pick(payload.max_pages, "max_pages", 1),
        "categories": _csv_to_list(
            payload.categories if payload.categories is not None else sched.get("categories")
        ),
        "min_volume": _pick(payload.min_volume, "min_volume", "HIGH"),
        "min_source_count": payload.min_source_count if payload.min_source_count is not None else 1,
        "date_posted": _pick(payload.date_posted, "date_posted", "past_week"),
        "sort_by": _pick(payload.sort_by, "sort_by", "date_posted"),
    }

    run_id = db.start_run(mode="api_run_now")
    db.sync()  # push the new run row so the background DB + pollers see it
    background_tasks.add_task(_run_sweep_bg, run_id, p)
    logger.info("run-now accepted: run_id=%s params=%s", run_id, p)
    return RunNowResponse(
        run_id=run_id,
        status="started",
        message=f"Sweep started in background. Poll /api/linkedin/run-status/{run_id} for completion.",
    )


@router.get("/run-status/{run_id}", response_model=RunStatusResponse)
def run_status(run_id: int, db: LinkedInDatabase = Depends(get_db)) -> RunStatusResponse:
    rows = db.query(
        "SELECT id, started_at, completed_at, keywords_queried, api_calls_made, "
        "posts_ingested, posts_classified, error_count, notes "
        "FROM linkedin_runs WHERE id = %s",
        (run_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"run_id {run_id} not found")
    r = rows[0]
    if r["completed_at"] is None:
        status_ = "running"
    elif (r["error_count"] or 0) > 0:
        status_ = "failed"
    else:
        status_ = "completed"
    return RunStatusResponse(
        run_id=run_id,
        status=status_,
        started_at=r["started_at"],
        completed_at=r["completed_at"],
        stats=RunStats(
            keywords_queried=r["keywords_queried"],
            api_calls_made=r["api_calls_made"],
            posts_ingested=r["posts_ingested"],
            posts_classified=r["posts_classified"],
            error_count=r["error_count"],
        ),
        notes=r["notes"],
    )

"""
Lexicon config CRUD API — Phase 1b (/api/config).

Postgres-backed admin CRUD over the three lexicon tables the X scraper reads:
  - keyword_classes  (class_key PK)
  - keywords         (id PK, UNIQUE(keyword, class_key), FK -> keyword_classes)
  - influencers      (handle PK)

Backed by the existing X `Database` psycopg pool (db._conn() for writes,
db.query() for reads). Mirrors the Pydantic response-model pattern in
api/routers/linkedin.py.

Schema notes (verified against backend/db/postgres_schema.sql, not guessed):
  - Only keyword_classes has an `updated_at` column; keywords/influencers do
    not, so the dynamic UPDATE builder only touches updated_at for classes.
  - The keywords.class_key FK has NO ON DELETE CASCADE, so deleting a class
    removes its keywords first inside one transaction.
  - Timestamp columns come back from psycopg as datetime objects; responses
    declare them as str, so rows are stringified before validation.
  - Edits take effect on the next sweep — the lexicon loader has no caching.
"""
from __future__ import annotations

import datetime as _dt
import logging
from typing import Any, Optional

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query

from api.deps import verify_cron_secret
from pydantic import BaseModel

from agents.brand_visibility.x.db import Database

router = APIRouter()

logger = logging.getLogger("uvicorn.error")


def get_db() -> Database:
    """One Database per request. The Postgres pool is shared, so this is cheap;
    skip_schema_init=True because DDL runs out-of-band (see postgres_schema.sql)."""
    return Database(skip_schema_init=True)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _stringify_times(row: dict[str, Any]) -> dict[str, Any]:
    """psycopg returns TIMESTAMPTZ columns as datetime; the response models type
    them as str. Convert datetime/date values to ISO strings, leave None as None."""
    return {
        k: (v.isoformat() if isinstance(v, (_dt.datetime, _dt.date)) else v)
        for k, v in row.items()
    }


def _rows(db: Database, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Execute SQL and return rows as stringified dicts. Works for SELECT and for
    writes using RETURNING; returns [] when there is no result set. The _conn
    context manager commits on success / rolls back on error."""
    with db._conn() as conn:
        cur = conn.execute(sql, params or None)
        if not cur.description:
            return []
        cols = [d[0] for d in cur.description]
        return [_stringify_times(dict(zip(cols, r))) for r in cur.fetchall()]


def build_update(
    table: str,
    id_col: str,
    id_val: Any,
    updates: dict[str, Any],
    touch_updated_at: bool,
) -> tuple[Optional[str], Optional[list]]:
    """Build a dynamic UPDATE from only the provided (non-None) fields, RETURNING *.

    touch_updated_at appends `updated_at = NOW()` — only valid for keyword_classes
    (keywords/influencers have no updated_at column). Returns (None, None) when
    nothing was provided so the caller can no-op.
    """
    provided = {k: v for k, v in updates.items() if v is not None}
    if not provided:
        return None, None
    set_clauses = [f"{k} = %s" for k in provided]
    values: list[Any] = list(provided.values())
    if touch_updated_at:
        set_clauses.append("updated_at = NOW()")
    values.append(id_val)
    sql = f"UPDATE {table} SET {', '.join(set_clauses)} WHERE {id_col} = %s RETURNING *"
    return sql, values


def normalize_handle(h: str) -> str:
    """Influencer handles are stored with a leading @. Strip whitespace and add
    the @ prefix if missing."""
    h = h.strip()
    if not h.startswith("@"):
        h = "@" + h
    return h


# ==========================================================================
# RESOURCE 1 — keyword_classes
# ==========================================================================

class KeywordClassResponse(BaseModel):
    class_key: str
    name: str
    description: str | None = None
    priority: str
    enabled: int
    display_order: int
    color_hex: str | None = None
    updated_at: str
    keyword_count: int = 0  # populated on list only


class KeywordClassListResponse(BaseModel):
    classes: list[KeywordClassResponse]
    total: int


class ClassCreateRequest(BaseModel):
    class_key: str
    name: str
    description: str | None = None
    priority: str = "STANDARD"
    enabled: int = 1
    display_order: int = 0
    color_hex: str | None = None


class ClassUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    priority: str | None = None
    enabled: int | None = None
    display_order: int | None = None
    color_hex: str | None = None


@router.get("/classes", response_model=KeywordClassListResponse, dependencies=[Depends(verify_cron_secret)])
def list_classes() -> KeywordClassListResponse:
    db = get_db()
    rows = _rows(
        db,
        "SELECT c.*, COUNT(k.id) AS keyword_count "
        "FROM keyword_classes c "
        "LEFT JOIN keywords k ON k.class_key = c.class_key "
        "GROUP BY c.class_key "
        "ORDER BY c.display_order, c.class_key",
    )
    classes = [KeywordClassResponse(**r) for r in rows]
    return KeywordClassListResponse(classes=classes, total=len(classes))


@router.get("/classes/{class_key}", response_model=KeywordClassResponse, dependencies=[Depends(verify_cron_secret)])
def get_class(class_key: str) -> KeywordClassResponse:
    db = get_db()
    rows = _rows(db, "SELECT * FROM keyword_classes WHERE class_key = %s", (class_key,))
    if not rows:
        raise HTTPException(status_code=404, detail=f"class_key {class_key!r} not found")
    return KeywordClassResponse(**rows[0])


@router.post("/classes", response_model=KeywordClassResponse, status_code=201, dependencies=[Depends(verify_cron_secret)])
def create_class(body: ClassCreateRequest) -> KeywordClassResponse:
    db = get_db()
    try:
        rows = _rows(
            db,
            "INSERT INTO keyword_classes "
            "(class_key, name, description, priority, enabled, display_order, color_hex) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (body.class_key, body.name, body.description, body.priority,
             body.enabled, body.display_order, body.color_hex),
        )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=f"class_key {body.class_key!r} already exists")
    return KeywordClassResponse(**rows[0])


@router.put("/classes/{class_key}", response_model=KeywordClassResponse, dependencies=[Depends(verify_cron_secret)])
def update_class(class_key: str, body: ClassUpdateRequest) -> KeywordClassResponse:
    db = get_db()
    sql, values = build_update(
        "keyword_classes", "class_key", class_key, body.model_dump(), touch_updated_at=True
    )
    if sql is None:
        # nothing to update — return current row (404 if it doesn't exist)
        return get_class(class_key)
    rows = _rows(db, sql, tuple(values))
    if not rows:
        raise HTTPException(status_code=404, detail=f"class_key {class_key!r} not found")
    return KeywordClassResponse(**rows[0])


@router.delete("/classes/{class_key}", dependencies=[Depends(verify_cron_secret)])
def delete_class(class_key: str) -> dict:
    db = get_db()
    # FK is not ON DELETE CASCADE — remove keywords then the class in one txn.
    with db._conn() as conn:
        kw_removed = conn.execute(
            "SELECT COUNT(*) FROM keywords WHERE class_key = %s", [class_key]
        ).fetchone()[0]
        conn.execute("DELETE FROM keywords WHERE class_key = %s", [class_key])
        deleted = conn.execute(
            "DELETE FROM keyword_classes WHERE class_key = %s RETURNING class_key", [class_key]
        ).fetchone()
    if not deleted:
        raise HTTPException(status_code=404, detail=f"class_key {class_key!r} not found")
    return {"ok": True, "deleted_class": class_key, "keywords_removed": kw_removed}


# ==========================================================================
# RESOURCE 2 — keywords
# ==========================================================================

class KeywordResponse(BaseModel):
    id: int
    keyword: str
    class_key: str
    sub_category: str | None = None
    intent: str | None = None
    priority: str | None = None
    search_query: str | None = None
    signal_type: str | None = None
    enabled: int
    added_at: str
    added_by: str | None = None
    last_used_at: str | None = None
    hit_count: int
    notes: str | None = None


class KeywordListResponse(BaseModel):
    keywords: list[KeywordResponse]
    total: int


class KeywordCreateRequest(BaseModel):
    keyword: str
    class_key: str
    sub_category: str | None = None
    intent: str | None = None
    priority: str | None = None
    search_query: str | None = None
    signal_type: str | None = None
    enabled: int = 1
    added_by: str = "api"
    notes: str | None = None


class KeywordUpdateRequest(BaseModel):
    keyword: str | None = None
    class_key: str | None = None
    sub_category: str | None = None
    intent: str | None = None
    priority: str | None = None
    search_query: str | None = None
    signal_type: str | None = None
    enabled: int | None = None
    notes: str | None = None


@router.get("/keywords", response_model=KeywordListResponse, dependencies=[Depends(verify_cron_secret)])
def list_keywords(
    class_key: Optional[str] = Query(None),
    enabled: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
) -> KeywordListResponse:
    db = get_db()
    clauses: list[str] = []
    params: list[Any] = []
    if class_key is not None:
        clauses.append("class_key = %s")
        params.append(class_key)
    if enabled is not None:
        clauses.append("enabled = %s")
        params.append(enabled)
    if search:
        clauses.append("keyword ILIKE %s")
        params.append(f"%{search}%")
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = _rows(db, f"SELECT * FROM keywords{where} ORDER BY id", tuple(params))
    keywords = [KeywordResponse(**r) for r in rows]
    return KeywordListResponse(keywords=keywords, total=len(keywords))


@router.get("/keywords/{keyword_id}", response_model=KeywordResponse, dependencies=[Depends(verify_cron_secret)])
def get_keyword(keyword_id: int) -> KeywordResponse:
    db = get_db()
    rows = _rows(db, "SELECT * FROM keywords WHERE id = %s", (keyword_id,))
    if not rows:
        raise HTTPException(status_code=404, detail=f"keyword id {keyword_id} not found")
    return KeywordResponse(**rows[0])


@router.post("/keywords", response_model=KeywordResponse, status_code=201, dependencies=[Depends(verify_cron_secret)])
def create_keyword(body: KeywordCreateRequest) -> KeywordResponse:
    db = get_db()
    try:
        rows = _rows(
            db,
            "INSERT INTO keywords "
            "(keyword, class_key, sub_category, intent, priority, search_query, "
            " signal_type, enabled, added_by, notes) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (body.keyword, body.class_key, body.sub_category, body.intent, body.priority,
             body.search_query, body.signal_type, body.enabled, body.added_by, body.notes),
        )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail=f"keyword {body.keyword!r} already exists in class {body.class_key!r}",
        )
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(
            status_code=400, detail=f"class_key {body.class_key!r} does not exist"
        )
    return KeywordResponse(**rows[0])


@router.put("/keywords/{keyword_id}", response_model=KeywordResponse, dependencies=[Depends(verify_cron_secret)])
def update_keyword(keyword_id: int, body: KeywordUpdateRequest) -> KeywordResponse:
    db = get_db()
    sql, values = build_update(
        "keywords", "id", keyword_id, body.model_dump(), touch_updated_at=False
    )
    if sql is None:
        return get_keyword(keyword_id)
    try:
        rows = _rows(db, sql, tuple(values))
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail="keyword/class_key combination already exists")
    except psycopg.errors.ForeignKeyViolation:
        raise HTTPException(status_code=400, detail="class_key does not exist")
    if not rows:
        raise HTTPException(status_code=404, detail=f"keyword id {keyword_id} not found")
    return KeywordResponse(**rows[0])


@router.delete("/keywords/{keyword_id}", dependencies=[Depends(verify_cron_secret)])
def delete_keyword(keyword_id: int) -> dict:
    db = get_db()
    deleted = _rows(db, "DELETE FROM keywords WHERE id = %s RETURNING id", (keyword_id,))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"keyword id {keyword_id} not found")
    return {"ok": True}


@router.patch("/keywords/{keyword_id}/toggle", response_model=KeywordResponse, dependencies=[Depends(verify_cron_secret)])
def toggle_keyword(keyword_id: int) -> KeywordResponse:
    db = get_db()
    rows = _rows(
        db, "UPDATE keywords SET enabled = 1 - enabled WHERE id = %s RETURNING *", (keyword_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"keyword id {keyword_id} not found")
    return KeywordResponse(**rows[0])


# ==========================================================================
# RESOURCE 3 — influencers
# ==========================================================================

class InfluencerResponse(BaseModel):
    handle: str
    display_name: str | None = None
    specialty: str | None = None
    follower_tier: str | None = None
    priority: str | None = None
    enabled: int
    added_at: str
    added_by: str | None = None
    notes: str | None = None
    last_pulled_at: str | None = None
    posts_pulled: int


class InfluencerListResponse(BaseModel):
    influencers: list[InfluencerResponse]
    total: int


class InfluencerCreateRequest(BaseModel):
    handle: str  # normalized to include @ prefix if missing
    display_name: str | None = None
    specialty: str | None = None
    follower_tier: str | None = None
    priority: str | None = None
    enabled: int = 1
    added_by: str = "api"
    notes: str | None = None


class InfluencerUpdateRequest(BaseModel):
    display_name: str | None = None
    specialty: str | None = None
    follower_tier: str | None = None
    priority: str | None = None
    enabled: int | None = None
    notes: str | None = None


@router.get("/influencers", response_model=InfluencerListResponse, dependencies=[Depends(verify_cron_secret)])
def list_influencers(
    follower_tier: Optional[str] = Query(None),
    enabled: Optional[int] = Query(None),
) -> InfluencerListResponse:
    db = get_db()
    clauses: list[str] = []
    params: list[Any] = []
    if follower_tier is not None:
        clauses.append("follower_tier = %s")
        params.append(follower_tier)
    if enabled is not None:
        clauses.append("enabled = %s")
        params.append(enabled)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
    rows = _rows(db, f"SELECT * FROM influencers{where} ORDER BY handle", tuple(params))
    influencers = [InfluencerResponse(**r) for r in rows]
    return InfluencerListResponse(influencers=influencers, total=len(influencers))


@router.get("/influencers/{handle}", response_model=InfluencerResponse, dependencies=[Depends(verify_cron_secret)])
def get_influencer(handle: str) -> InfluencerResponse:
    db = get_db()
    handle = normalize_handle(handle)
    rows = _rows(db, "SELECT * FROM influencers WHERE handle = %s", (handle,))
    if not rows:
        raise HTTPException(status_code=404, detail=f"handle {handle!r} not found")
    return InfluencerResponse(**rows[0])


@router.post("/influencers", response_model=InfluencerResponse, status_code=201, dependencies=[Depends(verify_cron_secret)])
def create_influencer(body: InfluencerCreateRequest) -> InfluencerResponse:
    db = get_db()
    handle = normalize_handle(body.handle)
    try:
        rows = _rows(
            db,
            "INSERT INTO influencers "
            "(handle, display_name, specialty, follower_tier, priority, enabled, added_by, notes) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
            (handle, body.display_name, body.specialty, body.follower_tier,
             body.priority, body.enabled, body.added_by, body.notes),
        )
    except psycopg.errors.UniqueViolation:
        raise HTTPException(status_code=409, detail=f"handle {handle!r} already exists")
    return InfluencerResponse(**rows[0])


@router.put("/influencers/{handle}", response_model=InfluencerResponse, dependencies=[Depends(verify_cron_secret)])
def update_influencer(handle: str, body: InfluencerUpdateRequest) -> InfluencerResponse:
    db = get_db()
    handle = normalize_handle(handle)
    sql, values = build_update(
        "influencers", "handle", handle, body.model_dump(), touch_updated_at=False
    )
    if sql is None:
        return get_influencer(handle)
    rows = _rows(db, sql, tuple(values))
    if not rows:
        raise HTTPException(status_code=404, detail=f"handle {handle!r} not found")
    return InfluencerResponse(**rows[0])


@router.delete("/influencers/{handle}", dependencies=[Depends(verify_cron_secret)])
def delete_influencer(handle: str) -> dict:
    db = get_db()
    handle = normalize_handle(handle)
    deleted = _rows(db, "DELETE FROM influencers WHERE handle = %s RETURNING handle", (handle,))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"handle {handle!r} not found")
    return {"ok": True}


@router.patch("/influencers/{handle}/toggle", response_model=InfluencerResponse, dependencies=[Depends(verify_cron_secret)])
def toggle_influencer(handle: str) -> InfluencerResponse:
    db = get_db()
    handle = normalize_handle(handle)
    rows = _rows(
        db, "UPDATE influencers SET enabled = 1 - enabled WHERE handle = %s RETURNING *", (handle,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"handle {handle!r} not found")
    return InfluencerResponse(**rows[0])

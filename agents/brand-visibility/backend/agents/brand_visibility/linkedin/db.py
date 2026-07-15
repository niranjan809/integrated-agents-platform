"""
KA018 data-access layer for the linkedin_* tables.

Postgres migration Phase 2b (LinkedIn / KA018): full SQL-dialect swap — %s
placeholders, ON CONFLICT upserts, NOW()/to_char date math, RETURNING id in
place of lastrowid, NULLS LAST on nullable DESC sorts. Connection goes through
the shared psycopg pool (shared/db/postgres_client.py). The dead libsql
schema/migration scaffolding (SCHEMA_STATEMENTS, _migrate_columns) has been
removed — the schema lives in backend/db/postgres_schema.sql. Agent-owned
tables: linkedin_posts, linkedin_runs, linkedin_schedule, linkedin_active_prompt,
linkedin_classification_costs. linkedin_keywords is managed externally (read-only).
"""
from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator

from dotenv import load_dotenv

from shared.db.postgres_client import get_connection, get_pool

# Load .env so the module is self-sufficient when imported directly (e.g. a bare
# `python -c "from linkedin.db import LinkedInDatabase"`), not only via shared.config.settings.
load_dotenv()

logger = logging.getLogger(__name__)

# --- Legacy Turso / libSQL config (removed in Postgres migration) ---
# The connection now goes through shared/db/postgres_client.py (POSTGRES_URL).
# Former constants: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, TURSO_SYNC_INTERVAL,
# REPLICA_PATH (data/ka018_replica.db) — all obsolete under Postgres.

# Volume is ordinal — used by get_keywords(min_volume=...).
_VOLUME_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}

_POST_COLS = [
    "post_urn", "author_name", "author_headline", "author_urn",
    "author_profile_url", "author_followers", "text", "posted_at",
    "like_count", "comment_count", "repost_count", "post_url",
    "matched_keyword", "query_string", "source_class", "matched_category",
]

_SCHEDULE_COLUMNS = {
    "enabled", "interval_minutes", "max_keywords", "max_pages", "categories",
    "min_volume", "date_posted", "sort_by", "last_run_at", "next_run_at",
}


def _row_to_dict(row, columns: list[str]) -> dict:
    return {col: val for col, val in zip(columns, row)}


class LinkedInDatabase:
    """Postgres-backed data access for KA018's linkedin_* tables."""

    def __init__(
        self,
        sync_interval: int | None = None,
        skip_schema_init: bool = False,
        url: str | None = None,
        token: str | None = None,
    ) -> None:
        """Postgres-backed LinkedInDatabase.

        All constructor args (sync_interval, skip_schema_init, url, token) are
        accepted-but-ignored for backward compatibility with the libsql call
        sites (orchestrator, classifier, api routes, scripts). The schema is
        created out-of-band via backend/db/postgres_schema.sql, so there is no
        per-instance DDL/sync to run — the pool opens lazily on first use."""
        self._pool = get_pool()
        self._init_schema()

    def _init_schema(self) -> None:
        """No-op. Postgres schema is created via backend/db/postgres_schema.sql.
        Kept for backward compatibility with any callers."""
        pass

    @contextmanager
    def _conn(self) -> Generator[Any, None, None]:
        """Check out a pooled Postgres connection for the duration of a block.
        Commit-on-success / rollback-on-error + return-to-pool are handled by
        get_connection(). Same shape as the old libsql context manager."""
        with get_connection() as conn:
            yield conn

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        # psycopg only interpolates %s when params is non-None; pass None for the
        # empty case so parameterless queries are sent verbatim.
        with self._conn() as conn:
            cur = conn.execute(sql, params or None)
            cols = [d[0] for d in cur.description] if cur.description else []
            return [_row_to_dict(row, cols) for row in cur.fetchall()]

    def sync(self) -> None:
        """No-op. Postgres needs no explicit sync (was the libsql embedded
        replica). Kept so existing .sync() call sites keep working."""
        pass

    # --- Keywords (read-only; managed externally) ---
    def get_keywords(
        self,
        categories: list[str] | None = None,
        min_volume: str | None = None,
        min_source_count: int = 1,
        active_only: bool = True,
        limit: int | None = None,
    ) -> list[dict]:
        """Read linkedin_keywords with optional filters. min_volume is ordinal
        (LOW<MEDIUM<HIGH): 'MEDIUM' returns MEDIUM and HIGH. Ordered by
        source_count desc (cross-LLM agreement first), then volume desc."""
        clauses: list[str] = []
        params: list[Any] = []
        if active_only:
            clauses.append("is_active = 1")
        if categories:
            clauses.append(f"category IN ({', '.join('%s' for _ in categories)})")
            params.extend(categories)
        if min_volume:
            allowed = [v for v, r in _VOLUME_RANK.items()
                       if r >= _VOLUME_RANK.get(min_volume.upper(), 0)]
            if allowed:
                clauses.append(f"volume_estimate IN ({', '.join('%s' for _ in allowed)})")
                params.extend(allowed)
        if min_source_count and min_source_count > 1:
            clauses.append("source_count >= %s")
            params.append(min_source_count)

        sql = "SELECT * FROM linkedin_keywords"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += (" ORDER BY source_count DESC, CASE volume_estimate "
                "WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC")
        if limit:
            sql += " LIMIT %s"
            params.append(limit)
        return self.query(sql, tuple(params))

    # --- Posts ---
    def insert_post(self, row: dict) -> int | None:
        """Insert one normalized post. Returns the new row id, or None on a
        UNIQUE(post_urn) conflict (already ingested) or a missing post_urn."""
        post_urn = row.get("post_urn")
        if not post_urn:
            logger.warning("insert_post: row has no post_urn — skipping")
            return None
        raw = row.get("raw")
        _zero = {"like_count", "comment_count", "repost_count"}  # default 0, not NULL
        values = [row.get(c, 0) if c in _zero else row.get(c) for c in _POST_COLS]
        values += [json.dumps(raw) if raw is not None else None, self._now()]
        placeholders = ", ".join("%s" for _ in range(len(_POST_COLS) + 2))
        with self._conn() as conn:
            if conn.execute("SELECT 1 FROM linkedin_posts WHERE post_urn = %s",
                            [post_urn]).fetchall():
                return None
            # ON CONFLICT (post_urn) DO NOTHING guards the race; RETURNING id
            # yields the new id, or no row (fetchone() -> None) on conflict.
            cur = conn.execute(
                f"INSERT INTO linkedin_posts "
                f"({', '.join(_POST_COLS)}, raw_json, ingested_at, status) "
                f"VALUES ({placeholders}, 'PENDING') "
                f"ON CONFLICT (post_urn) DO NOTHING RETURNING id",
                values,
            )
            new = cur.fetchone()
            return new[0] if new else None

    def insert_posts_batch(self, rows: list[dict]) -> tuple[int, int]:
        """Insert many posts. Returns (inserted, skipped_duplicates)."""
        inserted = skipped = 0
        for row in rows:
            if self.insert_post(row) is not None:
                inserted += 1
            else:
                skipped += 1
        return inserted, skipped

    def list_recent_posts(self, limit: int = 50, category: str | None = None) -> list[dict]:
        if category:
            return self.query(
                "SELECT * FROM linkedin_posts WHERE matched_category = %s "
                "ORDER BY ingested_at DESC NULLS LAST LIMIT %s", (category, limit))
        return self.query(
            "SELECT * FROM linkedin_posts ORDER BY ingested_at DESC NULLS LAST LIMIT %s",
            (limit,))

    def count_posts(self) -> int:
        rows = self.query("SELECT COUNT(*) AS c FROM linkedin_posts")
        return rows[0]["c"] if rows else 0

    def count_posts_by_category(self) -> dict:
        rows = self.query("SELECT matched_category, COUNT(*) AS c FROM linkedin_posts "
                          "GROUP BY matched_category ORDER BY c DESC")
        return {r["matched_category"]: r["c"] for r in rows}

    # --- Run lifecycle ---
    def start_run(self, mode: str) -> int:
        with self._conn() as conn:
            cur = conn.execute(
                "INSERT INTO linkedin_runs (agent_id, started_at, mode, status) "
                "VALUES ('KA018', %s, %s, 'running') RETURNING id", (self._now(), mode))
            return cur.fetchone()[0]

    def finish_run(
        self,
        run_id: int,
        keywords_queried: int,
        api_calls_made: int,
        posts_ingested: int,
        posts_classified: int = 0,
        error_count: int = 0,
        notes: str | None = None,
    ) -> None:
        status = "failed" if error_count and posts_ingested == 0 else "completed"
        with self._conn() as conn:
            conn.execute(
                "UPDATE linkedin_runs SET completed_at=%s, status=%s, keywords_queried=%s, "
                "api_calls_made=%s, posts_ingested=%s, posts_classified=%s, "
                "error_count=%s, notes=%s WHERE id=%s",
                (self._now(), status, keywords_queried, api_calls_made,
                 posts_ingested, posts_classified, error_count, notes, run_id))

    # --- Schedule (single row, id = 1) ---
    def get_schedule(self) -> dict:
        """Return the single linkedin_schedule row (id=1). Raises if missing —
        the row is seeded via postgres_schema.sql, so a missing row signals a
        real problem (matches X's x_schedule pattern)."""
        # Row seeded via postgres_schema.sql, no lazy-create.
        rows = self.query("SELECT * FROM linkedin_schedule WHERE id = 1")
        if not rows:
            raise RuntimeError(
                "linkedin_schedule row (id=1) is missing — schema seed did not run"
            )
        return rows[0]

    def update_schedule(self, **kwargs: Any) -> None:
        """Update schedule fields. Unknown keys are ignored with a warning."""
        self.get_schedule()  # ensure the row exists
        set_clauses: list[str] = []
        params: list[Any] = []
        for col, val in kwargs.items():
            if col not in _SCHEDULE_COLUMNS:
                logger.warning("update_schedule: ignoring unknown field %r", col)
                continue
            set_clauses.append(f"{col} = %s")
            params.append(val)
        if not set_clauses:
            return
        set_clauses.append("updated_at = %s")
        params.extend([self._now(), 1])
        with self._conn() as conn:
            conn.execute(f"UPDATE linkedin_schedule SET {', '.join(set_clauses)} "
                         f"WHERE id = %s", tuple(params))

    # --- Active prompt (single-row pointer; id = 1) ---
    def get_active_prompt(self) -> dict | None:
        rows = self.query("SELECT * FROM linkedin_active_prompt WHERE id = 1")
        return rows[0] if rows else None

    def set_active_prompt(self, prompt_text: str, prompt_version: str = "v1") -> None:
        """Upsert the single active prompt row (id = 1)."""
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO linkedin_active_prompt (id, prompt_text, prompt_version, "
                "updated_at) VALUES (1, %s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET prompt_text=EXCLUDED.prompt_text, "
                "prompt_version=EXCLUDED.prompt_version, updated_at=EXCLUDED.updated_at",
                (prompt_text, prompt_version, self._now()))

    # --- Classification costs (LLM cost tracking) ---
    def record_classification_cost(
        self, post_id: int, model: str, input_tokens: int | None,
        output_tokens: int | None, cost_usd: float | None,
    ) -> None:
        # post_id is a FOREIGN KEY -> linkedin_posts(id). Postgres ENFORCES this
        # (SQLite did not by default), so post_id must reference an existing row.
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO linkedin_classification_costs (post_id, model, "
                "input_tokens, output_tokens, cost_usd, classified_at) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (post_id, model, input_tokens, output_tokens, cost_usd, self._now()))

    def total_cost_this_month(self) -> float:
        # classified_at is a TEXT column (ISO-8601 strings), so cast to timestamptz
        # before to_char for the month comparison.
        rows = self.query(
            "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM "
            "linkedin_classification_costs WHERE "
            "to_char(classified_at::timestamptz, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')")
        return float(rows[0]["total"]) if rows else 0.0

    def cost_summary_by_model(self) -> list[tuple]:
        """Return [(model, total_cost_usd, post_count), ...] across all time."""
        rows = self.query(
            "SELECT model, COALESCE(SUM(cost_usd), 0) AS total, "
            "COUNT(DISTINCT post_id) AS posts FROM linkedin_classification_costs "
            "GROUP BY model ORDER BY total DESC")
        return [(r["model"], float(r["total"]), r["posts"]) for r in rows]

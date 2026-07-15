"""
Agent-owned data access layer. Reads/writes to Postgres via psycopg v3, using
a shared connection pool (shared/db/postgres_client.py).

Postgres migration Phase 2 (X / KA017): full SQL-dialect swap — %s placeholders,
ON CONFLICT upserts, NOW()/make_interval date math, to_char month keys, ILIKE
for user text search, NULLS LAST on nullable DESC sorts, and RETURNING id in
place of lastrowid. The dead libsql schema/migration scaffolding (SCHEMA_STATEMENTS,
_migrate_*) has been removed — the schema lives in backend/db/postgres_schema.sql.
Method signatures are unchanged, so callers don't change. (LinkedIn db.py is Phase 2b.)

psycopg note: psycopg only interpolates %s when params is non-None, so query()
passes `params or None`; queries with a literal % (e.g. LIKE 'URGENT%') and no
params are sent verbatim. Fragments that always run WITH params (see _POSTS_ORDER)
escape a literal % as %%.
"""
from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator

from shared.db.postgres_client import get_connection, get_pool

logger = logging.getLogger(__name__)


def _row_to_dict(row, columns: list[str]) -> dict:
    """psycopg default-cursor rows are tuples; pair them with column names from
    cursor.description."""
    return {col: val for col, val in zip(columns, row)}


class Database:
    """Postgres-backed data access via the shared psycopg connection pool."""

    def __init__(self, db_path: str | None = None, skip_schema_init: bool = False,
                 sync_interval: int | None = None,
                 replica_path: str | None = None,
                 url: str | None = None, token: str | None = None) -> None:
        """Postgres-backed Database.

        All constructor args (db_path, skip_schema_init, sync_interval,
        replica_path, url, token) are accepted-but-ignored for backward
        compatibility with the libsql call sites throughout the codebase
        (orchestrator, scraper, classifier, api routes, scripts). The schema is
        now created out-of-band via backend/db/postgres_schema.sql, so there is
        no per-instance DDL/sync to run — the pool is opened lazily on first use.
        """
        self._pool = get_pool()
        self._init_schema()

    def _init_schema(self) -> None:
        """No-op. Postgres schema is created via backend/db/postgres_schema.sql,
        and the single-row seeds (x_active_prompt v1, x_schedule id=1) live in
        that file too. Kept as a method (called from __init__) for backward
        compatibility with any callers."""
        pass

    # Allowed enum values for useful_promoters
    _PROMOTION_KINDS = {"vendor", "self", "agency", "course", "vc_portfolio"}
    _PROMOTION_TIERS = {"high", "medium", "low"}

    def add_useful_promoter(
        self,
        tweet_id: str,
        author_handle: str,
        author_followers: int,
        matched_class: str,
        promotion_kind: str,
        tier: str,
    ) -> bool:
        """Insert a MARKETING tweet into useful_promoters.

        Returns True if a row was inserted, False if the tweet_id was already
        present (idempotent — re-classification/backfill never duplicates).
        Raises ValueError on an invalid promotion_kind or tier.
        """
        if promotion_kind not in self._PROMOTION_KINDS:
            raise ValueError(
                f"invalid promotion_kind {promotion_kind!r}; "
                f"must be one of {sorted(self._PROMOTION_KINDS)}"
            )
        if tier not in self._PROMOTION_TIERS:
            raise ValueError(
                f"invalid tier {tier!r}; must be one of {sorted(self._PROMOTION_TIERS)}"
            )
        with self._conn() as conn:
            existing = conn.execute(
                "SELECT 1 FROM useful_promoters WHERE tweet_id = %s", [tweet_id]
            ).fetchall()
            if existing:
                return False
            # ON CONFLICT DO NOTHING as belt-and-suspenders against UNIQUE(tweet_id).
            conn.execute(
                """INSERT INTO useful_promoters
                   (author_handle, author_followers, matched_class, tweet_id,
                    promotion_kind, tier, added_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (tweet_id) DO NOTHING""",
                [
                    author_handle,
                    author_followers,
                    matched_class,
                    tweet_id,
                    promotion_kind,
                    tier,
                    self._now(),
                ],
            )
            return True

    # ------------------------------------------------------------------
    # Author reputation overlay
    # ------------------------------------------------------------------

    def upsert_author_reputation(self, author_handle: str) -> dict:
        """Recompute and upsert reputation for a single author.

        Reads all of this author's CLASSIFIED tweets, computes counts + label,
        writes to author_reputation (preserving first_seen_at). Idempotent.
        Returns the new reputation row as a dict (empty dict if no tweets).
        """
        from agents.brand_visibility.x.reputation import (
            compute_promotional_ratio,
            derive_reputation_label,
        )

        if not author_handle:
            return {}

        rows = self.query(
            """SELECT intent_signal, relevance_score
               FROM scraped_tweets
               WHERE author_handle = %s AND status = 'CLASSIFIED'""",
            (author_handle,),
        )
        if not rows:
            return {}

        total = len(rows)
        marketing = sum(1 for r in rows if r.get("intent_signal") == "MARKETING")
        govt = sum(1 for r in rows if r.get("intent_signal") == "GOVT_PROMOTION")
        noise = sum(1 for r in rows if (r.get("relevance_score") or 0) < 40)
        signal_intents = {"OBSERVATION", "RECOMMENDATION", "BUILDER_PAIN", "BUILDER_QUESTION"}
        signal = sum(1 for r in rows if r.get("intent_signal") in signal_intents)

        ratio = compute_promotional_ratio(total, marketing, govt)
        label = derive_reputation_label(total, marketing, govt)
        now = self._now()

        with self._conn() as conn:
            conn.execute(
                """INSERT INTO author_reputation
                   (author_handle, total_tweets, marketing_count, govt_promotion_count,
                    signal_count, noise_count, promotional_ratio, reputation_label,
                    first_seen_at, last_updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (author_handle) DO UPDATE SET
                       total_tweets = EXCLUDED.total_tweets,
                       marketing_count = EXCLUDED.marketing_count,
                       govt_promotion_count = EXCLUDED.govt_promotion_count,
                       signal_count = EXCLUDED.signal_count,
                       noise_count = EXCLUDED.noise_count,
                       promotional_ratio = EXCLUDED.promotional_ratio,
                       reputation_label = EXCLUDED.reputation_label,
                       last_updated_at = EXCLUDED.last_updated_at""",
                [author_handle, total, marketing, govt, signal, noise, ratio, label, now, now],
            )

        return {
            "author_handle": author_handle,
            "total_tweets": total,
            "marketing_count": marketing,
            "govt_promotion_count": govt,
            "signal_count": signal,
            "noise_count": noise,
            "promotional_ratio": ratio,
            "reputation_label": label,
        }

    def get_author_reputation_label(self, author_handle: str) -> str:
        """Return the reputation_label for an author, or 'unknown' if not found."""
        if not author_handle:
            return "unknown"
        rows = self.query(
            "SELECT reputation_label FROM author_reputation WHERE author_handle = %s",
            (author_handle,),
        )
        if not rows:
            return "unknown"
        return rows[0]["reputation_label"]

    def update_tweet_reputation_label(self, tweet_id: str, label: str) -> None:
        """Set author_reputation_label on a single tweet row."""
        with self._conn() as conn:
            conn.execute(
                "UPDATE scraped_tweets SET author_reputation_label = %s WHERE tweet_id = %s",
                [label, tweet_id],
            )

    def stamp_reputation_by_handle(self, author_handle: str, label: str) -> None:
        """Stamp the reputation label on all of an author's CLASSIFIED tweets in
        one statement — one round-trip per author instead of one per tweet."""
        with self._conn() as conn:
            conn.execute(
                "UPDATE scraped_tweets SET author_reputation_label = %s "
                "WHERE author_handle = %s AND status = 'CLASSIFIED'",
                [label, author_handle],
            )

    @contextmanager
    def _conn(self) -> Generator[Any, None, None]:
        """Check out a pooled Postgres connection for the duration of a block.

        Same shape as the old libsql context manager (callers are unchanged):
        yields a connection, commits on success, rolls back on error. The
        commit/rollback + return-to-pool are handled by get_connection().
        """
        with get_connection() as conn:
            yield conn

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def sync(self) -> None:
        """No-op. Postgres needs no explicit sync (was the libsql embedded
        replica). Kept so the ~10 existing .sync() call sites keep working."""
        pass

    # ------------------------------------------------------------------
    # Tweet upsert — refreshes engagement + last_seen_at on re-encounter
    # ------------------------------------------------------------------

    def upsert_tweet(self, tweet: dict[str, Any]) -> None:
        now = self._now()
        ingested_at = tweet.get("ingested_at", now)
        is_builder = tweet.get("is_builder")
        if is_builder is not None:
            is_builder = int(bool(is_builder))
        # psycopg takes positional (%s) params in a sequence.
        values = [
            tweet.get("tweet_id"),
            tweet.get("created_at"),
            tweet.get("author_id"),
            tweet.get("author_handle"),
            tweet.get("author_followers"),
            tweet.get("author_bio"),
            tweet.get("text"),
            tweet.get("like_count"),
            tweet.get("reply_count"),
            tweet.get("retweet_count"),
            tweet.get("quote_count"),
            tweet.get("impression_count"),
            tweet.get("lang"),
            tweet.get("source_type"),
            tweet.get("matched_class"),
            tweet.get("matched_query"),
            tweet.get("source_handle"),
            tweet.get("conversation_id"),
            ingested_at,
            now,
            tweet.get("velocity"),
            tweet.get("priority_flag"),
        ]
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO scraped_tweets (
                  tweet_id, created_at, author_id, author_handle, author_followers,
                  author_bio, text, like_count, reply_count, retweet_count, quote_count,
                  impression_count, lang, source_type, matched_class, matched_query,
                  source_handle, conversation_id, ingested_at, last_seen_at,
                  velocity, priority_flag, status
                ) VALUES (
                  %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s,
                  %s, %s, %s, %s,
                  %s, %s, 'PENDING'
                )
                ON CONFLICT (tweet_id) DO UPDATE SET
                  like_count       = EXCLUDED.like_count,
                  reply_count      = EXCLUDED.reply_count,
                  retweet_count    = EXCLUDED.retweet_count,
                  quote_count      = EXCLUDED.quote_count,
                  impression_count = EXCLUDED.impression_count,
                  last_seen_at     = EXCLUDED.last_seen_at,
                  velocity         = EXCLUDED.velocity,
                  priority_flag    = CASE
                    WHEN scraped_tweets.priority_flag = 'URGENT_INFLUENCER_REPLY'
                    THEN 'URGENT_INFLUENCER_REPLY'
                    ELSE EXCLUDED.priority_flag
                  END
                """,
                values,
            )

    def insert_classification_cost(
        self,
        tweet_id: str,
        classified_at: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        input_cost_usd: float,
        output_cost_usd: float,
        total_cost_usd: float,
    ) -> None:
        """Record cost metadata for one classification call.

        Composite PK (tweet_id, classified_at) supports re-classification — a
        tweet classified twice at different times yields two cost rows. ON
        CONFLICT (tweet_id, classified_at) DO UPDATE makes a rerun of the same
        exact (tweet_id, timestamp) idempotent without raising.
        """
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO classification_costs (
                    tweet_id, classified_at, model,
                    input_tokens, output_tokens,
                    input_cost_usd, output_cost_usd, total_cost_usd
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tweet_id, classified_at) DO UPDATE SET
                    model           = EXCLUDED.model,
                    input_tokens    = EXCLUDED.input_tokens,
                    output_tokens   = EXCLUDED.output_tokens,
                    input_cost_usd  = EXCLUDED.input_cost_usd,
                    output_cost_usd = EXCLUDED.output_cost_usd,
                    total_cost_usd  = EXCLUDED.total_cost_usd
                """,
                (
                    tweet_id, classified_at, model,
                    input_tokens, output_tokens,
                    input_cost_usd, output_cost_usd, total_cost_usd,
                ),
            )

    def update_tweet_engagement(self, tweet_id: str, metrics: dict[str, int]) -> None:
        now = self._now()
        with self._conn() as conn:
            conn.execute(
                """
                UPDATE scraped_tweets SET
                  like_count    = %s,
                  reply_count   = %s,
                  retweet_count = %s,
                  quote_count   = %s,
                  last_seen_at  = %s
                WHERE tweet_id = %s
                """,
                [
                    metrics.get("like_count"),
                    metrics.get("reply_count"),
                    metrics.get("retweet_count"),
                    metrics.get("quote_count"),
                    now,
                    tweet_id,
                ],
            )

    # ------------------------------------------------------------------
    # Classifier queue
    # ------------------------------------------------------------------

    def get_unclassified(self, limit: int = 50) -> list[dict]:
        with self._conn() as conn:
            cur = conn.execute(
                "SELECT * FROM scraped_tweets WHERE status = 'PENDING' "
                "ORDER BY priority_flag, created_at DESC NULLS LAST LIMIT %s",
                (limit,),
            )
            cols = [d[0] for d in cur.description] if cur.description else []
            return [_row_to_dict(row, cols) for row in cur.fetchall()]

    def mark_classified(self, tweet_id: str, classification: dict[str, Any]) -> None:
        now = self._now()
        with self._conn() as conn:
            conn.execute(
                """
                UPDATE scraped_tweets SET
                  confirmed_class      = %s,
                  intent_signal        = %s,
                  quality_score        = %s,
                  is_builder           = %s,
                  theme_tags           = %s,
                  competitor_mentioned = %s,
                  summary_one_line     = %s,
                  classified_at        = %s,
                  status               = 'CLASSIFIED'
                WHERE tweet_id = %s
                """,
                [
                    classification["confirmed_class"],
                    classification["intent_signal"],
                    classification["quality_score"],
                    int(bool(classification["is_builder"])),
                    json.dumps(classification.get("theme_tags", [])),
                    json.dumps(classification.get("competitor_mentioned", [])),
                    classification.get("summary_one_line", ""),
                    now,
                    tweet_id,
                ],
            )

    # ------------------------------------------------------------------
    # Clustering / drafting
    # ------------------------------------------------------------------

    def get_for_clustering(self, quality_threshold: int = 6, days: int = 7) -> list[dict]:
        with self._conn() as conn:
            cur = conn.execute(
                """
                SELECT * FROM scraped_tweets
                WHERE status = 'CLASSIFIED'
                  AND quality_score >= %s
                  AND confirmed_class != 'NOISE'
                  AND classified_at >= NOW() - make_interval(days => %s)
                ORDER BY confirmed_class, quality_score DESC NULLS LAST
                """,
                (quality_threshold, days),
            )
            cols = [d[0] for d in cur.description] if cur.description else []
            return [_row_to_dict(row, cols) for row in cur.fetchall()]

    def get_pending_drafts(self) -> list[dict]:
        with self._conn() as conn:
            cur = conn.execute(
                "SELECT * FROM content_themes WHERE status = 'DRAFT' "
                "ORDER BY created_at DESC NULLS LAST"
            )
            cols = [d[0] for d in cur.description] if cur.description else []
            return [_row_to_dict(row, cols) for row in cur.fetchall()]

    def upsert_theme(self, theme: dict[str, Any]) -> None:
        now = self._now()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO content_themes (
                  theme_id, theme_class, tag_intersection, tweet_ids,
                  tweet_count, summary, created_at, status
                ) VALUES (
                  %s, %s, %s, %s,
                  %s, %s, %s, 'DRAFT'
                )
                ON CONFLICT (theme_id) DO UPDATE SET
                  tweet_count = EXCLUDED.tweet_count,
                  tweet_ids   = EXCLUDED.tweet_ids
                """,
                [
                    theme.get("theme_id"),
                    theme.get("theme_class"),
                    theme.get("tag_intersection"),
                    theme.get("tweet_ids"),
                    theme.get("tweet_count"),
                    theme.get("summary"),
                    now,
                ],
            )

    def save_draft(self, theme_id: str, draft_post: str, draft_format: str, rationale: str) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                UPDATE content_themes SET
                  draft_post      = %s,
                  draft_format    = %s,
                  draft_rationale = %s,
                  status          = 'DRAFT'
                WHERE theme_id = %s
                """,
                (draft_post, draft_format, rationale, theme_id),
            )

    def update_status(self, table: str, id_col: str, id_val: str, status: str, **extra: Any) -> None:
        allowed_tables = {"scraped_tweets", "content_themes"}
        if table not in allowed_tables:
            raise ValueError(f"Unknown table: {table}")
        set_clauses = ["status = %s"]
        params: list[Any] = [status]
        for col, val in extra.items():
            set_clauses.append(f"{col} = %s")
            params.append(val)
        params.append(id_val)
        with self._conn() as conn:
            conn.execute(
                f"UPDATE {table} SET {', '.join(set_clauses)} WHERE {id_col} = %s",
                tuple(params),
            )

    # ------------------------------------------------------------------
    # Query state (for since_id pagination)
    # ------------------------------------------------------------------

    def get_query_state(self, query_hash: str) -> dict | None:
        with self._conn() as conn:
            cur = conn.execute(
                "SELECT * FROM query_state WHERE query_hash = %s", (query_hash,)
            )
            cols = [d[0] for d in cur.description] if cur.description else []
            row = cur.fetchone()
            return _row_to_dict(row, cols) if row else None

    def set_query_state(
        self,
        query_hash: str,
        query_text: str,
        last_since_id: str,
        tweet_count_delta: int = 0,
    ) -> None:
        now = self._now()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO query_state (query_hash, query_text, last_since_id, last_run_at, tweet_count_total)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (query_hash) DO UPDATE SET
                  last_since_id     = EXCLUDED.last_since_id,
                  last_run_at       = EXCLUDED.last_run_at,
                  tweet_count_total = query_state.tweet_count_total + %s
                """,
                (query_hash, query_text, last_since_id, now, tweet_count_delta, tweet_count_delta),
            )

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def log_api_call(
        self,
        endpoint: str,
        query_text: str,
        status_code: int,
        tweets_returned: int,
        rate_remaining: int | None,
        rate_reset_at: str | None,
        notes: str = "",
        service: str = "twitter",
    ) -> None:
        # The api_log table (shared with the dashboard) only has columns:
        # agent_id, called_at, service, endpoint, status_code, month_key.
        # The richer fields (query_text, tweets_returned, rate_*, notes) have no
        # column here — they remain in the caller signature for source-compat but
        # are not persisted. month_key drives the dashboard's monthly quota view.
        now = self._now()
        month_key = now[:7]  # 'YYYY-MM'
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO api_log (agent_id, called_at, service, endpoint,
                  status_code, month_key)
                VALUES ('KA017', %s, %s, %s, %s, %s)
                """,
                (now, service, endpoint, status_code, month_key),
            )

    def log_llm_cost(
        self,
        purpose: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        estimated_cost_usd: float,
        run_id: int | None = None,
    ) -> None:
        # llm_costs columns: agent_id, called_at, purpose, model,
        # input_tokens, output_tokens, estimated_cost_usd, run_id.
        now = self._now()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO llm_costs (agent_id, called_at, purpose, model,
                  input_tokens, output_tokens, estimated_cost_usd, run_id)
                VALUES ('KA017', %s, %s, %s, %s, %s, %s, %s)
                """,
                (now, purpose, model, input_tokens, output_tokens,
                 estimated_cost_usd, run_id),
            )

    # ------------------------------------------------------------------
    # Agent run lifecycle (visible to the dashboard's Activity panel)
    # ------------------------------------------------------------------

    def start_run(self, mode: str, triggered_by: str = "manual") -> int:
        # agent_runs has no `mode` column — fold mode into triggered_by so
        # the dashboard still shows which pipeline phase ran.
        now = self._now()
        triggered = f"{triggered_by}:{mode}" if mode else triggered_by
        with self._conn() as conn:
            cur = conn.execute(
                """
                INSERT INTO agent_runs (agent_id, started_at, triggered_by, status)
                VALUES ('KA017', %s, %s, 'running')
                RETURNING id
                """,
                (now, triggered),
            )
            return cur.fetchone()[0]

    def finish_run(
        self,
        run_id: int,
        status: str,
        calls_used: int = 0,
        records_new: int = 0,
        records_updated: int = 0,
        error_message: str | None = None,
        summary: dict | None = None,
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                UPDATE agent_runs SET
                  ended_at        = %s,
                  status          = %s,
                  calls_used      = %s,
                  records_new     = %s,
                  records_updated = %s,
                  error_message   = %s,
                  summary_json    = %s
                WHERE id = %s
                """,
                (
                    self._now(),
                    status,
                    calls_used,
                    records_new,
                    records_updated,
                    error_message,
                    json.dumps(summary) if summary else None,
                    run_id,
                ),
            )

    def log_activity(
        self,
        run_id: int | None,
        phase: str,
        event: str,
        message: str = "",
        level: str = "INFO",
        meta: dict | None = None,
    ) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO agent_activity
                  (run_id, agent_id, occurred_at, level, phase, event, message, meta_json)
                VALUES (%s, 'KA017', %s, %s, %s, %s, %s, %s)
                """,
                (
                    run_id,
                    self._now(),
                    level,
                    phase,
                    event,
                    message,
                    json.dumps(meta) if meta else None,
                ),
            )

    # ------------------------------------------------------------------
    # Dashboard helpers
    # ------------------------------------------------------------------

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        # psycopg only interpolates %s when params is non-None; pass None for the
        # empty case so queries containing a literal % (e.g. LIKE 'URGENT%') and
        # no bind params are sent verbatim.
        with self._conn() as conn:
            cur = conn.execute(sql, params or None)
            cols = [d[0] for d in cur.description] if cur.description else []
            return [_row_to_dict(row, cols) for row in cur.fetchall()]

    # ------------------------------------------------------------------
    # Read helpers for the FastAPI dashboard (Sub-phase X1, read-only)
    #
    # Schema reminders (the contract field names differ from the real columns,
    # so these methods map):
    #   scraped_tweets: text=content, created_at=posted_at, confirmed_class=class,
    #     priority_flag is a TEXT enum (URGENT_*/STANDARD/LOW_PRIORITY_CONTENT),
    #     author_reputation_label=reputation, no display-name column (handle only).
    #   agent_runs: ended_at (not finished_at), records_new/records_updated,
    #     no keywords_queried/posts_classified columns (parsed from summary_json).
    #   llm_costs: estimated_cost_usd (the cost column), called_at.
    # ------------------------------------------------------------------

    # Sort keys -> safe ORDER BY (whitelist; never interpolate user input).
    # NULLS LAST keeps unscored/unclassified rows at the end under DESC (Postgres
    # defaults NULLS FIRST for DESC, unlike SQLite). The 'URGENT%%' literal is
    # double-%-escaped because this fragment is always executed WITH bind params
    # (limit/offset), so psycopg processes % in the query string.
    _POSTS_ORDER = {
        "posted_desc": "created_at DESC NULLS LAST",
        "priority_then_quality": (
            "CASE WHEN priority_flag LIKE 'URGENT%%' THEN 0 ELSE 1 END, "
            "quality_score DESC NULLS LAST, created_at DESC NULLS LAST"
        ),
        "recent_classifications": "classified_at DESC NULLS LAST",
    }

    @staticmethod
    def _posts_where(class_filter: list[str] | None, search: str | None):
        """Build the shared WHERE clause for list_posts/count (parameterized)."""
        clauses: list[str] = []
        params: list[Any] = []
        if class_filter:
            clauses.append(f"confirmed_class IN ({', '.join('%s' for _ in class_filter)})")
            params.extend(class_filter)
        if search:
            clauses.append("(text ILIKE %s OR author_handle ILIKE %s)")
            like = f"%{search}%"
            params.extend([like, like])
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        return where, params

    def count_posts(self) -> int:
        """Total scraped_tweets rows."""
        rows = self.query("SELECT COUNT(*) AS c FROM scraped_tweets")
        return rows[0]["c"] if rows else 0

    def count_posts_filtered(self, class_filter: list[str] | None = None,
                             search: str | None = None) -> int:
        """Row count under the same filters as list_posts — drives pagination."""
        where, params = self._posts_where(class_filter, search)
        rows = self.query(f"SELECT COUNT(*) AS c FROM scraped_tweets{where}", tuple(params))
        return rows[0]["c"] if rows else 0

    def kpi_stats(self) -> dict:
        """Top-of-dashboard metrics. by_class maps confirmed_class -> count;
        high_priority counts URGENT_* tweets (priority_flag is a TEXT enum).

        The LIKE 'URGENT%' query has no bind params, so query() passes None and
        psycopg sends the literal % verbatim (single %, not escaped)."""
        total = self.count_posts()
        classified = self.query(
            "SELECT COUNT(*) AS c FROM scraped_tweets WHERE confirmed_class IS NOT NULL"
        )[0]["c"]
        last = self.query("SELECT MAX(ingested_at) AS m FROM scraped_tweets")[0]["m"]
        high_priority = self.query(
            "SELECT COUNT(*) AS c FROM scraped_tweets WHERE priority_flag LIKE 'URGENT%'"
        )[0]["c"]
        by_class = {
            r["k"]: r["c"]
            for r in self.query(
                "SELECT confirmed_class AS k, COUNT(*) AS c FROM scraped_tweets "
                "WHERE confirmed_class IS NOT NULL GROUP BY confirmed_class"
            )
        }
        return {
            "total_posts": total,
            "classified": classified,
            "unclassified": total - classified,
            "last_scraped_at": last,
            "high_priority": high_priority,
            "by_class": by_class,
        }

    def list_posts(self, class_filter: list[str] | None = None, search: str | None = None,
                   offset: int = 0, limit: int = 50,
                   sort_by: str = "priority_then_quality") -> list[dict]:
        """One page of tweets as dashboard-ready dicts. engagement is computed
        (likes+RTs+replies). author_name is None — scraped_tweets stores only the
        handle. reputation comes from the author_reputation_label overlay column."""
        where, params = self._posts_where(class_filter, search)
        order = self._POSTS_ORDER.get(sort_by, self._POSTS_ORDER["priority_then_quality"])
        sql = (
            "SELECT tweet_id, author_handle, text, created_at, confirmed_class, "
            "priority_flag, quality_score, velocity, is_builder, author_reputation_label, "
            "(COALESCE(like_count,0) + COALESCE(retweet_count,0) + COALESCE(reply_count,0)) "
            "AS engagement "
            f"FROM scraped_tweets{where} ORDER BY {order} LIMIT %s OFFSET %s"
        )
        rows = self.query(sql, tuple(params + [limit, offset]))
        out = []
        for r in rows:
            out.append({
                "tweet_id": r["tweet_id"],
                "author_handle": r["author_handle"],
                "author_name": None,  # no display-name column in scraped_tweets
                "content": r["text"],
                "posted_at": r["created_at"],
                "classification": r["confirmed_class"],
                "priority_flag": r["priority_flag"],
                "quality_score": r["quality_score"],
                "velocity": r["velocity"],
                "is_builder": bool(r["is_builder"]) if r["is_builder"] is not None else None,
                "reputation": r["author_reputation_label"],
                "engagement": r["engagement"] or 0,
            })
        return out

    def get_recent_runs(self, limit: int = 20) -> list[dict]:
        """Latest agent_runs, mapped to the dashboard contract. The real table
        has ended_at/records_new/records_updated and no keywords_queried/
        posts_classified columns, so the latter come from summary_json if present."""
        rows = self.query(
            "SELECT id, started_at, ended_at, status, triggered_by, calls_used, "
            "records_new, records_updated, error_message, summary_json "
            "FROM agent_runs ORDER BY started_at DESC LIMIT %s",
            (limit,),
        )
        out = []
        for r in rows:
            summary = {}
            if r.get("summary_json"):
                try:
                    summary = json.loads(r["summary_json"])
                except Exception:
                    summary = {}
            out.append({
                "id": r["id"],
                "started_at": r["started_at"],
                "finished_at": r["ended_at"],
                "status": r["status"],
                "triggered_by": r["triggered_by"],
                "keywords_queried": summary.get("keywords_queried"),
                "posts_fetched": r["records_new"],
                "posts_classified": summary.get("posts_classified", r["records_updated"]),
                "error_message": r["error_message"],
            })
        return out

    def cost_summary(self) -> dict:
        """LLM spend from llm_costs (cost column = estimated_cost_usd).

        estimated_cost_usd is DOUBLE PRECISION -> psycopg returns float, so the
        float() wrappers below are no-ops but stay as a safety net if the column
        ever becomes NUMERIC (which psycopg returns as Decimal)."""
        total_all = self.query(
            "SELECT COALESCE(SUM(estimated_cost_usd), 0) AS s FROM llm_costs"
        )[0]["s"]
        total_month = self.query(
            "SELECT COALESCE(SUM(estimated_cost_usd), 0) AS s FROM llm_costs "
            "WHERE to_char(called_at, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')"
        )[0]["s"]
        rows_count = self.query("SELECT COUNT(*) AS c FROM llm_costs")[0]["c"]
        by_model = [
            {"model": r["model"], "posts": r["c"],
             "total_cost_usd": round(float(r["s"]), 6)}
            for r in self.query(
                "SELECT model, COUNT(*) AS c, COALESCE(SUM(estimated_cost_usd), 0) AS s "
                "FROM llm_costs GROUP BY model ORDER BY s DESC"
            )
        ]
        return {
            "total_all_time_usd": round(float(total_all), 6),
            "total_this_month_usd": round(float(total_month), 6),
            "posts_classified": rows_count,  # count of llm_costs rows (all purposes)
            "by_model": by_model,
        }

    def _file_prompt(self) -> dict:
        """Read the file-based prompt (config/prompts/active.txt -> <name>.txt).
        Kept as the fallback source after the X3 DB migration. Returns
        {filename, content, updated_at(mtime)}."""
        from pathlib import Path
        prompts_dir = Path(__file__).resolve().parents[3] / "config" / "prompts"
        try:
            name = (prompts_dir / "active.txt").read_text(encoding="utf-8").strip()
        except Exception:
            name = ""
        filename = name if name.endswith(".txt") else (f"{name}.txt" if name else "")
        content, updated_at = "", None
        if filename:
            fpath = prompts_dir / filename
            try:
                content = fpath.read_text(encoding="utf-8")
                updated_at = datetime.fromtimestamp(
                    fpath.stat().st_mtime, tz=timezone.utc
                ).isoformat()
            except Exception:
                pass
        return {"filename": filename, "content": content, "updated_at": updated_at}

    def get_active_prompt(self) -> dict:
        """Active classifier prompt (Sub-phase X3: DB-first, file fallback).

        Returns {version, content, updated_at}. Primary source is the
        x_active_prompt row with is_active=1; if that table/row is missing
        (shouldn't happen post-migration), falls back to the file prompt with
        version='file'. Never returns None — callers (classifier, API) rely on
        a content string being present."""
        try:
            rows = self.query(
                "SELECT version, content, created_at FROM x_active_prompt "
                "WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
            )
        except Exception as exc:
            logger.warning("x_active_prompt read failed (%s); falling back to file prompt", exc)
            rows = []
        if rows:
            r = rows[0]
            return {"version": r["version"], "content": r["content"], "updated_at": r["created_at"]}
        logger.warning("No active x_active_prompt row; falling back to file prompt")
        f = self._file_prompt()
        return {"version": "file", "content": f["content"], "updated_at": f["updated_at"]}

    def set_active_prompt(self, version: str, content: str) -> dict:
        """Save a new active prompt version (Sub-phase X3). Deactivates the
        current active row and inserts a new is_active=1 row (immutable history;
        matches LinkedIn's "save creates a new active version" semantics).
        Raises ValueError on invalid input. Returns the new row as a dict."""
        version = (version or "").strip()
        content = content if content is not None else ""
        if not version:
            raise ValueError("version must be non-empty")
        if len(version) > 64:
            raise ValueError("version too long (max 64 characters)")
        if not content.strip():
            raise ValueError("content must be non-empty")
        if len(content) > 50_000:
            raise ValueError("content too long (max 50000 characters)")

        with self._conn() as conn:
            conn.execute("UPDATE x_active_prompt SET is_active = 0 WHERE is_active = 1")
            cur = conn.execute(
                "INSERT INTO x_active_prompt (version, content, is_active, created_at) "
                "VALUES (%s, %s, 1, %s) RETURNING id",
                (version, content, self._now()),
            )
            new_id = cur.fetchone()[0]
        rows = self.query(
            "SELECT id, version, content, is_active, created_at FROM x_active_prompt WHERE id = %s",
            (new_id,),
        )
        return rows[0] if rows else {}

    def list_prompt_versions(self) -> list[dict]:
        """Version history metadata (no content) for the editor — newest first."""
        try:
            return self.query(
                "SELECT id, version, is_active, created_at FROM x_active_prompt "
                "ORDER BY id DESC LIMIT 20"
            )
        except Exception:
            return []

    # ------------------------------------------------------------------
    # Sweep schedule config (Sub-phase X4) — single row (id=1). Config-only:
    # stores the orchestrator's tunable sweep params. Render Cron owns cadence
    # (no enabled/interval/next_run_at here). Nothing reads this table until X5.
    # ------------------------------------------------------------------

    # Editable columns (everything else — id/last_run_*/updated_at — is managed).
    _SCHEDULE_EDITABLE = {
        "mode", "sweep_type", "max_pages", "max_keywords",
        "class_filter", "since_hours", "max_api_calls",
    }
    _SCHEDULE_MODES = {
        "keywords", "influencers", "reply_trees", "classify", "cluster", "draft", "all",
    }
    _SCHEDULE_SWEEP_TYPES = {"Latest", "Top"}
    _SCHEDULE_CLASSES = {
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "NOISE", "GOVT_PROMOTION",
    }

    @classmethod
    def _validate_schedule_field(cls, key: str, value):
        """Coerce + validate one editable schedule field. Form values arrive as
        strings, so ints are coerced here. Raises ValueError on bad input."""
        def _as_int(name, lo, hi):
            try:
                n = int(value)
            except (TypeError, ValueError):
                raise ValueError(f"{name} must be an integer")
            if n < lo or n > hi:
                raise ValueError(f"{name} must be between {lo} and {hi}")
            return n

        if key == "mode":
            v = str(value).strip()
            if v not in cls._SCHEDULE_MODES:
                raise ValueError(f"mode must be one of {sorted(cls._SCHEDULE_MODES)}")
            return v
        if key == "sweep_type":
            v = str(value).strip()
            if v not in cls._SCHEDULE_SWEEP_TYPES:
                raise ValueError("sweep_type must be 'Latest' or 'Top'")
            return v
        if key == "max_pages":
            return _as_int("max_pages", 1, 10)
        if key == "max_keywords":
            return _as_int("max_keywords", 1, 50)
        if key == "max_api_calls":
            return _as_int("max_api_calls", 1, 100)
        if key == "since_hours":
            if value is None or str(value).strip() == "":
                return None  # NULL = no time filter
            return _as_int("since_hours", 1, 720)
        if key == "class_filter":
            v = str(value).strip()
            if v:
                toks = [t.strip() for t in v.split(",") if t.strip()]
                bad = [t for t in toks if t not in cls._SCHEDULE_CLASSES]
                if bad:
                    raise ValueError(f"class_filter has unknown class code(s): {bad}")
                v = ",".join(toks)
            return v
        raise ValueError(f"unknown/uneditable field: {key}")

    def get_schedule(self) -> dict:
        """Return the single x_schedule row (id=1). Raises if missing — the
        migration seeds it, so a missing row signals a real problem."""
        rows = self.query("SELECT * FROM x_schedule WHERE id = 1")
        if not rows:
            raise RuntimeError(
                "x_schedule row (id=1) is missing — schema migration did not seed it"
            )
        return rows[0]

    def update_schedule(self, **kwargs) -> dict:
        """Partial update of editable schedule fields. Unknown/uneditable field
        names and invalid values raise ValueError. Only provided fields change;
        updated_at is bumped. Returns the updated row."""
        self.get_schedule()  # ensure the row exists (raises clear error if not)
        set_clauses: list[str] = []
        params: list[Any] = []
        for key, raw in kwargs.items():
            if key not in self._SCHEDULE_EDITABLE:
                raise ValueError(f"unknown/uneditable field: {key}")
            set_clauses.append(f"{key} = %s")
            params.append(self._validate_schedule_field(key, raw))
        if not set_clauses:
            return self.get_schedule()
        set_clauses.append("updated_at = %s")
        params.extend([self._now(), 1])
        with self._conn() as conn:
            conn.execute(
                f"UPDATE x_schedule SET {', '.join(set_clauses)} WHERE id = %s",
                tuple(params),
            )
        return self.get_schedule()

    def set_last_run(self, status: str) -> None:
        """Stamp last_run_at=now and last_run_status. Called by the X5 run-now
        flow; added now so the contract exists. status is typically 'ok'/'failed'."""
        with self._conn() as conn:
            conn.execute(
                "UPDATE x_schedule SET last_run_at = %s, last_run_status = %s WHERE id = 1",
                (self._now(), status),
            )

    # ------------------------------------------------------------------
    # Run lifecycle helpers for the API run-now flow (Sub-phase X5).
    # Reuse existing agent_runs columns (no migration): records_new=posts_fetched,
    # records_updated=posts_classified, calls_used=api_calls_used,
    # triggered_by=trigger_source. start_run()/finish_run() are unchanged.
    # ------------------------------------------------------------------

    # Live-progress columns the run-now task is allowed to update.
    _RUN_UPDATE_FIELDS = {"records_new", "records_updated", "calls_used", "status", "error_message"}

    def get_running_run(self) -> dict | None:
        """Most recent in-flight run, for the concurrency guard. None if idle.
        A row older than 30 minutes is treated as dead — sweeps cap at ~10 min,
        so a longer 'running' state means the process crashed without recording
        failure. Auto-expiring prevents orphan rows from permanently blocking cron."""
        rows = self.query(
            "SELECT * FROM agent_runs WHERE status = 'running' "
            "AND started_at > NOW() - INTERVAL '30 minutes' "
            "ORDER BY started_at DESC LIMIT 1"
        )
        return rows[0] if rows else None

    def get_run(self, run_id: int) -> dict | None:
        """Single agent_runs row by id (None if not found)."""
        rows = self.query("SELECT * FROM agent_runs WHERE id = %s", (run_id,))
        return rows[0] if rows else None

    def update_run(self, run_id: int, **fields) -> None:
        """Partial live update of an agent_runs row (run-now progress). Only the
        allowlisted columns may be set; unknown fields raise ValueError."""
        set_clauses: list[str] = []
        params: list[Any] = []
        for key, val in fields.items():
            if key not in self._RUN_UPDATE_FIELDS:
                raise ValueError(f"update_run: field not allowed: {key}")
            set_clauses.append(f"{key} = %s")
            params.append(val)
        if not set_clauses:
            return
        params.append(run_id)
        with self._conn() as conn:
            conn.execute(
                f"UPDATE agent_runs SET {', '.join(set_clauses)} WHERE id = %s",
                tuple(params),
            )

    def api_calls_this_month(self) -> int:
        """Sum of scrape API calls (agent_runs.calls_used) for the current month —
        the budget-guard signal for run-now (NOT OpenRouter/LLM call counts)."""
        rows = self.query(
            "SELECT COALESCE(SUM(calls_used), 0) AS c FROM agent_runs "
            "WHERE to_char(started_at, 'YYYY-MM') = to_char(NOW(), 'YYYY-MM')"
        )
        return int(rows[0]["c"]) if rows else 0

    # ------------------------------------------------------------------
    # User ID cache (handle → Twitter numeric user_id)
    # ------------------------------------------------------------------

    def get_user_id(self, handle: str) -> str | None:
        normalized = handle.lstrip("@").lower()
        with self._conn() as conn:
            cur = conn.execute(
                "SELECT user_id FROM user_id_cache WHERE handle = %s",
                (normalized,),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def set_user_id(self, handle: str, user_id: str) -> None:
        normalized = handle.lstrip("@").lower()
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO user_id_cache (handle, user_id, cached_at)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (handle) DO UPDATE SET
                     user_id = EXCLUDED.user_id,
                     cached_at = EXCLUDED.cached_at""",
                (normalized, user_id, self._now()),
            )

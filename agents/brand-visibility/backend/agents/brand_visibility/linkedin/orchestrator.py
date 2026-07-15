"""
KA018 LinkedIn orchestrator — single-sweep runner.

Mirrors KA017's orchestrator shape but scoped to LinkedIn keyword sweeps.
No classifier, no clustering yet — just: fetch keywords -> search posts ->
ingest -> record the run.

Usage:
  python -m linkedin.orchestrator --once
  python -m linkedin.orchestrator --once --max-keywords 10 --max-pages 2 \
      --categories pain_signal,product_name --min-volume HIGH --date-posted past_week
"""
from __future__ import annotations

import argparse
import logging
import os
import sys

from dotenv import load_dotenv

logger = logging.getLogger(__name__)


def _month_to_date_calls(ldb) -> int:
    """Sum api_calls_made across this calendar month's runs (UTC).

    NOTE: queries linkedin_runs — the table linkedin/db.py actually creates.
    Degrades to 0 (with a logged warning) if the query fails, so budget logic
    never crashes a run.
    """
    sql = (
        "SELECT COALESCE(SUM(api_calls_made), 0) AS used FROM linkedin_runs "
        "WHERE strftime('%Y-%m', started_at) = strftime('%Y-%m', 'now')"
    )
    try:
        rows = ldb.query(sql)
        return int(rows[0]["used"]) if rows else 0
    except Exception:
        logger.exception("Failed to compute month-to-date API usage; assuming 0")
        return 0

# source_class = query-routing metadata (HOW the keyword was queried), distinct
# from the keyword's `intent` metadata. This orchestrator only handles the
# keyword-search classes; watchlist (Class 1) and hashtag (Class 5) live in
# separate code paths. Maps the keyword's CATEGORY -> query class.
_CATEGORY_TO_SOURCE_CLASS = {
    "vendor": "vendor",            # Class 2 — individual per-vendor queries
    "product_name": "product",     # Class 4 — individual per-product queries
    "pain_signal": "grouped",      # Class 3 — OR-grouped queries
    "trend_topic": "grouped",
    "technical_term": "grouped",
    "use_case": "grouped",
}


def _setup_logging(level: str = "INFO") -> None:
    fmt = "%(asctime)s %(levelname)s %(name)s: %(message)s"
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(fmt))
    root.addHandler(handler)


def run_sweep(
    db: LinkedInDatabase,
    run_id: int,
    max_keywords: int = 5,
    max_pages: int = 1,
    categories: list[str] | None = None,
    min_volume: str = "HIGH",
    min_source_count: int = 1,
    date_posted: str | None = "past_week",
    sort_by: str = "date_posted",
) -> dict:
    """Execute one sweep cycle against an EXISTING run_id (caller created the row).

    Single source of truth for the sweep loop, shared by run_once() (CLI) and the
    FastAPI background task. The caller owns the db lifecycle, start_run /
    finish_run, and the final sync.

    Returns stats: keywords_queried, api_calls_made, posts_ingested,
    skipped_duplicates, errors, notes, aborted_first_call. Does NOT create the run
    row, call finish_run(), or close the db.

    Budget (from env + month-to-date): if exhausted BEFORE the loop -> return zeros
    + a note (no exception); if exhausted MID-loop -> break cleanly. First-call
    abort: if the very first API call fails, stop early (don't burn calls) and set
    aborted_first_call so a CLI caller can exit non-zero.
    """
    from agents.brand_visibility.linkedin import scraper

    run_cap = int(os.getenv("LINKEDIN_MAX_API_CALLS_PER_RUN", "5"))
    monthly_budget = int(os.getenv("LINKEDIN_MONTHLY_BUDGET", "50"))

    api_calls = 0
    posts_ingested = 0
    skipped_dupes = 0
    error_count = 0
    keywords_queried = 0

    month_used = _month_to_date_calls(db)
    remaining_budget = max(0, monthly_budget - month_used)
    if remaining_budget <= 0:
        logger.warning("Monthly budget exhausted (used %d/%d) — sweep does nothing",
                       month_used, monthly_budget)
        return {
            "keywords_queried": 0, "api_calls_made": 0, "posts_ingested": 0,
            "skipped_duplicates": 0, "errors": 0,
            "notes": f"budget exhausted: used {month_used}/{monthly_budget}",
            "aborted_first_call": False,
        }

    effective_cap = run_cap
    if remaining_budget < run_cap:
        logger.warning("Monthly budget tight: only %d calls left this month",
                       remaining_budget)
        effective_cap = remaining_budget

    keywords = db.get_keywords(
        categories=categories,
        min_volume=min_volume,
        min_source_count=min_source_count,
        active_only=True,
        limit=max_keywords,
    )
    logger.info("Fetched %d keyword(s) to sweep", len(keywords))

    first_call = True
    for kw in keywords:
        keyword = kw.get("keyword", "")
        category = kw.get("category", "")
        source_class = _CATEGORY_TO_SOURCE_CLASS.get(category, "grouped")
        if not keyword:
            continue

        # Hard per-run cap (independent of --max-keywords). Stop before the next
        # keyword would push us past the cap rather than overshoot.
        if api_calls + max_pages > effective_cap:
            logger.warning("Run cap hit: cap=%d, used=%d", effective_cap, api_calls)
            break

        try:
            raw_posts = scraper.search_posts(
                keyword=keyword,
                date_posted=date_posted,
                sort_by=sort_by,
                max_pages=max_pages,
            )
            api_calls += max_pages  # 1 call per requested page (upper bound)
            keywords_queried += 1
            first_call = False
        except Exception as exc:
            error_count += 1
            logger.exception("search_posts failed for keyword %r", keyword)
            # If the very first API call fails, abort early — don't burn calls.
            if first_call:
                logger.error("First API call failed — aborting run early.")
                return {
                    "keywords_queried": keywords_queried,
                    "api_calls_made": api_calls,
                    "posts_ingested": posts_ingested,
                    "skipped_duplicates": skipped_dupes,
                    "errors": error_count,
                    "notes": f"aborted: first call failed: {exc}",
                    "aborted_first_call": True,
                }
            continue

        rows = [
            scraper.normalize_post(
                raw=p,
                matched_keyword=keyword,
                query_string=keyword,
                source_class=source_class,
                matched_category=category,
            )
            for p in raw_posts
        ]
        inserted, skipped = db.insert_posts_batch(rows)
        posts_ingested += inserted
        skipped_dupes += skipped
        logger.info(
            "keyword=%r posts=%d inserted=%d dupes=%d",
            keyword, len(rows), inserted, skipped,
        )

        scraper.sleep_between_queries()

    return {
        "keywords_queried": keywords_queried,
        "api_calls_made": api_calls,
        "posts_ingested": posts_ingested,
        "skipped_duplicates": skipped_dupes,
        "errors": error_count,
        "notes": f"skipped_duplicates={skipped_dupes}",
        "aborted_first_call": False,
    }


def run_once(
    max_keywords: int = 5,
    max_pages: int = 1,
    categories: list[str] | None = None,
    min_volume: str | None = "HIGH",
    min_source_count: int = 1,
    date_posted: str | None = "past_week",
    sort_by: str = "date_posted",
) -> dict:
    """Run a single LinkedIn sweep and return a stats summary (CLI entrypoint).

    Owns the db lifecycle + run-row lifecycle; delegates the loop to run_sweep().
    Preserves CLI behavior: SystemExit(2) on monthly-budget exhaustion,
    SystemExit(1) on first-call abort.
    """
    from agents.brand_visibility.linkedin.db import LinkedInDatabase

    monthly_budget = int(os.getenv("LINKEDIN_MONTHLY_BUDGET", "50"))

    # Write-heavy run: disable background sync (avoids mid-write WalConflict);
    # we sync() manually — once here to pull state, once at the end to push.
    ldb = LinkedInDatabase(sync_interval=None)
    ldb.sync()

    # Month-to-date budget gate (preserves CLI SystemExit(2) on exhaustion).
    month_used = _month_to_date_calls(ldb)
    remaining_budget = max(0, monthly_budget - month_used)
    logger.info("Budget status: used %d / %d this month, remaining %d",
                month_used, monthly_budget, remaining_budget)
    if remaining_budget <= 0:
        logger.error("Monthly API budget exhausted. Aborting.")
        raise SystemExit(2)

    run_id = ldb.start_run(mode="keywords")
    stats = None
    try:
        stats = run_sweep(
            ldb, run_id,
            max_keywords=max_keywords, max_pages=max_pages, categories=categories,
            min_volume=min_volume, min_source_count=min_source_count,
            date_posted=date_posted, sort_by=sort_by,
        )
        ldb.finish_run(
            run_id,
            keywords_queried=stats["keywords_queried"],
            api_calls_made=stats["api_calls_made"],
            posts_ingested=stats["posts_ingested"],
            error_count=stats["errors"],
            notes=stats["notes"],
        )
        if stats.get("aborted_first_call"):
            raise SystemExit(1)
        month_total = month_used + stats["api_calls_made"]
        logger.info("API budget: used %d this run, %d total this month, %d remaining",
                    stats["api_calls_made"], month_total,
                    max(0, monthly_budget - month_total))
    except SystemExit:
        raise
    except Exception as exc:
        s = stats or {}
        ldb.finish_run(
            run_id,
            keywords_queried=s.get("keywords_queried", 0),
            api_calls_made=s.get("api_calls_made", 0),
            posts_ingested=s.get("posts_ingested", 0),
            error_count=s.get("errors", 0) + 1,
            notes=f"run failed: {exc}",
        )
        raise
    finally:
        # Push all writes (run record + posts) to Turso.
        ldb.sync()

    return {
        "run_id": run_id,
        "keywords_queried": stats["keywords_queried"],
        "api_calls_made": stats["api_calls_made"],
        "posts_ingested": stats["posts_ingested"],
        "skipped_duplicates": stats["skipped_duplicates"],
        "error_count": stats["errors"],
    }


def _parse_csv(value: str | None) -> list[str] | None:
    if not value:
        return None
    items = [v.strip() for v in value.split(",") if v.strip()]
    return items or None


def main() -> None:
    parser = argparse.ArgumentParser(description="KA018 LinkedIn orchestrator")
    parser.add_argument("--once", action="store_true", help="Run one sweep and exit")
    parser.add_argument("--max-keywords", type=int, default=5)
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--categories", type=str, default="",
                        help="Comma-separated categories (e.g. 'pain_signal,product_name')")
    parser.add_argument("--min-volume", type=str, default="HIGH",
                        choices=["HIGH", "MEDIUM", "LOW"])
    parser.add_argument("--min-source-count", type=int, default=1)
    parser.add_argument("--date-posted", type=str, default="past_week",
                        choices=["past_24h", "past_week", "past_month"])
    parser.add_argument("--sort-by", type=str, default="date_posted",
                        choices=["date_posted", "relevance"])
    parser.add_argument("--log-level", type=str, default="INFO")
    args = parser.parse_args()

    load_dotenv()
    _setup_logging(args.log_level)

    if not args.once:
        parser.error("only --once mode is supported currently; pass --once")

    stats = run_once(
        max_keywords=args.max_keywords,
        max_pages=args.max_pages,
        categories=_parse_csv(args.categories),
        min_volume=args.min_volume,
        min_source_count=args.min_source_count,
        date_posted=args.date_posted,
        sort_by=args.sort_by,
    )

    print("\n" + "=" * 50)
    print(" KA018 LinkedIn sweep — summary")
    print("=" * 50)
    for k, v in stats.items():
        print(f"  {k:20} {v}")
    print("=" * 50)


if __name__ == "__main__":
    main()

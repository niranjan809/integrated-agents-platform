"""
KA017 orchestrator — Interactive Control Panel & Scheduled Loop

Usage:
  python orchestrator.py                 # Opens interactive menu
  python orchestrator.py --once          # run one full tick and exit
  python orchestrator.py --loop          # run forever (30-min ticks)
"""
from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from shared.config.settings import DATA_DIR, LOG_PATH

# ---------------------------------------------------------------------------
# Logging — structured, rotating file + stdout
# ---------------------------------------------------------------------------

def _setup_logging(level: str = "INFO") -> None:
    fmt = "%(asctime)s %(levelname)s %(name)s: %(message)s"
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    stdout_handler = logging.StreamHandler(sys.stdout)
    stdout_handler.setFormatter(logging.Formatter(fmt))
    root.addHandler(stdout_handler)

    DATA_DIR.mkdir(exist_ok=True)
    file_handler = logging.handlers.RotatingFileHandler(
        str(LOG_PATH), maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(fmt))
    root.addHandler(file_handler)


logger = logging.getLogger(__name__)

TICK_STATE_FILE = DATA_DIR / "tick_state.json"
TICK_INTERVAL_SECONDS = 30 * 60  # 30 min
CONTENT_DRAFT_EVERY_N_TICKS = 48  # ~once per day


# ---------------------------------------------------------------------------
# Tick state persistence
# ---------------------------------------------------------------------------

def load_tick_state() -> int:
    if TICK_STATE_FILE.exists():
        try:
            return json.loads(TICK_STATE_FILE.read_text())["tick_number"]
        except Exception:
            pass
    return 0


def save_tick_state(tick_number: int) -> None:
    TICK_STATE_FILE.write_text(
        json.dumps({"tick_number": tick_number, "saved_at": datetime.now(timezone.utc).isoformat()}),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# Tick logic
# ---------------------------------------------------------------------------

def run_sweep(db, run_id: int, config: dict, post_enabled: bool = False) -> dict:
    """API-friendly sweep entry (Sub-phase X5). Caller pre-creates the agent_runs
    row (run_id) and owns the Database (so it can set sync_interval=None for WAL
    safety) and the final finish_run() call.

    config matches db.get_schedule(): mode, sweep_type, max_pages, max_keywords,
    class_filter, since_hours, max_api_calls (+ optional dry_run for the CLI).

    post_enabled gates the content-drafting phases (cluster/draft). It defaults
    False and the API layer NEVER sets it True, so run-now is scrape+classify
    only — no OpenRouter drafting, and (there is no X-posting code anywhere) no
    posting. The flag exists solely to preserve CLI drafting via tick().

    Phase order matches the legacy tick(): keywords -> influencers -> classify ->
    reply_trees -> (cluster/draft). Progress is written to agent_runs as it goes.
    Returns {posts_fetched, posts_classified, keywords_queried, api_calls_used,
    errors, status, summary}; status is 'completed' or 'completed_partial' (API
    budget exhausted). Phase exceptions are caught and counted; the caller wraps
    the whole thing to record a 'failed' status on an unhandled error.
    """
    from agents.brand_visibility.x.x_scraper import (
        expand_reply_trees, sweep_influencers, sweep_keywords,
        reset_call_budget, _budget_ok,
    )
    from agents.brand_visibility.x.classifier import classify_pending

    mode = config.get("mode") or "all"
    dry_run = bool(config.get("dry_run", False))
    max_api_calls = int(config.get("max_api_calls") or 12)
    max_keywords = config.get("max_keywords")  # None = no keyword cap (CLI default)

    # Thread per-sweep config to the scraper, which reads these env vars at
    # provider-call time (least-invasive — x_scraper is unchanged).
    os.environ["KA017_SWEEP_TYPE"] = str(config.get("sweep_type") or "Latest")
    os.environ["KA017_MAX_PAGES"] = str(config.get("max_pages") or 1)
    os.environ["KA017_CLASS_FILTER"] = str(config.get("class_filter") or "")
    since_hours = config.get("since_hours")
    if since_hours is not None and str(since_hours).strip() != "":
        os.environ["KA017_SINCE_HOURS"] = str(since_hours)
    else:
        os.environ.pop("KA017_SINCE_HOURS", None)

    reset_call_budget(max_api_calls)
    start = datetime.now(timezone.utc)
    logger.info("=== run_sweep run_id=%s start (%s) mode=%s dry_run=%s budget=%d ===",
                run_id, start.isoformat(), mode, dry_run, max_api_calls)

    summary: dict[str, object] = {
        "run_id": run_id, "mode": mode, "start": start.isoformat(),
        "config": {k: config.get(k) for k in (
            "mode", "sweep_type", "max_pages", "max_keywords",
            "class_filter", "since_hours", "max_api_calls")},
    }
    total_new = 0
    total_calls = 0
    keywords_queried = 0
    posts_classified = 0
    errors = 0

    if mode in ("all", "keywords"):
        try:
            st = sweep_keywords(db, dry_run=dry_run, limit=max_keywords, run_id=run_id)
            summary["keywords"] = st
            total_new += st.get("new", 0)
            total_calls += st.get("api_calls", 0)
            keywords_queried += st.get("api_calls", 0)  # 1 keyword query == 1 API call
        except Exception:
            logger.exception("run_sweep: sweep_keywords failed")
            errors += 1
        db.update_run(run_id, records_new=total_new, calls_used=total_calls)

    if mode in ("all", "influencers"):
        try:
            st = sweep_influencers(db, tick_number=0, dry_run=dry_run, run_id=run_id)
            summary["influencers"] = st
            total_new += st.get("new", 0)
            total_calls += st.get("api_calls", 0)
        except Exception:
            logger.exception("run_sweep: sweep_influencers failed")
            errors += 1
        db.update_run(run_id, records_new=total_new, calls_used=total_calls)

    if mode in ("all", "classify"):
        try:
            st = classify_pending(db, limit=500, dry_run=dry_run, run_id=run_id)
            summary["classify"] = st
            posts_classified = st.get("classified", 0)
        except Exception:
            logger.exception("run_sweep: classify_pending failed")
            errors += 1
        db.update_run(run_id, records_updated=posts_classified)

    if mode in ("all", "reply_trees"):
        try:
            st = expand_reply_trees(db, dry_run=dry_run, run_id=run_id)
            summary["reply_trees"] = st
            total_new += st.get("reply_tweets", 0)
            total_calls += st.get("api_calls", 0)
        except Exception:
            logger.exception("run_sweep: expand_reply_trees failed")
            errors += 1
        db.update_run(run_id, records_new=total_new, calls_used=total_calls)

    # Content drafting (cluster/draft) — generates draft text via OpenRouter into
    # content_themes for human review. NEVER posts to X. Gated by post_enabled,
    # which the API run-now path never sets True (CLI parity only).
    if post_enabled and mode in ("all", "cluster", "draft"):
        from agents.brand_visibility.x.post_drafter import cluster_themes, draft_posts_for_new_themes
        if mode in ("all", "cluster"):
            try:
                themes = cluster_themes(db)
                summary["themes_clustered"] = len(themes)
            except Exception:
                logger.exception("run_sweep: cluster_themes failed")
                errors += 1
        if mode in ("all", "draft"):
            try:
                summary["drafts"] = draft_posts_for_new_themes(db, dry_run=dry_run)
            except Exception:
                logger.exception("run_sweep: draft_posts_for_new_themes failed")
                errors += 1

    end = datetime.now(timezone.utc)
    summary["end"] = end.isoformat()
    summary["duration_seconds"] = round((end - start).total_seconds(), 1)
    summary["keywords_queried"] = keywords_queried
    status = "completed_partial" if (not dry_run and not _budget_ok()) else "completed"
    stats = {
        "posts_fetched": total_new,
        "posts_classified": posts_classified,
        "keywords_queried": keywords_queried,
        "api_calls_used": total_calls,
        "errors": errors,
        "status": status,
        "summary": summary,
    }
    logger.info("=== run_sweep run_id=%s %s in %.1fs | fetched=%d classified=%d calls=%d errors=%d ===",
                run_id, status, summary["duration_seconds"], total_new, posts_classified, total_calls, errors)
    return stats


def tick(tick_number: int, mode: str = "all", dry_run: bool = False) -> dict:
    """CLI/legacy entry — preserved. Thin wrapper that builds a config from the
    env vars / settings the CLI already populates, then delegates to run_sweep().
    Owns the Database + start_run/finish_run lifecycle, exactly as before."""
    from agents.brand_visibility.x.db import Database
    from shared.config.settings import MAX_API_CALLS_PER_RUN

    db = Database()
    run_id = db.start_run(mode=mode, triggered_by="orchestrator")
    db.log_activity(run_id, phase="orchestrator", event="tick_start",
                    message=f"tick={tick_number} dry_run={dry_run} budget={MAX_API_CALLS_PER_RUN}")

    config = {
        "mode": mode,
        "sweep_type": os.environ.get("KA017_SWEEP_TYPE", "Latest"),
        "max_pages": int(os.environ.get("KA017_MAX_PAGES", "1") or 1),
        "class_filter": os.environ.get("KA017_CLASS_FILTER", ""),
        "since_hours": os.environ.get("KA017_SINCE_HOURS") or None,
        "max_api_calls": MAX_API_CALLS_PER_RUN,
        "max_keywords": None,                 # CLI: no keyword cap (legacy behavior)
        "dry_run": dry_run,
    }
    # Preserve legacy drafting cadence: every tick for explicit cluster/draft
    # modes, else once per ~day on the 'all' loop. The API never enables this.
    post_enabled = mode in ("cluster", "draft") or (
        mode == "all" and tick_number % CONTENT_DRAFT_EVERY_N_TICKS == 0
    )

    try:
        stats = run_sweep(db, run_id, config, post_enabled=post_enabled)
        db.finish_run(run_id, status=stats["status"],
                      calls_used=stats["api_calls_used"],
                      records_new=stats["posts_fetched"],
                      records_updated=stats["posts_classified"],
                      summary=stats["summary"])
    except Exception as exc:
        logger.exception("tick %d failed", tick_number)
        db.finish_run(run_id, status="failed", error_message=str(exc),
                      summary={"tick": tick_number, "error": str(exc)})
        raise
    finally:
        db.log_activity(run_id, phase="orchestrator", event="tick_end")

    return stats["summary"]


# ---------------------------------------------------------------------------
# CLI & Interactive Menu
# ---------------------------------------------------------------------------

def interactive_menu(tick_number: int, dry_run: bool) -> None:
    """Displays an interactive control panel for manual orchestration."""
    while True:
        print("\n" + "="*55)
        print(" 🚀 KA017 Orchestrator - Interactive Control Panel")
        print("="*55)
        print(" [1] Sweep Keywords        (Scraper Only)")
        print(" [2] Sweep Influencers     (Scraper Only)")
        print(" [3] Expand Reply Trees    (Scraper Only)")
        print(" [4] Classify Pending      (Analysis)")
        print(" [5] Cluster Themes        (Analysis)")
        print(" [6] Draft Posts           (Auto-Reply/Content Engine)")
        print(" [7] Run Full Pipeline     (All Modes)")
        print(" [8] Start Continuous Loop (Automated)")
        print(" [9] Exit")
        print("="*55)
        
        choice = input("\nSelect a phase to trigger [1-9]: ").strip()

        mode_map = {
            "1": "keywords",
            "2": "influencers",
            "3": "reply_trees",
            "4": "classify",
            "5": "cluster",
            "6": "draft",
            "7": "all"
        }

        if choice == "9":
            print("Exiting KA017 Orchestrator. Goodbye.")
            sys.exit(0)
            
        elif choice == "8":
            print("\nStarting continuous loop... (Press Ctrl+C to stop)")
            run_continuous_loop(tick_number, dry_run)
            break
            
        elif choice in mode_map:
            selected_mode = mode_map[choice]
            print(f"\n⚡ Triggering Phase: {selected_mode.upper()}...")
            try:
                tick(tick_number, mode=selected_mode, dry_run=dry_run)
                tick_number += 1
                save_tick_state(tick_number)
            except Exception as e:
                logger.exception(f"Manual trigger for {selected_mode} failed.")
        else:
            print("Invalid selection. Please choose a number between 1 and 9.")

def run_continuous_loop(tick_number: int, dry_run: bool) -> None:
    logger.info("Starting continuous loop (tick interval: %d min)", TICK_INTERVAL_SECONDS // 60)
    while True:
        try:
            tick(tick_number, mode="all", dry_run=dry_run)
        except KeyboardInterrupt:
            logger.info("Continuous loop halted by user.")
            break
        except Exception:
            logger.exception("Tick %d failed — sleeping before retry", tick_number)

        tick_number += 1
        save_tick_state(tick_number)
        logger.info("Sleeping %d s until next tick…", TICK_INTERVAL_SECONDS)
        try:
            time.sleep(TICK_INTERVAL_SECONDS)
        except KeyboardInterrupt:
            logger.info("Continuous loop halted by user during sleep.")
            break

def main() -> None:
    parser = argparse.ArgumentParser(description="KA017 orchestrator")
    parser.add_argument("--once", action="store_true", help="Run one full tick and exit without menu")
    parser.add_argument("--loop", action="store_true", help="Run continuous loop without menu")
    parser.add_argument(
        "--mode",
        choices=["keywords", "influencers", "reply_trees", "classify", "cluster", "draft", "all"],
        default="all",
        help="Specify pipeline step (used with --once)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print plan, make no API calls")
    parser.add_argument(
        "--sweep-type", choices=["Latest", "Top"], default="Latest",
        help="Sweep type for keyword search (twitter241 'type' param). Latest = chronological, Top = algorithmic.",
    )
    parser.add_argument(
        "--max-pages", type=int, default=1,
        help="Pages per query (1 page = ~20 tweets). Higher = deeper capture at proportional API cost.",
    )
    parser.add_argument(
        "--classes", type=str, default="",
        help="Comma-separated class codes to sweep (e.g. 'A,C'). Empty = all classes (default).",
    )
    parser.add_argument(
        "--since-hours",
        type=int,
        default=None,
        help="Hour-granular time filter for sweeps. If set, replaces {{since_time}} "
             "placeholders in lexicon queries with current_unix_time - N*3600. "
             "If unset, placeholders are stripped from queries.",
    )
    parser.add_argument(
        "--lexicon-file",
        type=str,
        default=None,
        help="Override the default lexicon path. Useful for testing with a "
             "temporary lexicon (e.g. config/genesis_lexicon_topsweep.json).",
    )
    args = parser.parse_args()

    # Pass sweep config to scraper via env vars (read by x_scraper at provider-call time)
    os.environ["KA017_SWEEP_TYPE"] = args.sweep_type
    os.environ["KA017_MAX_PAGES"] = str(args.max_pages)
    os.environ["KA017_CLASS_FILTER"] = args.classes
    if args.since_hours is not None:
        os.environ["KA017_SINCE_HOURS"] = str(args.since_hours)
    if args.lexicon_file:
        os.environ["KA017_LEXICON_FILE"] = args.lexicon_file

    _setup_logging()

    tick_number = load_tick_state()

    # Bypass menu if flags are passed directly
    if args.once:
        try:
            tick(tick_number, mode=args.mode, dry_run=args.dry_run)
        except Exception:
            logger.exception("Single tick failed")
            raise SystemExit(1)
        save_tick_state(tick_number + 1)
        return

    if args.loop:
        run_continuous_loop(tick_number, dry_run=args.dry_run)
        return

    # Default to Interactive Menu
    try:
        interactive_menu(tick_number, dry_run=args.dry_run)
    except KeyboardInterrupt:
        print("\nExiting KA017 Orchestrator. Goodbye.")
        sys.exit(0)

if __name__ == "__main__":
    main()
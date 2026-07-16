"""
One-time migration: load config/genesis_lexicon.json into the Postgres
lexicon tables (keyword_classes, keywords, influencers).

Strategy (Option A3): each JSON query string is already a fully-formed X search
query (parenthesised, OR-joined, operator suffix baked in). We store it verbatim
in keywords.search_query so the loader emits it as-is and never re-chunks it (see
agents/brand_visibility/x/lexicon.py::load_from_turso). keyword mirrors
search_query to satisfy the UNIQUE(keyword, class_key) constraint.

Idempotent: safe to re-run (ON CONFLICT DO UPDATE). Ordering is preserved via
display_order (classes) and insertion order / id (keywords), matching the file.

Usage:
    py scripts/migrate_genesis_lexicon_to_postgres.py --dry-run
    py scripts/migrate_genesis_lexicon_to_postgres.py
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
LEXICON_FILE = BACKEND_ROOT / "config" / "genesis_lexicon.json"


def load_lexicon() -> dict:
    return json.loads(LEXICON_FILE.read_text(encoding="utf-8"))


def migrate(conn: psycopg.Connection, lex: dict, dry_run: bool) -> dict:
    classes = lex["Keyword_Classes"]
    handles = lex.get("Tracked_Handles", {})

    stats = {"classes": 0, "keywords": 0, "influencers": 0}

    with conn.cursor() as cur:
        # --- keyword_classes + keywords (display_order preserves JSON order) ---
        for order, (class_key, cls) in enumerate(classes.items()):
            name = cls["name"]
            priority = cls.get("priority") or "STANDARD"
            queries = cls.get("queries", [])

            print(f"  class {class_key!r:>5}  order={order:<2} priority={priority:<8} "
                  f"queries={len(queries):<3} {name}")

            if not dry_run:
                cur.execute(
                    "INSERT INTO keyword_classes (class_key, name, priority, enabled, display_order) "
                    "VALUES (%s, %s, %s, 1, %s) "
                    "ON CONFLICT (class_key) DO UPDATE SET "
                    "name = EXCLUDED.name, priority = EXCLUDED.priority, "
                    "enabled = 1, display_order = EXCLUDED.display_order",
                    (class_key, name, priority, order),
                )
            stats["classes"] += 1

            for q in queries:
                if not dry_run:
                    cur.execute(
                        "INSERT INTO keywords (keyword, class_key, search_query, enabled) "
                        "VALUES (%s, %s, %s, 1) "
                        "ON CONFLICT (keyword, class_key) DO UPDATE SET "
                        "search_query = EXCLUDED.search_query, enabled = 1",
                        (q, class_key, q),
                    )
                stats["keywords"] += 1

        # --- influencers (follower_tier must be exactly tier_1/2/3) ---
        for tier, handle_list in handles.items():
            print(f"  {tier}: {len(handle_list)} handles")
            for handle in handle_list:
                if not dry_run:
                    cur.execute(
                        "INSERT INTO influencers (handle, follower_tier, enabled) "
                        "VALUES (%s, %s, 1) "
                        "ON CONFLICT (handle) DO UPDATE SET "
                        "follower_tier = EXCLUDED.follower_tier, enabled = 1",
                        (handle, tier),
                    )
                stats["influencers"] += 1

    if not dry_run:
        conn.commit()
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Print what would be migrated; write nothing.")
    args = ap.parse_args()

    load_dotenv(BACKEND_ROOT / ".env")
    url = os.environ["POSTGRES_URL"]

    lex = load_lexicon()
    print(f"Source: {LEXICON_FILE}  (version {lex.get('version')})")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'LIVE'}\n")

    with psycopg.connect(url) as conn:
        stats = migrate(conn, lex, args.dry_run)

    print(f"\n{'Would migrate' if args.dry_run else 'Migrated'}: "
          f"{stats['classes']} classes, {stats['keywords']} keywords, "
          f"{stats['influencers']} influencers.")


if __name__ == "__main__":
    main()

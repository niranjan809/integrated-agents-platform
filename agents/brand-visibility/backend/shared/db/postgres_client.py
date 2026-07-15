"""Postgres connection pool for KiteAI agents.

Replaces the libsql/Turso embedded-replica client (shared/db/turso_client.py,
scheduled for deletion in a later cleanup commit). Uses psycopg v3 with a
single shared ConnectionPool.
"""
from __future__ import annotations

import logging
from contextlib import contextmanager

from psycopg_pool import ConnectionPool

# Absolute import — the app runs with backend/ on sys.path (callers use
# `from shared...` / `from agents...`), so a relative import would not resolve
# `shared` as a top-level package.
from shared.config.settings import (
    POSTGRES_POOL_MAX,
    POSTGRES_POOL_MIN,
    POSTGRES_URL,
)

log = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


def get_pool() -> ConnectionPool:
    """Return the process-wide connection pool, opening it on first use."""
    global _pool
    if _pool is None:
        if not POSTGRES_URL:
            raise RuntimeError("POSTGRES_URL not configured")
        _pool = ConnectionPool(
            conninfo=POSTGRES_URL,
            min_size=POSTGRES_POOL_MIN,
            max_size=POSTGRES_POOL_MAX,
            open=True,
        )
        log.info(
            "Postgres pool opened: min=%s max=%s",
            POSTGRES_POOL_MIN,
            POSTGRES_POOL_MAX,
        )
    return _pool


@contextmanager
def get_connection():
    """Check out a connection from the pool for the duration of a block.

    Auto-commits on success, rolls back on exception. The connection is
    returned to the pool when the block exits.
    """
    pool = get_pool()
    with pool.connection() as conn:
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise


def close_pool() -> None:
    """Close the connection pool. Call on shutdown."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
        log.info("Postgres pool closed")

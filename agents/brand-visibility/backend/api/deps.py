"""Shared FastAPI auth dependencies.

P0 security lockdown: `verify_cron_secret` gates the Python API's write
endpoints (POST/PUT/PATCH/DELETE across x/linkedin/config) behind the shared
X-Cron-Secret. Mirrors the existing inline check in x.py:run_now, so behavior
is identical (500 if the secret isn't configured server-side, 401 on a missing
or wrong header). GET reads stay public for now — migrating the frontend's
direct read calls through the Node gateway is deferred to P0.5.
"""
from __future__ import annotations

import os

from fastapi import Header, HTTPException

# Read once at import (same as x.py). Shared between the GitHub Actions cron,
# the Node gateway, and any authorized caller.
_X_CRON_SECRET = os.getenv("X_CRON_SECRET")


def verify_cron_secret(
    x_cron_secret: str | None = Header(None, alias="X-Cron-Secret"),
) -> None:
    """Reject the request unless the X-Cron-Secret header matches X_CRON_SECRET."""
    if not _X_CRON_SECRET:
        raise HTTPException(status_code=500, detail={
            "reason": "server_misconfigured",
            "message": "X_CRON_SECRET env var not set on server",
        })
    if x_cron_secret != _X_CRON_SECRET:
        raise HTTPException(status_code=401, detail={"reason": "invalid_cron_secret"})

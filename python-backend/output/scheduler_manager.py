"""Schedule config and scheduler-process status helpers.

The dashboard writes user intent (frequency, modes, enabled) to
config/schedule.json via `save_schedule`. The standalone scheduler.py
process reads that config and writes its runtime status (pid, last fire,
next fire) to data/scheduler_status.json. The dashboard reads the status
file to display whether the scheduler is actually running.

Splitting "config" from "status" prevents the dashboard from accidentally
clobbering runtime state when it writes user intent, and prevents the
scheduler from contaminating user intent when it writes runtime telemetry.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEDULE_CONFIG_PATH = _REPO_ROOT / "config" / "schedule.json"
SCHEDULER_STATUS_PATH = _REPO_ROOT / "data" / "scheduler_status.json"


# ---------------------------------------------------------------- defaults ---

DEFAULT_CONFIG = {
    "enabled": False,
    "frequency_type": "interval",          # "interval" or "fixed_times"
    "interval_minutes": 60,
    "fixed_times": ["09:00", "13:00", "17:00"],
    "modes": ["keywords", "classify"],
    "last_modified": None,
}


# -------------------------------------------------------------- config IO ---

def _ensure_config_dir() -> None:
    SCHEDULE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_schedule() -> dict:
    """Read schedule config from disk. Returns DEFAULT_CONFIG if missing."""
    _ensure_config_dir()
    if not SCHEDULE_CONFIG_PATH.exists():
        return dict(DEFAULT_CONFIG)
    try:
        with SCHEDULE_CONFIG_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        # Merge with defaults to fill any missing keys (forward-compat)
        merged = dict(DEFAULT_CONFIG)
        merged.update(data)
        return merged
    except Exception as exc:
        logger.exception("Could not parse schedule.json: %s", exc)
        return dict(DEFAULT_CONFIG)


def save_schedule(config: dict) -> None:
    """Persist schedule config to disk. Validates required fields."""
    _ensure_config_dir()
    # Basic validation
    required = {"enabled", "frequency_type", "modes"}
    missing = required - set(config.keys())
    if missing:
        raise ValueError(f"Schedule config missing required fields: {sorted(missing)}")
    if config["frequency_type"] not in ("interval", "fixed_times"):
        raise ValueError(
            f"Invalid frequency_type: {config['frequency_type']!r}. "
            f"Must be 'interval' or 'fixed_times'."
        )
    if config["frequency_type"] == "interval":
        iv = int(config.get("interval_minutes", 0))
        if iv < 5:
            raise ValueError(
                f"interval_minutes must be at least 5 (got {iv}). "
                f"More-frequent runs risk API quota exhaustion."
            )
    if config["frequency_type"] == "fixed_times":
        times = config.get("fixed_times", [])
        if not times:
            raise ValueError("fixed_times list cannot be empty when frequency_type='fixed_times'")
        for t in times:
            # Light HH:MM validation
            parts = str(t).split(":")
            if len(parts) != 2 or not all(p.isdigit() for p in parts):
                raise ValueError(f"Invalid time format {t!r}. Use HH:MM (24-hour).")
            h, m = int(parts[0]), int(parts[1])
            if not (0 <= h <= 23 and 0 <= m <= 59):
                raise ValueError(f"Invalid time {t!r}. Hours 0-23, minutes 0-59.")
    valid_modes = {"keywords", "classify", "influencers", "reply_trees", "all"}
    modes = config.get("modes", [])
    if not modes:
        raise ValueError("modes list cannot be empty")
    bad_modes = set(modes) - valid_modes
    if bad_modes:
        raise ValueError(f"Invalid modes: {sorted(bad_modes)}. Allowed: {sorted(valid_modes)}")

    # Stamp last_modified
    config = dict(config)  # don't mutate caller's dict
    config["last_modified"] = datetime.now(timezone.utc).isoformat()

    tmp = SCHEDULE_CONFIG_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(config, fh, indent=2)
    tmp.replace(SCHEDULE_CONFIG_PATH)
    logger.info("Saved schedule config: %s", config)


# ------------------------------------------------------------- status IO ---

def _is_pid_alive(pid: int) -> bool:
    """Cross-platform check whether a PID corresponds to a running process."""
    if pid <= 0:
        return False
    try:
        if os.name == "nt":  # Windows
            # On Windows, os.kill(pid, 0) raises if process doesn't exist
            os.kill(pid, 0)
            return True
        else:
            # POSIX: signal 0 doesn't actually signal, just checks existence
            os.kill(pid, 0)
            return True
    except (ProcessLookupError, OSError):
        return False
    except PermissionError:
        # Process exists but we can't signal it — still alive
        return True


def read_status() -> dict | None:
    """Read scheduler runtime status. Returns None if status file missing,
    PID file is stale (process dead), or file is unparseable.
    """
    if not SCHEDULER_STATUS_PATH.exists():
        return None
    try:
        with SCHEDULER_STATUS_PATH.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        pid = int(data.get("pid", 0))
        if not _is_pid_alive(pid):
            return None  # Stale file from a dead scheduler
        return data
    except Exception as exc:
        logger.warning("Could not read scheduler status: %s", exc)
        return None


def write_status(data: dict) -> None:
    """Persist scheduler runtime status (called by scheduler.py)."""
    SCHEDULER_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = SCHEDULER_STATUS_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    tmp.replace(SCHEDULER_STATUS_PATH)


def clear_status() -> None:
    """Remove status file (called by scheduler.py on shutdown)."""
    if SCHEDULER_STATUS_PATH.exists():
        try:
            SCHEDULER_STATUS_PATH.unlink()
        except Exception:
            pass


def is_scheduler_running() -> bool:
    """Quick check: is a scheduler process actively running?"""
    return read_status() is not None

"""Prompt manager helpers — list, read, write classifier prompts.

The classifier reads its system prompt from config/prompts/<active_name>.txt
where <active_name> is the content of config/prompts/active.txt.

This module is the single source of truth for dashboard read/write operations
on prompt files. Direct filesystem access from page code is discouraged —
go through these helpers so backup, validation, and active-pointer logic
stay consistent.
"""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parent.parent
PROMPTS_DIR = _REPO_ROOT / "config" / "prompts"
ACTIVE_POINTER = PROMPTS_DIR / "active.txt"
BACKUPS_DIR = PROMPTS_DIR / ".backups"


def _ensure_dirs() -> None:
    PROMPTS_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)


def list_prompts() -> list[str]:
    """Return sorted list of prompt names (filenames without .txt extension).

    Excludes active.txt (which is a pointer, not a prompt).
    """
    _ensure_dirs()
    names = []
    for p in PROMPTS_DIR.glob("*.txt"):
        if p.name == "active.txt":
            continue
        names.append(p.stem)
    return sorted(names)


def get_active_name() -> str:
    """Return the name (no extension) of the currently active prompt.

    Returns empty string if active.txt is missing or empty.
    """
    _ensure_dirs()
    if not ACTIVE_POINTER.exists():
        return ""
    return ACTIVE_POINTER.read_text(encoding="utf-8").strip()


def set_active(name: str) -> None:
    """Write `name` to active.txt. Validates the prompt file exists first."""
    _ensure_dirs()
    if not name or not name.strip():
        raise ValueError("Active prompt name cannot be empty")
    name = name.strip()
    target = PROMPTS_DIR / f"{name}.txt"
    if not target.exists():
        raise FileNotFoundError(f"Prompt file does not exist: {target}")
    ACTIVE_POINTER.write_text(name, encoding="utf-8")
    logger.info("Active prompt set to: %s", name)


def read_prompt(name: str) -> str:
    """Read prompt content by name. Raises FileNotFoundError if missing."""
    _ensure_dirs()
    path = PROMPTS_DIR / f"{name}.txt"
    if not path.exists():
        raise FileNotFoundError(f"Prompt not found: {name}")
    return path.read_text(encoding="utf-8")


def save_prompt(name: str, content: str, backup: bool = True) -> Path:
    """Write content to prompts/<name>.txt. Backs up the existing file first.

    Returns the path written.
    """
    _ensure_dirs()
    if not name or not name.strip():
        raise ValueError("Prompt name cannot be empty")
    name = name.strip()
    # Validate name: no path separators, no special chars beyond a-zA-Z0-9_-
    if not all(c.isalnum() or c in "_-" for c in name):
        raise ValueError(
            f"Invalid prompt name '{name}'. Use letters, digits, hyphens, underscores."
        )
    if not content or not content.strip():
        raise ValueError("Prompt content cannot be empty")

    target = PROMPTS_DIR / f"{name}.txt"

    # Backup existing file if present
    if backup and target.exists():
        ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        backup_path = BACKUPS_DIR / f"{name}.{ts}.txt"
        backup_path.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")
        logger.info("Backed up %s to %s", target.name, backup_path.name)

    target.write_text(content, encoding="utf-8")
    logger.info("Saved prompt: %s (%d chars)", name, len(content))
    return target


def prompt_exists(name: str) -> bool:
    """True if the named prompt file exists."""
    return (PROMPTS_DIR / f"{name}.txt").exists()


def estimate_tokens(text: str) -> int:
    """Approximate token count for English text. Uses chars/4 heuristic.

    Good enough for UI display. Real tokenization varies by model.
    """
    return max(1, len(text) // 4)

import time
from typing import Optional

_cache: dict = {}
_TTL = 60  # seconds


DEFAULTS: dict[str, dict] = {
    "normalization": {
        "label": "Normalization",
        "description": "Extracts structured metadata from scraped leaderboard page text. The scraped text is appended automatically after this prompt.",
        "prompt_text": (
            "Here is text scraped from a leaderboard webpage.\n"
            "Map ONLY what is present in this text to the following fields.\n"
            "Return null for any field not mentioned in the text.\n"
            "Do not add anything from outside this text.\n\n"
            "Return a single JSON object with these keys:\n"
            "methodology (string — extract verbatim or closely paraphrase from the text only; null if not described), "
            "benchmark_datasets (array of strings), "
            "primary_metrics (array of strings — the actual evaluation metric names used, e.g. WER, MOS, RTF, Latency — extract from the text, do NOT guess), "
            "update_frequency, availability, "
            "type (string — 'Leaderboard' if it ranks models by objective scores, 'Arena' if it uses human preference voting or Elo; null if unclear), "
            "scope (string — 'Global' if the leaderboard accepts entries from all countries/languages worldwide, 'Regional' if it focuses on a specific language, country, or geographic region; null if not clear from the text), "
            "domain (string — one of exactly: 'STT', 'TTS', 'Voice Assistants', 'Realtime Voice Agents', 'LLM', 'Coding AI', 'General'; based on what the leaderboard evaluates; null if not clear from the text), "
            "estimated_models_count (integer), estimated_companies_count (integer), estimated_metrics_count (integer), "
            "notes (string — quote or closely paraphrase only what is explicitly stated in the scraped text; null if nothing relevant), "
            "scraper_note (string — one or two sentences describing what the ORIGINAL site provides beyond a static ranking table, based only on what is in this text. "
            "Mention specific features visible in the text such as: interactive audio listening, human preference voting, Elo ratings that update live, filters by language/dataset/domain/provider, pricing comparison, latency charts, downloadable results, methodology details, or any other interactive/dynamic features. "
            "Example: 'The original site lets users listen to audio samples and vote between models. It also provides filtering by language and real-time Elo score updates.' "
            "If no such features are evident from the text, return null.)"
        ),
    },
    "scope_classification": {
        "label": "Scope Classification",
        "description": "Classifies a leaderboard as Global or Regional. The stored description text is appended automatically.",
        "prompt_text": (
            "Based ONLY on this text about a leaderboard, classify its geographic/linguistic scope.\n"
            'Return ONLY JSON: {"scope": "Global"} or {"scope": "Regional"}\n'
            "Global = accepts entries from all countries/languages worldwide.\n"
            "Regional = focuses on a specific language, country, or geographic region."
        ),
    },
    "scraper_note": {
        "label": "Scraper Note",
        "description": "Generates a one-sentence note about what the original site offers beyond a static table. Scraped text is appended automatically.",
        "prompt_text": (
            "The text below was scraped from a leaderboard website. "
            "Write ONE concise sentence (max 30 words) describing what the original site "
            "offers BEYOND a static ranking table — for example: audio playback, pairwise "
            "voting, Elo updates, pricing comparison, latency charts, language filters, "
            "dataset breakdowns, or interactive model comparison. "
            "Use only information explicitly present in the text. "
            "Do not mention 'the app' or 'this tool'. "
            "If nothing extra is evident, return exactly: null"
        ),
    },
}


def get_prompt(key: str, default: str) -> str:
    """Read prompt from DB (60-s in-process cache). Falls back to default."""
    now = time.monotonic()
    hit = _cache.get(key)
    if hit and now - hit[1] < _TTL:
        return hit[0]
    try:
        from database import SessionLocal
        from models import PromptConfig
        db = SessionLocal()
        try:
            row = db.query(PromptConfig).filter(PromptConfig.key == key).first()
            text = row.prompt_text if row else default
        finally:
            db.close()
    except Exception:
        text = default
    _cache[key] = (text, now)
    return text


def invalidate(key: Optional[str] = None) -> None:
    if key:
        _cache.pop(key, None)
    else:
        _cache.clear()

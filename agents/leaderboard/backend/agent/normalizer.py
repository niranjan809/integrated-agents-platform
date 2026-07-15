import httpx
import json
import os
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session


OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-2.5-flash"


def _fetch_html(url: str) -> tuple[str, int]:
    """Fetch URL and return (raw HTML string, http_status)."""
    try:
        resp = httpx.get(
            url, timeout=15, follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; VoiceAIBot/1.0)"},
        )
        return resp.text, resp.status_code
    except Exception:
        return "", 0


def _clean_text(html: str) -> str:
    """Strip tags and return plain visible text (capped at 8k chars) for Gemini."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    return " ".join(soup.get_text(separator=" ", strip=True).split())[:8000]


def _truncate_at_sentence(text: str, max_len: int) -> str:
    """Truncate to max_len at a sentence boundary so no mid-sentence cuts."""
    if len(text) <= max_len:
        return text
    chunk = text[:max_len]
    for sep in (". ", "! ", "? ", ".\n"):
        pos = chunk.rfind(sep)
        if pos > max_len // 2:
            return chunk[:pos + 1].rstrip()
    last_space = chunk.rfind(" ")
    return chunk[:last_space].rstrip() if last_space > 0 else chunk


def _extract_fallback(html: str) -> dict:
    """
    Extract About-section content directly from scraped HTML — no AI, no training
    knowledge. Uses meta tags and semantic heading patterns from the actual page.
    """
    soup = BeautifulSoup(html, "html.parser")
    result: dict = {}

    # Description: prefer standard meta tags
    for attrs in [
        {"name": "description"},
        {"property": "og:description"},
        {"name": "twitter:description"},
    ]:
        tag = soup.find("meta", attrs=attrs)
        if tag and tag.get("content", "").strip():
            raw = tag["content"].strip()
            result["description"] = _truncate_at_sentence(raw, 1500)
            break

    # Fallback: first substantial paragraph in the main content area
    if not result.get("description"):
        container = soup.find("main") or soup.find("article") or soup.find("body")
        if container:
            for p in container.find_all("p"):
                text = p.get_text(strip=True)
                if len(text) >= 80:
                    result["description"] = _truncate_at_sentence(text, 800)
                    break

    # Scan headings for methodology / about sections
    METHODOLOGY_KW = {"methodology", "how it works", "how we evaluate",
                      "scoring", "evaluation method", "how models are ranked"}
    ABOUT_KW = {"about", "overview", "what is", "introduction"}

    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5"]):
        h_text = heading.get_text(strip=True).lower()

        matched_section = None
        if any(kw in h_text for kw in METHODOLOGY_KW):
            matched_section = "methodology"
        elif any(kw in h_text for kw in ABOUT_KW) and not result.get("description"):
            matched_section = "description"

        if not matched_section:
            continue
        if result.get(matched_section):
            continue  # already filled

        texts: list[str] = []
        for sib in heading.next_siblings:
            sib_name = getattr(sib, "name", None)
            if sib_name in ("h1", "h2", "h3"):
                break
            if sib_name in ("p", "ul", "ol", "div", "section"):
                t = sib.get_text(strip=True)
                if t and len(t) > 20:
                    texts.append(t)
            if len(texts) >= 5:
                break

        if texts:
            combined = " ".join(texts)
            limit = 800 if matched_section == "description" else 1500
            result[matched_section] = _truncate_at_sentence(combined, limit)

    return result


def _call_gemini(scraped_text: str) -> dict:
    """Send scraped text to Gemini via OpenRouter and return structured JSON."""
    if not OPENROUTER_API_KEY:
        return {}

    from agent.prompt_store import get_prompt, DEFAULTS
    template = get_prompt("normalization", DEFAULTS["normalization"]["prompt_text"])
    prompt = template + f"\n\nScraped text:\n{scraped_text}"

    try:
        resp = httpx.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(content)
    except Exception as e:
        print(f"Gemini normalization error: {e}")
        return {}


def _strip_trailing_ellipsis(text: str) -> str:
    return text.rstrip(". ").rstrip("…").rstrip("...").rstrip()


def _apply_data(lb, data: dict) -> None:
    """Merge a data dict onto the leaderboard row (never overwrites with None/empty)."""
    if data.get("description"):
        lb.description = _strip_trailing_ellipsis(data["description"])
    if data.get("methodology"):
        lb.methodology = data["methodology"]
    if data.get("benchmark_datasets"):
        lb.benchmark_datasets = data["benchmark_datasets"]
    if data.get("update_frequency"):
        lb.update_frequency = data["update_frequency"]
    if data.get("availability") and data["availability"] in ("Public", "Private"):
        lb.availability = data["availability"]
    if data.get("scope") and data["scope"] in ("Global", "Regional"):
        lb.scope = data["scope"]
    if data.get("estimated_models_count"):
        lb.models_count = data["estimated_models_count"]
    if data.get("estimated_companies_count"):
        lb.companies_count = data["estimated_companies_count"]
    if data.get("estimated_metrics_count"):
        lb.metrics_count = data["estimated_metrics_count"]
    if data.get("notes") and not lb.notes:
        lb.notes = data["notes"]
    if data.get("primary_metrics"):
        lb.primary_metrics = data["primary_metrics"]
    if data.get("type") and data["type"] in ("Leaderboard", "Arena"):
        lb.type = data["type"]
    if data.get("domain") and not lb.domain and data["domain"] in (
        "STT", "TTS", "Voice Assistants", "Realtime Voice Agents", "LLM", "Coding AI", "General"
    ):
        lb.domain = data["domain"]
    if data.get("scraper_note"):
        lb.scraper_note = data["scraper_note"]


def classify_scope(lb_id: int, db: Session, body_text: str = ""):
    """
    Classify scope (Global / Regional) for a leaderboard.
    Uses stored description/methodology/notes as context; falls back to the
    already-scraped body_text, then to a fresh URL fetch (plain httpx).
    Only runs when lb.scope is still NULL.
    """
    from models import Leaderboard
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb or lb.scope is not None:
        return

    # Build context: prefer stored text, then freshly-scraped body_text, then URL re-fetch
    context = " ".join(filter(None, [lb.description, lb.methodology, lb.notes]))[:4000]
    if not context and body_text:
        context = body_text[:4000]
    if not context:
        html, _ = _fetch_html(lb.official_url)
        context = _clean_text(html)[:4000] if html else ""
    if not context or not OPENROUTER_API_KEY:
        return

    from agent.prompt_store import get_prompt, DEFAULTS
    template = get_prompt("scope_classification", DEFAULTS["scope_classification"]["prompt_text"])
    prompt = template + f"\n\nText: {context}"
    try:
        resp = httpx.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "response_format": {"type": "json_object"},
            },
            timeout=20,
        )
        if resp.status_code == 200:
            data = json.loads(resp.json()["choices"][0]["message"]["content"])
            # Case-insensitive check — Gemini occasionally returns lowercase
            scope_raw = str(data.get("scope") or "").strip()
            if scope_raw.lower() == "global":
                lb.scope = "Global"
                db.commit()
                print(f"  Scope classified: {lb.name} → Global")
            elif scope_raw.lower() == "regional":
                lb.scope = "Regional"
                db.commit()
                print(f"  Scope classified: {lb.name} → Regional")
            else:
                print(f"  Scope unresolved for {lb.name}: Gemini returned {scope_raw!r}")
    except Exception as e:
        print(f"  Scope classification error for {lb.name}: {e}")


def normalize_leaderboard(lb_id: int, db: Session):
    from models import Leaderboard

    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        return

    print(f"Normalizing: {lb.name}")
    html, http_status = _fetch_html(lb.official_url)

    if not html:
        print(f"  Could not fetch {lb.official_url} (status {http_status})")
        lb.status = "active"
        db.commit()
        return

    # Step 1: always extract from scraped HTML (no AI, no hallucination)
    fallback = _extract_fallback(html)
    _apply_data(lb, fallback)

    # Step 2: try Gemini to enhance/supplement (uses scraped text only)
    clean = _clean_text(html)
    if OPENROUTER_API_KEY:
        gemini_data = _call_gemini(clean)
        _apply_data(lb, gemini_data)

    lb.status = "active"
    db.commit()
    print(f"  Normalized {lb.name} — status: active")

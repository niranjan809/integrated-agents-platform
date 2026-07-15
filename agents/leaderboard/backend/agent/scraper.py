import httpx
import time
import json
import os
import re
import subprocess
import sys
import tempfile
import base64
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from models import Leaderboard, RankingEntry, ScanLog, Company, Model

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; VoiceAIBot/1.0)"}
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()

# Set by _try_playwright, read by scrape_leaderboard to generate the note.
# Single-threaded dev usage only — not thread-safe for concurrent scrapes.
_last_body_text: str = ""


def get_last_body_text() -> str:
    return _last_body_text

RANK_HEADERS = {"#", "rank", "no.", "no", "position", "pos", "rk", "place", "nr", "index", "idx"}
MODEL_HEADERS = {
    "model", "model name", "system", "name", "method", "model/system",
    "architecture", "model name / system", "approach", "model name/system",
    "model name (click for details)", "model/approach",
}
COMPANY_HEADERS = {
    "company", "organization", "org", "provider", "team",
    "affiliation", "author", "organization/team", "publisher",
}


def _classify_header(h: str) -> str:
    hl = h.lower().strip().rstrip("↑↓↕").strip()
    if hl in RANK_HEADERS:
        return "rank"
    if hl in MODEL_HEADERS:
        return "model"
    if hl in COMPANY_HEADERS:
        return "company"
    return "score"


def _log_scan(db: Session, lb_id: int, status: str, records: int,
              duration_ms: int, http_status: int, error: str, triggered_by: str):
    log = ScanLog(
        leaderboard_id=lb_id,
        status=status,
        records_updated=records,
        duration_ms=duration_ms,
        http_status=http_status,
        error_message=error,
        triggered_by=triggered_by,
    )
    db.add(log)
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if lb:
        lb.last_scanned_at = datetime.now(timezone.utc).replace(tzinfo=None)
        lb.last_scan_status = status
        if status == "success" and lb.status == "pending":
            lb.status = "active"
    db.commit()


def _upsert_entries(db: Session, lb_id: int, rows: list[dict]) -> int:
    db.query(RankingEntry).filter(RankingEntry.leaderboard_id == lb_id).delete()
    db.flush()

    for row in rows:
        company_name = row.get("company_name") or ""
        company = None
        if company_name:
            company = db.query(Company).filter(Company.name == company_name).first()
            if not company:
                company = Company(name=company_name)
                db.add(company)
                db.flush()

        model = db.query(Model).filter(
            Model.leaderboard_id == lb_id,
            Model.name == row["model_name"]
        ).first()
        if not model:
            model = Model(
                leaderboard_id=lb_id,
                name=row["model_name"],
                company_id=company.id if company else None,
            )
            db.add(model)
            db.flush()

        entry = RankingEntry(
            leaderboard_id=lb_id,
            model_id=model.id,
            rank=row.get("rank"),
            model_name=row["model_name"],
            company_name=company_name or None,
            scores=row.get("scores", {}),
        )
        db.add(entry)

    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if lb and rows:
        companies = {r.get("company_name") for r in rows if r.get("company_name")}
        lb.models_count = len(rows)
        lb.companies_count = len(companies)
        col_order = list(rows[0].get("scores", {}).keys())
        if col_order:
            lb.column_order = col_order
            metric_cols = [k for k in col_order if _classify_header(k) == "score"]
            if metric_cols:
                lb.primary_metrics = metric_cols[:6]

    db.commit()
    return len(rows)


# ── Parsers ────────────────────────────────────────────────────────────────

_JUNK_HEADER_KEYWORDS = {
    "choice", "what it means", "option", "description", "meaning",
    "definition", "action", "shortcut",
}
_JUNK_ROW_PHRASES = [
    "is better", "both good", "both bad", "sounded", "felt right",
    "sounds great", "neither", "vote for", "next round",
]
# Headers that identify a dataset-statistics table (corpus/audio stats, not model rankings)
_DATASET_STAT_KEYWORDS = {
    "language", "samples", "noisy", "districts", "male", "female",
    "hours", "speakers", "utterances", "locale", "accent", "dialect",
    "region", "corpus", "clips", "duration", "avg/spk", "unique words",
}
# Headers that confirm a table is a model leaderboard
_LEADERBOARD_HINT_KEYWORDS = {
    "model", "rank", "wer", "accuracy", "score", "elo", "mos",
    "system", "name", "method", "latency", "rtf", "bleu", "cer",
}


def _is_junk_table(headers: list[str], data_rows: list[list[str]]) -> bool:
    """Return True if the table looks like instructions/explanations or dataset stats — not a ranking table."""
    if not headers:
        return False
    hl = " ".join(h.lower() for h in headers)
    if len(headers) <= 2 and any(kw in hl for kw in _JUNK_HEADER_KEYWORDS):
        return True
    sample = " ".join(c.lower() for row in data_rows[:6] for c in row)
    junk_hits = sum(1 for p in _JUNK_ROW_PHRASES if p in sample)
    if junk_hits >= 2:
        return True
    # If every cell is a long sentence (avg > 55 chars), it's descriptive text not scores
    all_cells = [c for row in data_rows for c in row if c]
    if all_cells and sum(len(c) for c in all_cells) / len(all_cells) > 55:
        return True
    # Reject dataset-statistics tables: majority of headers are corpus-stat terms
    # and none are leaderboard terms. Threshold is high (5) to avoid false positives.
    cleaned = {h.lower().strip().rstrip("↑↓↕ ").strip() for h in headers}
    dataset_hits = sum(1 for h in cleaned if any(kw in h for kw in _DATASET_STAT_KEYWORDS))
    lb_hits = sum(1 for h in cleaned if any(kw in h for kw in _LEADERBOARD_HINT_KEYWORDS))
    if dataset_hits >= 5 and lb_hits == 0:
        return True
    return False


def _parse_html_table(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        return []

    def _score(t):
        rows = t.find_all("tr")
        if not rows:
            return 0
        all_rows_cells = [r.find_all(["th", "td"]) for r in rows]
        max_cols = max((len(r) for r in all_rows_cells), default=1)
        headers = [td.get_text(strip=True) for td in all_rows_cells[0]] if all_rows_cells else []
        data_rows = [[td.get_text(strip=True) for td in r] for r in all_rows_cells[1:6]]
        if _is_junk_table(headers, data_rows):
            return 0
        return len(rows) * max_cols

    table = max(tables, key=_score)
    if _score(table) == 0:
        return []  # all tables are explanation/junk — caller should try other strategies
    headers: list[str] = []
    col_types: list[str] = []
    rows_out: list[dict] = []

    for i, row in enumerate(table.find_all("tr")):
        cells = [td.get_text(separator=" ", strip=True) for td in row.find_all(["th", "td"])]
        if not cells:
            continue
        if not headers:
            headers = cells
            col_types = [_classify_header(h) for h in headers]
            continue
        if len(cells) < 2:
            continue

        entry: dict = {"scores": {}}
        rank_set = model_set = company_set = False

        for j, val in enumerate(cells):
            if j >= len(headers):
                break
            ct = col_types[j] if j < len(col_types) else "score"
            val = val.strip()
            if headers[j]:
                entry["scores"][headers[j]] = val
            if ct == "rank" and not rank_set:
                try:
                    entry["rank"] = int(re.sub(r"[^\d]", "", val) or str(i + 1))
                except Exception:
                    entry["rank"] = i + 1
                rank_set = True
            elif ct == "model" and not model_set:
                entry["model_name"] = val
                model_set = True
            elif ct == "company" and not company_set:
                entry["company_name"] = val
                company_set = True

        if not model_set:
            for j, val in enumerate(cells):
                ct = col_types[j] if j < len(col_types) else "score"
                if ct != "rank" and val.strip():
                    entry["model_name"] = val.strip()
                    model_set = True
                    break
            if not model_set:
                entry["model_name"] = cells[0]

        if not rank_set:
            entry["rank"] = i + 1
        if entry.get("model_name"):
            rows_out.append(entry)

    return rows_out


def _extract_next_data_table(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    script = soup.find("script", {"id": "__NEXT_DATA__"})
    if not script or not script.string:
        return []
    try:
        data = json.loads(script.string)
    except Exception:
        return []

    def find_arrays(obj, depth=0):
        if depth > 10:
            return []
        if isinstance(obj, list) and len(obj) >= 2:
            sample = obj[0] if obj else {}
            if isinstance(sample, dict) and len(sample) >= 2:
                return [obj]
        results = []
        if isinstance(obj, dict):
            for v in obj.values():
                results.extend(find_arrays(v, depth + 1))
        elif isinstance(obj, list):
            for item in obj:
                results.extend(find_arrays(item, depth + 1))
        return results

    candidates = find_arrays(data)
    candidates.sort(key=len, reverse=True)
    for candidate in candidates:
        rows_out = _parse_json_array_to_rows(candidate)
        if rows_out:
            return rows_out
    return []


def _parse_json_array_to_rows(arr: list) -> list[dict]:
    if not arr or not isinstance(arr[0], dict):
        return []
    headers = list(arr[0].keys())
    col_types = [_classify_header(h) for h in headers]

    rows_out = []
    for i, item in enumerate(arr):
        entry: dict = {"scores": {}}
        rank_set = model_set = company_set = False

        for j, h in enumerate(headers):
            val = str(item.get(h, "") or "").strip()
            ct = col_types[j]
            if h:
                entry["scores"][h] = val
            if ct == "rank" and not rank_set:
                try:
                    entry["rank"] = int(re.sub(r"[^\d]", "", val) or str(i + 1))
                except Exception:
                    entry["rank"] = i + 1
                rank_set = True
            elif ct == "model" and not model_set:
                entry["model_name"] = val
                model_set = True
            elif ct == "company" and not company_set:
                entry["company_name"] = val
                company_set = True

        if not model_set or not entry.get("model_name"):
            continue
        if not rank_set:
            entry["rank"] = i + 1
        rows_out.append(entry)

    return rows_out


def _scan_inline_scripts(html: str) -> list[dict]:
    """
    Scan all inline <script> tags for JSON arrays that look like leaderboard data.
    Catches Chart.js / ECharts / Highcharts initialization data that sits in the
    page source even when no <table> exists.
    """
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    candidates = []

    for script in soup.find_all("script"):
        text = (script.string or "").strip()
        if not text or len(text) > 300_000:
            continue

        # 1. Whole script is a JSON array
        try:
            data = json.loads(text)
            if isinstance(data, list) and len(data) >= 2 and isinstance(data[0], dict):
                candidates.append(data)
                continue
        except Exception:
            pass

        # 2. Variable assignments: var x = [...] or window.x = [...]
        for match in re.finditer(
            r'(?:var |let |const |window\.)\w+\s*=\s*(\[\s*\{.*?\}\s*\])',
            text, re.DOTALL
        ):
            try:
                arr = json.loads(match.group(1))
                if isinstance(arr, list) and len(arr) >= 2 and isinstance(arr[0], dict) and len(arr[0]) >= 2:
                    candidates.append(arr)
            except Exception:
                pass

    candidates.sort(key=len, reverse=True)
    for candidate in candidates:
        rows = _parse_json_array_to_rows(candidate)
        if rows:
            return rows
    return []


def _parse_api_data(api_arrays: list) -> list[dict]:
    """Try to convert network-intercepted JSON arrays into ranking rows."""
    sorted_arrays = sorted(api_arrays, key=len, reverse=True)
    for arr in sorted_arrays:
        rows = _parse_json_array_to_rows(arr)
        if rows and len(rows) >= 2:
            return rows
    return []


# ── Chart detection ────────────────────────────────────────────────────────

def _has_charts(html: str) -> bool:
    """Return True if the page likely uses chart/graph visualisations.
    Must be called on the Playwright-rendered HTML (not httpx) because
    <canvas> elements are created by JavaScript after page load.
    """
    if not html:
        return False
    soup = BeautifulSoup(html, "html.parser")
    if soup.find("canvas"):
        return True
    chart_libs = {
        "chart.js", "echarts", "highcharts", "plotly", "d3.", "vega",
        "apexcharts", "recharts", "victory", "nivo", "visx", "chartist",
        "frappe", "billboard", "c3.min", "morris", "flot", "tremor",
    }
    # Check script src= attributes
    for script in soup.find_all("script", src=True):
        src = script.get("src", "").lower()
        if any(lib in src for lib in chart_libs):
            return True
    # Check inline script content for chart library signatures
    for script in soup.find_all("script"):
        text = (script.string or "").lower()
        if any(lib in text for lib in ["recharts", "victory", "apexcharts", "echarts", "highcharts", "nivo", "chartjs"]):
            return True
    # Check element class names for known chart lib signatures
    for el in soup.find_all(class_=True):
        classes = " ".join(el.get("class", [])).lower()
        if any(lib in classes for lib in ["recharts", "victory", "apexcharts", "echarts", "nivo", "chartjs", "visx"]):
            return True
    # SVG with matching class name OR with many data-elements (bar/line charts have dozens of paths)
    for svg in soup.find_all("svg"):
        cls = " ".join(svg.get("class", [])).lower()
        if any(kw in cls for kw in ["chart", "graph", "viz", "plot", "bar", "line", "pie"]):
            return True
        if len(svg.find_all(["path", "rect", "circle", "line", "polyline", "polygon"])) >= 5:
            return True
    return False


# ── Gemini visual extraction (last resort for chart-only pages) ────────────

_GEMINI_VISUAL_PROMPT = (
    "You are a data extraction assistant. This is a screenshot of a leaderboard or benchmark results page.\n\n"
    "Your task: Extract the ranking data visible in this image.\n\n"
    "RULES:\n"
    "1. Extract model names and scores that are visible in the image — from tables, bar charts, or labeled charts.\n"
    "2. For bar charts: read values from printed data labels on bars, OR from axis tick labels paired with bar heights. Rank models by bar length (shorter WER = better rank).\n"
    "3. DO NOT use any knowledge outside this image. DO NOT hallucinate model names or scores.\n"
    "4. DO NOT guess values when no label or axis is visible — omit that field.\n"
    "5. Return ONLY a valid JSON array — no explanation, no markdown code fences.\n\n"
    "Output format:\n"
    '[{"rank": 1, "model_name": "exact name from image", "scores": {"metric": "value as shown"}}, ...]\n\n'
    "If no ranked model data is readable in this image, return exactly: []"
)


def _gemini_visual_extract(screenshot_b64: str, url: str) -> list[dict]:
    if not OPENROUTER_API_KEY or not screenshot_b64:
        return []
    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.5-flash",
                "temperature": 0,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"},
                        },
                        {"type": "text", "text": _GEMINI_VISUAL_PROMPT},
                    ],
                }],
            },
            timeout=60,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        content = re.sub(r"^```[a-z]*\n?", "", content).rstrip("`").strip()
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if not match:
            return []
        rows_raw = json.loads(match.group())
        if not isinstance(rows_raw, list):
            return []

        rows_out = []
        for i, item in enumerate(rows_raw):
            if not isinstance(item, dict) or not item.get("model_name"):
                continue
            rank = item.get("rank", i + 1)
            model = str(item["model_name"]).strip()
            extra_scores = {k: str(v) for k, v in (item.get("scores") or {}).items()}
            entry = {
                "rank": rank,
                "model_name": model,
                "scores": {"Rank": str(rank), "Model": model, **extra_scores},
            }
            if item.get("company_name"):
                entry["company_name"] = str(item["company_name"]).strip()
            rows_out.append(entry)

        print(f"  Gemini vision: {len(rows_out)} rows from {url}")
        return rows_out

    except Exception as e:
        print(f"  Gemini vision failed for {url}: {e}")
        return []


# ── Gemini text extraction (after DOM fails, before vision) ───────────────

_GEMINI_TEXT_PROMPT = (
    "You are a data extraction assistant for Voice AI leaderboards.\n"
    "The text below was scraped from a leaderboard or benchmark page that ranks AI voice/speech models.\n\n"
    "TASK: Extract the RANKING TABLE — each row is ONE voice model/system and its performance scores.\n"
    "DO NOT extract descriptions, methodology, or general information about the leaderboard itself.\n\n"
    "CRITICAL RULES:\n"
    "1. Extract ONLY data EXPLICITLY present in this text. Never use outside knowledge.\n"
    "2. Each JSON object = one ranked AI model or voice system.\n"
    "3. 'model_name' = the name of the AI model/system — in voice AI pages it may be labeled:\n"
    "   System, Voice, Model, TTS Model, ASR Model, Method, Name, Speaker, Engine.\n"
    "4. 'scores' = ALL metric values shown for that model: Elo, Rating, WER, MOS, Win Rate,\n"
    "   Votes, RTF, RTFx, Latency, DNSMOS, PESQ, Score, CER, BLEU, Speed, Cost, etc.\n"
    "5. 'rank' = numeric position in the ranking (1 = best). Infer from order if not explicit.\n"
    "6. Include EVERY model row — do not truncate the list.\n"
    "7. Return ONLY a valid JSON array. No markdown fences, no explanation.\n\n"
    "Output format:\n"
    '[{"rank": 1, "model_name": "exact name", "company_name": "org if shown", '
    '"scores": {"Elo": "1500", "Win Rate": "62%", "WER": "5.2%", ...}}, ...]\n\n'
    "Return exactly [] if no ranked model rows are found.\n\n"
    "Scraped content:\n"
)


def _extract_page_text(html: str, max_chars: int = 80_000) -> str:
    """
    Extract meaningful text from rendered HTML for Gemini to parse.
    Strips noise (scripts, nav, footer), then prioritises table content
    followed by main/article content, then full body text.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup.find_all(["script", "style", "nav", "footer", "head", "header"]):
        tag.decompose()

    # Prioritise table content (densest with data)
    tables = soup.find_all("table")
    if tables:
        # Include surrounding context: page title + all table text
        title = soup.title.string.strip() if soup.title and soup.title.string else ""
        table_text = "\n\n".join(t.get_text(separator="\t", strip=True) for t in tables)
        combined = f"{title}\n\n{table_text}" if title else table_text
        if len(combined) >= 100:
            return combined[:max_chars]

    # Try named content containers
    for sel in ["main", "article", "[role='main']",
                "[class*='leaderboard']", "[class*='ranking']", "[class*='results']",
                "[class*='content']", "[class*='table']"]:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(separator="\n", strip=True)
            if len(text) >= 100:
                return text[:max_chars]

    return soup.get_text(separator="\n", strip=True)[:max_chars]


def _gemini_text_extract(html: str, url: str) -> list[dict]:
    """
    Pass the page's visible text to Gemini and ask it to extract ranking rows.
    Fires after all DOM/API/script strategies have returned 0 rows.
    Receives only real scraped text — must not use training knowledge.
    """
    if not OPENROUTER_API_KEY or not html:
        return []

    page_text = _extract_page_text(html)
    if len(page_text) < 80:
        return []

    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.5-flash",
                "temperature": 0,
                "messages": [{"role": "user", "content": _GEMINI_TEXT_PROMPT + page_text}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        content = re.sub(r"^```[a-z]*\n?", "", content).rstrip("`").strip()
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if not match:
            return []
        rows_raw = json.loads(match.group())
        if not isinstance(rows_raw, list):
            return []

        rows_out = []
        for i, item in enumerate(rows_raw):
            if not isinstance(item, dict) or not item.get("model_name"):
                continue
            rank = item.get("rank", i + 1)
            model = str(item["model_name"]).strip()
            extra_scores = {k: str(v) for k, v in (item.get("scores") or {}).items()}
            entry: dict = {
                "rank": rank,
                "model_name": model,
                "scores": {"Rank": str(rank), "Model": model, **extra_scores},
            }
            if item.get("company_name"):
                entry["company_name"] = str(item["company_name"]).strip()
            rows_out.append(entry)

        print(f"  Gemini text: {len(rows_out)} rows from {url}")
        return rows_out

    except Exception as e:
        print(f"  Gemini text failed for {url}: {e}")
        return []


def _gemini_text_extract_raw(page_text: str, url: str) -> list[dict]:
    """
    Like _gemini_text_extract but receives plain text (e.g. body_text from
    document.body.innerText) instead of HTML. Used for div/grid-based
    leaderboards that have no <table> elements.
    Receives only real scraped text — must not use training knowledge.
    """
    if not OPENROUTER_API_KEY or not page_text or len(page_text) < 80:
        return []

    text = page_text[:30000]
    try:
        resp = httpx.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "google/gemini-2.5-flash",
                "temperature": 0,
                "messages": [{"role": "user", "content": _GEMINI_TEXT_PROMPT + text}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"].strip()
        content = re.sub(r"^```[a-z]*\n?", "", content).rstrip("`").strip()
        match = re.search(r"\[.*\]", content, re.DOTALL)
        if not match:
            return []
        rows_raw = json.loads(match.group())
        if not isinstance(rows_raw, list):
            return []

        rows_out = []
        for i, item in enumerate(rows_raw):
            if not isinstance(item, dict) or not item.get("model_name"):
                continue
            rank = item.get("rank", i + 1)
            model = str(item["model_name"]).strip()
            extra_scores = {k: str(v) for k, v in (item.get("scores") or {}).items()}
            entry: dict = {
                "rank": rank,
                "model_name": model,
                "scores": {"Rank": str(rank), "Model": model, **extra_scores},
            }
            if item.get("company_name"):
                entry["company_name"] = str(item["company_name"]).strip()
            rows_out.append(entry)

        print(f"  Gemini body_text: {len(rows_out)} rows from {url}")
        return rows_out

    except Exception as e:
        print(f"  Gemini body_text failed for {url}: {e}")
        return []


# ── Headless browser ───────────────────────────────────────────────────────

_PW_SCRIPT = r"""
import json, sys, re, time as _time, base64
from html import escape
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

url = sys.argv[1]
out = sys.argv[2]

NEXT_PAGE_SELECTORS = [
    # ARIA labels
    "button[aria-label='Next page']",
    "button[aria-label='next page']",
    "button[aria-label='Go to next page']",
    "button[aria-label='Next']",
    "a[aria-label='Next page']",
    "a[aria-label='Next']",
    "a[rel='next']",
    # data-testid patterns
    "[data-testid='next-page-button']",
    "[data-testid='pagination-next']",
    # CSS class patterns
    ".pagination-next:not(.disabled)",
    "li.next:not(.disabled) > a",
    "button.next-page:not([disabled])",
    "button[class*='next']:not([disabled]):not([aria-disabled='true'])",
    "a[class*='next']:not(.disabled)",
    # DataTables
    ".dataTables_paginate .next:not(.disabled)",
    # AG Grid
    "[ref='lbNext']:not([disabled])",
    # MUI / generic last pagination button
    ".MuiPaginationItem-root[aria-label*='next']",
    "[class*='pagination'] [class*='next']:not([disabled])",
    # Common SVG arrow buttons (chevron-right icon inside a button)
    "button[class*='page']:not([disabled]) svg[data-icon*='right']",
]

PAGE_SIZE_SELECTORS = [
    "select[name*='per_page']",
    "select[name*='pageSize']",
    "select[name*='page_size']",
    "select[name*='rows']",
    "select[id*='per_page']",
    "select[id*='pageSize']",
    "select[id*='rows_per_page']",
    "select[aria-label*='per page']",
    "select[aria-label*='rows per page']",
    "select[aria-label*='page size']",
]

SHOW_ALL_SELECTORS = [
    "button[data-value='all']",
    "option[value='all']",
    "option[value='-1']",
    "option[value='0']",
]

def extract_rows(page):
    return page.evaluate('''
    () => {
        const JUNK_KW = ["choice", "what it means", "action", "shortcut", "description"];
        function isJunk(t) {
            const rows = [...t.querySelectorAll("tr")];
            if (!rows.length) return true;
            const hdrs = [...rows[0].querySelectorAll("th,td")].map(c => c.innerText.toLowerCase().trim());
            if (hdrs.length <= 2 && JUNK_KW.some(k => hdrs.join(" ").includes(k))) return true;
            return false;
        }
        const tables = [...document.querySelectorAll("table")].filter(t => !isJunk(t));
        if (!tables.length) return [];
        let best = tables[0], bestScore = 0;
        for (const t of tables) {
            const rows = [...t.querySelectorAll("tr")];
            const maxCols = Math.max(...rows.map(r => r.querySelectorAll("th,td").length), 1);
            const score = rows.length * maxCols;
            if (score > bestScore) { bestScore = score; best = t; }
        }
        return [...best.querySelectorAll("tr")].map(tr =>
            [...tr.querySelectorAll("th,td")].map(c =>
                c.innerText.replace(/\\n+/g, " ").replace(/\\s+/g, " ").trim()
            )
        ).filter(row => row.some(c => c));
    }
    ''')

def _try_show_all(page):
    '''Try to switch the table to "show all rows" mode before paginating.'''
    # 1. Try <select> with an "all" / -1 / 0 option
    for ps in PAGE_SIZE_SELECTORS:
        try:
            el = page.query_selector(ps)
            if not el:
                continue
            opts = el.evaluate(
                "el => [...el.options].map(o => ({v: o.value, t: o.text.toLowerCase(), n: parseInt(o.value)||0}))"
            )
            # Prefer explicit "all" option, otherwise pick the largest numeric value
            all_opt = next((o for o in opts if o['t'] in ('all', 'show all', 'everything')), None)
            if all_opt:
                el.select_option(all_opt['v'])
                page.wait_for_timeout(1200)
                return
            neg_opt = next((o for o in opts if o['v'] in ('-1', '0')), None)
            if neg_opt:
                el.select_option(neg_opt['v'])
                page.wait_for_timeout(1200)
                return
            if opts:
                best = max(opts, key=lambda o: o['n'])
                if best['n'] > 0:
                    el.select_option(best['v'])
                    page.wait_for_timeout(1200)
                    return
        except Exception:
            pass
    # 2. Try clicking a "Show all" / "100 per page" type button
    for sel in SHOW_ALL_SELECTORS:
        try:
            el = page.query_selector(sel)
            if el and el.is_visible():
                el.click()
                page.wait_for_timeout(1200)
                return
        except Exception:
            pass

def click_next(page):
    for sel in NEXT_PAGE_SELECTORS:
        try:
            for btn in page.query_selector_all(sel):
                if btn.is_visible() and btn.is_enabled():
                    btn.scroll_into_view_if_needed()
                    btn.click()
                    page.wait_for_timeout(1800)
                    return True
        except Exception:
            pass
    # Text-based fallback: find any visible, enabled button/link whose text is a
    # common "next page" label (handles Gradio, DataTables, custom pagination UIs).
    try:
        clicked = page.evaluate('''() => {
            const LABELS = ["next", "next page", ">", ">>", "›", "»", "→"];
            const els = [...document.querySelectorAll("button, a[role='button'], a[href]")];
            for (const el of els) {
                const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
                if (!LABELS.includes(txt)) continue;
                if (el.offsetParent === null) continue;          // hidden
                if (el.disabled || el.getAttribute("disabled") !== null) continue;
                const cls = (el.className || "").toLowerCase();
                if (cls.includes("disabled") || cls.includes("inactive")) continue;
                el.click();
                return true;
            }
            return false;
        }''')
        if clicked:
            page.wait_for_timeout(1800)
            return True
    except Exception:
        pass
    return False

def _scroll_collect(page, deadline):
    '''
    Scroll-based row collection for infinite-scroll / virtual-scroll tables.
    Scrolls the page incrementally and harvests new rows each time.
    Stops when no new rows appear after two consecutive scrolls.
    '''
    all_rows = []
    seen = set()
    headers_captured = False
    no_new = 0
    scroll_pos = 0
    step = 600  # px per scroll step

    while _time.time() < deadline and no_new < 3:
        rows = extract_rows(page)
        added = 0
        if rows:
            if not headers_captured:
                all_rows.append(rows[0])
                headers_captured = True
                start = 1
            else:
                start = 1
            for row in rows[start:]:
                key = tuple(row)
                if key not in seen:
                    seen.add(key)
                    all_rows.append(row)
                    added += 1
        if added == 0:
            no_new += 1
        else:
            no_new = 0
        scroll_pos += step
        page.evaluate(f'window.scrollTo(0, {scroll_pos})')
        page.wait_for_timeout(600)

    return all_rows

def collect_all_rows(page, deadline):
    '''
    Collect all rows using: show-all → pagination → scroll fallback.
    '''
    _try_show_all(page)

    all_rows = []
    seen = set()
    headers_captured = False

    for _ in range(500):
        if _time.time() > deadline:
            break
        rows = extract_rows(page)
        if rows:
            start = 0
            if not headers_captured:
                all_rows.append(rows[0])
                headers_captured = True
                start = 1
            for row in rows[start:]:
                key = tuple(row)
                if key not in seen:
                    seen.add(key)
                    all_rows.append(row)
        if not click_next(page):
            break

    # If pagination found very few rows (≤5 data rows), try scroll-based
    # collection — the table may be virtual/infinite-scroll.
    if len(all_rows) <= 6 and _time.time() < deadline:
        scroll_rows = _scroll_collect(page, deadline)
        if len(scroll_rows) > len(all_rows):
            all_rows = scroll_rows

    return all_rows

JUNK_ROW_PHRASES = [
    'is better', 'both good', 'both bad', 'sounded', 'felt right',
    'sounds great', 'neither', 'vote for', 'next round',
]
JUNK_HEADER_KEYWORDS = [
    'choice', 'what it means', 'option', 'description', 'meaning',
    'definition', 'action', 'shortcut',
]
# Tab text patterns that likely lead to a leaderboard view
LEADERBOARD_TAB_KEYWORDS = [
    'leaderboard', 'ranking', 'results', 'scores', 'standings', 'board',
    'wer', 'accuracy', 'cer', 'mos', 'elo', 'bleu', 'rtf',
    'benchmark', 'evaluation', 'model ranking',
]

DATASET_STAT_KEYWORDS = [
    'language', 'samples', 'noisy', 'districts', 'male', 'female',
    'hours', 'speakers', 'utterances', 'locale', 'accent', 'dialect',
    'region', 'corpus', 'clips', 'duration', 'avg/spk', 'unique words',
]
LEADERBOARD_HINT_KEYWORDS = [
    'model', 'rank', 'wer', 'accuracy', 'score', 'elo', 'mos',
    'system', 'name', 'method', 'latency', 'rtf', 'bleu', 'cer',
]

def looks_like_leaderboard(rows):
    if len(rows) < 3:
        return False
    header = rows[0]
    data = rows[1:]
    hl = ' '.join(header).lower()
    # Reject 2-column tables whose headers look like instructions/shortcuts/explanations
    if len(header) <= 2 and any(kw in hl for kw in JUNK_HEADER_KEYWORDS):
        return False
    # Reject rows containing voting/arena UI text
    sample = ' '.join(c.lower() for row in data[:6] for c in row)
    junk_hits = sum(1 for p in JUNK_ROW_PHRASES if p in sample)
    if junk_hits >= 2:
        return False
    # Reject all-long-sentences tables (description text, not scores)
    all_cells = [c for row in data for c in row if c]
    if all_cells and sum(len(c) for c in all_cells) / len(all_cells) > 55:
        return False
    # Reject dataset-statistics tables (corpus/audio stats, not model rankings)
    cleaned = [h.lower().strip().rstrip('↑↓↕ ').strip() for h in header]
    dataset_hits = sum(1 for h in cleaned if any(kw in h for kw in DATASET_STAT_KEYWORDS))
    lb_hits = sum(1 for h in cleaned if any(kw in h for kw in LEADERBOARD_HINT_KEYWORDS))
    if dataset_hits >= 5 and lb_hits == 0:
        return False
    # Require at least one header that looks like a model/rank/score column
    good_headers = {
        'rank', 'model', 'name', 'score', 'elo', 'wer', 'mos', 'latency',
        'accuracy', 'rating', 'wins', 'battles', 'win rate', 'votes', 'system', 'method',
        'provider', 'engine', 'voice', 'cer', 'bleu', 'rtf', 'dnsmos', 'pesq',
    }
    if not any(kw in hl for kw in good_headers):
        return False
    return True

def _wait_for_table(page, timeout_ms=14000):
    # Wait until a LEADERBOARD table appears — one with >=3 rows, >=3 cols, AND
    # at least one header cell that contains a leaderboard-related keyword.
    # This prevents early return when voting/instruction tables already exist
    # in the DOM (e.g. Gradio arenas show A-vs-B tables before the leaderboard tab loads).
    # NOTE: LEADERBOARD_HINT_KEYWORDS is defined above in this script (subprocess scope).
    try:
        page.wait_for_function(
            '''(kws) => {
                const tables = [...document.querySelectorAll("table")];
                return tables.some(t => {
                    const rows = t.querySelectorAll("tr");
                    if (rows.length < 3) return false;
                    const firstRow = rows[0];
                    const headers = [...(firstRow ? firstRow.querySelectorAll("th,td") : [])]
                        .map(c => c.innerText.toLowerCase().trim());
                    if (headers.length < 3) return false;
                    return kws.some(kw => headers.some(h => h.includes(kw)));
                });
            }''',
            arg=LEADERBOARD_HINT_KEYWORDS,
            timeout=timeout_ms,
        )
    except Exception:
        pass  # proceed to collect_all_rows regardless

def try_tabs(page, deadline):
    # Click through any clickable element that contains a leaderboard keyword.
    # Handles: ARIA tab buttons (Gradio/HF), nav links, headings, div-based nav.

    def score_tab(tab):
        try:
            txt = tab.inner_text().lower()
            return sum(1 for kw in LEADERBOARD_TAB_KEYWORDS if kw in txt)
        except Exception:
            return 0

    # Collect from broadened selectors — tab buttons, nav links, headings, divs
    tab_els = []
    for sel in [
        "button[role='tab'], [role='tablist'] button, [role='tab']",
        "nav a, nav button, nav li",
        "a[class*='tab'], li[class*='tab'], div[class*='tab']",
        "[class*='nav-item'], [class*='nav-link'], [class*='menu-item']",
        "h1, h2, h3, h4, h5",
        "a[href*='leaderboard'], a[href*='ranking']",
    ]:
        try:
            tab_els.extend(page.query_selector_all(sel))
        except Exception:
            pass

    # Only keep elements that score > 0 (contain a leaderboard keyword), sorted best-first
    scored = [(score_tab(t), t) for t in tab_els]
    sorted_tabs = [t for s, t in sorted(scored, key=lambda x: x[0], reverse=True) if s > 0]

    tried_any = False  # track whether any ARIA tab was attempted

    for tab in sorted_tabs:
        if _time.time() > deadline:
            break
        try:
            if not tab.is_visible():
                continue
            tab.scroll_into_view_if_needed()
            tab.click()
            tried_any = True
            # Minimum baseline so Gradio registers the click and initiates SSE
            page.wait_for_timeout(3000)
            # Gradio Spaces deliver leaderboard data via SSE after tab click;
            # allow up to 75 s for a busy/queued HF server to respond.
            _wait_for_table(page, 75000)
            rows = collect_all_rows(page, deadline)
            if len(rows) > 2 and looks_like_leaderboard(rows):
                return rows
            # Table didn't appear or wasn't recognised as a leaderboard.
            # SSE may have arrived AFTER the 75 s timeout — wait up to 20 s more
            # for any body-text change that signals the data finally landed.
            # This ensures body_text captured later contains the leaderboard content
            # so the Gemini text fallback in _try_playwright can extract rows.
            try:
                init_len = len(page.evaluate("() => (document.body.innerText || '')") or "")
                page.wait_for_function(
                    f"() => (document.body.innerText || '').length > {init_len + 100}",
                    timeout=20000,
                )
            except Exception:
                pass
        except Exception:
            pass

    # JS fallback: only run when ARIA tabs found NOTHING to click.
    # If ARIA already tried the leaderboard tab (tried_any=True), skipping here
    # avoids a redundant 75 s double-wait on the same element.
    if tried_any:
        return []

    try:
        clicked = page.evaluate('''(keywords) => {
            const candidates = [...document.querySelectorAll(
                "a, button, [role='button'], h1, h2, h3, h4, h5, li, " +
                "div[onclick], span[onclick], [class*='tab'], [class*='nav-item'], [class*='menu']"
            )];
            for (const el of candidates) {
                const txt = (el.innerText || el.textContent || "").toLowerCase().trim();
                if (txt.length === 0 || txt.length > 60) continue;
                if (!keywords.some(kw => txt.includes(kw))) continue;
                if (el.offsetParent === null) continue;
                el.click();
                return true;
            }
            return false;
        }''', LEADERBOARD_TAB_KEYWORDS)
        if clicked:
            page.wait_for_timeout(3000)
            _wait_for_table(page, 45000)
            rows = collect_all_rows(page, deadline)
            if len(rows) > 2 and looks_like_leaderboard(rows):
                return rows
    except Exception:
        pass

    return []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            # Required for container/cloud environments (Render free tier)
            "--no-sandbox",
            "--disable-setuid-sandbox",
            # Use /tmp instead of /dev/shm — critical on Render where /dev/shm
            # is only ~64 MB; without this flag Chromium crashes on complex pages
            "--disable-dev-shm-usage",
            # Reduce memory: disable GPU, WebGL, hardware acceleration
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-accelerated-2d-canvas",
            "--disable-webgl",
            # Skip background processes to keep memory footprint small
            "--no-zygote",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--no-first-run",
            "--disable-features=TranslateUI,BlinkGenPropertyTrees",
        ],
    )
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

    # ── Network interception: capture JSON API responses ──────────────────
    # Chart pages (ECharts, Chart.js, Highcharts) almost always fetch their
    # data from an API endpoint.  Capturing those responses gives us structured
    # data without any visual parsing.
    captured_api = []

    def on_response(response):
        try:
            if response.status != 200:
                return
            ct = response.headers.get("content-type", "")
            if "json" not in ct:
                return
            body = response.body()
            if len(body) > 2_000_000:   # skip > 2 MB
                return
            data = json.loads(body)
            # Only keep arrays of objects (typical leaderboard payload)
            if isinstance(data, list) and len(data) >= 2 and isinstance(data[0] if data else None, dict) and len(data[0]) >= 2:
                captured_api.append(data)
            elif isinstance(data, dict):
                # One level deep — many APIs wrap rows in {"data": [...]}
                for v in data.values():
                    if isinstance(v, list) and len(v) >= 2 and isinstance(v[0] if v else None, dict) and len(v[0]) >= 2:
                        captured_api.append(v)
        except Exception:
            pass

    pw_page = context.new_page()
    pw_page.on("response", on_response)

    try:
        resp = pw_page.goto(url, wait_until="domcontentloaded", timeout=35000)
    except PWTimeout:
        resp = None

    # Wait for table or chart-specific elements — do NOT match plain "svg" here
    # because SVG logos load instantly and would cut short the 25s wait that
    # React/D3/Recharts apps need to fetch API data and render charts.
    try:
        pw_page.wait_for_selector(
            "table, canvas, svg[class*='chart'], div[class*='chart'], div[class*='echarts']",
            timeout=25000
        )
    except PWTimeout:
        pass

    # Wait for network to settle after selector fires (or times out).
    # React apps (like Coval) fetch leaderboard data from an API on component mount.
    # networkidle returns immediately if the fetch already completed; otherwise waits
    # up to 10s for the response — so on_response has a chance to capture the payload.
    try:
        pw_page.wait_for_load_state("networkidle", timeout=10000)
    except Exception:
        pass

    has_canvas = bool(pw_page.query_selector("canvas"))
    pw_page.wait_for_timeout(2000 if has_canvas else 1000)

    # 150 s overall pagination budget — extended to give Gradio SSE tabs time to load.
    # try_tabs can wait up to 75 s for a leaderboard table; collect_all_rows needs
    # ~30 s of remaining budget after that, so 150 s total is the safe minimum.
    _deadline = _time.time() + 150

    # Capture screenshot AND rendered_html BEFORE try_tabs can navigate away.
    # Both are needed: screenshot for Gemini visual, rendered_html for _has_charts().
    screenshot_b64 = ""
    try:
        pw_page.set_viewport_size({"width": 1280, "height": 900})
        screenshot_bytes = pw_page.screenshot(full_page=False, type="png")
        screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
    except Exception:
        pass
    early_rendered_html = ""
    try:
        early_rendered_html = pw_page.content() or ""
    except Exception:
        pass

    # Primary: collect rows from current page view with full pagination
    all_rows = collect_all_rows(pw_page, _deadline)
    original_rows = list(all_rows)  # preserve before try_tabs may navigate away

    # Secondary: if no useful table found, try clicking ARIA tabs.
    # chart_only_page: skip tab-clicking when canvas or Recharts/ECharts divs exist
    # AND no table found — navigating on chart pages corrupts page state needed
    # for API-intercept (already captured) and Gemini visual.
    # Use specific chart-lib selectors, NOT plain "svg" — SVG logos are on every site.
    has_chart_div = bool(pw_page.query_selector(
        "div[class*='recharts'], div[class*='echarts'], div[class*='highcharts'], "
        "div[class*='apexcharts'], [class*='chart-container'], [class*='chart-wrapper']"
    ))
    chart_only_page = len(all_rows) == 0 and (has_canvas or has_chart_div)
    if len(all_rows) <= 1 or not looks_like_leaderboard(all_rows):
        if chart_only_page:
            # Chart-only page — keep all_rows=[] so API/Gemini strategies run
            all_rows = []
        else:
            tab_rows = try_tabs(pw_page, _deadline)
            if len(tab_rows) > 1 and looks_like_leaderboard(tab_rows):
                all_rows = tab_rows
                # Update screenshot to show the leaderboard tab that was found
                try:
                    screenshot_bytes = pw_page.screenshot(full_page=False, type="png")
                    screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
                except Exception:
                    pass
            else:
                # try_tabs found nothing better — restore original rows so
                # Python's _parse_html_table (Strategy E) can still use them.
                all_rows = original_rows

    status = resp.status if resp else 200
    # rendered_html: use early capture when try_tabs may have navigated away.
    # _has_charts() needs the original JS-rendered HTML to see <canvas>/chart libs.
    rendered_html = early_rendered_html or (pw_page.content() if pw_page else "")
    # body_text = plain visible text of the page (innerText), useful for pages
    # where leaderboard data is in divs/spans rather than <table> elements.
    body_text = ""
    try:
        body_text = pw_page.evaluate("() => document.body.innerText") or ""
    except Exception:
        pass
    browser.close()

if len(all_rows) > 1:
    header = all_rows[0]
    th_cells  = "".join(f"<th>{escape(c)}</th>" for c in header)
    data_rows = "".join(
        "<tr>" + "".join(f"<td>{escape(c)}</td>" for c in row) + "</tr>"
        for row in all_rows[1:]
    )
    table_html = f"<html><body><table><tr>{th_cells}</tr>{data_rows}</table></body></html>"
else:
    table_html = ""   # signals "no table found"

with open(out, "w", encoding="utf-8") as f:
    json.dump({
        "table_html":   table_html,    # reconstructed table (empty str if none)
        "rendered_html": rendered_html, # full JS-rendered page — used for chart detection
        "body_text":     body_text,     # plain visible text (innerText) — for non-table pages
        "status":        status,
        "screenshot":    screenshot_b64,
        "api_data":      captured_api[:10],  # top 10 intercepted JSON arrays
    }, f)
"""


def _scrape_with_playwright(url: str) -> dict:
    """
    Returns a dict with keys:
      table_html    – reconstructed <table> HTML if rows were found, else ""
      rendered_html – full JS-rendered page HTML (has JS-created <canvas> tags)
      status        – HTTP status code
      screenshot    – base64-encoded PNG
      api_data      – list of JSON arrays captured from network responses
    """
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8")
    tmp.close()
    outfile = tmp.name
    try:
        result = subprocess.run(
            [sys.executable, "-c", _PW_SCRIPT, url, outfile],
            capture_output=True, text=True, timeout=200,
        )
        if result.returncode != 0:
            print(f"  Playwright error for {url}:\n{result.stderr[-400:]}")
            return {"table_html": "", "rendered_html": "", "body_text": "", "status": 0, "screenshot": "", "api_data": []}
        with open(outfile, "r", encoding="utf-8") as f:
            data = json.load(f)
            data.setdefault("body_text", "")
            return data
    except Exception as e:
        print(f"  Playwright failed for {url}: {e}")
        return {"table_html": "", "rendered_html": "", "body_text": "", "status": 0, "screenshot": "", "api_data": []}
    finally:
        try:
            os.unlink(outfile)
        except Exception:
            pass


# ── Core strategies ────────────────────────────────────────────────────────

def _try_httpx(url: str, timeout: int = 40) -> tuple[list, int, str]:
    """Returns (rows, http_status, raw_html). raw_html used as fallback for chart detection."""
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=timeout, follow_redirects=True)
        if resp.status_code == 200:
            rows = (_parse_html_table(resp.text)
                    or _extract_next_data_table(resp.text)
                    or _scan_inline_scripts(resp.text))
            return rows, resp.status_code, resp.text
        return [], resp.status_code, ""
    except Exception as e:
        print(f"  httpx error for {url}: {e}")
        return [], 0, ""


def _try_playwright(url: str) -> tuple[list, int, str, str]:
    """
    Returns (rows, http_status, screenshot_b64, rendered_html).
    Tries strategies in order:
      1. Reconstructed table from paginated DOM (including tab-click)
      2. Intercepted network API responses
      3. Inline script JSON scanning on rendered HTML
      4. __NEXT_DATA__ on rendered HTML
      5. HTML table parser on rendered HTML
      6. Gemini text on body_text (plain innerText, for non-table div-based leaderboards)
    Returns screenshot and rendered_html regardless so callers can use them for
    Gemini visual fallback and chart detection.
    """
    global _last_body_text
    pw = _scrape_with_playwright(url)
    table_html    = pw["table_html"]
    rendered_html = pw["rendered_html"]
    body_text     = pw.get("body_text", "")
    status        = pw["status"]
    screenshot    = pw["screenshot"]
    api_data      = pw["api_data"]
    _last_body_text = body_text  # expose to scrape_leaderboard for note generation

    # Strategy A: paginated DOM table (already reconstructed by PW script)
    if table_html:
        rows = _parse_html_table(table_html)
        if rows:
            return rows, status, screenshot, rendered_html

    # Strategy B: network-intercepted API response (best for chart pages)
    rows = _parse_api_data(api_data)
    if rows:
        print(f"  API intercept succeeded: {len(rows)} rows")
        return rows, status, screenshot, rendered_html

    # Strategy C: inline <script> JSON scanning on rendered HTML
    if rendered_html:
        rows = _scan_inline_scripts(rendered_html)
        if rows:
            return rows, status, screenshot, rendered_html

    # Strategy D: __NEXT_DATA__ on rendered HTML
    if rendered_html:
        rows = _extract_next_data_table(rendered_html)
        if rows:
            return rows, status, screenshot, rendered_html

    # Strategy E: HTML table parser on rendered HTML
    if rendered_html:
        rows = _parse_html_table(rendered_html)
        if rows:
            return rows, status, screenshot, rendered_html

    # Strategy F: Gemini text on body_text (plain innerText from the live DOM).
    # Handles div/grid-based leaderboards where no <table> exists.
    # Skip if body_text is a bot-protection / JS-required page (useless to Gemini).
    _BOT_PHRASES = ("enable javascript", "enable cookies", "checking your browser",
                    "please wait", "cloudflare", "ddos protection", "access denied")
    body_blocked = body_text and any(p in body_text.lower() for p in _BOT_PHRASES)
    if OPENROUTER_API_KEY and body_text and len(body_text) >= 80 and not body_blocked:
        rows = _gemini_text_extract_raw(body_text, url)
        if rows:
            return rows, status, screenshot, rendered_html

    return [], status, screenshot, rendered_html


def _parse_generic(url: str, lb_name: str = "") -> tuple[list, int]:
    """
    Full extraction cascade — never returns placeholder rows.

    1. httpx  → table / __NEXT_DATA__ / inline scripts
    2. Playwright → DOM table (paginated + tabs) / API intercept /
                    inline scripts / __NEXT_DATA__ / table parser
    3. Gemini text — passes visible page text to Gemini; catches complex
                     HTML layouts, React/Vue grids, and anything DOM parsers miss
    4. Gemini vision — screenshot → for chart-only pages where no text rows exist
    """
    label = lb_name or url

    # ── Step 1: httpx ──────────────────────────────────────────────────────
    rows, http_status, raw_html = _try_httpx(url)
    if rows:
        # Capture plain text for enrichment (Gemini popularity/scope) even when
        # httpx succeeds and Playwright is never called (which normally sets _last_body_text).
        global _last_body_text
        if raw_html:
            try:
                _last_body_text = BeautifulSoup(raw_html, "html.parser").get_text(" ", strip=True)
            except Exception:
                pass
        return rows, http_status
    print(f"  [{label}] httpx: 0 rows (HTTP {http_status})")

    # ── Step 2: Playwright (JS-rendered DOM + API intercept + tab-click) ──
    rows, pw_status, screenshot_b64, rendered_html = _try_playwright(url)
    if rows:
        return rows, pw_status or http_status
    print(f"  [{label}] Playwright DOM/API/scripts: 0 rows (HTTP {pw_status})")

    combined_status = pw_status or http_status
    check_html = rendered_html or raw_html   # prefer JS-rendered for chart detection

    # ── Step 3: Gemini text extraction ────────────────────────────────────
    if OPENROUTER_API_KEY and check_html:
        rows = _gemini_text_extract(check_html, url)
        if rows:
            print(f"  [{label}] Gemini text: {len(rows)} rows ✓")
            return rows, combined_status
        print(f"  [{label}] Gemini text: 0 rows")
    elif not OPENROUTER_API_KEY:
        print(f"  [{label}] Gemini text: skipped (no API key)")
    else:
        print(f"  [{label}] Gemini text: skipped (no rendered HTML)")

    # ── Step 4: Gemini vision ─────────────────────────────────────────────
    if OPENROUTER_API_KEY and screenshot_b64:
        rows = _gemini_visual_extract(screenshot_b64, url)
        if rows:
            print(f"  [{label}] Gemini vision: {len(rows)} rows ✓")
            return rows, combined_status
        print(f"  [{label}] Gemini vision: 0 rows")
    elif not screenshot_b64:
        print(f"  [{label}] Gemini vision: skipped (no screenshot)")

    print(f"  [{label}] All strategies exhausted — no data extracted")
    return [], combined_status


def _parse_github_readme(url: str) -> tuple[list, int]:
    raw_url = url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
    if "raw.githubusercontent" not in raw_url:
        raw_url = url.rstrip("/") + "/raw/main/README.md"

    try:
        resp = httpx.get(raw_url, headers=HEADERS, timeout=15, follow_redirects=True)
        if resp.status_code != 200:
            resp2 = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
            rows = _parse_html_table(resp2.text)
            return rows, resp2.status_code

        md = resp.text
        rows_out: list[dict] = []
        headers: list[str] = []
        in_table = False
        rank = 1

        for line in md.splitlines():
            if "|" not in line:
                if in_table:
                    break
                continue
            if re.match(r"^\s*\|[-| :]+\|\s*$", line):
                in_table = True
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            cells = [c for c in cells if c]
            if not cells:
                continue
            if not headers:
                headers = cells
                in_table = True
                continue

            col_types = [_classify_header(h) for h in headers]
            entry: dict = {"scores": {}}
            rank_set = model_set = company_set = False

            for j, val in enumerate(cells):
                if j >= len(headers):
                    break
                ct = col_types[j]
                if headers[j]:
                    entry["scores"][headers[j]] = val
                if ct == "rank" and not rank_set:
                    try:
                        entry["rank"] = int(re.sub(r"[^\d]", "", val) or str(rank))
                    except Exception:
                        entry["rank"] = rank
                    rank_set = True
                elif ct == "model" and not model_set:
                    entry["model_name"] = val
                    model_set = True
                elif ct == "company" and not company_set:
                    entry["company_name"] = val
                    company_set = True

            if not model_set:
                entry["model_name"] = cells[0] if cells else "Unknown"
            if not rank_set:
                entry["rank"] = rank
            rows_out.append(entry)
            rank += 1

        return rows_out, resp.status_code

    except Exception:
        return [], 0


def _is_hf_sleeping(html: str) -> bool:
    """Return True if the page is HuggingFace's 'Space is sleeping' screen."""
    if not html:
        return False
    lower = html.lower()
    return (
        "space is sleeping" in lower
        or "this space is paused" in lower
        or "wake up this space" in lower
        or ("sleeping" in lower and "huggingface" in lower)
    )


def _parse_hf_space(url: str) -> tuple[list, int]:
    """
    Try the .hf.space subdomain first; if the space is sleeping, hit the
    huggingface.co/spaces URL to wake it, wait up to 90s, then retry once.
    Cascade: Playwright DOM/tabs → Gemini text → Gemini vision.
    """
    space_url = url
    hf_url = url  # huggingface.co/spaces/... URL (used for wake-up)
    if "huggingface.co/spaces/" in url:
        parts = url.rstrip("/").split("/spaces/")[-1].split("/")
        if len(parts) >= 2:
            owner = parts[0].lower()
            space = parts[1].lower().replace("_", "-")
            space_url = f"https://{owner}-{space}.hf.space"

    rows, status, screenshot, rendered_html = _try_playwright(space_url)

    # Detect sleeping space and retry via huggingface.co URL which triggers wake-up
    if not rows and _is_hf_sleeping(rendered_html):
        print(f"  HF space sleeping — waking via {hf_url}, retrying in 90s...")
        try:
            # Hit the HF page to trigger wake-up (HF auto-wakes on page visit)
            httpx.get(hf_url, headers=HEADERS, timeout=10, follow_redirects=True)
        except Exception:
            pass
        import time as _t
        _t.sleep(90)
        rows, status, screenshot, rendered_html = _try_playwright(space_url)

    if rows:
        return rows, status

    check_html = rendered_html or ""

    if OPENROUTER_API_KEY and check_html and not _is_hf_sleeping(check_html):
        rows = _gemini_text_extract(check_html, space_url)
        if rows:
            return rows, status

    if OPENROUTER_API_KEY and screenshot and _has_charts(check_html):
        rows = _gemini_visual_extract(screenshot, space_url)
        if rows:
            return rows, status

    return [], status


# ── Per-leaderboard dispatch ───────────────────────────────────────────────

def _parse_open_asr(lb_id: int, db: Session) -> tuple[list, int]:
    url = "https://hf-audio-open-asr-leaderboard.hf.space/"
    rows, status, screenshot, rendered_html = _try_playwright(url)
    if rows:
        return rows, status
    check_html = rendered_html or ""
    if OPENROUTER_API_KEY and check_html:
        rows = _gemini_text_extract(check_html, url)
        if rows:
            return rows, status
    if OPENROUTER_API_KEY and screenshot and _has_charts(check_html):
        rows = _gemini_visual_extract(screenshot, url)
    return rows, status


def _parse_speechcolab(lb_id: int, db: Session) -> tuple[list, int]:
    rows, status = _parse_generic("https://speechcolab.github.io/Leaderboard/", "SpeechColab")
    if rows:
        return rows, status
    return _parse_github_readme("https://github.com/SpeechColab/Leaderboard")


PARSER_MAP: dict = {
    "open asr leaderboard": _parse_open_asr,
    "speechcolab leaderboard": _parse_speechcolab,
}


def _generate_scraper_note(url: str, body_text: str) -> str:
    """
    Ask Gemini to describe what the original site offers beyond the static ranking table.
    Falls back to a minimal factual sentence if Gemini is unavailable or body_text is empty.
    """
    from urllib.parse import urlparse
    host = urlparse(url).netloc.replace("www.", "")

    if OPENROUTER_API_KEY and body_text and len(body_text) >= 80:
        from agent.prompt_store import get_prompt, DEFAULTS
        template = get_prompt("scraper_note", DEFAULTS["scraper_note"]["prompt_text"])
        prompt = template + f"\n\nScraped text:\n{body_text[:4000]}"
        try:
            resp = httpx.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                json={"model": "google/gemini-2.5-flash", "temperature": 0,
                      "messages": [{"role": "user", "content": prompt}]},
                timeout=30,
            )
            resp.raise_for_status()
            note = resp.json()["choices"][0]["message"]["content"].strip().strip('"')
            if note and note.lower() != "null":
                return note
        except Exception as e:
            print(f"  Note generation failed: {e}")

    return f"Showing data automatically extracted from {host}. Visit the official site for the full interactive leaderboard."



def scrape_leaderboard(lb_id: int, db: Session, triggered_by: str = "click") -> dict:
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        return {"error": "Leaderboard not found"}

    start = time.time()
    name_key = lb.name.lower().strip()

    try:
        if name_key in PARSER_MAP:
            rows, http_status = PARSER_MAP[name_key](lb_id, db)
        elif "github.com" in lb.official_url:
            rows, http_status = _parse_github_readme(lb.official_url)
        elif "hf.space" in lb.official_url or "huggingface.co/spaces" in lb.official_url:
            rows, http_status = _parse_hf_space(lb.official_url)
        else:
            rows, http_status = _parse_generic(lb.official_url, lb.name)

        duration_ms = int((time.time() - start) * 1000)

        if rows and len(rows) >= 2:
            count = _upsert_entries(db, lb_id, rows)
            status = "success"
            error = None
            print(f"  Scraped {lb.name}: {count} rows")
        elif rows:
            count = 0
            status = "partial"
            error = f"Only {len(rows)} row(s) extracted — cached data preserved"
            print(f"  {error} for {lb.name}")
        else:
            count = 0
            status = "error"
            error = f"No rows extracted (HTTP {http_status})"
            print(f"  Scrape failed for {lb.name}: {error}")

        _log_scan(db, lb_id, status, count, duration_ms, http_status, error, triggered_by)

        return {
            "leaderboard_id": lb_id,
            "status": status,
            "records_updated": count,
            "duration_ms": duration_ms,
            "http_status": http_status,
        }

    except Exception as e:
        duration_ms = int((time.time() - start) * 1000)
        _log_scan(db, lb_id, "error", 0, duration_ms, 0, str(e), triggered_by)
        print(f"  Scrape exception for {lb.name}: {e}")
        return {"leaderboard_id": lb_id, "status": "error", "error": str(e)}

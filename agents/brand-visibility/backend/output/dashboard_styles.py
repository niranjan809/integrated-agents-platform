"""
Visual identity for the KA017 demo dashboard.

Exposes:
  - CLASS_META: per-class display name + accent colour
  - get_css(): the global stylesheet (injected once at app start)
  - class_badge(), relevance_badge(), pill(), status_dot(): small HTML helpers

Keep this presentation-only. No data access here.
"""
from __future__ import annotations

# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------
BG = "#0F1419"          # near-black blue page background
CARD = "#1A1F2E"        # card background
BORDER = "#2D3548"      # hairline borders
TEXT = "#E6E8EC"        # primary text
MUTED = "#8B93A7"       # secondary text
MONO = "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"

# Per-class accent colours. C (Voice AI) and E (Language Moat) are KiteAI's
# core/differentiator and are highlighted in the UI.
CLASS_META: dict[str, dict[str, str]] = {
    "A": {"name": "Macro AI & Inference", "color": "#3B82F6"},
    "B": {"name": "Orchestration & Agents", "color": "#06B6D4"},
    "C": {"name": "Voice AI Stack", "color": "#10B981"},
    "D": {"name": "Unit Economics", "color": "#F59E0B"},
    "E": {"name": "Language Moat", "color": "#8B5CF6"},
    "F": {"name": "Vertical Integrators", "color": "#EC4899"},
    "G": {"name": "AI Terminology", "color": "#6B7280"},
    "H": {"name": "Influencers", "color": "#EF4444"},
    "K": {"name": "Product Keywords", "color": "#84CC16"},
    "NOISE": {"name": "Noise", "color": "#4B5563"},
}

# Relevance score bands -> colour
_REL_GREEN = "#10B981"
_REL_YELLOW = "#F59E0B"
_REL_ORANGE = "#F97316"
_REL_RED = "#EF4444"


def class_color(class_key: str | None) -> str:
    if not class_key:
        return MUTED
    return CLASS_META.get(class_key, {}).get("color", MUTED)


def class_name(class_key: str | None) -> str:
    if not class_key:
        return "—"
    return CLASS_META.get(class_key, {}).get("name", class_key)


def relevance_color(score) -> str:
    try:
        s = int(score)
    except (TypeError, ValueError):
        return MUTED
    if s >= 80:
        return _REL_GREEN
    if s >= 60:
        return _REL_YELLOW
    if s >= 40:
        return _REL_ORANGE
    return _REL_RED


# --------------------------------------------------------------------------
# Small HTML fragments (used inside st.markdown(unsafe_allow_html=True))
# --------------------------------------------------------------------------

def class_badge(class_key: str | None) -> str:
    if not class_key:
        return "<span class='ka-badge ka-muted'>—</span>"
    color = class_color(class_key)
    label = f"{class_key} · {class_name(class_key)}"
    return (
        f"<span class='ka-badge' style='background:{color}22;"
        f"color:{color};border:1px solid {color}55'>{label}</span>"
    )


def class_chip(class_key: str | None) -> str:
    """Compact version — just the letter."""
    if not class_key:
        return "<span class='ka-badge ka-muted'>—</span>"
    color = class_color(class_key)
    return (
        f"<span class='ka-badge' style='background:{color}22;color:{color};"
        f"border:1px solid {color}55'>{class_key}</span>"
    )


def relevance_badge(score) -> str:
    color = relevance_color(score)
    try:
        s = int(score)
        label = f"{s}/100"
    except (TypeError, ValueError):
        s, label = None, "—"
    if s is None:
        return "<span class='ka-badge ka-muted'>—</span>"
    return (
        f"<span class='ka-badge' style='background:{color}22;color:{color};"
        f"border:1px solid {color}55'>{label}</span>"
    )


def pill(text: str, color: str = MUTED) -> str:
    return (
        f"<span class='ka-pill' style='background:{color}1A;color:{color};"
        f"border:1px solid {color}44'>{text}</span>"
    )


def status_dot(status: str | None) -> str:
    s = (status or "").lower()
    if s == "completed":
        return "<span style='color:#10B981'>✓ completed</span>"
    if s == "failed":
        return "<span style='color:#EF4444'>✗ failed</span>"
    if s == "running":
        return "<span style='color:#3B82F6'>● running</span>"
    return f"<span class='ka-muted'>{status or '—'}</span>"


# --------------------------------------------------------------------------
# Global stylesheet
# --------------------------------------------------------------------------

def get_css() -> str:
    return f"""
<style>
  /* page + sidebar */
  .stApp {{ background: {BG}; color: {TEXT}; }}
  section[data-testid="stSidebar"] {{ background: #0B0E13; border-right: 1px solid {BORDER}; }}

  /* headings */
  h1, h2, h3, h4 {{ color: {TEXT}; font-weight: 700; }}
  .ka-subtitle {{ color: {MUTED}; font-size: 0.95rem; margin-top: -0.4rem; margin-bottom: 1rem; }}

  /* metric cards */
  div[data-testid="stMetric"] {{
     background: {CARD}; border: 1px solid {BORDER}; border-radius: 12px;
     padding: 14px 16px;
  }}
  div[data-testid="stMetriclabel"] {{ color: {MUTED}; }}

  /* bordered containers */
  div[data-testid="stVerticalBlockBorderWrapper"] {{
     background: {CARD}; border-radius: 12px;
  }}

  /* badges + pills */
  .ka-badge {{
     display: inline-block; padding: 2px 9px; border-radius: 6px;
     font-family: {MONO}; font-size: 0.78rem; font-weight: 600; white-space: nowrap;
  }}
  .ka-pill {{
     display: inline-block; padding: 2px 10px; border-radius: 999px;
     font-size: 0.75rem; margin: 2px 4px 2px 0; white-space: nowrap;
  }}
  .ka-muted {{ color: {MUTED}; background: #ffffff0d; border: 1px solid {BORDER}; }}

  /* workflow step card */
  .ka-step {{
     background: {CARD}; border: 1px solid {BORDER}; border-left-width: 4px;
     border-radius: 10px; padding: 14px 18px; margin-bottom: 12px;
  }}
  .ka-step h4 {{ margin: 0 0 6px 0; font-family: {MONO}; letter-spacing: .3px; }}
  .ka-step ul {{ margin: 6px 0 0 0; padding-left: 18px; color: {TEXT}; }}
  .ka-step li {{ margin: 3px 0; font-size: 0.9rem; }}
  .ka-step code {{ font-family: {MONO}; color: #C7D2FE; background: #ffffff0d;
     padding: 1px 5px; border-radius: 4px; font-size: 0.82rem; }}
  .ka-ref {{ color: {MUTED}; font-size: 0.8rem; font-family: {MONO}; }}

  /* warning / guardrail card */
  .ka-warn {{
     background: #EF44441A; border: 1px solid #EF444455; border-radius: 10px;
     padding: 14px 18px; color: #FCA5A5;
  }}
  .ka-warn h4 {{ color: #FCA5A5; margin-top: 0; }}

  /* signal card */
  .ka-signal {{ font-size: 0.9rem; line-height: 1.35; }}
  .ka-signal .h {{ color: {MUTED}; font-family: {MONO}; font-size: 0.8rem; }}

  /* connection status footer in sidebar */
  .ka-conn-ok {{ color: #10B981; font-family: {MONO}; font-size: 0.8rem; }}
  .ka-conn-bad {{ color: #EF4444; font-family: {MONO}; font-size: 0.8rem; }}

  .ka-logo {{ font-size: 1.5rem; font-weight: 800; color: {TEXT}; letter-spacing: .5px; }}
  .ka-logo span {{ color: #10B981; }}
  .ka-tag {{ color: {MUTED}; font-size: 0.78rem; margin-bottom: 1rem; }}

  /* engagement pill row (expanded panel) */
  .engagement-row {{
     display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
     font-size: 0.9rem; color: #94A3B8; margin: 12px 0;
  }}
  .engagement-row .pill {{
     display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px;
     background: #1E293B; border-radius: 12px; font-family: {MONO};
     font-size: 0.85rem; color: #CBD5E1;
  }}

  /* compact engagement strip (overview cards) */
  .engagement-strip {{ color: {MUTED}; font-family: {MONO}; font-size: 0.78rem; margin-top: 6px; }}

  /* matched keyword display */
  .matched-keyword-line {{
     font-family: {MONO}; font-size: 0.85rem; color: #CBD5E1; margin: 8px 0;
  }}
  .matched-keyword-line .class-badge {{
     display: inline-block; padding: 2px 8px; border-radius: 4px;
     font-weight: bold; margin-right: 8px;
  }}

  /* open-on-X link styled as button */
  .x-link-button {{
     display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px;
     background: transparent; border: 1px solid #475569; border-radius: 6px;
     color: #94A3B8; text-decoration: none; font-size: 0.85rem;
     transition: all 0.15s ease;
  }}
  .x-link-button:hover {{ border-color: #10B981; color: #10B981; }}

  .ka-handle-link {{ color: {TEXT}; text-decoration: none; font-weight: 600; }}
  .ka-handle-link:hover {{ color: #10B981; }}
</style>
"""

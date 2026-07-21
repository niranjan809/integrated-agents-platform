from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from models import RankingChange, Leaderboard, DomainCategory

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _category_resolver(db: Session):
    """Map a leaderboard's raw domain (e.g. 'TTS') to its category-grid name
    (e.g. 'Voice AI Leaderboards'), mirroring the Home grid's matching: a category
    with include_domains whitelists those domains; an empty include is a catch-all
    for anything not excluded. First match by display_order wins."""
    cats = db.query(DomainCategory).order_by(DomainCategory.display_order).all()

    def resolve(domain: str) -> str:
        for c in cats:
            inc = c.include_domains or []
            exc = c.exclude_domains or []
            if inc:
                if domain in inc:
                    return c.name
            elif domain not in exc:
                return c.name
        return "Uncategorized"

    return resolve


@router.get("/changes")
def list_changes(
    leaderboard_id: Optional[int] = None,
    limit: int = 1000,
    db: Session = Depends(get_db),
):
    """Ranking change-log across all leaderboards (newest first), joined with each
    leaderboard's name + domain so the Analytics tab can group by domain → board →
    scan event. Optionally filter to a single leaderboard. Public read (GET)."""
    limit = max(1, min(limit, 5000))
    q = (
        db.query(RankingChange, Leaderboard.name, Leaderboard.domain)
        .join(Leaderboard, RankingChange.leaderboard_id == Leaderboard.id)
    )
    if leaderboard_id is not None:
        q = q.filter(RankingChange.leaderboard_id == leaderboard_id)
    rows = q.order_by(RankingChange.recorded_at.desc(), RankingChange.id.desc()).limit(limit).all()

    resolve_category = _category_resolver(db)

    return [
        {
            "id": ch.id,
            "leaderboard_id": ch.leaderboard_id,
            "leaderboard_name": lb_name,
            "domain": domain,                    # raw type, e.g. "TTS"
            "category": resolve_category(domain), # grid domain, e.g. "Voice AI Leaderboards"
            "change_type": ch.change_type,   # new | dropped | up | down
            "model_name": ch.model_name,
            "old_rank": ch.old_rank,
            "new_rank": ch.new_rank,
            "triggered_by": ch.triggered_by,
            "prev_scanned_at": ch.prev_scanned_at.isoformat() if ch.prev_scanned_at else None,
            "recorded_at": ch.recorded_at.isoformat() if ch.recorded_at else None,
        }
        for ch, lb_name, domain in rows
    ]

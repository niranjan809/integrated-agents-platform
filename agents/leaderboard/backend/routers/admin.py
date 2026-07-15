from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from database import get_db
from models import Leaderboard, RankingEntry, ScanLog

router = APIRouter(prefix="/admin", tags=["admin"])


def verify_admin(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=403, detail="Not authenticated")


class PromptUpdate(BaseModel):
    prompt_text: str


class LeaderboardCreate(BaseModel):
    name: str
    publisher: str
    official_url: str
    type: str = "Leaderboard"
    domain: str
    primary_metrics: Optional[List[str]] = []
    availability: str = "Public"
    scope: Optional[str] = None
    notes: Optional[str] = None


class LeaderboardUpdate(BaseModel):
    name: Optional[str] = None
    publisher: Optional[str] = None
    official_url: Optional[str] = None
    type: Optional[str] = None
    domain: Optional[str] = None
    primary_metrics: Optional[List[str]] = None
    availability: Optional[str] = None
    scope: Optional[str] = None
    description: Optional[str] = None
    methodology: Optional[str] = None
    benchmark_datasets: Optional[List[str]] = None
    update_frequency: Optional[str] = None
    notes: Optional[str] = None


@router.get("/status")
def admin_status(db: Session = Depends(get_db), _=Depends(verify_admin)):
    from models import Leaderboard
    total = db.query(Leaderboard).count()
    pending = db.query(Leaderboard).filter(Leaderboard.status == "pending").count()
    errors = db.query(Leaderboard).filter(Leaderboard.last_scan_status == "error").count()
    # Derive active so that Active + Pending + Errors always equals Total.
    # Using SQL != with a nullable column silently drops NULL rows, so we
    # avoid that by computing active arithmetically instead.
    active = total - pending - errors
    return {
        "total_leaderboards": total,
        "active": active,
        "pending_normalization": pending,
        "last_scan_errors": errors,
    }


@router.post("/leaderboards")
def add_leaderboard(data: LeaderboardCreate, db: Session = Depends(get_db), _=Depends(verify_admin)):
    lb = Leaderboard(
        name=data.name,
        publisher=data.publisher,
        official_url=data.official_url,
        type=data.type,
        domain=data.domain,
        primary_metrics=data.primary_metrics,
        availability=data.availability,
        scope=data.scope,
        notes=data.notes,
        status="pending",
        source="custom",
    )
    db.add(lb)
    db.commit()
    db.refresh(lb)

    # Run normalizer immediately
    try:
        from agent.normalizer import normalize_leaderboard
        normalize_leaderboard(lb.id, db)
        db.refresh(lb)
    except Exception as e:
        print(f"Normalizer error for {lb.name}: {e}")

    # Run initial scrape
    try:
        from agent.scraper import scrape_leaderboard
        scrape_leaderboard(lb.id, db, triggered_by="admin")
    except Exception as e:
        print(f"Scraper error for {lb.name}: {e}")

    db.refresh(lb)
    return {"id": lb.id, "name": lb.name, "status": lb.status}


@router.put("/leaderboards/{lb_id}")
def update_leaderboard(
    lb_id: int,
    data: LeaderboardUpdate,
    db: Session = Depends(get_db),
    _=Depends(verify_admin),
):
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(lb, field, value)
    db.commit()
    db.refresh(lb)
    return {"id": lb.id, "name": lb.name, "status": "updated"}


@router.post("/leaderboards/{lb_id}/renormalize")
def renormalize_leaderboard(lb_id: int, db: Session = Depends(get_db), _=Depends(verify_admin)):
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    try:
        from agent.normalizer import normalize_leaderboard, classify_scope
        normalize_leaderboard(lb_id, db)
        db.refresh(lb)
        # classify_scope is a no-op if scope was already set by normalize_leaderboard
        if not lb.scope:
            classify_scope(lb_id, db)
            db.refresh(lb)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"id": lb_id, "scraper_note": lb.scraper_note, "scope": lb.scope}


@router.delete("/leaderboards/{lb_id}")
def delete_leaderboard(lb_id: int, db: Session = Depends(get_db), _=Depends(verify_admin)):
    from models import SeedExclusion
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    if lb.source == "seed" and lb.official_url:
        existing = db.query(SeedExclusion).filter(SeedExclusion.official_url == lb.official_url).first()
        if not existing:
            db.add(SeedExclusion(official_url=lb.official_url))
    db.delete(lb)
    db.commit()
    return {"deleted": lb_id}



@router.get("/prompts")
def list_prompts(db: Session = Depends(get_db), _=Depends(verify_admin)):
    from models import PromptConfig
    prompts = db.query(PromptConfig).order_by(PromptConfig.id).all()
    return [
        {"key": p.key, "label": p.label, "description": p.description,
         "prompt_text": p.prompt_text,
         "updated_at": p.updated_at.isoformat() if p.updated_at else None}
        for p in prompts
    ]

@router.put("/prompts/{key}")
def update_prompt(key: str, data: PromptUpdate, db: Session = Depends(get_db), _=Depends(verify_admin)):
    from models import PromptConfig
    from agent.prompt_store import invalidate
    from datetime import datetime, timezone
    p = db.query(PromptConfig).filter(PromptConfig.key == key).first()
    if not p:
        raise HTTPException(status_code=404, detail="Prompt not found")
    p.prompt_text = data.prompt_text
    p.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    invalidate(key)
    return {"key": key, "updated": True}

@router.post("/prompts/{key}/reset")
def reset_prompt(key: str, db: Session = Depends(get_db), _=Depends(verify_admin)):
    from models import PromptConfig
    from agent.prompt_store import DEFAULTS, invalidate
    from datetime import datetime, timezone
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail="Prompt not found")
    p = db.query(PromptConfig).filter(PromptConfig.key == key).first()
    if p:
        p.prompt_text = DEFAULTS[key]["prompt_text"]
        p.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        invalidate(key)
    return {"key": key, "reset": True}


@router.get("/leaderboards")
def list_all_leaderboards(db: Session = Depends(get_db), _=Depends(verify_admin)):
    lbs = db.query(Leaderboard).order_by(Leaderboard.name).all()
    return [
        {
            "id": lb.id,
            "name": lb.name,
            "publisher": lb.publisher,
            "domain": lb.domain,
            "type": lb.type,
            "official_url": lb.official_url,
            "primary_metrics": lb.primary_metrics or [],
            "availability": lb.availability,
            "scope": lb.scope,
            "notes": lb.notes,
            "description": lb.description,
            "methodology": lb.methodology,
            "benchmark_datasets": lb.benchmark_datasets or [],
            "update_frequency": lb.update_frequency,
            "status": lb.status,
            "source": lb.source if lb.source else "seed",
            "models_count": lb.models_count,
            "companies_count": lb.companies_count,
            "scraper_note": lb.scraper_note,
            "last_scanned_at": lb.last_scanned_at.isoformat() if lb.last_scanned_at else None,
            "last_scan_status": lb.last_scan_status,
        }
        for lb in lbs
    ]

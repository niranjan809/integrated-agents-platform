from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import Leaderboard, RankingEntry
from model_normalize import model_matches, canonical_tokens

router = APIRouter(prefix="/compare", tags=["compare"])


@router.get("/leaderboards")
def compare_leaderboards(ids: str = Query(...), db: Session = Depends(get_db)):
    id_list = [int(i) for i in ids.split(",") if i.strip().isdigit()]
    lbs = db.query(Leaderboard).filter(Leaderboard.id.in_(id_list)).all()

    result = []
    for lb in lbs:
        entries = (
            db.query(RankingEntry)
            .filter(RankingEntry.leaderboard_id == lb.id)
            .order_by(RankingEntry.rank.asc())
            .all()
        )
        companies = list({e.company_name for e in entries if e.company_name})
        models = [e.model_name for e in entries]
        result.append({
            "id": lb.id,
            "name": lb.name,
            "publisher": lb.publisher,
            "domain": lb.domain,
            "type": lb.type,
            "primary_metrics": lb.primary_metrics or [],
            "availability": lb.availability,
            "models_count": lb.models_count or len(models),
            "companies_count": lb.companies_count or len(companies),
            "last_scanned_at": lb.last_scanned_at.isoformat() if lb.last_scanned_at else None,
            "companies": companies,
            "top_models": models[:10],
        })

    # Find shared companies and models across all selected leaderboards
    if len(result) > 1:
        all_companies = [set(r["companies"]) for r in result]
        shared_companies = list(set.intersection(*all_companies)) if all_companies else []
        all_models = [set(r["top_models"]) for r in result]
        shared_models = list(set.intersection(*all_models)) if all_models else []
    else:
        shared_companies = []
        shared_models = []

    return {
        "leaderboards": result,
        "shared_companies": shared_companies,
        "shared_models": shared_models,
    }


@router.get("/companies")
def compare_companies(company: str = Query(...), db: Session = Depends(get_db)):
    term = f"%{company}%"
    entries = (
        db.query(RankingEntry)
        .filter(RankingEntry.company_name.ilike(term))
        .order_by(RankingEntry.leaderboard_id, RankingEntry.rank)
        .all()
    )

    grouped: dict = {}
    for e in entries:
        lb_id = e.leaderboard_id
        if lb_id not in grouped:
            lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
            grouped[lb_id] = {
                "leaderboard_id": lb_id,
                "leaderboard_name": lb.name if lb else str(lb_id),
                "domain": lb.domain if lb else None,
                "models": [],
            }
        grouped[lb_id]["models"].append({
            "model_name": e.model_name,
            "rank": e.rank,
            "scores": e.scores or {},
        })

    return {"company": company, "appearances": list(grouped.values())}


@router.get("/models")
def compare_models(model: str = Query(...), db: Session = Depends(get_db)):
    # Collect all distinct model names and filter with canonical normalization.
    # This handles word-order variation, company-prefix stripping, and
    # preserves version distinctions (gpt-4 ≠ gpt-4o).
    all_names = db.query(RankingEntry.model_name).distinct().all()
    matching_names = {r.model_name for r in all_names if model_matches(model, r.model_name)}

    if not matching_names:
        return {"model": model, "appearances": []}

    entries = (
        db.query(RankingEntry)
        .filter(RankingEntry.model_name.in_(matching_names))
        .order_by(RankingEntry.leaderboard_id, RankingEntry.rank)
        .all()
    )

    # Preload leaderboards to avoid N+1
    lb_ids = {e.leaderboard_id for e in entries}
    lbs = {lb.id: lb for lb in db.query(Leaderboard).filter(Leaderboard.id.in_(lb_ids)).all()}

    results = []
    for e in entries:
        lb = lbs.get(e.leaderboard_id)
        results.append({
            "leaderboard_id": e.leaderboard_id,
            "leaderboard_name": lb.name if lb else str(e.leaderboard_id),
            "domain": lb.domain if lb else None,
            "model_name": e.model_name,
            "company_name": e.company_name,
            "rank": e.rank,
            "scores": e.scores or {},
        })

    return {"model": model, "appearances": results}

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from database import get_db
from models import Leaderboard, Model, Company, RankingEntry
from model_normalize import model_matches, model_matches_suggest, canonical_tokens

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    term = f"%{q}%"

    leaderboards = (
        db.query(Leaderboard)
        .filter(
            or_(
                Leaderboard.name.ilike(term),
                Leaderboard.publisher.ilike(term),
                Leaderboard.description.ilike(term),
                Leaderboard.domain.ilike(term),
            )
        )
        .limit(20)
        .all()
    )

    models = (
        db.query(Model)
        .filter(Model.name.ilike(term))
        .limit(20)
        .all()
    )

    companies = (
        db.query(Company)
        .filter(Company.name.ilike(term))
        .limit(20)
        .all()
    )

    # Also search ranking entries by model/company name
    ranking_models = (
        db.query(RankingEntry.model_name, RankingEntry.leaderboard_id)
        .filter(RankingEntry.model_name.ilike(term))
        .distinct()
        .limit(20)
        .all()
    )

    ranking_companies = (
        db.query(RankingEntry.company_name, RankingEntry.leaderboard_id)
        .filter(RankingEntry.company_name.ilike(term))
        .distinct()
        .limit(20)
        .all()
    )

    model_names = list({r.model_name for r in ranking_models})
    company_names = list({r.company_name for r in ranking_companies if r.company_name})

    return {
        "query": q,
        "leaderboards": [
            {"id": lb.id, "name": lb.name, "publisher": lb.publisher, "domain": lb.domain}
            for lb in leaderboards
        ],
        "models": list({m.name for m in models} | set(model_names)),
        "companies": list({c.name for c in companies} | set(company_names)),
    }


@router.get("/suggestions")
def suggestions(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Fast lightweight suggestions for the search bar dropdown."""
    term = f"%{q}%"

    lbs = (
        db.query(Leaderboard.id, Leaderboard.name, Leaderboard.domain)
        .filter(Leaderboard.name.ilike(term))
        .limit(5)
        .all()
    )

    # Model suggestions: canonical matching so word-order variants and
    # company-prefix variants surface correctly, deduplicated by canonical key.
    all_model_rows = db.query(RankingEntry.model_name).distinct().all()
    seen_keys: set = set()
    matched_models: list = []
    for row in all_model_rows:
        name = row.model_name
        if not model_matches_suggest(q, name):
            continue
        key = canonical_tokens(name)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        matched_models.append(name)
        if len(matched_models) >= 12:
            break

    companies = (
        db.query(RankingEntry.company_name)
        .filter(RankingEntry.company_name.ilike(term), RankingEntry.company_name.isnot(None))
        .distinct()
        .limit(5)
        .all()
    )

    return {
        "leaderboards": [{"id": r.id, "name": r.name, "domain": r.domain} for r in lbs],
        "models": matched_models,
        "companies": [r.company_name for r in companies],
    }

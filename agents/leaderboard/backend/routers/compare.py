from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Leaderboard, RankingEntry
from model_normalize import model_matches

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
    # The clicked chip is one unique (canonical) model, so show exactly the
    # leaderboards that carry THAT model. Matching is by canonical identity, which
    # normalises formatting only — vendor prefix, hyphens/dashes/dots, emojis,
    # casing, word order — while keeping different versions/sizes/variants apart
    # (GPT-5 ≠ GPT-5.5 ≠ GPT-5 High). Ranking pages keep the exact scanned name.
    all_names = [r.model_name for r in db.query(RankingEntry.model_name).distinct().all() if r.model_name]

    matching_names = {nm for nm in all_names if model_matches(model, nm)}

    if not matching_names:
        return {"model": model, "appearances": []}

    entries = (
        db.query(RankingEntry)
        .filter(RankingEntry.model_name.in_(matching_names))
        .all()
    )

    # One row per leaderboard: a model should appear once per board. Some boards
    # carry stale duplicate rows (a scrape that didn't fully replace older entries),
    # which would otherwise show the same model 3–6× with conflicting ranks. Keep
    # the most recent scrape (recorded_at), tie-breaking to the better rank.
    from datetime import datetime
    _floor = datetime.min

    def _better(cand, cur):
        c_ts, u_ts = cand.recorded_at or _floor, cur.recorded_at or _floor
        if c_ts != u_ts:
            return c_ts > u_ts
        cr = cand.rank if cand.rank is not None else 10**9
        ur = cur.rank if cur.rank is not None else 10**9
        return cr < ur

    by_lb: dict = {}
    for e in entries:
        cur = by_lb.get(e.leaderboard_id)
        if cur is None or _better(e, cur):
            by_lb[e.leaderboard_id] = e

    # Preload leaderboards to avoid N+1
    lbs = {lb.id: lb for lb in db.query(Leaderboard).filter(Leaderboard.id.in_(by_lb.keys())).all()}

    results = []
    for e in by_lb.values():
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

    # Best rank first (Nones last), then leaderboard name.
    results.sort(key=lambda r: (r["rank"] if r["rank"] is not None else 10**9, r["leaderboard_name"]))
    return {"model": model, "appearances": results}

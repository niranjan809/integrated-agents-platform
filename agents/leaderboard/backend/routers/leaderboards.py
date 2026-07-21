from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db, SessionLocal
from models import Leaderboard, RankingEntry, ScanLog, Model, Company, Metric
from datetime import datetime, timezone, timedelta
import scan_state

router = APIRouter(prefix="/leaderboards", tags=["leaderboards"])


def _enrich_leaderboard(lb_id: int, last_body_text: str) -> None:
    """Run scraper_note + scope enrichment in a background task after a successful scrape."""
    db = SessionLocal()
    try:
        lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
        if not lb:
            return
        if not lb.scraper_note and last_body_text:
            try:
                from agent.scraper import _generate_scraper_note
                lb.scraper_note = _generate_scraper_note(lb.official_url or "", last_body_text)
                db.commit()
            except Exception as e:
                print(f"  [bg] scraper_note error for {lb.name}: {e}")
        if lb.scope is None:
            try:
                from agent.normalizer import classify_scope
                # Pass last_body_text so classify_scope has context without re-fetching
                classify_scope(lb_id, db, body_text=last_body_text)
            except Exception as e:
                print(f"  [bg] scope error for {lb.name}: {e}")
    finally:
        db.close()


def leaderboard_to_dict(lb: Leaderboard) -> dict:
    return {
        "id": lb.id,
        "name": lb.name,
        "publisher": lb.publisher,
        "description": lb.description,
        "official_url": lb.official_url,
        "type": lb.type,
        "domain": lb.domain,
        "primary_metrics": lb.primary_metrics or [],
        "benchmark_datasets": lb.benchmark_datasets or [],
        "methodology": lb.methodology,
        "update_frequency": lb.update_frequency,
        "last_updated": lb.last_updated,
        "availability": lb.availability,
        "scope": lb.scope,
        "companies_count": lb.companies_count,
        "models_count": lb.models_count,
        "metrics_count": lb.metrics_count,
        "notes": lb.notes,
        "status": lb.status,
        "source": lb.source if lb.source else "seed",
        "column_order": lb.column_order or [],
        "scraper_note": lb.scraper_note,
        "added_at": lb.added_at.isoformat() if lb.added_at else None,
        "last_scanned_at": lb.last_scanned_at.isoformat() if lb.last_scanned_at else None,
        "last_scan_status": lb.last_scan_status,
    }


@router.get("")
def list_leaderboards(
    domain: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("models_count"),
    order: Optional[str] = Query("desc"),
    db: Session = Depends(get_db),
):
    q = db.query(Leaderboard)
    if domain:
        q = q.filter(Leaderboard.domain == domain)
    if type:
        q = q.filter(Leaderboard.type == type)
    if availability:
        q = q.filter(Leaderboard.availability == availability)

    lbs = q.all()

    # Python-side sort — avoids SQL CASE compatibility issues with libSQL/Turso
    desc = (order == "desc")
    if sort_by in ("importance", "popularity_score", "models_count"):
        # Sort by actual scraped model count — larger leaderboards (more tracked models)
        # appear first. NULLs/zero last; ties broken by name.
        lbs.sort(key=lambda lb: (-(lb.models_count or 0), lb.name))
    else:
        attr = sort_by if hasattr(Leaderboard, sort_by) else "name"
        lbs.sort(key=lambda lb: str(getattr(lb, attr) or ""), reverse=desc)

    return [leaderboard_to_dict(lb) for lb in lbs]


@router.get("/{lb_id}")
def get_leaderboard(lb_id: int, db: Session = Depends(get_db)):
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    return leaderboard_to_dict(lb)


@router.get("/{lb_id}/rankings")
def get_rankings(lb_id: int, background_tasks: BackgroundTasks, force: bool = False, db: Session = Depends(get_db)):
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")

    # Check existing cached entries first
    entries = (
        db.query(RankingEntry)
        .filter(RankingEntry.leaderboard_id == lb_id)
        .order_by(RankingEntry.rank.asc())
        .all()
    )
    has_data = len(entries) > 0

    # Determine staleness (>14 days since last scan)
    is_stale = True
    if lb.last_scanned_at and not force:
        age = datetime.now(timezone.utc).replace(tzinfo=None) - lb.last_scanned_at
        is_stale = age >= timedelta(days=14)

    # Only block on a live scrape when there is no data yet, or forced
    if not has_data or force:
        from agent.scraper import scrape_leaderboard, get_last_body_text
        result = scrape_leaderboard(lb_id, db, triggered_by="click")
        if result.get("status") == "success":
            background_tasks.add_task(_enrich_leaderboard, lb_id, get_last_body_text())
        db.refresh(lb)
        entries = (
            db.query(RankingEntry)
            .filter(RankingEntry.leaderboard_id == lb_id)
            .order_by(RankingEntry.rank.asc())
            .all()
        )
        is_stale = False

    # Defensive read-time dedup: never return the same model on two rows, even if
    # duplicate RankingEntry rows accumulated in the DB (the scrape-time dedup and
    # delete-before-insert should prevent this, but Turso replica/delete timing can
    # leave stragglers). Keep the best-ranked occurrence of each model.
    entries = sorted(entries, key=lambda e: (e.rank if e.rank is not None else 10**9, e.id))
    _seen: set[str] = set()
    _unique = []
    for e in entries:
        k = (e.model_name or "").strip().lower()
        if not k or k in _seen:
            continue
        _seen.add(k)
        _unique.append(e)
    entries = _unique

    return {
        "leaderboard_id": lb_id,
        "cached": has_data and not force,
        "is_stale": is_stale,
        "last_scanned_at": lb.last_scanned_at.isoformat() if lb.last_scanned_at else None,
        "last_scan_status": lb.last_scan_status,
        "entries": [
            {
                "rank": e.rank,
                "model_name": e.model_name,
                "company_name": e.company_name,
                "scores": e.scores or {},
            }
            for e in entries
        ],
    }


def _run_rescan(lb_id: int, lb_name: str) -> None:
    """Background worker for POST /{lb_id}/rescan. Runs the (200+s) scrape off
    the request thread so the Railway proxy doesn't time out the HTTP response.

    Owns its own DB session: the request-scoped Depends(get_db) session is closed
    when the 202 response returns, before this task runs — same reason
    _enrich_leaderboard opens its own SessionLocal(). scan_state.start() is called
    synchronously in the endpoint (so the 409 guard reserves the slot before this
    task is scheduled); this worker only marks progress and always finish()es."""
    db = SessionLocal()
    try:
        from agent.scraper import scrape_leaderboard, get_last_body_text
        scan_state.update(name=lb_name, index=1)
        try:
            result = scrape_leaderboard(lb_id, db, triggered_by="rescan")
        finally:
            scan_state.finish()
        # Already in a background task — call enrichment inline (it opens its own
        # session) rather than scheduling another BackgroundTask.
        if result.get("status") == "success":
            _enrich_leaderboard(lb_id, get_last_body_text())
    finally:
        db.close()


@router.post("/{lb_id}/rescan", status_code=202)
def rescan_leaderboard(lb_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")

    # Conflict guard: scan_state is a shared in-memory lock — a scheduled bulk
    # scan (main.py) or another rescan may already be running. Concurrent scrapes
    # would clobber scan_state and race, so reject with the current scan info.
    current = scan_state.get()
    if current.get("active"):
        raise HTTPException(status_code=409, detail={
            "reason": "scan_in_progress",
            "scan": current,
        })

    # Reserve the slot synchronously (closes the check→schedule race) before
    # handing the long scrape off to the background task.
    scan_state.start(total=1, triggered_by="rescan")
    background_tasks.add_task(_run_rescan, lb_id, lb.name)
    return {"leaderboard_id": lb_id, "status": "rescan_scheduled"}


@router.get("/{lb_id}/scan-logs")
def get_scan_logs(lb_id: int, db: Session = Depends(get_db)):
    lb = db.query(Leaderboard).filter(Leaderboard.id == lb_id).first()
    if not lb:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    logs = (
        db.query(ScanLog)
        .filter(ScanLog.leaderboard_id == lb_id)
        .order_by(ScanLog.timestamp.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": l.id,
            "timestamp": l.timestamp.isoformat() if l.timestamp else None,
            "status": l.status,
            "records_updated": l.records_updated,
            "duration_ms": l.duration_ms,
            "http_status": l.http_status,
            "error_message": l.error_message,
            "triggered_by": l.triggered_by,
        }
        for l in logs
    ]

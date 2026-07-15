import os
import sys
import threading
import jwt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler
import scan_state

# Windows console defaults to CP1252 which can't encode Greek/CJK leaderboard names.
# Reconfigure stdout/stderr to UTF-8 so print() never crashes on non-Latin characters.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

from database import engine, SessionLocal
from models import Base
from seed_data import run_seed, seed_domain_categories, fix_domain_corruption, fix_category_configs, seed_prompts
from routers import leaderboards, search, compare, admin, domain_categories, auth as auth_router

app = FastAPI(title="Voice AI Leaderboard Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_JWT_SECRET = os.getenv("JWT_SECRET", "change-me-please")
_JWT_ALGORITHM = "HS256"
# Paths that bypass auth entirely
_PUBLIC_PATHS = {"/", "/health", "/docs", "/openapi.json", "/redoc", "/scan-status"}
_PUBLIC_PREFIXES = ("/auth/",)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Let CORS preflight pass through so the CORS middleware can respond correctly
    if request.method == "OPTIONS":
        return await call_next(request)
    path = request.url.path
    if path in _PUBLIC_PATHS or any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return await call_next(request)
    # Public read access for the embedded platform dashboard — browsing needs no
    # login. Writes (POST/PUT/DELETE) and everything under /admin stay protected,
    # so the platform's single sign-in is the only login users ever see.
    if request.method in ("GET", "HEAD") and not path.startswith("/admin"):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    token = auth[7:]
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
        request.state.user = payload
    except jwt.ExpiredSignatureError:
        return JSONResponse(status_code=401, content={"detail": "Token expired"})
    except jwt.InvalidTokenError:
        return JSONResponse(status_code=401, content={"detail": "Invalid token"})
    return await call_next(request)


app.include_router(auth_router.router)
app.include_router(leaderboards.router)
app.include_router(search.router)
app.include_router(compare.router)
app.include_router(admin.router)
app.include_router(domain_categories.router)


def _create_missing_tables():
    from sqlalchemy import inspect
    insp = inspect(engine)
    existing = insp.get_table_names()
    if "seed_exclusions" not in existing:
        from models import SeedExclusion
        SeedExclusion.__table__.create(bind=engine)
        print("Migration: created 'seed_exclusions' table.")


def _auto_migrate():
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    try:
        existing_cols = {c["name"] for c in insp.get_columns("leaderboards")}
    except Exception:
        return
    with engine.begin() as conn:
        if "source" not in existing_cols:
            conn.execute(text("ALTER TABLE leaderboards ADD COLUMN source VARCHAR NOT NULL DEFAULT 'seed'"))
            print("Migration: added 'source' column to leaderboards.")
        if "column_order" not in existing_cols:
            conn.execute(text("ALTER TABLE leaderboards ADD COLUMN column_order JSON"))
            print("Migration: added 'column_order' column to leaderboards.")
        if "scraper_note" not in existing_cols:
            conn.execute(text("ALTER TABLE leaderboards ADD COLUMN scraper_note TEXT"))
            print("Migration: added 'scraper_note' column to leaderboards.")
        if "scope" not in existing_cols:
            conn.execute(text("ALTER TABLE leaderboards ADD COLUMN scope VARCHAR"))
            print("Migration: added 'scope' column to leaderboards.")


def _enrich_in_background():
    from models import Leaderboard
    from agent.normalizer import normalize_leaderboard

    db = SessionLocal()
    try:
        pending = db.query(Leaderboard).filter(Leaderboard.status == "pending").all()
        no_about = db.query(Leaderboard).filter(
            Leaderboard.status == "active",
            Leaderboard.description.is_(None),
        ).all()
        to_normalize = pending + no_about
        if to_normalize:
            print(f"[bg] Normalizing {len(to_normalize)} leaderboard(s)...")
            for lb in to_normalize:
                try:
                    normalize_leaderboard(lb.id, db)
                except Exception as e:
                    print(f"  [bg] Normalize error for {lb.name}: {e}")
                    lb.status = "active"
                    db.commit()
    finally:
        db.close()


@app.on_event("startup")
def on_startup():
    """Push all slow Turso I/O to a background thread — login and health respond instantly."""
    def _background_startup():
        # Schema setup (idempotent — tables already exist in production)
        try:
            Base.metadata.create_all(bind=engine)
            _create_missing_tables()
            _auto_migrate()
        except Exception as e:
            print(f"[startup] Schema setup error: {e}")

        # Seed reference data
        db = SessionLocal()
        try:
            run_seed(db)
            fix_domain_corruption(db)
            seed_domain_categories(db)
            fix_category_configs(db)
            seed_prompts(db)
        except Exception as e:
            print(f"[startup] Seed error: {e}")
        finally:
            db.close()

        # Normalize any pending leaderboards (calls Gemini — slow)
        _enrich_in_background()

        # Start 14-day rescan scheduler; next_run_time=now catches stale data immediately
        from datetime import datetime as _dt
        if not _scheduler.running:
            _scheduler.add_job(
                _rescan_stale_leaderboards,
                "interval",
                days=14,
                id="rescan_all",
                next_run_time=_dt.now(),
            )
            _scheduler.start()
            print("[scheduler] Started — will rescan stale leaderboards now and every 14 days.")

    threading.Thread(target=_background_startup, daemon=True).start()


def _rescan_stale_leaderboards():
    """Rescan leaderboards not scanned in the last 14 days, then enrich scope."""
    from datetime import datetime, timezone, timedelta
    from models import Leaderboard
    from agent.scraper import scrape_leaderboard, get_last_body_text
    from agent.normalizer import classify_scope
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=14)
    db = SessionLocal()
    try:
        stale = db.query(Leaderboard).filter(
            Leaderboard.status == "active",
            (Leaderboard.last_scanned_at == None) | (Leaderboard.last_scanned_at < cutoff),
        ).all()
        if not stale:
            print("[scheduler] All leaderboards are up to date.")
            return
        print(f"[scheduler] Rescanning {len(stale)} stale leaderboard(s)...")
        scan_state.start(total=len(stale), triggered_by="scheduler")
        for i, lb in enumerate(stale, 1):
            try:
                scan_state.update(name=lb.name, index=i)
                print(f"[scheduler] Rescanning ({i}/{len(stale)}): {lb.name}")
                result = scrape_leaderboard(lb.id, db, triggered_by="scheduler")
                if result.get("status") == "success":
                    db.refresh(lb)
                    if lb.scope is None:
                        try:
                            # Pass already-scraped body_text so classify_scope
                            # doesn't have to re-fetch the (often JS-heavy) URL
                            classify_scope(lb.id, db, body_text=get_last_body_text())
                        except Exception as e:
                            print(f"[scheduler] Scope error for {lb.name}: {e}")
            except Exception as e:
                print(f"[scheduler] Error rescanning {lb.name}: {e}")
        print("[scheduler] Rescan complete.")
    finally:
        scan_state.finish()
        db.close()


_scheduler = BackgroundScheduler(daemon=True)


@app.get("/scan-status")
def scan_status():
    return scan_state.get()


@app.get("/")
def root():
    return {"message": "Voice AI Leaderboard Agent API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}

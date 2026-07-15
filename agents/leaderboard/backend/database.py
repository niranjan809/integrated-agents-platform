from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os

TURSO_URL = os.getenv("TURSO_URL", "").strip()
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()

if TURSO_URL and TURSO_AUTH_TOKEN:
    # Production / shared DB — libSQL over the custom HTTP adapter.
    import turso_dbapi

    def _creator():
        return turso_dbapi.connect(database=TURSO_URL, auth_token=TURSO_AUTH_TOKEN)

    engine = create_engine("sqlite+pysqlite:///:memory:", creator=_creator)
    print(f"Database: Turso ({TURSO_URL})")
else:
    # Local / no-Turso fallback — a plain SQLite file so the agent runs for
    # browsing (seed data) with no external credentials. check_same_thread=False
    # because startup seeding and the rescan scheduler use background threads.
    _db_path = os.getenv("SQLITE_PATH", "leaderboard.db")
    engine = create_engine(
        f"sqlite+pysqlite:///{_db_path}",
        connect_args={"check_same_thread": False},
    )
    print(f"Database: local SQLite ({_db_path})")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

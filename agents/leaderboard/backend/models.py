from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Leaderboard(Base):
    __tablename__ = "leaderboards"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    publisher = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    official_url = Column(String, nullable=False)
    type = Column(String, nullable=False, default="Leaderboard")  # Leaderboard | Arena
    domain = Column(String, nullable=False)  # STT | TTS | Voice Assistants | Realtime Voice Agents | General
    primary_metrics = Column(JSON, nullable=True)  # ["WER", "RTFx"]
    benchmark_datasets = Column(JSON, nullable=True)
    methodology = Column(Text, nullable=True)
    update_frequency = Column(String, nullable=True)
    last_updated = Column(String, nullable=True)
    availability = Column(String, nullable=False, default="Public")
    scope = Column(String, nullable=True)  # Global | Regional
    companies_count = Column(Integer, nullable=True)
    models_count = Column(Integer, nullable=True)
    metrics_count = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")  # pending | active
    source = Column(String, nullable=False, default="seed", server_default="seed")  # seed | custom
    column_order = Column(JSON, nullable=True)  # original scraped column headers in order
    scraper_note = Column(Text, nullable=True)  # auto-generated note about data coverage
    added_at = Column(DateTime, default=utcnow)
    last_scanned_at = Column(DateTime, nullable=True)
    last_scan_status = Column(String, nullable=True)  # success | partial | error

    ranking_entries = relationship("RankingEntry", back_populates="leaderboard", cascade="all, delete-orphan")
    scan_logs = relationship("ScanLog", back_populates="leaderboard", cascade="all, delete-orphan")
    ranking_changes = relationship("RankingChange", back_populates="leaderboard", cascade="all, delete-orphan")
    models_rel = relationship("Model", back_populates="leaderboard", cascade="all, delete-orphan")
    metrics_rel = relationship("Metric", back_populates="leaderboard", cascade="all, delete-orphan")


class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    website = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    models_rel = relationship("Model", back_populates="company")


class Model(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    name = Column(String, nullable=False, index=True)
    model_type = Column(String, nullable=True)

    leaderboard = relationship("Leaderboard", back_populates="models_rel")
    company = relationship("Company", back_populates="models_rel")
    ranking_entries = relationship("RankingEntry", back_populates="model")


class Metric(Base):
    __tablename__ = "metrics"

    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    unit = Column(String, nullable=True)
    higher_is_better = Column(Integer, nullable=True)  # 1 = higher better, 0 = lower better

    leaderboard = relationship("Leaderboard", back_populates="metrics_rel")


class RankingEntry(Base):
    __tablename__ = "ranking_entries"

    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"), nullable=False)
    model_id = Column(Integer, ForeignKey("models.id"), nullable=True)
    rank = Column(Integer, nullable=True)
    model_name = Column(String, nullable=False)
    company_name = Column(String, nullable=True)
    scores = Column(JSON, nullable=True)  # {"WER": 2.1, "RTFx": 189.2}
    recorded_at = Column(DateTime, default=utcnow)

    leaderboard = relationship("Leaderboard", back_populates="ranking_entries")
    model = relationship("Model", back_populates="ranking_entries")


class ScanLog(Base):
    __tablename__ = "scan_logs"

    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"), nullable=False)
    timestamp = Column(DateTime, default=utcnow)
    status = Column(String, nullable=False)  # success | partial | error
    records_updated = Column(Integer, default=0)
    duration_ms = Column(Integer, nullable=True)
    http_status = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    triggered_by = Column(String, default="click")  # click | rescan | admin

    leaderboard = relationship("Leaderboard", back_populates="scan_logs")


class RankingChange(Base):
    """One row per model whose position changed between two consecutive scans of a
    leaderboard. Populated at scan time by diffing the previous rankings against the
    freshly scraped ones — the first (baseline) scan records nothing. Never deleted,
    so it accumulates a change history over time for the Analytics tab."""
    __tablename__ = "ranking_changes"

    id = Column(Integer, primary_key=True, index=True)
    leaderboard_id = Column(Integer, ForeignKey("leaderboards.id"), nullable=False, index=True)
    change_type = Column(String, nullable=False)  # new | dropped | up | down
    model_name = Column(String, nullable=False)
    old_rank = Column(Integer, nullable=True)     # None for new entrants
    new_rank = Column(Integer, nullable=True)     # None for dropped models
    triggered_by = Column(String, nullable=True)  # click | rescan | scheduler | admin
    prev_scanned_at = Column(DateTime, nullable=True)  # time of the scan this was compared against ("from")
    recorded_at = Column(DateTime, default=utcnow, index=True)  # time of the scan that produced this change ("to")

    leaderboard = relationship("Leaderboard", back_populates="ranking_changes")


class DomainCategory(Base):
    __tablename__ = "domain_categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    icon = Column(String, nullable=False, default="📊")
    description = Column(String, nullable=True)
    # if non-empty: whitelist — only these leaderboard.domain values belong here
    # if empty: catch-all — include everything not in exclude_domains
    include_domains = Column(JSON, nullable=True, default=list)
    exclude_domains = Column(JSON, nullable=True, default=list)
    display_order = Column(Integer, default=99)
    is_builtin = Column(Integer, default=0)  # 1 = cannot be deleted
    accent_color = Column(String, nullable=True, default="indigo")  # purple|indigo|emerald|amber|rose|cyan
    created_at = Column(DateTime, default=utcnow)


class SeedExclusion(Base):
    """Tracks official_urls of seed leaderboards that were explicitly deleted by admin."""
    __tablename__ = "seed_exclusions"
    id = Column(Integer, primary_key=True, index=True)
    official_url = Column(String, unique=True, nullable=False, index=True)
    deleted_at = Column(DateTime, default=utcnow)


class PromptConfig(Base):
    __tablename__ = "prompt_configs"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False, index=True)
    label = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    prompt_text = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=utcnow)

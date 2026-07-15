from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from database import get_db
from models import DomainCategory, Leaderboard

router = APIRouter(tags=["domain-categories"])


def verify_admin(request: Request):
    user = getattr(request.state, "user", None)
    if not user:
        raise HTTPException(status_code=403, detail="Not authenticated")


def _build_category_dict(cat: DomainCategory, domain_counts: dict[str, int]) -> dict:
    """Build a category dict using pre-fetched domain counts — no extra DB query."""
    if cat.include_domains:
        count = sum(domain_counts.get(d, 0) for d in cat.include_domains)
    elif cat.exclude_domains:
        count = sum(v for d, v in domain_counts.items() if d not in cat.exclude_domains)
    else:
        count = sum(domain_counts.values())
    return {
        "id": cat.id,
        "slug": cat.slug,
        "name": cat.name,
        "icon": cat.icon or "📊",
        "description": cat.description,
        "include_domains": cat.include_domains or [],
        "exclude_domains": cat.exclude_domains or [],
        "display_order": cat.display_order,
        "is_builtin": bool(cat.is_builtin),
        "accent_color": cat.accent_color or "indigo",
        "leaderboard_count": count,
    }


def _domain_counts(db: Session) -> dict[str, int]:
    """One query: count of all leaderboards per domain (any status)."""
    from sqlalchemy import func
    rows = (
        db.query(Leaderboard.domain, func.count(Leaderboard.id))
        .group_by(Leaderboard.domain)
        .all()
    )
    return {domain: cnt for domain, cnt in rows if domain}


@router.get("/domain-categories")
def list_categories(db: Session = Depends(get_db)):
    cats = db.query(DomainCategory).order_by(DomainCategory.display_order).all()
    counts = _domain_counts(db)
    return [_build_category_dict(c, counts) for c in cats]


@router.get("/domain-categories/{slug}")
def get_category(slug: str, db: Session = Depends(get_db)):
    cat = db.query(DomainCategory).filter(DomainCategory.slug == slug).first()
    if not cat:
        raise HTTPException(404, "Domain category not found")
    counts = _domain_counts(db)
    return _build_category_dict(cat, counts)


@router.post("/admin/domain-categories")
def add_category(data: dict, db: Session = Depends(get_db), _=Depends(verify_admin)):
    slug = data.get("slug", "").strip().lower().replace(" ", "-")
    if not slug:
        raise HTTPException(400, "Slug is required")
    if db.query(DomainCategory).filter(DomainCategory.slug == slug).first():
        raise HTTPException(400, f"Slug '{slug}' already exists")
    max_order = db.query(DomainCategory).count()
    cat = DomainCategory(
        slug=slug,
        name=data.get("name", slug),
        icon=data.get("icon", "📊"),
        description=data.get("description"),
        include_domains=data.get("include_domains", []),
        exclude_domains=data.get("exclude_domains", []),
        display_order=data.get("display_order", max_order),
        accent_color=data.get("accent_color", "indigo"),
        is_builtin=0,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return _build_category_dict(cat, _domain_counts(db))


@router.put("/admin/domain-categories/{cat_id}")
def update_category(cat_id: int, data: dict, db: Session = Depends(get_db), _=Depends(verify_admin)):
    cat = db.query(DomainCategory).filter(DomainCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Not found")
    for field in ["name", "icon", "description", "include_domains", "exclude_domains", "display_order", "accent_color"]:
        if field in data:
            setattr(cat, field, data[field])
    db.commit()
    return _build_category_dict(cat, _domain_counts(db))


@router.delete("/admin/domain-categories/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db), _=Depends(verify_admin)):
    cat = db.query(DomainCategory).filter(DomainCategory.id == cat_id).first()
    if not cat:
        raise HTTPException(404, "Not found")
    db.delete(cat)
    db.commit()
    return {"deleted": cat_id}

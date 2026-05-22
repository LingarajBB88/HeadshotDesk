"""
Job business logic. All operations are scoped to a single account, enforced here
rather than at the route layer so it's impossible to accidentally leak data
across accounts.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.slugs import generate_named_slug
from app.models import Account, Job, User

# Maximum attempts to find an unused slug before giving up.
# Collisions are astronomically unlikely with our alphabet/length but we still
# bound the loop so a runaway can't hang the request.
_MAX_SLUG_ATTEMPTS = 8


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _unique_slug(db: Session, *, name: str) -> str:
    """Generate a slug derived from the job name that's not already in use."""
    for _ in range(_MAX_SLUG_ATTEMPTS):
        candidate = generate_named_slug(name)
        existing = db.scalar(select(Job.id).where(Job.public_slug == candidate))
        if existing is None:
            return candidate
    # Falls through only if we somehow had 8 collisions in a row.
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not generate a unique slug, please retry.",
    )


def create_job(
    db: Session,
    *,
    account: Account,
    creator: User,
    name: str,
    client_name: str | None = None,
    client_email: str | None = None,
    shoot_date=None,
    location: str | None = None,
    download_cap: int | None = None,
) -> Job:
    job = Job(
        id=new_id("job"),
        account_id=account.id,
        public_slug=_unique_slug(db, name=name),
        name=name,
        client_name=client_name,
        client_email=client_email,
        shoot_date=shoot_date,
        location=location,
        status="draft",
        created_by=creator.id,
        # download_cap omitted falls back to the model default (1).
        **({"download_cap": download_cap} if download_cap is not None else {}),
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        # Almost certainly a slug collision — extremely rare, retryable.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not create job, please retry.",
        ) from e
    db.refresh(job)
    return job


def list_jobs(
    db: Session,
    *,
    account: Account,
    include_archived: bool = False,
) -> tuple[list[Job], int]:
    stmt = select(Job).where(Job.account_id == account.id)
    count_stmt = select(func.count()).select_from(Job).where(Job.account_id == account.id)
    if not include_archived:
        stmt = stmt.where(Job.archived_at.is_(None))
        count_stmt = count_stmt.where(Job.archived_at.is_(None))
    stmt = stmt.order_by(Job.created_at.desc())

    items = list(db.scalars(stmt).all())
    total = db.scalar(count_stmt) or 0
    return items, total


def get_job(db: Session, *, account: Account, job_id: str) -> Job:
    job = db.get(Job, job_id)
    if job is None or job.account_id != account.id:
        # Same response for "wrong account" and "not found" — don't leak existence.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


def update_job(
    db: Session,
    *,
    account: Account,
    job_id: str,
    fields: dict,
) -> Job:
    job = get_job(db, account=account, job_id=job_id)

    # Only assign keys that were provided (sparse update). Pydantic's
    # model_dump(exclude_unset=True) at the route layer ensures this.
    for key, value in fields.items():
        if hasattr(job, key):
            setattr(job, key, value)

    db.commit()
    db.refresh(job)
    return job


def archive_job(db: Session, *, account: Account, job_id: str) -> Job:
    job = get_job(db, account=account, job_id=job_id)
    if job.archived_at is None:
        job.archived_at = _utcnow()
        job.status = "archived"
        db.commit()
        db.refresh(job)
    return job


# ============================================================================
# Status auto-advancement
# ============================================================================

# Forward-only ordering. Anything past `delivered` is terminal; archived is its
# own axis (set by archive_job).
_STATUS_ORDER = {
    "draft": 0,
    "open_for_signup": 1,
    "in_progress": 2,
    "delivered": 3,
}


def maybe_advance_status(job: Job, target: str) -> bool:
    """
    Advance a Job's status forward to `target` if it's not already there or
    further. No-op for archived jobs (manual flow only). Caller is responsible
    for committing — this just mutates the object.

    Returns True if the status changed.
    """
    if job.status == "archived":
        return False
    current_rank = _STATUS_ORDER.get(job.status, -1)
    target_rank = _STATUS_ORDER.get(target, -1)
    if target_rank > current_rank:
        job.status = target
        return True
    return False

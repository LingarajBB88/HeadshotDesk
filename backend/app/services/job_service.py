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

from app.config import settings
from app.core.ids import new_id
from app.core.slugs import generate_named_slug
from app.models import Account, File, Job, Participant, User
from app.services import email_service

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
    shoot_mode: str | None = None,
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
        # Omitted optionals fall back to model defaults (cap 1, mode queue).
        **({"download_cap": download_cap} if download_cap is not None else {}),
        **({"shoot_mode": shoot_mode} if shoot_mode is not None else {}),
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

    # HSD-55: shoot-mode rules. Mode is locked once the shoot has started
    # (someone marked shot) — switching mid-day would orphan the running
    # flow. Switching away from time_slot clears existing bookings; the
    # frontend confirms with the photographer before sending that.
    new_mode = fields.get("shoot_mode")
    if new_mode and new_mode != job.shoot_mode:
        if job.status in ("in_progress", "delivered"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Shoot mode is locked once shooting has started.",
            )
        if job.shoot_mode == "time_slot" and new_mode == "queue":
            from app.services import slot_service

            slot_service.clear_bookings(db, job=job)

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


# ============================================================================
# F5c — Gallery delivery
# ============================================================================

def deliver_galleries(
    db: Session,
    *,
    account: Account,
    job_id: str,
    include_already_delivered: bool = False,
) -> dict:
    """
    Bulk-send the gallery delivery email to every eligible participant on a
    job. Idempotent by default: participants who already have
    `gallery_sent_at` are skipped, so re-clicking the button is safe.

    With `include_already_delivered=True` the skip is bypassed and every
    participant with photos + email gets (re)sent — the "resend to all"
    path from the Deliver modal's checkbox. Still refuses no-photo and
    no-email participants.

    Eligibility:
      • Must have at least one assigned photo (don't deliver empty galleries).
      • Must have an email address on file.
      • `gallery_sent_at` must be null.

    Side effects:
      • `gallery_sent_at` set on each delivered participant.
      • Job status advances to `delivered` when, after this batch, every
        photographed participant who has photos has been emailed at least once.
        A job that still has un-photographed participants left can also reach
        `delivered` once all *deliverable* participants are sent — the queue
        is just considered "wrapped up for the photos we have."

    Returns a result dict for the API:
      {
        "sent": int,         # how many emails were dispatched this call
        "skipped_already_delivered": int,
        "skipped_no_photos": int,
        "skipped_no_email": int,
        "errors": list[str],  # per-participant failures (rare)
      }
    """
    job = get_job(db, account=account, job_id=job_id)
    creator = db.get(User, job.created_by) if job.created_by else None
    photographer_name = (
        creator.name if creator and creator.name else account.name or "HeadshotDesk"
    )

    # Pull all participants on this job in one query plus their photo counts so
    # we can decide eligibility without an N+1.
    participants = list(
        db.scalars(
            select(Participant)
            .where(Participant.job_id == job_id)
            .order_by(Participant.created_at.asc())
        ).all()
    )
    photo_counts: dict[str, int] = {}
    if participants:
        rows = db.execute(
            select(File.participant_id, func.count())
            .where(
                File.job_id == job_id,
                File.deleted_at.is_(None),
                File.variant == "original",
                File.participant_id.is_not(None),
            )
            .group_by(File.participant_id)
        ).all()
        photo_counts = {pid: int(c) for pid, c in rows}

    sent = 0
    skipped_already_delivered = 0
    skipped_no_photos = 0
    skipped_no_email = 0
    errors: list[str] = []

    for p in participants:
        if p.gallery_sent_at is not None and not include_already_delivered:
            skipped_already_delivered += 1
            continue
        if photo_counts.get(p.id, 0) == 0:
            skipped_no_photos += 1
            continue
        if not p.email:
            skipped_no_email += 1
            continue

        gallery_url = f"{settings.frontend_url}/g/{p.gallery_token}"
        try:
            email_service.send_gallery_delivery_email(
                to_email=p.email,
                participant_name=p.name,
                photographer_name=photographer_name,
                job_name=job.name,
                gallery_url=gallery_url,
            )
        except Exception as exc:  # noqa: BLE001 — log + report, don't abort batch
            errors.append(f"{p.name}: {exc}")
            continue

        p.gallery_sent_at = _utcnow()
        sent += 1

    # Promote the job to `delivered` as soon as anything's been delivered AND
    # no eligible participant is left unsent. "Eligible" = has-photos + has-email.
    eligible_unsent_remaining = any(
        p.gallery_sent_at is None
        and photo_counts.get(p.id, 0) > 0
        and p.email
        for p in participants
    )
    if sent > 0 and not eligible_unsent_remaining:
        maybe_advance_status(job, "delivered")

    db.commit()
    return {
        "sent": sent,
        "skipped_already_delivered": skipped_already_delivered,
        "skipped_no_photos": skipped_no_photos,
        "skipped_no_email": skipped_no_email,
        "errors": errors,
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

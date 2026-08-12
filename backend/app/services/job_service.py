"""
Job business logic. All operations are scoped to a single account, enforced here
rather than at the route layer so it's impossible to accidentally leak data
across accounts.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.ids import new_id
from app.core.slugs import generate_named_slug
from app.models import Account, File, Job, Participant, User
from app.services import email_service

logger = logging.getLogger(__name__)

# Maximum attempts to find an unused slug before giving up.
# Collisions are astronomically unlikely with our alphabet/length but we still
# bound the loop so a runaway can't hang the request.
_MAX_SLUG_ATTEMPTS = 8


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso_date(value) -> date | None:  # type: ignore[no-untyped-def]
    """Tolerant ISO date parse for the JSONB extra-days list."""
    try:
        return date.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


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
    client_id: str | None = None,
    extra_shoot_dates: list | None = None,
) -> Job:
    # HSD-36: linking a Client validates ownership and mirrors the client's
    # name into the legacy display field.
    if client_id is not None:
        from app.services import client_service

        client = client_service.get_client(
            db, account=account, client_id=client_id
        )
        client_name = client.name

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
        client_id=client_id,
        # Stored as ISO strings in JSONB; dedupe and drop the primary day.
        extra_shoot_dates=(
            sorted(
                {
                    d.isoformat() if isinstance(d, date) else str(d)
                    for d in extra_shoot_dates
                }
                - {shoot_date.isoformat() if shoot_date else ""}
            )
            or None
        )
        if extra_shoot_dates
        else None,
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
    clear_bookings_requested = bool(fields.pop("clear_slot_bookings", False))
    # (participant_id, slot_start) for bookings dropped by this update, so
    # they can be told once the transaction is safely committed.
    cancelled_bookings: list[tuple[str, datetime]] = []

    # HSD-36: re-linking to a client validates ownership and syncs the
    # display name. Explicit None unlinks (client_name stays as-is).
    if "client_id" in fields and fields["client_id"] is not None:
        from app.services import client_service

        client = client_service.get_client(
            db, account=account, client_id=fields["client_id"]
        )
        fields.setdefault("client_name", client.name)
        fields["client_name"] = client.name
    new_mode = fields.get("shoot_mode")
    if new_mode and new_mode != job.shoot_mode:
        if job.status in ("in_progress", "delivered"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Shoot mode is locked once shooting has started.",
            )
        if job.shoot_mode == "time_slot" and new_mode == "queue":
            from app.models import SlotBooking as _SlotBooking
            from app.services import slot_service

            # Switching to a walk-up queue destroys every appointment, so
            # everyone holding one needs to hear about it.
            cancelled_bookings.extend(
                (b.participant_id, b.slot_start)
                for b in db.scalars(
                    select(_SlotBooking).where(_SlotBooking.job_id == job.id)
                ).all()
            )
            slot_service.clear_bookings(db, job=job)

    # HSD-55: changing the slot config (or the shoot date) can strand
    # participants on times that no longer exist. Only bookings that fall
    # off the NEW grid are at risk — extending the day or adding slots
    # keeps everything. Refuse (409) when bookings would be cancelled,
    # unless the caller confirmed; then cancel only the affected ones.
    if (
        "time_slot_config" in fields
        or "shoot_date" in fields
        or "extra_shoot_dates" in fields
    ):
        from app.models import SlotBooking
        from app.services import slot_service
        from sqlalchemy import select as sa_select

        new_config = fields.get("time_slot_config", job.time_slot_config)
        new_date = fields.get("shoot_date", job.shoot_date)
        # HSD-71: dropping a day must cancel that day's bookings, so the
        # comparison grid spans every day the job will run on.
        raw_extra = fields.get("extra_shoot_dates", job.extra_shoot_dates)
        new_days: list = [new_date] if new_date else []
        for raw in raw_extra or []:
            parsed = raw if isinstance(raw, date) else _parse_iso_date(raw)
            if parsed and parsed not in new_days:
                new_days.append(parsed)

        # Hygiene: removals (blocked times) belong to the grid they were
        # made on. Prune any that don't land on the new grid, so a cadence
        # change doesn't leave a graveyard of stale entries that silently
        # eat future slots.
        if new_config and new_config.get("blocked"):
            candidate_starts: set[str] = set()
            for day in new_days:
                for s, _ in slot_service.slot_times_for(
                    {**new_config, "blocked": []}, day
                ):
                    candidate_starts.add(s.strftime("%H:%M"))
                    candidate_starts.add(
                        f"{day.isoformat()}@{s.strftime('%H:%M')}"
                    )
            new_config = {
                **new_config,
                "blocked": [
                    b for b in new_config["blocked"] if b in candidate_starts
                ],
            }
            if "time_slot_config" in fields:
                fields["time_slot_config"] = new_config

        new_grid = {
            (s, e)
            for day in new_days
            for s, e in slot_service.slot_times_for(new_config, day)
        }
        bookings = list(
            db.scalars(
                sa_select(SlotBooking).where(SlotBooking.job_id == job.id)
            ).all()
        )
        affected = [
            b for b in bookings if (b.slot_start, b.slot_end) not in new_grid
        ]
        if affected:
            if not clear_bookings_requested:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"{len(affected)} booked slot(s) don't fit the new "
                        "schedule and would be cancelled."
                    ),
                )
            # Capture who loses what before the rows go: these people have
            # a confirmation email saying they're on at a time that's about
            # to stop existing, and nothing else would tell them otherwise.
            cancelled_bookings.extend(
                (b.participant_id, b.slot_start) for b in affected
            )
            for b in affected:
                db.delete(b)

    # HSD-71: extra days arrive as date objects; store ISO strings in JSONB
    # and never duplicate the primary day.
    if "extra_shoot_dates" in fields:
        raw = fields["extra_shoot_dates"]
        primary = fields.get("shoot_date", job.shoot_date)
        cleaned = sorted(
            {
                d.isoformat() if isinstance(d, date) else str(d)
                for d in (raw or [])
            }
            - {primary.isoformat() if primary else ""}
        )
        fields["extra_shoot_dates"] = cleaned or None

    # Only assign keys that were provided (sparse update). Pydantic's
    # model_dump(exclude_unset=True) at the route layer ensures this.
    for key, value in fields.items():
        if hasattr(job, key):
            setattr(job, key, value)

    # Starring and downloading are the same allowance seen from two sides:
    # you star the ones you want, you download the ones you starred. They
    # were stored as two numbers kept in step only by the frontend at the
    # moment picks were switched on, so changing the download cap afterwards
    # left the gallery saying "download up to 4" and "star up to 3" on the
    # same screen. The server owns the invariant now.
    if "download_cap" in fields and "pick_cap" not in fields:
        job.pick_cap = job.download_cap

    db.commit()
    db.refresh(job)

    # After the commit, so nobody is told their slot is gone while the
    # transaction could still roll back. Imported here rather than at module
    # level to keep the service import graph acyclic.
    from app.services import notify_service

    for participant_id, slot_start in cancelled_bookings:
        participant = db.get(Participant, participant_id)
        if participant is None:
            continue
        notify_service.slot_cancelled(
            db, job=job, participant=participant, slot_start=slot_start
        )

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

    # HSD-36: client branding for the email header, resolved once per batch.
    client_logo_url = None
    if job.client_id:
        from app.models import Client
        from app.services import client_service

        client = db.get(Client, job.client_id)
        client_logo_url = client_service.logo_url(client) if client else None

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
                # This job's rules, not generic copy: how many photos are
                # there, how many they may keep, whether they're being asked
                # to star favourites.
                photo_count=photo_counts.get(p.id, 0),
                download_cap=job.download_cap,
                picks_enabled=bool(job.picks_enabled),
                client_logo_url=client_logo_url,
                client_name=job.client_name,
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

    # Tell the client the job is done, once, when the last gallery goes out.
    # Firing on every partial batch would mean three "delivered!" emails for
    # one shoot. Only when there's a client email on file.
    if sent > 0 and not eligible_unsent_remaining and job.client_email:
        try:
            email_service.send_client_delivery_email(
                to_email=job.client_email,
                photographer_name=photographer_name,
                job_name=job.name,
                sent=sum(1 for p in participants if p.gallery_sent_at),
                total=len(participants),
                not_photographed=sum(
                    1 for p in participants if p.shot_at is None
                ),
                dashboard_url=(
                    f"{settings.frontend_url}/c/{job.client_token}"
                    if job.client_token
                    else None
                ),
                client_logo_url=client_logo_url,
                client_name=job.client_name,
            )
        except Exception:  # noqa: BLE001 — the galleries are what matter
            logger.exception("Client delivery notice failed (job=%s)", job.id)

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

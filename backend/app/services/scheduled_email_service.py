"""
Email that fires on a date rather than an event.

Deliberately a daily cron rather than a queue. RQ and Redis are already
dependencies, but nothing here needs sub-minute latency or retries within
a request: everything is "some time today". A cron job is one moving part
instead of three, and when it fails you get a failed job in the Render
dashboard rather than silence and a growing queue nobody is watching.

Every send is gated on a NULL timestamp column that's set immediately after,
so the job is safe to re-run. That matters more than it sounds: cron jobs
get retried by hand at 2am by someone who isn't sure whether the first run
worked, and nobody should get two "your trial is ending" emails because of
it.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, Job, Participant, User

logger = logging.getLogger(__name__)

# How far ahead of expiry to warn. Long enough to actually decide, short
# enough to still feel relevant.
TRIAL_WARNING_DAYS = 7


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _owner_of(db: Session, account: Account) -> User | None:
    """The person to email about an account."""
    return db.scalar(
        select(User)
        .where(User.account_id == account.id, User.deleted_at.is_(None))
        .order_by(User.created_at.asc())
    )


def send_trial_ending(db: Session) -> int:
    """Warn accounts whose trial ends within the warning window.

    Only unverified-of-nothing here: a trial ending is worth telling people
    about whether or not they've confirmed their address, because it's about
    their own account rather than mail to third parties.
    """
    from app.services import email_service

    now = _utcnow()
    cutoff = now + timedelta(days=TRIAL_WARNING_DAYS)
    accounts = list(
        db.scalars(
            select(Account).where(
                Account.plan == "trial",
                Account.trial_ends_at.is_not(None),
                Account.trial_ends_at <= cutoff,
                Account.trial_ends_at > now,
                Account.trial_ending_email_at.is_(None),
            )
        ).all()
    )

    sent = 0
    for account in accounts:
        owner = _owner_of(db, account)
        if owner is None:
            continue
        days_left = max((account.trial_ends_at - now).days, 0)
        try:
            email_service.send_trial_ending_email(
                to_email=owner.email,
                user_name=owner.name,
                studio_name=account.name,
                days_left=days_left,
                ends_on=account.trial_ends_at.strftime("%-d %B"),
                pricing_url=f"{settings.frontend_url}/pricing",
            )
        except Exception:  # noqa: BLE001 — one bad address can't stop the batch
            logger.exception("Trial-ending email failed (account=%s)", account.id)
            continue
        # Marked only after a successful send, so a provider outage means
        # "try again tomorrow" rather than "never mention it".
        account.trial_ending_email_at = now
        sent += 1
    db.commit()
    return sent


def send_trial_ended(db: Session) -> int:
    """Tell accounts whose trial has now run out."""
    from app.services import email_service

    now = _utcnow()
    accounts = list(
        db.scalars(
            select(Account).where(
                Account.plan == "trial",
                Account.trial_ends_at.is_not(None),
                Account.trial_ends_at <= now,
                Account.trial_ended_email_at.is_(None),
            )
        ).all()
    )

    sent = 0
    for account in accounts:
        owner = _owner_of(db, account)
        if owner is None:
            continue
        try:
            email_service.send_trial_ended_email(
                to_email=owner.email,
                user_name=owner.name,
                studio_name=account.name,
                pricing_url=f"{settings.frontend_url}/pricing",
            )
        except Exception:  # noqa: BLE001
            logger.exception("Trial-ended email failed (account=%s)", account.id)
            continue
        account.trial_ended_email_at = now
        sent += 1
    db.commit()
    return sent


def send_shoot_reminders(db: Session) -> int:
    """Remind participants the day before they're photographed.

    The highest-value message in the product: a reminder the evening before
    is the single cheapest way to reduce the no-shows we built tracking for.

    Only for jobs whose account has a confirmed email, same rule as the
    signup page: this is mail to third parties.
    """
    from app.services import email_service, profile_service, slot_service

    now = _utcnow()
    tomorrow = (now + timedelta(days=1)).date()

    jobs = list(db.scalars(select(Job).where(Job.archived_at.is_(None))).all())
    sent = 0

    for job in jobs:
        # A multi-day shoot reminds each day's people on their own eve.
        if tomorrow not in set(job.all_shoot_dates):
            continue
        from app.services.participant_service import _owner_is_verified

        if not _owner_is_verified(db, job):
            continue

        account = db.get(Account, job.account_id)
        owner = _owner_of(db, account) if account else None
        photographer_name = (
            owner.name if owner and owner.name else (account.name if account else "Your photographer")
        )

        slot_by_participant: dict[str, datetime] = {}
        if job.shoot_mode == "time_slot":
            for entry in slot_service.job_schedule(db, job=job):
                slot_by_participant[entry["participant_id"]] = entry["slot_start"]

        participants = list(
            db.scalars(
                select(Participant).where(
                    Participant.job_id == job.id,
                    Participant.reminder_sent_at.is_(None),
                    Participant.shot_at.is_(None),
                    Participant.no_show_at.is_(None),
                )
            ).all()
        )

        for p in participants:
            if not p.email:
                continue
            slot = slot_by_participant.get(p.id)
            # On a time-slot job, someone with no booking isn't expected
            # tomorrow specifically, so don't tell them they are.
            if job.shoot_mode == "time_slot":
                if slot is None or slot.date() != tomorrow:
                    continue
            try:
                email_service.send_shoot_reminder_email(
                    to_email=p.email,
                    participant_name=p.name,
                    photographer_name=photographer_name,
                    job_name=job.name,
                    location=job.location,
                    time_label=slot.strftime("%H:%M") if slot else None,
                    queue_url=f"{settings.frontend_url}/q/{p.gallery_token}",
                    signup_url=f"{settings.frontend_url}/s/{job.public_slug}",
                    client_name=job.client_name,
                    # Token-carrying, and only when the photographer opened
                    # rescheduling on this job.
                    reschedule_url=(
                        f"{settings.frontend_url}/s/{job.public_slug}"
                        f"?t={p.gallery_token}"
                        if job.allow_reschedule
                        else None
                    ),
                    profile_url=(
                        profile_service.profile_url(account) if account else None
                    ),
                )
            except Exception:  # noqa: BLE001
                logger.exception("Shoot reminder failed (participant=%s)", p.id)
                continue
            p.reminder_sent_at = now
            sent += 1

    db.commit()
    return sent


# How long a delivered gallery can sit unopened before we mention it, and
# how long a shot job can sit undelivered before the photographer hears.
GALLERY_NUDGE_DAYS = 4
UNDELIVERED_NUDGE_DAYS = 3


def send_gallery_nudges(db: Session) -> int:
    """Nudge participants whose gallery has sat unopened.

    "Unopened" means no download recorded, which is the only signal we have
    and the one that matters: a delivered gallery nobody pulls a photo from
    is the same as not delivering it.
    """
    from sqlalchemy import func

    from app.models import ParticipantDownload
    from app.services import email_service

    now = _utcnow()
    cutoff = now - timedelta(days=GALLERY_NUDGE_DAYS)

    candidates = list(
        db.scalars(
            select(Participant).where(
                Participant.gallery_sent_at.is_not(None),
                Participant.gallery_sent_at <= cutoff,
                Participant.gallery_nudge_at.is_(None),
            )
        ).all()
    )

    sent = 0
    for p in candidates:
        if not p.email:
            continue
        downloaded = db.scalar(
            select(func.count())
            .select_from(ParticipantDownload)
            .where(ParticipantDownload.participant_id == p.id)
        ) or 0
        if downloaded > 0:
            # They've been. Mark it so we never look again.
            p.gallery_nudge_at = now
            continue

        job = db.get(Job, p.job_id)
        if job is None or job.archived_at is not None:
            continue
        account = db.get(Account, job.account_id)
        owner = _owner_of(db, account) if account else None
        try:
            email_service.send_gallery_nudge_email(
                to_email=p.email,
                participant_name=p.name,
                photographer_name=(
                    owner.name if owner and owner.name
                    else (account.name if account else "Your photographer")
                ),
                job_name=job.name,
                gallery_url=f"{settings.frontend_url}/g/{p.gallery_token}",
                download_cap=job.download_cap,
                client_name=job.client_name,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Gallery nudge failed (participant=%s)", p.id)
            continue
        p.gallery_nudge_at = now
        sent += 1

    db.commit()
    return sent


def send_undelivered_nudges(db: Session) -> int:
    """Tell photographers about shot jobs whose galleries never went out.

    The failure this catches is mundane and expensive: the shoot went fine,
    the photos got edited, and nobody pressed Deliver.
    """
    from app.services import email_service

    now = _utcnow()
    cutoff_date = (now - timedelta(days=UNDELIVERED_NUDGE_DAYS)).date()

    jobs = list(
        db.scalars(
            select(Job).where(
                Job.archived_at.is_(None),
                Job.undelivered_nudge_at.is_(None),
                Job.shoot_date.is_not(None),
                Job.shoot_date <= cutoff_date,
            )
        ).all()
    )

    sent = 0
    for job in jobs:
        participants = list(
            db.scalars(
                select(Participant).where(Participant.job_id == job.id)
            ).all()
        )
        # Only jobs where work actually happened and delivery didn't.
        shot = [p for p in participants if p.shot_at is not None]
        undelivered = [
            p for p in shot if p.gallery_sent_at is None and p.email
        ]
        if not shot or not undelivered:
            continue

        account = db.get(Account, job.account_id)
        owner = _owner_of(db, account) if account else None
        if owner is None or not owner.email:
            continue

        days_ago = (now.date() - job.shoot_date).days
        try:
            email_service.send_undelivered_nudge_email(
                to_email=owner.email,
                user_name=owner.name,
                job_name=job.name,
                job_url=f"{settings.frontend_url}/jobs/{job.id}",
                count=len(undelivered),
                days_ago=days_ago,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Undelivered nudge failed (job=%s)", job.id)
            continue
        job.undelivered_nudge_at = now
        sent += 1

    db.commit()
    return sent


def run_daily(db: Session) -> dict[str, int]:
    """Everything the daily cron does, in one call.

    Each step is independent: a failure in one doesn't stop the others,
    because a broken trial email shouldn't cost everyone their shoot
    reminder.
    """
    results: dict[str, int] = {}
    for name, fn in (
        # Time-sensitive first: a shoot reminder that goes out late is
        # worthless, a trial warning a few minutes later is not.
        ("shoot_reminders", send_shoot_reminders),
        ("gallery_nudges", send_gallery_nudges),
        ("undelivered_nudges", send_undelivered_nudges),
        ("trial_ending", send_trial_ending),
        ("trial_ended", send_trial_ended),
    ):
        try:
            results[name] = fn(db)
        except Exception:  # noqa: BLE001
            logger.exception("Daily email step %s failed", name)
            results[name] = -1
    return results

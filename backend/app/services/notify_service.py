"""
Participant-facing notifications.

Every send here is best-effort: the thing being announced has already been
committed, so a mail failure is logged and swallowed rather than rolled back
into the caller's request. Losing a booking because Postmark blinked would
be a much worse outcome than a missing email.

This lives apart from email_service (which owns rendering and transport) so
the "who needs to know, and what do they need to know" decisions sit in one
place, reachable from both the public API and the photographer's own actions.
"""
from __future__ import annotations

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, Client, Job, Participant, SlotBooking
from app.services import client_service, email_service, profile_service

logger = logging.getLogger(__name__)


def _day_label(dt: datetime) -> str:
    # Slots are wall-clock times stored as UTC (there's no photographer
    # timezone setting yet), so format the stored value directly instead of
    # converting it and shifting everything by an hour.
    return dt.strftime("%A %-d %B")


def _time_label(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _context(db: Session, job: Job) -> dict:
    """Shared bits every participant email needs: who's sending, and the
    client branding to wear."""
    account = db.get(Account, job.account_id)
    logo_url = None
    if job.client_id:
        client = db.get(Client, job.client_id)
        if client:
            logo_url = client_service.logo_url(client)
    return {
        "photographer_name": account.name if account else "Your photographer",
        "job_name": job.name,
        "client_logo_url": logo_url,
        "client_name": job.client_name,
        "signup_url": f"{settings.frontend_url}/s/{job.public_slug}",
        # None unless they've published a profile, so we never link a 404.
        "profile_url": (
            profile_service.profile_url(account) if account else None
        ),
    }


def slot_confirmed(
    db: Session,
    *,
    job: Job,
    booking: SlotBooking,
    moved_by_photographer: bool = False,
) -> None:
    """Confirm a booked time. Covers both the participant booking their own
    slot and the photographer assigning or moving one, because from the
    participant's side those are the same event: this is when you're on."""
    participant = db.get(Participant, booking.participant_id)
    if participant is None or not participant.email:
        return
    ctx = _context(db, job)
    minutes = max(
        int((booking.slot_end - booking.slot_start).total_seconds() // 60), 1
    )
    try:
        email_service.send_slot_confirmation_email(
            to_email=participant.email,
            participant_name=participant.name,
            photographer_name=ctx["photographer_name"],
            job_name=ctx["job_name"],
            day_label=_day_label(booking.slot_start),
            time_label=_time_label(booking.slot_start),
            minutes=minutes,
            signup_url=ctx["signup_url"],
            location=job.location,
            client_logo_url=ctx["client_logo_url"],
            client_name=ctx["client_name"],
            # Changes the opening line: someone who didn't ask for this
            # needs to know their time moved, not be congratulated on
            # booking it.
            moved=moved_by_photographer,
        )
    except Exception:  # noqa: BLE001 — the booking is what matters
        logger.exception("Slot confirmation failed (job=%s)", job.id)


def slot_cancelled(
    db: Session,
    *,
    job: Job,
    participant: Participant,
    slot_start: datetime,
) -> None:
    """Tell someone their booked time is gone. Without this they turn up at
    a slot that no longer exists, which is the worst failure this product
    can produce on a shoot day."""
    if not participant.email:
        return
    ctx = _context(db, job)
    try:
        email_service.send_slot_cancelled_email(
            to_email=participant.email,
            participant_name=participant.name,
            photographer_name=ctx["photographer_name"],
            job_name=ctx["job_name"],
            day_label=_day_label(slot_start),
            time_label=_time_label(slot_start),
            signup_url=ctx["signup_url"],
            client_logo_url=ctx["client_logo_url"],
            client_name=ctx["client_name"],
        )
    except Exception:  # noqa: BLE001
        logger.exception("Slot cancellation email failed (job=%s)", job.id)


def marked_no_show(db: Session, *, job: Job, participant: Participant) -> None:
    """Follow up with someone who didn't turn up.

    Sent when the photographer flags them, not on a schedule: the moment
    they press the button is when the information is freshest and the
    rebooking is most likely to happen.
    """
    if not participant.email:
        return
    ctx = _context(db, job)
    try:
        email_service.send_no_show_followup_email(
            to_email=participant.email,
            participant_name=participant.name,
            photographer_name=ctx["photographer_name"],
            job_name=ctx["job_name"],
            signup_url=ctx["signup_url"],
            # Only offer a self-serve rebooking when there's actually a
            # schedule to book into. On a walk-up job "pick a new time" is
            # a link to a page with no times on it.
            can_rebook=job.shoot_mode == "time_slot"
            and job.archived_at is None,
            client_logo_url=ctx["client_logo_url"],
            client_name=ctx["client_name"],
        )
    except Exception:  # noqa: BLE001
        logger.exception("No-show follow-up failed (job=%s)", job.id)


def participant_signed_up(
    db: Session, *, job: Job, participant: Participant
) -> None:
    """Acknowledge a public signup.

    On queue-mode jobs this is the only message a participant gets between
    signing up and their gallery arriving days later, so it carries the
    practical details and their live queue link. On slot jobs the booking
    confirmation follows separately with the actual time.
    """
    if not participant.email:
        return
    ctx = _context(db, job)
    try:
        email_service.send_signup_confirmation_email(
            to_email=participant.email,
            participant_name=participant.name,
            photographer_name=ctx["photographer_name"],
            job_name=ctx["job_name"],
            shoot_date=job.shoot_date.strftime("%A %-d %B")
            if job.shoot_date
            else None,
            location=job.location,
            time_slots=job.shoot_mode == "time_slot",
            signup_url=ctx["signup_url"],
            queue_url=f"{settings.frontend_url}/q/{participant.gallery_token}",
            client_logo_url=ctx["client_logo_url"],
            client_name=ctx["client_name"],
            profile_url=ctx["profile_url"],
        )
    except Exception:  # noqa: BLE001
        logger.exception("Signup confirmation failed (job=%s)", job.id)

"""
Time-slot booking logic (HSD-55).

Slots are COMPUTED from Job.time_slot_config, never stored; only bookings
are rows. Times: the config holds wall-clock HH:MM for the shoot day; slots
are materialized as UTC datetimes on the job's shoot_date. v0.1 has no
photographer timezone setting, so wall-clock in equals wall-clock out and
display code simply formats the stored HH:MM. Revisit when multi-timezone
support matters.

Booking safety: UNIQUE(job_id, slot_start) makes concurrent double-booking
lose at the database; the service translates that into a 409 the UI can
turn into a re-pick. UNIQUE(participant_id) means rebooking replaces the
previous slot inside the same transaction.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models import Job, Participant, SlotBooking
from app.schemas.slots import TimeSlotConfig


def _slot_times(job: Job) -> list[tuple[datetime, datetime]]:
    """Materialize the slot list for a job across every day it runs on."""
    if job.shoot_mode != "time_slot" or not job.time_slot_config or not job.shoot_date:
        return []
    slots: list[tuple[datetime, datetime]] = []
    for day in job.all_shoot_dates:
        slots.extend(slot_times_for(job.time_slot_config, day))
    slots.sort(key=lambda se: se[0])
    return slots


def slot_times_for(config, shoot_date) -> list[tuple[datetime, datetime]]:
    """Materialize slots for an arbitrary (config, date) pair. Used both for
    a job's live grid and to preview a *proposed* config during updates, so
    only bookings that fall off the new grid get cancelled."""
    if not config or not shoot_date:
        return []
    cfg = (
        config
        if isinstance(config, TimeSlotConfig)
        else TimeSlotConfig.model_validate(config)
    )

    def at(hhmm: str) -> datetime:
        h, m = (int(x) for x in hhmm.split(":"))
        return datetime(
            shoot_date.year, shoot_date.month, shoot_date.day,
            h, m, tzinfo=timezone.utc,
        )

    # HSD-71: a day may run different hours from the rest of the shoot.
    # Its override supplies the window and cadence; anything without one
    # uses the base settings, so single-day jobs are untouched.
    day = cfg.day_overrides.get(shoot_date.isoformat())
    day_start_s = day.start if day else cfg.start
    day_end_s = day.end if day else cfg.end
    slot_minutes = day.slot_minutes if day else cfg.slot_minutes
    buffer_minutes = day.buffer_minutes if day else cfg.buffer_minutes
    day_breaks = day.breaks if day else cfg.breaks

    day_end = at(day_end_s)
    breaks = [(at(b.start), at(b.end)) for b in day_breaks]
    step = timedelta(minutes=slot_minutes + buffer_minutes)
    length = timedelta(minutes=slot_minutes)

    # HSD-71: on a multi-day shoot the same clock time exists on every day,
    # so removals and one-off slots may be date-qualified
    # ("2026-09-16@14:20"). A bare "14:20" still applies to every day,
    # which keeps single-day jobs (and everything saved before this)
    # behaving exactly as before.
    iso_day = shoot_date.isoformat()
    blocked = {
        b.split("@", 1)[1] if "@" in b else b
        for b in cfg.blocked
        if "@" not in b or b.split("@", 1)[0] == iso_day
    }
    slots: list[tuple[datetime, datetime]] = []
    cursor = at(day_start_s)
    while cursor + length <= day_end:
        slot = (cursor, cursor + length)
        # Skip slots overlapping any break; resume at the break's end.
        hit = next((b for b in breaks if slot[0] < b[1] and slot[1] > b[0]), None)
        if hit:
            cursor = hit[1]
            continue
        # Individually removed slots: skip the slot but keep the cadence,
        # so the rest of the grid doesn't shift.
        if slot[0].strftime("%H:%M") not in blocked:
            slots.append(slot)
        cursor += step

    # One-off extras (custom lengths, usually appended after the day).
    # Overlaps with existing slots or each other are skipped, not errors.
    # Same date-qualification rule as blocked entries.
    for ex in cfg.extra:
        raw_start = ex.start
        if "@" in raw_start:
            day_part, raw_start = raw_start.split("@", 1)
            if day_part != iso_day:
                continue
        ex_start = at(raw_start)
        ex_end = ex_start + timedelta(minutes=ex.minutes)
        if any(s < ex_end and e > ex_start for s, e in slots):
            continue
        slots.append((ex_start, ex_end))

    slots.sort(key=lambda se: se[0])
    return slots


def list_slots(db: Session, *, job: Job) -> list[dict]:
    """All slots with availability, for the public picker."""
    slots = _slot_times(job)
    if not slots:
        return []
    booked = {
        b.slot_start
        for b in db.scalars(
            select(SlotBooking).where(SlotBooking.job_id == job.id)
        ).all()
    }
    return [
        {"start": s, "end": e, "available": s not in booked}
        for s, e in slots
    ]


def book_slot(
    db: Session,
    *,
    job: Job,
    gallery_token: str,
    slot_start: datetime,
) -> SlotBooking:
    """Book (or rebook) a slot for the participant owning gallery_token.

    409 when the slot is taken (including losing a race), 404 for a token
    that doesn't belong to this job, 422-equivalent 400 for a slot_start
    that isn't in the generated slot list.
    """
    participant = db.scalar(
        select(Participant).where(
            Participant.gallery_token == gallery_token,
            Participant.job_id == job.id,
        )
    )
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Signup not found."
        )
    return book_slot_for_participant(
        db, job=job, participant=participant, slot_start=slot_start
    )


def book_slot_for_participant(
    db: Session,
    *,
    job: Job,
    participant: Participant,
    slot_start: datetime,
) -> SlotBooking:
    """Core booking: assign `slot_start` to `participant`. Shared by the
    public token-authenticated path and the photographer's owner-side
    assignment. Same semantics: rebooking replaces, races lose with 409."""
    # Normalize + verify the requested slot exists in the configured grid.
    if slot_start.tzinfo is None:
        slot_start = slot_start.replace(tzinfo=timezone.utc)
    else:
        slot_start = slot_start.astimezone(timezone.utc)
    match = next(
        (s for s in _slot_times(job) if s[0] == slot_start), None
    )
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That time isn't a bookable slot.",
        )

    # Rebooking replaces: drop any previous booking for this participant in
    # the same transaction as the insert, so they never hold two slots and
    # their old slot frees up atomically.
    existing = db.scalar(
        select(SlotBooking).where(SlotBooking.participant_id == participant.id)
    )
    if existing is not None:
        if existing.slot_start == slot_start:
            return existing  # idempotent: same slot re-picked
        db.delete(existing)
        db.flush()

    booking = SlotBooking(
        id=new_id("slot"),
        job_id=job.id,
        participant_id=participant.id,
        slot_start=match[0],
        slot_end=match[1],
    )
    db.add(booking)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Lost the race for this slot to someone else.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That slot was just taken. Pick another.",
        ) from None
    db.refresh(booking)
    return booking


def job_schedule(db: Session, *, job: Job) -> list[dict]:
    """Chronological bookings with participant info, for photographer views."""
    rows = db.execute(
        select(SlotBooking, Participant)
        .join(Participant, Participant.id == SlotBooking.participant_id)
        .where(SlotBooking.job_id == job.id)
        .order_by(SlotBooking.slot_start.asc())
    ).all()
    return [
        {
            "slot_start": b.slot_start,
            "slot_end": b.slot_end,
            "participant_id": p.id,
            "participant_name": p.name,
            "shot": p.shot_at is not None,
        }
        for b, p in rows
    ]


def cancel_participant_booking(
    db: Session, *, job: Job, participant: Participant
) -> bool:
    """Owner-side: free a participant's slot (they become a walk-in again).
    Returns True when a booking existed. Commits."""
    existing = db.scalar(
        select(SlotBooking).where(
            SlotBooking.participant_id == participant.id,
            SlotBooking.job_id == job.id,
        )
    )
    if existing is None:
        return False
    db.delete(existing)
    db.commit()
    return True


def clear_bookings(db: Session, *, job: Job) -> int:
    """Remove all bookings for a job. Used when the photographer switches a
    job away from time-slot mode. Caller commits."""
    bookings = db.scalars(
        select(SlotBooking).where(SlotBooking.job_id == job.id)
    ).all()
    count = 0
    for b in bookings:
        db.delete(b)
        count += 1
    return count

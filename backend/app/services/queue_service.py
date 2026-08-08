"""
Walk-up queue position and estimated time.

Walk-up jobs deliberately have no appointments: some clients won't chase
sixty people to book a slot. What people actually want isn't a time, it's an
answer to "how long?", so this computes a live position and an estimate from
the photographer's own pace on the day rather than from a schedule.

The estimate is honest about being an estimate: it's derived from how long
recent shots actually took, and falls back to a conservative default before
there's enough data to measure.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Job, Participant

# Used until the photographer has shot enough people to measure a real pace.
# Five minutes per person is a slow-ish headshot booth, so early estimates
# run long rather than short. Being told "20 minutes" and waiting 12 is a
# much better experience than the reverse.
DEFAULT_MINUTES_PER_PERSON = 5.0

# How many recent shots feed the pace estimate. Small enough to react when
# the photographer speeds up after the first few, large enough that one
# person who needed a wardrobe change doesn't skew everything.
PACE_SAMPLE_SIZE = 6


def _pace_minutes(shot: list[Participant]) -> tuple[float, bool]:
    """Minutes per person, and whether it's measured or the default.

    Uses the median gap between consecutive shots, which shrugs off the long
    tail (a coffee break, a late arrival) that a mean would absorb.
    """
    times = sorted(p.shot_at for p in shot if p.shot_at is not None)
    recent = times[-(PACE_SAMPLE_SIZE + 1):]
    gaps = [
        (b - a).total_seconds() / 60
        for a, b in zip(recent, recent[1:], strict=False)
    ]
    # Ignore gaps that clearly aren't shooting time: a lunch break shouldn't
    # tell us the photographer takes 40 minutes per person.
    gaps = [g for g in gaps if 0 < g <= 30]
    if len(gaps) < 2:
        return DEFAULT_MINUTES_PER_PERSON, False
    return statistics.median(gaps), True


def queue_status(db: Session, *, gallery_token: str) -> dict:
    """Live position for one participant in a walk-up queue.

    Keyed on the participant's own gallery token: they already have it from
    signup, and it exposes nothing about anyone else. Only counts and their
    own name come back, never other participants' details.
    """
    participant = db.scalar(
        select(Participant).where(Participant.gallery_token == gallery_token)
    )
    if participant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    job = db.get(Job, participant.job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )

    everyone = list(
        db.scalars(
            select(Participant)
            .where(Participant.job_id == job.id)
            .order_by(Participant.created_at.asc())
        ).all()
    )
    shot = [p for p in everyone if p.shot_at is not None]
    # Queue order is signup order. No-shows drop out of the line entirely.
    waiting = [
        p for p in everyone if p.shot_at is None and p.no_show_at is None
    ]

    if participant.shot_at is not None:
        return {
            "name": participant.name,
            "job_name": job.name,
            "status": "photographed",
            "position": None,
            "people_ahead": 0,
            "estimated_wait_minutes": None,
            "estimated_time": None,
            "pace_measured": False,
            "queue_length": len(waiting),
        }

    if participant.no_show_at is not None:
        return {
            "name": participant.name,
            "job_name": job.name,
            "status": "missed",
            "position": None,
            "people_ahead": 0,
            "estimated_wait_minutes": None,
            "estimated_time": None,
            "pace_measured": False,
            "queue_length": len(waiting),
        }

    position = next(
        (i + 1 for i, p in enumerate(waiting) if p.id == participant.id), None
    )
    ahead = (position - 1) if position else 0

    minutes_each, measured = _pace_minutes(shot)
    wait = round(ahead * minutes_each)
    now = datetime.now(timezone.utc)
    # Someone mid-shoot means the person at the front isn't starting from
    # zero, but we don't track shot start times, so the estimate stays
    # deliberately simple: whole minutes, no false precision.
    eta = now + timedelta(minutes=wait)

    return {
        "name": participant.name,
        "job_name": job.name,
        "status": "next" if ahead == 0 else "waiting",
        "position": position,
        "people_ahead": ahead,
        "estimated_wait_minutes": wait,
        "estimated_time": eta.isoformat(),
        "pace_measured": measured,
        "queue_length": len(waiting),
    }

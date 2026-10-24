"""
Demo job for founder-led walkthroughs (HSD-81).

One admin action builds a job that looks like a real two-day team shoot
caught in the middle: day one photographed, mostly delivered, a few people
starring favourites and downloading, one no-show, private notes on some
people; day two still ahead with bookings on the grid. Every screen a
prospect is shown has something real-looking on it instead of an empty
account.

The photos are the photographer's own, uploaded with the action. A file
named like a person ("Mara Visser_001.jpg") keeps that name and its frames
are grouped under one person; anything else ("IMG_4021.jpg") gets a
generated name, one person per file.

Nothing here may email anyone. Participants and the client contact get
addresses at example.com, a domain reserved for documentation, and
email_service refuses to send to reserved domains at all. The job is also
marked `settings["demo"] = True` so it can be found and replaced.

Building again archives the previous demo job, so a demo always starts
from the same state.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.security import generate_refresh_token
from app.models import (
    Account,
    File,
    Job,
    Participant,
    ParticipantDownload,
    ParticipantPick,
    SlotBooking,
    User,
)
from app.services import storage_service
from app.services.file_service import (
    _generate_thumbnail,
    _read_image_dimensions,
    _strip_index_suffix,
)

DEMO_JOB_NAME = "Team headshots, Brightwater Partners"
DEMO_CLIENT = "Brightwater Partners"
DEMO_LOCATION = "Brightwater office, Amsterdam"
MAX_FILES = 60
MAX_FILE_BYTES = 25 * 1024 * 1024
_ALLOWED = {"image/jpeg", "image/png", "image/webp"}

# Used when a filename does not carry a person's name. Plain, international,
# and deliberately not "Jane Doe".
_FAKE_NAMES = [
    "Sanne de Wit", "Thomas Bakker", "Priya Raman", "Lucas Meijer",
    "Amira El Idrissi", "Daan Visser", "Sofia Marchetti", "Ruben Smit",
    "Noor Hendriks", "Jasper de Boer", "Elif Yilmaz", "Mats Jansen",
    "Charlotte Peeters", "Omar Haddad", "Femke Mulder", "Kenji Sato",
    "Lotte van Dijk", "Mateo Alvarez", "Isa Kramer", "Hugo Willems",
]
# Day-two bookings: people who signed up but haven't been photographed.
_DAY_TWO = [
    "Bram Vos", "Yara Kok", "Stijn Dekker", "Mila Brouwer",
    "Sem van Leeuwen", "Eva de Groot",
]
_TITLES = [
    "Partner", "Senior Associate", "Office Manager", "Analyst",
    "Head of Finance", "Marketing Lead", "Associate", "HR Business Partner",
]
_NOTES = [
    "Light retouching on the face only, keep the glasses.",
    "No retouching on the face. Wants the version with the jacket.",
    "Prefers the left side. Second outfit for the website.",
]
_GENERIC_STEM = re.compile(r"^(img|dsc|dscf|dsc_|_mg|photo|image|untitled|p\d|\d)", re.I)


@dataclass
class _Person:
    name: str
    files: list[tuple[str, bytes, str]]


def _person_name(filename: str) -> str | None:
    stem = _strip_index_suffix(Path(filename).stem)
    stem = re.sub(r"[_\-]+", " ", stem).strip()
    if not stem or _GENERIC_STEM.match(stem) or not re.search(r"[A-Za-z]{2}", stem):
        return None
    return " ".join(w[:1].upper() + w[1:] for w in stem.split())


def _group(photos: list[tuple[str, bytes, str]]) -> list[_Person]:
    named: dict[str, _Person] = {}
    people: list[_Person] = []
    fake = iter(_FAKE_NAMES)
    for filename, content, ctype in photos:
        name = _person_name(filename)
        if name:
            if name not in named:
                named[name] = _Person(name=name, files=[])
                people.append(named[name])
            named[name].files.append((filename, content, ctype))
        else:
            fake_name = next(fake, None) or f"Guest {len(people) + 1}"
            people.append(_Person(name=fake_name, files=[(filename, content, ctype)]))
    return people


def _email_for(name: str) -> str:
    local = re.sub(r"[^a-z0-9]+", ".", name.lower()).strip(".")
    return f"{local}@example.com"


def _slot(day: date, index: int, minutes: int = 15, start_hour: int = 9) -> tuple[datetime, datetime]:
    # Slots are wall-clock times stored as UTC, matching slot_service.
    start = datetime(day.year, day.month, day.day, start_hour, 0, tzinfo=timezone.utc) + timedelta(
        minutes=index * minutes
    )
    return start, start + timedelta(minutes=minutes)


def _archive_previous(db: Session, account: Account) -> None:
    now = datetime.now(timezone.utc)
    for job in db.scalars(
        select(Job).where(Job.account_id == account.id, Job.archived_at.is_(None))
    ).all():
        if (job.settings or {}).get("demo"):
            job.archived_at = now
            job.status = "archived"


def validate_uploads(photos: list[tuple[str, bytes, str]]) -> None:
    if not photos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Add at least one photo.")
    if len(photos) > MAX_FILES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"At most {MAX_FILES} photos for a demo job."
        )
    for filename, content, ctype in photos:
        if ctype not in _ALLOWED:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"{filename}: JPEG, PNG, or WebP only."
            )
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{filename}: over 25 MB.")


def build_demo_job(
    db: Session,
    *,
    account: Account,
    user: User,
    photos: list[tuple[str, bytes, str]],
    today: date | None = None,
) -> dict:
    validate_uploads(photos)
    today = today or date.today()
    now = datetime.now(timezone.utc)
    day_one = today - timedelta(days=1)
    day_two = today + timedelta(days=6)

    _archive_previous(db, account)
    people = _group(photos)
    # The grid has to hold everyone photographed plus the no-show, at 15
    # minutes each from 09:00, and never ends before noon.
    end_minutes = max(12 * 60, 9 * 60 + 15 * (len(people) + 1))
    grid_end = f"{min(end_minutes, 23 * 60) // 60:02d}:{min(end_minutes, 23 * 60) % 60:02d}"

    job = Job(
        id=new_id("job"),
        account_id=account.id,
        public_slug=f"demo-{generate_refresh_token()[:8].lower()}",
        name=DEMO_JOB_NAME,
        client_name=DEMO_CLIENT,
        client_email="hr@example.com",
        shoot_date=day_one,
        extra_shoot_dates=[day_two.isoformat()],
        location=DEMO_LOCATION,
        status="in_progress",
        settings={"demo": True},
        download_cap=3,
        picks_enabled=True,
        pick_cap=3,
        shoot_mode="time_slot",
        time_slot_config={"start": "09:00", "end": grid_end, "slot_minutes": 15},
        delivery_mode="both",
        allow_reschedule=False,
        client_token=generate_refresh_token(),
        created_by=user.id,
    )
    db.add(job)
    db.flush()

    # Most of day one delivered, a couple shot and waiting, so both the
    # "delivered" and the "still to deliver" states are on screen.
    undelivered_from = max(1, len(people) - 2)
    participants: list[Participant] = []
    files_by_person: dict[str, list[File]] = {}

    for i, person in enumerate(people):
        shot_at = datetime(day_one.year, day_one.month, day_one.day, 9, 5, tzinfo=timezone.utc) + timedelta(minutes=15 * i)
        delivered = i < undelivered_from
        p = Participant(
            id=new_id("part"),
            job_id=job.id,
            name=person.name,
            email=_email_for(person.name),
            title=_TITLES[i % len(_TITLES)],
            notes=_NOTES[i // 3] if i % 3 == 0 and i // 3 < len(_NOTES) else None,
            gallery_token=generate_refresh_token(),
            shot_at=shot_at,
            gallery_sent_at=now - timedelta(hours=20) if delivered else None,
            # Already "handled", so no scheduled mail even looks at them.
            reminder_sent_at=now - timedelta(days=2),
            gallery_nudge_at=now if delivered else None,
            consented_at=now - timedelta(days=7),
        )
        db.add(p)
        participants.append(p)
        start, end = _slot(day_one, i)
        db.add(SlotBooking(id=new_id("slot"), job_id=job.id, participant_id=p.id, slot_start=start, slot_end=end))

        stored: list[File] = []
        for n, (filename, content, ctype) in enumerate(person.files, start=1):
            ext = Path(filename).suffix.lower() or ".jpg"
            fid = new_id("file")
            key = f"{job.id}/{fid}{ext}"
            storage_service.save(key=key, content=content, content_type=ctype)
            width, height = _read_image_dimensions(content)
            f = File(
                id=fid,
                job_id=job.id,
                participant_id=p.id,
                original_filename=f"{person.name}_{n:04d}{ext}",
                storage_key=key,
                width=width,
                height=height,
                size_bytes=len(content),
                mime_type=ctype,
                variant="original",
                content_sha256=hashlib.sha256(content).hexdigest(),
            )
            db.add(f)
            stored.append(f)
            thumb = _generate_thumbnail(content)
            if thumb is not None:
                tbytes, tw, th = thumb
                tid = new_id("file")
                tkey = f"{job.id}/{tid}.thumb.jpg"
                storage_service.save(key=tkey, content=tbytes, content_type="image/jpeg")
                db.add(
                    File(
                        id=tid,
                        job_id=job.id,
                        participant_id=p.id,
                        original_filename=f.original_filename,
                        storage_key=tkey,
                        width=tw,
                        height=th,
                        size_bytes=len(tbytes),
                        mime_type="image/jpeg",
                        variant="thumbnail",
                        source_file_id=fid,
                    )
                )
        files_by_person[p.id] = stored

    db.flush()

    # Engagement on delivered galleries: every other person has starred a
    # favourite, every third has downloaded one.
    for i, p in enumerate(participants):
        if p.gallery_sent_at is None or not files_by_person.get(p.id):
            continue
        first = files_by_person[p.id][0]
        if i % 2 == 0:
            db.add(ParticipantPick(id=new_id("pick"), participant_id=p.id, file_id=first.id, picked_at=now - timedelta(hours=10)))
        if i % 3 == 0:
            db.add(ParticipantDownload(id=new_id("dl"), participant_id=p.id, file_id=first.id, downloaded_at=now - timedelta(hours=8)))

    # One no-show on day one, the slot right after the last photographed.
    no_show = Participant(
        id=new_id("part"),
        job_id=job.id,
        name="Joris Peters",
        email=_email_for("Joris Peters"),
        title="Associate",
        gallery_token=generate_refresh_token(),
        no_show_at=now - timedelta(hours=26),
        reminder_sent_at=now - timedelta(days=2),
        consented_at=now - timedelta(days=7),
    )
    db.add(no_show)
    start, end = _slot(day_one, len(people))
    db.add(SlotBooking(id=new_id("slot"), job_id=job.id, participant_id=no_show.id, slot_start=start, slot_end=end))

    # Day two: booked, waiting.
    for i, name in enumerate(_DAY_TWO):
        p = Participant(
            id=new_id("part"),
            job_id=job.id,
            name=name,
            email=_email_for(name),
            title=_TITLES[(i + 3) % len(_TITLES)],
            gallery_token=generate_refresh_token(),
            reminder_sent_at=now,
            consented_at=now - timedelta(days=3),
        )
        db.add(p)
        start, end = _slot(day_two, i * 2)
        db.add(SlotBooking(id=new_id("slot"), job_id=job.id, participant_id=p.id, slot_start=start, slot_end=end))

    db.commit()
    return {
        "job_id": job.id,
        "people_photographed": len(people),
        "photos": sum(len(p.files) for p in people),
        "day_two_bookings": len(_DAY_TWO),
    }

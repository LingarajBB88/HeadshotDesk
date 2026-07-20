"""
Participant business logic. All authed operations are scoped to the
participant's parent job, which is in turn scoped to the current account.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.ids import new_id
from app.core.security import generate_refresh_token  # reused for opaque tokens
from app.models import Account, Job, Participant, User
from app.schemas.participant import ParticipantCreate
from app.services import email_service, job_service


# ============================================================================
# Authed (photographer-side) operations
# ============================================================================

def list_participants(
    db: Session,
    *,
    account: Account,
    job_id: str,
) -> tuple[list[Participant], int]:
    # Verify the job belongs to the current account (raises 404 if not).
    job_service.get_job(db, account=account, job_id=job_id)

    # Local import keeps participant_service.File-free at module load time
    # (avoids circular import risk).
    from app.models import File, ParticipantDownload

    stmt = (
        select(Participant)
        .where(Participant.job_id == job_id)
        .order_by(Participant.created_at.asc())
    )
    participants = list(db.scalars(stmt).all())

    # Compute photo counts per participant in one query.
    # Restrict to original variant — thumbnails and other variants shouldn't
    # inflate the count (they're internal).
    counts: dict[str, int] = {}
    downloads: dict[str, int] = {}
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
        counts = {pid: int(c) for pid, c in rows}

        # Per-participant download count for the Job detail Downloads tile.
        # Scoped via Participant.job_id so we don't leak counts across jobs.
        # ParticipantDownload's UNIQUE(participant_id, file_id) constraint means
        # this naturally counts unique pulls — re-downloads don't inflate.
        participant_ids = [p.id for p in participants]
        dl_rows = db.execute(
            select(ParticipantDownload.participant_id, func.count())
            .where(ParticipantDownload.participant_id.in_(participant_ids))
            .group_by(ParticipantDownload.participant_id)
        ).all()
        downloads = {pid: int(c) for pid, c in dl_rows}

    # Attach as transient attributes so Pydantic from_attributes picks them up.
    for p in participants:
        # mypy: dynamic attributes; harmless and not persisted.
        p.photo_count = counts.get(p.id, 0)  # type: ignore[attr-defined]
        p.downloads_used = downloads.get(p.id, 0)  # type: ignore[attr-defined]

    total = len(participants)
    return participants, total


def add_participant(
    db: Session,
    *,
    account: Account,
    job_id: str,
    name: str,
    email: str | None,
    title: str | None,
) -> Participant:
    job = job_service.get_job(db, account=account, job_id=job_id)

    if email:
        existing = db.scalar(
            select(Participant).where(
                Participant.job_id == job_id,
                Participant.email == email,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A participant with this email is already on this job.",
            )

    participant = Participant(
        id=new_id("part"),
        job_id=job_id,
        name=name.strip(),
        email=email,
        title=title.strip() if title else None,
        gallery_token=generate_refresh_token(),
    )
    db.add(participant)
    # First participant flips the job into "open_for_signup" so the dashboard
    # reflects reality.
    job_service.maybe_advance_status(job, "open_for_signup")
    db.commit()
    db.refresh(participant)
    return participant


def get_participant(
    db: Session,
    *,
    account: Account,
    participant_id: str,
) -> Participant:
    p = db.get(Participant, participant_id)
    if p is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found."
        )
    # Verify the parent job is in this account.
    job_service.get_job(db, account=account, job_id=p.job_id)
    return p


def update_participant(
    db: Session,
    *,
    account: Account,
    participant_id: str,
    fields: dict,
) -> Participant:
    p = get_participant(db, account=account, participant_id=participant_id)

    for key, value in fields.items():
        if hasattr(p, key):
            if isinstance(value, str):
                value = value.strip() or None if key != "name" else value.strip()
            setattr(p, key, value)

    db.commit()
    db.refresh(p)
    return p


def resend_gallery_email(
    db: Session,
    *,
    account: Account,
    participant_id: str,
) -> Participant:
    """F5c per-row Resend. Always sends, regardless of whether the participant
    has been delivered before — this is the explicit override path for
    "I uploaded more photos for Jane after Deliver, nudge her again."

    Refuses to send if the participant has zero photos (resending an empty
    gallery is a worse experience than no email at all) or no email address.
    """
    from app.models import File

    p = get_participant(db, account=account, participant_id=participant_id)
    if not p.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant has no email address on file.",
        )

    photo_count = db.scalar(
        select(func.count()).select_from(File).where(
            File.job_id == p.job_id,
            File.participant_id == p.id,
            File.deleted_at.is_(None),
            File.variant == "original",
        )
    ) or 0
    if photo_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No photos assigned to this participant yet.",
        )

    job = db.get(Job, p.job_id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found."
        )
    creator = db.get(User, job.created_by) if job.created_by else None
    photographer_name = (
        creator.name if creator and creator.name else account.name or "HeadshotDesk"
    )

    gallery_url = f"{settings.frontend_url}/g/{p.gallery_token}"
    email_service.send_gallery_delivery_email(
        to_email=p.email,
        participant_name=p.name,
        photographer_name=photographer_name,
        job_name=job.name,
        gallery_url=gallery_url,
    )
    p.gallery_sent_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(p)
    return p


def delete_participant(
    db: Session, *, account: Account, participant_id: str
) -> None:
    p = get_participant(db, account=account, participant_id=participant_id)
    db.delete(p)
    db.commit()


# ============================================================================
# Shoot queue — mark / reset shot status
# ============================================================================

def mark_shot(
    db: Session, *, account: Account, participant_id: str
) -> Participant:
    """Mark a participant as photographed. Idempotent — repeat calls just
    refresh the timestamp.

    Also advances the parent job's status to 'in_progress' on the first shot.
    """
    p = get_participant(db, account=account, participant_id=participant_id)
    p.shot_at = datetime.now(timezone.utc)

    # First shot of a job → it's officially "in_progress" now.
    job = db.get(Job, p.job_id)
    if job is not None:
        job_service.maybe_advance_status(job, "in_progress")

    db.commit()
    db.refresh(p)
    return p


def reset_shot(
    db: Session, *, account: Account, participant_id: str
) -> Participant:
    """Send a participant back to the pending queue. Used when the photographer
    wants to re-shoot someone."""
    p = get_participant(db, account=account, participant_id=participant_id)
    p.shot_at = None
    db.commit()
    db.refresh(p)
    return p


# ============================================================================
# CSV import
# ============================================================================

_DELIMITER_CANDIDATES = (",", ";", "\t", "|")


def _preprocess_csv(csv_text: str) -> str:
    """
    Make the parser tolerant of common real-world CSV quirks:
    - Strip BOM (utf-8-sig at decode time should catch this, but defense-in-depth)
    - Normalize CRLF / CR line endings to LF
    - Skip Excel-style 'sep=,' preamble
    - Skip leading blank lines
    """
    # Strip BOM
    if csv_text.startswith("﻿"):
        csv_text = csv_text[1:]
    # Normalize line endings
    csv_text = csv_text.replace("\r\n", "\n").replace("\r", "\n")
    lines = csv_text.split("\n")
    # Skip "sep=,", "sep=;", etc. that Excel sometimes adds
    while lines and lines[0].strip().lower().startswith("sep="):
        lines = lines[1:]
    # Skip leading blank lines
    while lines and not lines[0].strip():
        lines = lines[1:]
    return "\n".join(lines)


def _detect_delimiter(first_line: str) -> str:
    """
    Pick the most likely CSV delimiter from the header line.

    Comma is the default. Semicolon is what European/German Excel uses (the
    comma is reserved for decimals there). Tab is what spreadsheet
    copy-paste produces.
    """
    counts = {d: first_line.count(d) for d in _DELIMITER_CANDIDATES}
    best, best_count = max(counts.items(), key=lambda kv: kv[1])
    return best if best_count > 0 else ","


def import_csv(
    db: Session,
    *,
    account: Account,
    job_id: str,
    csv_text: str,
) -> dict:
    """
    Bulk-import participants from CSV. Recognized columns: name, email, title.
    Header row required. Each row is validated via the ParticipantCreate
    Pydantic schema, so all the same rules as manual create apply (StrictEmail,
    length limits, etc). Validation errors are collected per row, not fatal.
    Duplicate emails (within this job) are silently deduplicated.
    """
    job_service.get_job(db, account=account, job_id=job_id)

    csv_text = _preprocess_csv(csv_text)
    if not csv_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file is empty.",
        )

    # Auto-detect delimiter (comma / semicolon / tab / pipe) so Excel exports
    # from any locale work without the user having to convert manually.
    first_line = csv_text.split("\n", 1)[0]
    delimiter = _detect_delimiter(first_line)

    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delimiter)
    fieldnames_lower = [
        (f or "").lower().strip() for f in (reader.fieldnames or [])
    ]
    if "name" not in fieldnames_lower:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "CSV must include a 'name' column. Found: "
                + (", ".join(reader.fieldnames or []) or "no headers")
            ),
        )

    # Lower-case header lookup so Name/NAME/name all work
    def get(row: dict, key: str) -> str:
        for k, v in row.items():
            if k and k.lower().strip() == key:
                return (v or "").strip()
        return ""

    # Existing emails on this job — used to skip dupes
    existing_emails_lower: set[str] = {
        e.lower()
        for (e,) in db.execute(
            select(Participant.email).where(
                Participant.job_id == job_id,
                Participant.email.is_not(None),
            )
        )
        if e is not None
    }

    # Refetch the job so we can advance its status if anything imports cleanly.
    job = job_service.get_job(db, account=account, job_id=job_id)

    created = 0
    skipped_duplicates = 0
    errors: list[str] = []
    seen_in_batch: set[str] = set()

    for i, row in enumerate(reader, start=2):  # header is row 1
        # Skip fully-blank rows silently
        if not any((v or "").strip() for v in row.values()):
            continue

        name = get(row, "name")
        email = get(row, "email") or None
        title = get(row, "title") or None

        # Validate via the same Pydantic schema as manual create.
        try:
            validated = ParticipantCreate(name=name, email=email, title=title)
        except ValidationError as e:
            for err in e.errors():
                field = err["loc"][-1] if err["loc"] else "row"
                msg = err["msg"]
                errors.append(f"Row {i}: {field} — {msg}")
            continue

        # Dedupe by email (case-insensitive) — already in DB or earlier in this CSV
        if validated.email:
            el = validated.email.lower()
            if el in existing_emails_lower or el in seen_in_batch:
                skipped_duplicates += 1
                continue
            seen_in_batch.add(el)

        participant = Participant(
            id=new_id("part"),
            job_id=job_id,
            name=validated.name,
            email=validated.email,
            title=validated.title,
            gallery_token=generate_refresh_token(),
        )
        db.add(participant)
        created += 1

    if created > 0:
        job_service.maybe_advance_status(job, "open_for_signup")

    db.commit()
    return {
        "created": created,
        "skipped_duplicates": skipped_duplicates,
        "errors": errors,
    }


# ============================================================================
# Public (no auth) — for the signup form at /s/{slug}
# ============================================================================

def get_job_by_slug(db: Session, *, slug: str) -> Job:
    """Public-safe lookup by slug. 404 if not found OR if not accepting signups."""
    job = db.scalar(select(Job).where(Job.public_slug == slug))
    if job is None or job.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="This signup link is not active."
        )
    return job


def public_signup(
    db: Session,
    *,
    slug: str,
    name: str,
    email: str,
    title: str | None,
) -> tuple[Participant, bool]:
    """A participant signs themselves up via the public signup form.

    Returns (participant, created). `created` is False if the same email is
    already signed up — we treat repeated submits as idempotent so accidental
    double-clicks don't error, but the caller can show a different message
    if they want.
    """
    job = get_job_by_slug(db, slug=slug)

    existing = db.scalar(
        select(Participant).where(
            Participant.job_id == job.id,
            Participant.email == email,
        )
    )
    if existing is not None:
        return existing, False

    participant = Participant(
        id=new_id("part"),
        job_id=job.id,
        name=name.strip(),
        email=email,
        title=title.strip() if title else None,
        gallery_token=generate_refresh_token(),
        # Public signups always come through the consent checkbox (enforced
        # at the API layer) — record when.
        consented_at=datetime.now(timezone.utc),
    )
    db.add(participant)
    job_service.maybe_advance_status(job, "open_for_signup")
    db.commit()
    db.refresh(participant)
    return participant, True

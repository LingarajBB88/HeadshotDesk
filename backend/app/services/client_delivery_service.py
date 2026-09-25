"""
Handing the whole job to the client contact.

Some corporate clients do not want their staff emailed directly. HR takes
the full set and distributes it internally, or keeps a copy for the
intranet. This is that path: one link, everything on it, grouped by person.

Deliberately separate from gallery_service, which is built around one
participant and their download cap. None of that applies here. The client
commissioned the shoot, so there is no per-person limit to enforce and no
favourites to record. Mixing the two would mean threading "is this a client
or a participant" through every function in that file.

The access rules that do apply:

  - the job's delivery_mode must include the client. A photographer who
    never chose to hand photos to the employer must not have it happen
    because somebody found the dashboard link.
  - the job must actually have been delivered. Before that, the client
    seeing half-finished work is how you get asked about frames you were
    going to cull.
"""
from __future__ import annotations

import io
import zipfile

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import File, Job, Participant
from app.services import storage_service
from app.services.gallery_service import (
    _get_thumbnail_or_original_for_file,
    _safe_slug,
)


def resolve_job(db: Session, *, token: str) -> Job:
    """The job behind a client token, or 404.

    404 rather than 403 throughout: someone holding a wrong or revoked token
    should not learn whether it ever existed.
    """
    job = db.scalar(select(Job).where(Job.client_token == token))
    if job is None or job.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    return job


def assert_photos_shared(job: Job) -> None:
    """Whether this client is entitled to see the photos at all."""
    if job.delivery_mode not in ("client", "both"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    if job.status != "delivered":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )


def list_photos(db: Session, *, token: str) -> dict:
    """Every delivered photo on the job, grouped by the person in it."""
    job = resolve_job(db, token=token)
    assert_photos_shared(job)

    participants = list(
        db.scalars(
            select(Participant)
            .where(Participant.job_id == job.id)
            .order_by(Participant.name.asc())
        ).all()
    )
    files = list(
        db.scalars(
            select(File)
            .where(
                File.job_id == job.id,
                File.deleted_at.is_(None),
                File.variant == "original",
                File.participant_id.is_not(None),
            )
            .order_by(File.uploaded_at.asc())
        ).all()
    )

    by_participant: dict[str, list[File]] = {}
    for f in files:
        by_participant.setdefault(f.participant_id, []).append(f)

    people = []
    for p in participants:
        owned = by_participant.get(p.id, [])
        if not owned:
            # Someone who was never photographed is reported in the
            # attendance numbers, not here as an empty folder.
            continue
        people.append(
            {
                "name": p.name,
                # No email address. The client hired the photographer, not
                # the staff list, and the dashboard has never carried
                # personal data. Nor `notes`, which is the photographer's.
                "title": p.title,
                "photos": [
                    {
                        "id": f.id,
                        "filename": f.original_filename,
                        "thumbnail_url": (
                            f"{settings.base_url}/api/v1/public/client/"
                            f"{token}/photos/{f.id}/thumbnail"
                        ),
                        "download_url": (
                            f"{settings.base_url}/api/v1/public/client/"
                            f"{token}/photos/{f.id}/download"
                        ),
                    }
                    for f in owned
                ],
            }
        )

    return {
        "job_name": job.name,
        "client_name": job.client_name,
        "people": people,
        "photo_count": sum(len(p["photos"]) for p in people),
    }


def get_file(db: Session, *, token: str, file_id: str) -> File:
    """One file, checked against this token's job."""
    job = resolve_job(db, token=token)
    assert_photos_shared(job)
    f = db.get(File, file_id)
    # The job check is the point: a file id from another shoot must not be
    # readable just because this token is valid.
    if (
        f is None
        or f.job_id != job.id
        or f.deleted_at is not None
        or f.variant != "original"
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    return f


def read_photo(
    db: Session, *, token: str, file_id: str, thumbnail: bool
) -> tuple[bytes, str]:
    """Bytes for one photo, as a thumbnail or the full original."""
    f = get_file(db, token=token, file_id=file_id)
    target = _get_thumbnail_or_original_for_file(db, f=f) if thumbnail else f
    try:
        return storage_service.read(key=target.storage_key), (
            target.mime_type or "application/octet-stream"
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        ) from None


def build_zip(db: Session, *, token: str) -> tuple[bytes, str]:
    """The whole job as one archive, foldered by person.

    No cap accounting, unlike the participant zip: the client paid for the
    shoot. Folders rather than a flat list because a 200-person job is
    unusable otherwise.
    """
    job = resolve_job(db, token=token)
    assert_photos_shared(job)

    rows = db.execute(
        select(File, Participant)
        .join(Participant, Participant.id == File.participant_id)
        .where(
            File.job_id == job.id,
            File.deleted_at.is_(None),
            File.variant == "original",
        )
        .order_by(Participant.name.asc(), File.uploaded_at.asc())
    ).all()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No photos yet."
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        used: dict[str, int] = {}
        for f, p in rows:
            folder = _safe_slug(p.name, fallback="participant")
            name = f"{folder}/{f.original_filename}"
            # Two frames exported with the same filename would otherwise
            # silently overwrite each other inside the archive.
            if name in used:
                used[name] += 1
                stem, dot, ext = name.rpartition(".")
                name = (
                    f"{stem} ({used[name]}).{ext}"
                    if dot
                    else f"{name} ({used[name]})"
                )
            else:
                used[name] = 1
            zf.writestr(name, storage_service.read(key=f.storage_key))

    return buf.getvalue(), f"{_safe_slug(job.name, fallback='job')}-photos.zip"

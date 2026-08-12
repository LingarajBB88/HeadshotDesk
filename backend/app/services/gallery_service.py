"""
Public gallery (F5b.1) — service layer for /g/{token} participant access.

All callers are unauthenticated. Trust model: the token alone is the bearer
of access. Each function looks the participant up by token and 404s with a
generic message on miss (no info leak distinguishing "wrong token" from
"file not in this gallery").

Shared with admin via:
- storage_service.read() for raw bytes
- file_service.get_thumbnail_or_original_for_file() for variant pick
  (extracted from the photographer-side endpoint so both surfaces share
  the same thumbnail-vs-original fallback logic)
"""
from __future__ import annotations

import io
import re
import zipfile

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models import (
    File,
    Job,
    Participant,
    ParticipantDownload,
    ParticipantPick,
)
from app.services import storage_service


# ============================================================================
# Helpers
# ============================================================================

def _resolve_participant(db: Session, token: str) -> Participant:
    """Look up a participant by gallery token. 404 generically on miss so we
    don't leak whether the token is malformed vs. unknown."""
    if not token or len(token) < 16:
        # Cheap pre-check — tokens are 32+ chars. Reject obviously bogus values
        # without a DB hit. Same 404 status to avoid signal.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found."
        )
    p = db.scalar(select(Participant).where(Participant.gallery_token == token))
    if p is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found."
        )
    return p


def _resolve_file_for_participant(
    db: Session, *, participant: Participant, file_id: str
) -> File:
    """Look up a file and verify it belongs to this participant. Generic 404
    on any miss — prevents a participant from probing other participants'
    file_ids."""
    f = db.scalar(
        select(File).where(
            File.id == file_id,
            File.participant_id == participant.id,
            File.variant == "original",
            File.deleted_at.is_(None),
        )
    )
    if f is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found."
        )
    return f


def _get_thumbnail_or_original_for_file(db: Session, *, f: File) -> File:
    """Inline-fallback version of file_service.get_thumbnail_or_original
    that takes an already-resolved File (skipping the per-account scoping
    check, which isn't applicable on the public surface)."""
    thumb = db.scalar(
        select(File).where(
            File.source_file_id == f.id,
            File.variant == "thumbnail",
            File.deleted_at.is_(None),
        )
    )
    return thumb if thumb is not None else f


# ============================================================================
# Public API
# ============================================================================

def get_gallery(db: Session, *, token: str) -> dict:
    """Returns the gallery payload for /api/v1/public/gallery/{token}.

    Shape matches GalleryOut. Returns a plain dict so the API layer can
    Pydantic-validate it; keeps the service layer storage-agnostic.
    """
    participant = _resolve_participant(db, token)
    job = db.get(Job, participant.job_id)
    if job is None or job.archived_at is not None:
        # If the job is archived, treat the gallery as gone too. Same generic
        # 404 — don't tell the participant their photographer archived the job.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found."
        )

    files = list(
        db.scalars(
            select(File)
            .where(
                File.participant_id == participant.id,
                File.variant == "original",
                File.deleted_at.is_(None),
            )
            .order_by(File.uploaded_at.asc())
        ).all()
    )

    # Pull the set of file_ids this participant has already downloaded so the
    # frontend can render "Downloaded" badges + know which photos are free
    # to re-download even at cap.
    downloaded_ids: set[str] = {
        fid
        for (fid,) in db.execute(
            select(ParticipantDownload.file_id).where(
                ParticipantDownload.participant_id == participant.id
            )
        ).all()
    }

    # F5b.2: which photos this participant starred as favorites.
    picked_ids: set[str] = {
        fid
        for (fid,) in db.execute(
            select(ParticipantPick.file_id).where(
                ParticipantPick.participant_id == participant.id
            )
        ).all()
    }

    file_entries = [
        {
            "id": f.id,
            "original_filename": f.original_filename,
            "uploaded_at": f.uploaded_at,
            "is_downloaded": f.id in downloaded_ids,
            "is_picked": f.id in picked_ids,
        }
        for f in files
    ]

    # HSD-36: the client's logo makes the gallery feel like the client's
    # deliverable, not a tool's.
    client_logo_url = None
    if job.client_id:
        from app.models import Client
        from app.services import client_service

        client = db.get(Client, job.client_id)
        if client:
            client_logo_url = client_service.logo_url(client)

    return {
        "participant_name": participant.name,
        "job": {
            "name": job.name,
            "client_name": job.client_name,
            "shoot_date": job.shoot_date,
        },
        "files": file_entries,
        "download_cap": job.download_cap,
        "downloads_used": len(downloaded_ids),
        "client_logo_url": client_logo_url,
        # F5b.2: picks. 0 cap = unlimited; picks_enabled off hides the UI.
        "picks_enabled": job.picks_enabled,
        "pick_cap": job.pick_cap,
        "picks_used": len(picked_ids),
        # Who took these, and how to ask them for a reshoot. The gallery is
        # often the only page a participant ever sees.
        "studio": _studio_block(db, job),
    }


def _studio_block(db: Session, job) -> dict | None:  # type: ignore[no-untyped-def]
    """The photographer's public contact details, or None if unset."""
    from app.models import Account
    from app.schemas.studio import PublicStudioOut

    account = db.get(Account, job.account_id)
    if account is None:
        return None
    block = PublicStudioOut(
        name=account.name,
        website_url=account.website_url,
        contact_email=account.contact_email,
        contact_phone=account.contact_phone,
        links=account.links or [],
    ).model_dump()
    if not any(
        [
            block["website_url"],
            block["contact_email"],
            block["contact_phone"],
            block["links"],
        ]
    ):
        return None
    return block


# ============================================================================
# F5b.2 — favorites / picks
# ============================================================================

def set_pick(
    db: Session, *, token: str, file_id: str, picked: bool
) -> dict:
    """Star or un-star a photo. Idempotent: starring twice is a no-op, and
    un-starring something unpicked is fine. Enforces the per-job cap
    (pick_cap, 0 = unlimited) and refuses when picks are off for the job.

    Returns the fresh pick state so the UI can update without a refetch.
    """
    participant = _resolve_participant(db, token)
    job = db.get(Job, participant.job_id)
    if job is None or job.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found."
        )
    if not job.picks_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Picking favorites isn't enabled for this shoot.",
        )
    f = _resolve_file_for_participant(
        db, participant=participant, file_id=file_id
    )

    existing = db.scalar(
        select(ParticipantPick).where(
            ParticipantPick.participant_id == participant.id,
            ParticipantPick.file_id == f.id,
        )
    )

    if picked and existing is None:
        used = int(
            db.scalar(
                select(func.count())
                .select_from(ParticipantPick)
                .where(ParticipantPick.participant_id == participant.id)
            )
            or 0
        )
        if job.pick_cap and used >= job.pick_cap:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"You can pick {job.pick_cap} photo"
                    f"{'' if job.pick_cap == 1 else 's'}. "
                    "Unpick one to choose another."
                ),
            )
        db.add(
            ParticipantPick(
                id=new_id("pick"), participant_id=participant.id, file_id=f.id
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # Double-click race: the row already exists, which is the
            # desired end state.
            db.rollback()
    elif not picked and existing is not None:
        db.delete(existing)
        db.commit()

    picked_ids = [
        fid
        for (fid,) in db.execute(
            select(ParticipantPick.file_id).where(
                ParticipantPick.participant_id == participant.id
            )
        ).all()
    ]
    return {
        "picked_file_ids": picked_ids,
        "picks_used": len(picked_ids),
        "pick_cap": job.pick_cap,
    }


def get_thumbnail_for_gallery(
    db: Session, *, token: str, file_id: str
) -> tuple[bytes, str]:
    """Stream a thumbnail for a participant viewing their gallery.

    Falls back to original if no thumbnail variant exists (legacy uploads).
    Returns (bytes, mime_type).
    """
    participant = _resolve_participant(db, token)
    original = _resolve_file_for_participant(
        db, participant=participant, file_id=file_id
    )
    target = _get_thumbnail_or_original_for_file(db, f=original)
    content = storage_service.read(key=target.storage_key)
    return content, target.mime_type


def download_file_for_gallery(
    db: Session, *, token: str, file_id: str
) -> tuple[bytes, str, str]:
    """Stream the full-res file for a participant download.

    Enforces the per-job download_cap on UNIQUE photos. Re-downloading a
    photo the participant has already claimed is free (idempotent at the
    UNIQUE(participant_id, file_id) DB constraint level).

    Returns (bytes, mime_type, original_filename). 403 if at cap and this
    is a new photo. 404 if the file doesn't belong to this participant.
    """
    participant = _resolve_participant(db, token)
    f = _resolve_file_for_participant(
        db, participant=participant, file_id=file_id
    )

    # Has this participant already downloaded this specific file?
    already = db.scalar(
        select(ParticipantDownload).where(
            ParticipantDownload.participant_id == participant.id,
            ParticipantDownload.file_id == f.id,
        )
    )

    if already is None:
        # New download. Enforce the cap.
        job = db.get(Job, participant.job_id)
        if job is None:
            # Defensive — should be impossible if participant exists.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found."
            )

        used = db.scalar(
            select(func.count(ParticipantDownload.id)).where(
                ParticipantDownload.participant_id == participant.id
            )
        ) or 0

        if used >= job.download_cap:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"You've reached your download limit ({job.download_cap} "
                    f"photo{'s' if job.download_cap != 1 else ''}). "
                    "Contact the photographer if you'd like more."
                ),
            )

        record = ParticipantDownload(
            id=new_id("pdl"),
            participant_id=participant.id,
            file_id=f.id,
        )
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            # Double-click race: another request inserted the same row first.
            # Treat as already-downloaded (free) and proceed to stream.
            db.rollback()

    content = storage_service.read(key=f.storage_key)
    return content, f.mime_type, f.original_filename


# ============================================================================
# Bulk download (.zip)
# ============================================================================

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_slug(value: str, *, fallback: str) -> str:
    """Collapse anything that isn't filename-safe to a single dash, trim
    leading/trailing dashes. Used to build the .zip filename — we want
    Job + participant in the name but can't trust either is filesystem-safe.
    """
    slug = _SAFE_NAME_RE.sub("-", value).strip("-")
    return slug or fallback


def download_zip_for_gallery(
    db: Session, *, token: str, file_ids: list[str]
) -> tuple[bytes, str]:
    """Build a .zip of the requested photos for this participant.

    Cap accounting:
    - Files already claimed by this participant are free re-downloads.
    - For files NOT yet claimed, the count must fit in the remaining cap.
      If it doesn't, returns 403 with no files written — atomic by design,
      we don't want a partial commit that uses up some of the cap.

    Filename collisions inside the zip are resolved by appending " (2)",
    " (3)", etc. before the extension. F5e dedup makes this rare but not
    impossible if two participants ended up sharing a row.

    Returns (zip_bytes, suggested_filename).
    """
    participant = _resolve_participant(db, token)

    job = db.get(Job, participant.job_id)
    if job is None or job.archived_at is not None:
        # Match get_gallery's behavior — archived job = no gallery.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Gallery not found."
        )

    # De-duplicate while preserving order (a participant might submit the
    # same file_id twice if their UI hiccuped).
    seen: set[str] = set()
    ordered_ids: list[str] = []
    for fid in file_ids:
        if fid not in seen:
            seen.add(fid)
            ordered_ids.append(fid)

    # Resolve all files in a single query, then verify each ID was found and
    # belongs to this participant. Generic 404 on any miss — prevents file_id
    # probing across participants.
    files = list(
        db.scalars(
            select(File).where(
                File.id.in_(ordered_ids),
                File.participant_id == participant.id,
                File.variant == "original",
                File.deleted_at.is_(None),
            )
        ).all()
    )
    found_by_id = {f.id: f for f in files}
    if len(found_by_id) != len(ordered_ids):
        # At least one ID was missing/foreign. Don't tell them which.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found."
        )

    # Which of these has this participant already claimed?
    claimed_ids: set[str] = {
        fid
        for (fid,) in db.execute(
            select(ParticipantDownload.file_id).where(
                ParticipantDownload.participant_id == participant.id,
                ParticipantDownload.file_id.in_(ordered_ids),
            )
        ).all()
    }
    new_files = [f for f in files if f.id not in claimed_ids]

    # Cap check on NEW files only — re-downloads are free.
    if new_files:
        used = db.scalar(
            select(func.count(ParticipantDownload.id)).where(
                ParticipantDownload.participant_id == participant.id
            )
        ) or 0
        remaining = job.download_cap - used
        if len(new_files) > remaining:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"This batch needs {len(new_files)} new download"
                    f"{'s' if len(new_files) != 1 else ''}, but you only have "
                    f"{max(remaining, 0)} left. Pick fewer photos or contact "
                    "the photographer."
                ),
            )

        # Record each new download. Per-row IntegrityError tolerated — means
        # this participant raced themselves; treat as already-claimed and
        # keep going.
        for f in new_files:
            db.add(
                ParticipantDownload(
                    id=new_id("pdl"),
                    participant_id=participant.id,
                    file_id=f.id,
                )
            )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # Rare race — re-read state and continue. Don't 500 the request;
            # the participant is entitled to the files either way.

    # Build the zip in memory. ZIP_DEFLATED is fine for JPEGs (most will be
    # close to non-compressible, but ZIP_STORED skips the CRC pass and saves
    # nothing meaningful — sticking with the default of DEFLATED keeps
    # behavior consistent for non-image MIME types in case we extend later).
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        used_names: dict[str, int] = {}
        for f in files:
            name = f.original_filename
            # Disambiguate duplicates within the zip.
            if name in used_names:
                used_names[name] += 1
                stem, dot, ext = name.rpartition(".")
                suffix = f" ({used_names[name]})"
                name = (
                    f"{stem}{suffix}.{ext}" if dot else f"{name}{suffix}"
                )
            else:
                used_names[name] = 1
            zf.writestr(name, storage_service.read(key=f.storage_key))

    job_slug = _safe_slug(job.name, fallback="job")
    participant_slug = _safe_slug(participant.name, fallback="photos")
    zip_filename = f"{job_slug}-{participant_slug}.zip"

    return buf.getvalue(), zip_filename

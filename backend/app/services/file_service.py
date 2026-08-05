"""
File business logic — upload, list, delete, and the magic of matching files
back to participants by filename.
"""
from __future__ import annotations

import hashlib
import io
import logging
import re
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models import Account, File, Participant
from app.services import job_service, storage_service

logger = logging.getLogger(__name__)

# Supported upload mime types (gallery-bound JPEG/PNG, plus HEIC for iPhone exports).
_ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
_MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB ceiling per file for v0.1

# Thumbnail target — generated synchronously on upload so the UI can render
# fast (single-digit KB instead of multi-MB originals).
_THUMBNAIL_SIZE = (400, 400)
_THUMBNAIL_QUALITY = 80


# ============================================================================
# Filename → participant matching
# ============================================================================

def _normalize_for_match(s: str) -> str:
    """Reduce a string to a comparable form: lowercase, no punctuation, single spaces."""
    # Replace separators with spaces, drop everything else non-alphanumeric.
    s = re.sub(r"[_\-]+", " ", s)
    s = re.sub(r"[^a-zA-Z0-9 ]+", "", s)
    return " ".join(s.split()).lower()


def _strip_index_suffix(stem: str) -> str:
    """Remove trailing index numbers a la 'Jane_Doe_001' → 'Jane_Doe'.

    Only strips when a separator precedes the digits, so a name that
    genuinely ends in a number keeps it. Counters glued directly to the
    name ('Jane Doe0042') are handled by the substring rule in
    match_filename_to_participant instead.
    """
    return re.sub(r"[\s_\-]\d+$", "", stem)


def match_filename_to_participant(
    filename: str, participants: list[Participant]
) -> Participant | None:
    """
    Try to match a file to a participant by name.

    Strategy (most specific to most permissive):
      1. Exact normalized match
      2. Token-set match: every word of the participant's name appears in the
         filename. Order doesn't matter, so 'Doe_Jane.jpg' still matches
         'Jane Doe'. Requires the participant to have at least 2 name tokens
         so that a single-token participant ("Test") doesn't grab unrelated
         files ("Sangeetha Test.jpg").

    Returns None if no match.
    """
    stem = Path(filename).stem
    stem = _strip_index_suffix(stem)
    file_norm = _normalize_for_match(stem)
    if not file_norm:
        return None
    file_tokens = set(file_norm.split())

    # 1. Exact match wins
    for p in participants:
        if _normalize_for_match(p.name) == file_norm:
            return p

    # 2. Token-set: all of the participant's name tokens must appear in the file.
    # Minimum-specificity guard: require ≥2 participant tokens. Without this,
    # a participant named "Test" would match "Sangeetha Test.jpg" — the first
    # name "Sangeetha" gets ignored and the file is silently assigned to the
    # wrong person. Single-token participants ("Madonna") can still match via
    # the exact-match rule above; they just have to name the file exactly.
    best: Participant | None = None
    best_token_count = 0
    for p in participants:
        p_tokens = set(_normalize_for_match(p.name).split())
        if len(p_tokens) < 2:
            continue
        if p_tokens.issubset(file_tokens):
            # Prefer the participant with the most tokens matched (most specific)
            if len(p_tokens) > best_token_count:
                best = p
                best_token_count = len(p_tokens)
    if best is not None:
        return best

    # 3. Substring: the full name appears in the filename with no separator
    # before the counter — "Antonella Di Santi9223.jpg". Capture One writes
    # this when the naming format is clipboard + counter with nothing
    # between them, which is the default people land on. Still requires ≥2
    # name tokens, and the longest matching name wins so "Jane Doe" can't
    # beat "Jane Doerr" on a Doerr file.
    best_len = 0
    for p in participants:
        p_norm = _normalize_for_match(p.name)
        if len(p_norm.split()) < 2:
            continue
        if p_norm in file_norm and len(p_norm) > best_len:
            best = p
            best_len = len(p_norm)
    return best


# ============================================================================
# Upload
# ============================================================================

def _read_image_dimensions(content: bytes) -> tuple[int | None, int | None]:
    """Return (width, height) if Pillow can read it, else (None, None)."""
    try:
        with Image.open(io.BytesIO(content)) as img:
            return img.width, img.height
    except (UnidentifiedImageError, Exception):  # noqa: BLE001
        return None, None


def _generate_thumbnail(content: bytes) -> tuple[bytes, int, int] | None:
    """
    Generate a JPEG thumbnail at max _THUMBNAIL_SIZE (aspect ratio preserved).
    Returns (bytes, width, height) or None if Pillow couldn't read the source.
    """
    try:
        with Image.open(io.BytesIO(content)) as img:
            # Normalize colorspace — JPEG can't hold alpha, palette, etc.
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGB")
            elif img.mode != "RGB":
                img = img.convert("RGB")
            img.thumbnail(_THUMBNAIL_SIZE)
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=_THUMBNAIL_QUALITY, optimize=True)
            return out.getvalue(), img.width, img.height
    except (UnidentifiedImageError, Exception):  # noqa: BLE001
        return None


async def upload_files(
    db: Session,
    *,
    account: Account,
    job_id: str,
    upload_files: list[UploadFile],
) -> dict:
    """
    Upload multiple files to a job. Each file is:
      - validated (mime type, size)
      - matched against the job's participants by filename
      - written to storage at <job_id>/<file_id><ext>
      - persisted as a File row

    Returns a summary: { uploaded: [FileOut...], skipped: [filename...],
                         matched: int, unmatched: int }
    """
    job = job_service.get_job(db, account=account, job_id=job_id)

    participants = list(
        db.scalars(select(Participant).where(Participant.job_id == job.id)).all()
    )

    uploaded: list[File] = []
    skipped: list[str] = []
    matched_count = 0
    duplicates: list[File] = []  # existing files we returned instead of creating new ones

    for uf in upload_files:
        filename = uf.filename or "upload"

        if uf.content_type not in _ALLOWED_MIME:
            skipped.append(f"{filename} (unsupported type {uf.content_type})")
            continue

        content = await uf.read()
        if len(content) > _MAX_FILE_SIZE:
            skipped.append(f"{filename} (too large)")
            continue
        if len(content) == 0:
            skipped.append(f"{filename} (empty)")
            continue

        # Content-based dedup. SHA-256 is fast (~50ms per 10MB) and gives us
        # zero-collision duplicate detection — if a file with this exact
        # content already exists for the job, we return the existing record
        # rather than creating a new row.
        sha = hashlib.sha256(content).hexdigest()
        existing = db.scalar(
            select(File).where(
                File.job_id == job.id,
                File.variant == "original",
                File.deleted_at.is_(None),
                File.content_sha256 == sha,
            )
        )
        if existing is not None:
            # If the incoming filename is different from what we have on
            # record, consider this a rename and re-run participant matching.
            #
            # But: when the photographer has Cmd-D'd a file in Finder, the
            # folder ends up with several different filenames pointing to
            # the same bytes (e.g., "Jane Doe.jpg" + "Jane Doe copy 4.jpg").
            # All of them dedup to the same row, and we'd otherwise flip-flop
            # the display name on every poll. Rule: don't overwrite a
            # participant-matched name with one that doesn't match. The
            # participant-bearing name "wins" and stays sticky.
            if filename and existing.original_filename != filename:
                new_match = match_filename_to_participant(filename, participants)
                should_overwrite = (
                    new_match is not None  # new name matches a participant
                    or existing.participant_id is None  # existing row is unassigned anyway
                )
                if should_overwrite:
                    new_pid = new_match.id if new_match else None
                    existing.original_filename = filename
                    existing.participant_id = new_pid
                    # Keep variant rows (thumbnail, etc.) in sync — they
                    # carry the same display name and participant_id.
                    for v in db.scalars(
                        select(File).where(File.source_file_id == existing.id)
                    ).all():
                        v.original_filename = filename
                        v.participant_id = new_pid
            duplicates.append(existing)
            if existing.participant_id is not None:
                matched_count += 1
            continue

        width, height = _read_image_dimensions(content)
        ext = Path(filename).suffix.lower() or ""

        file_id = new_id("file")
        storage_key = f"{job.id}/{file_id}{ext}"

        try:
            storage_service.save(
                key=storage_key, content=content, content_type=uf.content_type
            )
        except Exception as exc:  # noqa: BLE001
            # Log with traceback: this used to fail silently, so a broken
            # storage config looked like "photos uploaded but nothing
            # appeared" with nothing in the logs (live shoot, 2026-07-27).
            logger.exception(
                "Storage write failed for %s (job=%s, key=%s)",
                filename,
                job.id,
                storage_key,
            )
            skipped.append(f"{filename} (storage write failed: {exc})")
            continue

        match = match_filename_to_participant(filename, participants)
        if match is not None:
            matched_count += 1

        f = File(
            id=file_id,
            job_id=job.id,
            participant_id=match.id if match else None,
            original_filename=filename,
            storage_key=storage_key,
            width=width,
            height=height,
            size_bytes=len(content),
            mime_type=uf.content_type,
            variant="original",
            content_sha256=sha,
        )
        db.add(f)
        uploaded.append(f)

        # Generate a small JPEG thumbnail synchronously so the UI never has to
        # render the full original. Failure here is non-fatal — the thumbnail
        # endpoint falls back to the original if no variant exists.
        thumb = _generate_thumbnail(content)
        if thumb is not None:
            thumb_bytes, thumb_w, thumb_h = thumb
            thumb_id = new_id("file")
            thumb_key = f"{job.id}/{thumb_id}.thumb.jpg"
            try:
                storage_service.save(
                    key=thumb_key, content=thumb_bytes, content_type="image/jpeg"
                )
                db.add(
                    File(
                        id=thumb_id,
                        job_id=job.id,
                        participant_id=match.id if match else None,
                        original_filename=filename,  # share the display name
                        storage_key=thumb_key,
                        width=thumb_w,
                        height=thumb_h,
                        size_bytes=len(thumb_bytes),
                        mime_type="image/jpeg",
                        variant="thumbnail",
                        source_file_id=file_id,
                    )
                )
            except Exception:  # noqa: BLE001
                # Storage write for the thumbnail failed — the original is fine;
                # just skip the thumbnail.
                pass

    db.commit()
    for f in uploaded:
        db.refresh(f)

    # Return both newly-uploaded files AND the deduplicated existing ones so
    # the watcher can record fingerprint→file_id for the dedup'd ones too
    # (otherwise it'd keep "uploading" them every time it sees them).
    combined = uploaded + duplicates
    return {
        "uploaded": combined,
        "skipped": skipped,
        "matched": matched_count,
        "unmatched": len(combined) - matched_count,
        # Count of incoming files whose content already existed in the job
        # (Finder copy-paste, Cmd-D, re-export of the same shot). The UI
        # surfaces this as a "N duplicates merged with existing photos"
        # notice so the photographer knows the paste was absorbed, not
        # silently dropped.
        "duplicates": len(duplicates),
    }


# ============================================================================
# Read / list / delete
# ============================================================================

def list_files(
    db: Session, *, account: Account, job_id: str
) -> tuple[list[File], int, int, int]:
    """List the photographer-visible files for a job. Hides thumbnails and
    other derived variants — those are implementation detail."""
    job_service.get_job(db, account=account, job_id=job_id)
    items = list(
        db.scalars(
            select(File)
            .where(
                File.job_id == job_id,
                File.deleted_at.is_(None),
                File.variant == "original",
            )
            .order_by(File.uploaded_at.desc())
        ).all()
    )
    # F5b.2: mark the photos participants starred, so the photographer sees
    # exactly what to retouch. Transient attribute, same pattern as the
    # participant counts.
    from app.models import ParticipantPick

    picked_file_ids = {
        fid
        for (fid,) in db.execute(
            select(ParticipantPick.file_id).where(
                ParticipantPick.file_id.in_([f.id for f in items])
            )
        ).all()
    } if items else set()
    for f in items:
        f.picked_by_participant = f.id in picked_file_ids  # type: ignore[attr-defined]

    total = len(items)
    matched = sum(1 for f in items if f.participant_id is not None)
    unmatched = total - matched
    return items, total, matched, unmatched


def get_file(db: Session, *, account: Account, file_id: str) -> File:
    f = db.get(File, file_id)
    if f is None or f.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found."
        )
    # Verify the parent job belongs to the current account.
    job_service.get_job(db, account=account, job_id=f.job_id)
    return f


def read_file_bytes(db: Session, *, account: Account, file_id: str) -> tuple[bytes, str]:
    f = get_file(db, account=account, file_id=file_id)
    return storage_service.read(key=f.storage_key), f.mime_type


def delete_file(db: Session, *, account: Account, file_id: str) -> None:
    """Hard-delete the row + remove the original AND its variants (thumbnail
    etc.) from storage. ON DELETE CASCADE handles the variant rows; we have
    to handle the storage files ourselves."""
    f = get_file(db, account=account, file_id=file_id)
    # Find variants pointing at this file (thumbnails, web-size, etc.) before
    # the cascade wipes their DB rows.
    variants = list(
        db.scalars(select(File).where(File.source_file_id == f.id)).all()
    )
    for v in variants:
        storage_service.delete(key=v.storage_key)
    storage_service.delete(key=f.storage_key)
    db.delete(f)
    db.commit()


def bulk_delete_files(
    db: Session, *, account: Account, job_id: str, file_ids: list[str]
) -> dict:
    """Delete many files from a job in one round-trip.

    Returns {deleted: int, not_found: [...]}. IDs that don't belong to the
    job (or are already deleted, or simply don't exist) are listed under
    not_found rather than raising — the UI is expected to confirm before
    calling this, and a partial success is more useful than a 404 abort.
    """
    # Scope: verify the job belongs to the caller's account up front. After
    # this, we trust the file rows we fetch with job_id == job.id.
    job = job_service.get_job(db, account=account, job_id=job_id)

    if not file_ids:
        return {"deleted": 0, "not_found": []}

    # Only consider originals — variants (thumbnails) are cascade-deleted
    # along with their parent and shouldn't be addressable directly here.
    files = list(
        db.scalars(
            select(File).where(
                File.id.in_(file_ids),
                File.job_id == job.id,
                File.deleted_at.is_(None),
                File.variant == "original",
            )
        ).all()
    )
    found_ids = {f.id for f in files}
    not_found = [fid for fid in file_ids if fid not in found_ids]

    for f in files:
        # Variants need their storage keys cleared before the DB cascade
        # wipes the rows we'd otherwise read them from.
        variants = list(
            db.scalars(select(File).where(File.source_file_id == f.id)).all()
        )
        for v in variants:
            storage_service.delete(key=v.storage_key)
        storage_service.delete(key=f.storage_key)
        db.delete(f)

    db.commit()
    return {"deleted": len(files), "not_found": not_found}


def get_thumbnail_or_original(
    db: Session, *, account: Account, file_id: str
) -> File:
    """For the thumbnail endpoint: prefer the thumbnail variant; fall back to
    the original if no thumbnail exists yet (e.g., files uploaded before this
    feature shipped)."""
    f = get_file(db, account=account, file_id=file_id)
    thumb = db.scalar(
        select(File).where(
            File.source_file_id == f.id,
            File.variant == "thumbnail",
            File.deleted_at.is_(None),
        )
    )
    return thumb if thumb is not None else f


def assign_to_participant(
    db: Session, *, account: Account, file_id: str, participant_id: str | None
) -> File:
    """Manual override — re-assign a file to a different participant (or none)."""
    f = get_file(db, account=account, file_id=file_id)
    if participant_id is not None:
        # Sanity check — must belong to the same job
        target = db.get(Participant, participant_id)
        if target is None or target.job_id != f.job_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Participant is not on this job.",
            )
    f.participant_id = participant_id
    db.commit()
    db.refresh(f)
    return f


def rename(
    db: Session, *, account: Account, file_id: str, new_filename: str
) -> File:
    """Rename a file's display name (original_filename) and re-run the
    participant-matching logic against the new name. Used by the folder
    watcher when a photographer renames the underlying file in Finder.

    Sticky-name rule: if the existing row is already assigned to a
    participant, only accept the rename when the new name also matches a
    participant. This prevents Cmd-D'd duplicates from clobbering the
    participant-matched name with a stray "copy 4.jpg" sibling.
    """
    new_filename = (new_filename or "").strip()
    if not new_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename cannot be empty.",
        )
    f = get_file(db, account=account, file_id=file_id)

    participants = list(
        db.scalars(select(Participant).where(Participant.job_id == f.job_id)).all()
    )
    match = match_filename_to_participant(new_filename, participants)

    if f.participant_id is not None and match is None:
        # Row is already assigned and the incoming name wouldn't match
        # anyone — most likely a Cmd-D'd duplicate of an already-matched
        # file. Leave the existing assignment alone.
        return f

    f.original_filename = new_filename
    f.participant_id = match.id if match else None

    db.commit()
    db.refresh(f)
    return f

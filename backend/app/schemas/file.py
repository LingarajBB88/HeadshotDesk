"""Pydantic schemas for the files API."""
from datetime import datetime

from pydantic import BaseModel


class FileOut(BaseModel):
    id: str
    job_id: str
    participant_id: str | None
    original_filename: str
    width: int | None
    height: int | None
    size_bytes: int
    mime_type: str
    variant: str
    is_favorite: bool
    is_selected: bool
    # F5b.2: the participant starred this photo in their gallery — the
    # photographer's cue for what to retouch. Only populated by list_files.
    picked_by_participant: bool = False
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class FileList(BaseModel):
    items: list[FileOut]
    total: int
    matched: int          # how many were auto-matched to a participant
    unmatched: int        # how many couldn't be matched by filename


class FileUploadResult(BaseModel):
    """Returned from a multi-file upload."""
    uploaded: list[FileOut]
    skipped: list[str]    # filenames we rejected (wrong type, too big, etc.)
    matched: int
    unmatched: int
    duplicates: int = 0   # how many incoming files content-deduped to an existing row

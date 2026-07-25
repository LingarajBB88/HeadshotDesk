"""Pydantic schemas for the public participant gallery (/g/{token})."""
from datetime import date, datetime

from pydantic import BaseModel, Field


class GalleryFileOut(BaseModel):
    """A single photo as shown in the participant's gallery.

    Slim by design — no width/height/size to avoid leaking metadata to the
    public surface and to keep payloads small. Frontend builds image URLs
    from the id + token.
    """

    id: str
    original_filename: str
    uploaded_at: datetime
    is_downloaded: bool  # whether this participant has already downloaded this file
    is_picked: bool = False  # F5b.2: starred as a favorite

    model_config = {"from_attributes": True}


class GalleryJobOut(BaseModel):
    """Slim job info for the gallery header."""

    name: str
    client_name: str | None
    shoot_date: date | None


class GalleryOut(BaseModel):
    """Full payload for GET /api/v1/public/gallery/{token}."""

    participant_name: str
    job: GalleryJobOut
    files: list[GalleryFileOut]
    download_cap: int        # per-job cap set by photographer
    downloads_used: int      # unique photos this participant has downloaded
    # HSD-36: client branding on the gallery header, when the job's client
    # has a logo.
    client_logo_url: str | None = None
    # F5b.2: favorites. picks_enabled off hides the UI entirely;
    # pick_cap 0 means unlimited.
    picks_enabled: bool = False
    pick_cap: int = 1
    picks_used: int = 0


class GalleryPickRequest(BaseModel):
    """Body for POST /api/v1/public/gallery/{token}/files/{file_id}/pick."""

    picked: bool


class GalleryPickResult(BaseModel):
    picked_file_ids: list[str]
    picks_used: int
    pick_cap: int


class GalleryZipRequest(BaseModel):
    """Body for POST /api/v1/public/gallery/{token}/files/zip.

    file_ids must reference photos in this participant's gallery. The endpoint
    enforces the per-job cap on the count of NEW (unclaimed) files in the
    batch; already-claimed files in the same batch are re-downloads (free).
    """

    file_ids: list[str] = Field(..., min_length=1, max_length=500)

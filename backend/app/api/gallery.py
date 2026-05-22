"""
Public gallery API — no auth. Mounted at /api/v1/public/gallery.

Frontend pairs with the Next.js page at /g/{token}. The token IS the auth;
there is no JWT involved on this surface.
"""
import io as _io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.gallery import GalleryOut, GalleryZipRequest
from app.services import gallery_service

router = APIRouter()


@router.get("/{token}", response_model=GalleryOut)
def get_gallery(token: str, db: Session = Depends(get_db)) -> GalleryOut:
    payload = gallery_service.get_gallery(db, token=token)
    return GalleryOut.model_validate(payload)


@router.get("/{token}/files/{file_id}/thumbnail")
def thumbnail(token: str, file_id: str, db: Session = Depends(get_db)):
    content, mime = gallery_service.get_thumbnail_for_gallery(
        db, token=token, file_id=file_id
    )
    return StreamingResponse(
        _io.BytesIO(content),
        media_type=mime,
        # Public + immutable: same file id always returns the same bytes
        # (deleting a file creates a new id). Safe to cache at the edge for
        # a long time. Switch to 'public' once we're behind a CDN.
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


@router.post("/{token}/files/{file_id}/download")
def download(token: str, file_id: str, db: Session = Depends(get_db)):
    """Records the download (counts against the per-job cap unless this file
    is already claimed) and streams the full-res file.

    Why POST and not GET: the call has a side-effect — inserting a row into
    participant_downloads when this is the first claim of this file. GET
    should be idempotent in the cache-friendly sense; POST signals 'this
    changes state.' Frontend triggers via a form-or-fetch with Content-
    Disposition handling.
    """
    content, mime, filename = gallery_service.download_file_for_gallery(
        db, token=token, file_id=file_id
    )
    return StreamingResponse(
        _io.BytesIO(content),
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # No long-lived caching on the download endpoint — we want each
            # download to hit the server so the cap counter stays accurate.
            "Cache-Control": "no-store",
        },
    )


@router.post("/{token}/files/zip")
def download_zip(
    token: str,
    payload: GalleryZipRequest,
    db: Session = Depends(get_db),
):
    """Bulk download: ZIP up the requested files for this participant.

    Cap accounting is atomic — if the batch needs more new picks than the
    participant has remaining, the whole request 403s before any rows are
    written. Already-claimed files in the same batch are re-downloads (free).
    """
    content, zip_filename = gallery_service.download_zip_for_gallery(
        db, token=token, file_ids=payload.file_ids
    )
    return StreamingResponse(
        _io.BytesIO(content),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Cache-Control": "no-store",
        },
    )

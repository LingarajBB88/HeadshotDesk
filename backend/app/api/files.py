"""Files API — upload, list, download, delete, reassign."""
from fastapi import APIRouter, Depends, File as FileParam, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_account
from app.db import get_db
from app.models import Account
from app.schemas.file import FileList, FileOut, FileUploadResult
from app.services import file_service

router = APIRouter()


@router.post(
    "/jobs/{job_id}/files",
    response_model=FileUploadResult,
    status_code=status.HTTP_201_CREATED,
)
async def upload(
    job_id: str,
    files: list[UploadFile] = FileParam(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> FileUploadResult:
    """Multi-file upload. Files are matched to participants by filename."""
    result = await file_service.upload_files(
        db, account=account, job_id=job_id, upload_files=files
    )
    return FileUploadResult(
        uploaded=[FileOut.model_validate(f) for f in result["uploaded"]],
        skipped=result["skipped"],
        matched=result["matched"],
        unmatched=result["unmatched"],
        duplicates=result.get("duplicates", 0),
    )


@router.get("/jobs/{job_id}/files", response_model=FileList)
def list_for_job(
    job_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> FileList:
    items, total, matched, unmatched = file_service.list_files(
        db, account=account, job_id=job_id
    )
    return FileList(
        items=[FileOut.model_validate(f) for f in items],
        total=total,
        matched=matched,
        unmatched=unmatched,
    )


@router.get("/files/{file_id}/raw")
def download(
    file_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Stream the raw file (full original). Long cache — file content
    is immutable once uploaded; deletion creates a new file with new id."""
    content, mime = file_service.read_file_bytes(
        db, account=account, file_id=file_id
    )
    import io as _io

    return StreamingResponse(
        _io.BytesIO(content),
        media_type=mime,
        headers={"Cache-Control": "private, max-age=86400, immutable"},
    )


@router.get("/files/{file_id}/thumbnail")
def thumbnail(
    file_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Stream a small thumbnail (~30KB) for gallery list previews. Falls back
    to the full original if no thumbnail variant exists (e.g. legacy files)."""
    target = file_service.get_thumbnail_or_original(
        db, account=account, file_id=file_id
    )
    from app.services import storage_service as _storage

    content = _storage.read(key=target.storage_key)
    import io as _io

    return StreamingResponse(
        _io.BytesIO(content),
        media_type=target.mime_type,
        headers={"Cache-Control": "private, max-age=86400, immutable"},
    )


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    file_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> Response:
    file_service.delete_file(db, account=account, file_id=file_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/jobs/{job_id}/files/bulk-delete")
def bulk_delete(
    job_id: str,
    payload: dict,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict:
    """Delete multiple files from a job in one request.

    Body: { "file_ids": ["file_...", "file_..."] }
    Response: { "deleted": int, "not_found": ["file_..."] }
    """
    raw = payload.get("file_ids")
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="file_ids must be a list of strings",
        )
    return file_service.bulk_delete_files(
        db, account=account, job_id=job_id, file_ids=raw
    )


@router.patch("/files/{file_id}", response_model=FileOut)
def update(
    file_id: str,
    payload: dict,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> FileOut:
    """
    Update file metadata. Recognized fields:
      - participant_id (str | null): manually re-assign to a participant
      - original_filename (str): rename + re-run participant matching

    If both are provided, original_filename is applied first (which may itself
    change participant_id via auto-match), then participant_id overrides.
    """
    f = None
    if "original_filename" in payload:
        f = file_service.rename(
            db,
            account=account,
            file_id=file_id,
            new_filename=str(payload["original_filename"]),
        )
    if "participant_id" in payload:
        f = file_service.assign_to_participant(
            db,
            account=account,
            file_id=file_id,
            participant_id=payload["participant_id"],
        )
    if f is None:
        # No-op — just return current state
        f = file_service.get_file(db, account=account, file_id=file_id)
    return FileOut.model_validate(f)

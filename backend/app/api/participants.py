"""
Participants API — auth-required photographer-facing routes.

The public signup-form endpoints live separately in app/api/public.py.
"""
from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_account
from app.db import get_db
from app.models import Account
from app.schemas.participant import (
    CsvImportResult,
    ParticipantCreate,
    ParticipantList,
    ParticipantOut,
    ParticipantUpdate,
)
from app.services import participant_service, spreadsheet_service

router = APIRouter()


# Nested-under-job routes ---------------------------------------------------

@router.get("/jobs/{job_id}/participants", response_model=ParticipantList)
def list_for_job(
    job_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantList:
    items, total = participant_service.list_participants(
        db, account=account, job_id=job_id
    )
    return ParticipantList(
        items=[ParticipantOut.model_validate(p) for p in items],
        total=total,
    )


@router.post(
    "/jobs/{job_id}/participants",
    response_model=ParticipantOut,
    status_code=status.HTTP_201_CREATED,
)
def create_for_job(
    job_id: str,
    payload: ParticipantCreate,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantOut:
    p = participant_service.add_participant(
        db,
        account=account,
        job_id=job_id,
        name=payload.name,
        email=payload.email,
        title=payload.title,
    )
    return ParticipantOut.model_validate(p)


@router.post(
    "/jobs/{job_id}/participants/import",
    response_model=CsvImportResult,
)
async def import_csv_for_job(
    job_id: str,
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> CsvImportResult:
    raw = await file.read()
    # Accepts CSV, Excel and Numbers; everything is normalised to CSV text
    # before the importer sees it.
    text = spreadsheet_service.to_csv_text(file.filename or "", raw)

    result = participant_service.import_csv(
        db, account=account, job_id=job_id, csv_text=text
    )
    return CsvImportResult(**result)


# Direct routes -------------------------------------------------------------

@router.patch("/participants/{participant_id}", response_model=ParticipantOut)
def update(
    participant_id: str,
    payload: ParticipantUpdate,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantOut:
    p = participant_service.update_participant(
        db,
        account=account,
        participant_id=participant_id,
        fields=payload.model_dump(exclude_unset=True),
    )
    return ParticipantOut.model_validate(p)


@router.delete(
    "/participants/{participant_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete(
    participant_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> Response:
    participant_service.delete_participant(
        db, account=account, participant_id=participant_id
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Shoot queue ---------------------------------------------------------------

@router.post(
    "/participants/{participant_id}/mark-shot", response_model=ParticipantOut
)
def mark_shot(
    participant_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantOut:
    p = participant_service.mark_shot(
        db, account=account, participant_id=participant_id
    )
    return ParticipantOut.model_validate(p)


@router.post(
    "/participants/{participant_id}/reset-shot", response_model=ParticipantOut
)
def reset_shot(
    participant_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantOut:
    p = participant_service.reset_shot(
        db, account=account, participant_id=participant_id
    )
    return ParticipantOut.model_validate(p)


class NoShowRequest(BaseModel):
    no_show: bool = True


@router.post(
    "/participants/{participant_id}/no-show", response_model=ParticipantOut
)
def set_no_show(
    participant_id: str,
    payload: NoShowRequest | None = None,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantOut:
    """Flag someone who didn't turn up (or clear the flag)."""
    p = participant_service.set_no_show(
        db,
        account=account,
        participant_id=participant_id,
        no_show=payload.no_show if payload else True,
    )
    return ParticipantOut.model_validate(p)


@router.get("/jobs/{job_id}/attendance.csv")
def attendance_report(
    job_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Attendance report the photographer can forward to their client."""
    csv_text = participant_service.attendance_csv(
        db, account=account, job_id=job_id
    )
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="attendance.csv"',
        },
    )


# F5c — gallery delivery (per-participant resend) ---------------------------

@router.post(
    "/participants/{participant_id}/resend-gallery",
    response_model=ParticipantOut,
)
def resend_gallery(
    participant_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ParticipantOut:
    """Force-resend the gallery delivery email to one participant. Overrides
    the idempotent skip used by the bulk Deliver button. Useful when more
    photos have been uploaded for a participant after they were initially
    delivered."""
    p = participant_service.resend_gallery_email(
        db, account=account, participant_id=participant_id
    )
    return ParticipantOut.model_validate(p)

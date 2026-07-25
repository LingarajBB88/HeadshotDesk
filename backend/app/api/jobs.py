"""Jobs API routes — all auth-required, all account-scoped."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_current_user
from app.db import get_db
from app.models import Account, User
from app.schemas.job import (
    JobCreate,
    JobList,
    JobListItem,
    JobOut,
    JobUpdate,
)
from app.schemas.slots import BookSlotForParticipantRequest, ScheduleEntryOut, ScheduleOut
from app.services import job_service, participant_service, slot_service


class DeliveryResult(BaseModel):
    """Result of the F5c Deliver button — counts surfaced to the UI so the
    photographer sees how many emails actually went out."""
    sent: int
    skipped_already_delivered: int
    skipped_no_photos: int
    skipped_no_email: int
    errors: list[str]


class DeliverRequest(BaseModel):
    """Optional body for the Deliver endpoint. include_already_delivered=True
    bypasses the idempotent skip — the 'resend to all' checkbox in the
    Deliver modal."""
    include_already_delivered: bool = False

router = APIRouter()


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create(
    payload: JobCreate,
    user: User = Depends(get_current_user),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> JobOut:
    job = job_service.create_job(
        db,
        account=account,
        creator=user,
        name=payload.name,
        client_name=payload.client_name,
        client_email=payload.client_email,
        shoot_date=payload.shoot_date,
        location=payload.location,
        download_cap=payload.download_cap,
        shoot_mode=payload.shoot_mode,
    )
    return JobOut.model_validate(job)


@router.get("", response_model=JobList)
def list_(
    include_archived: bool = Query(default=False),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> JobList:
    items, total = job_service.list_jobs(
        db, account=account, include_archived=include_archived
    )
    return JobList(
        items=[JobListItem.model_validate(j) for j in items],
        total=total,
    )


@router.get("/{job_id}", response_model=JobOut)
def get(
    job_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> JobOut:
    job = job_service.get_job(db, account=account, job_id=job_id)
    return JobOut.model_validate(job)


@router.patch("/{job_id}", response_model=JobOut)
def update(
    job_id: str,
    payload: JobUpdate,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> JobOut:
    job = job_service.update_job(
        db,
        account=account,
        job_id=job_id,
        fields=payload.model_dump(exclude_unset=True),
    )
    return JobOut.model_validate(job)


@router.post("/{job_id}/archive", response_model=JobOut)
def archive(
    job_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> JobOut:
    job = job_service.archive_job(db, account=account, job_id=job_id)
    return JobOut.model_validate(job)


@router.post("/{job_id}/deliver", response_model=DeliveryResult)
def deliver(
    job_id: str,
    payload: DeliverRequest | None = None,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> DeliveryResult:
    """F5c — Bulk send the gallery delivery email to every eligible participant
    on this job. Idempotent by default: re-clicking only emails participants
    who weren't reached on the first pass. Pass include_already_delivered=true
    to resend to everyone with photos + email.
    """
    result = job_service.deliver_galleries(
        db,
        account=account,
        job_id=job_id,
        include_already_delivered=bool(
            payload and payload.include_already_delivered
        ),
    )
    return DeliveryResult(**result)


@router.get("/{job_id}/schedule", response_model=ScheduleOut)
def schedule(
    job_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ScheduleOut:
    """HSD-55 — chronological slot bookings for the shoot-day schedule view.
    Empty list for queue-mode jobs."""
    job = job_service.get_job(db, account=account, job_id=job_id)
    entries = slot_service.job_schedule(db, job=job)
    return ScheduleOut(entries=[ScheduleEntryOut(**e) for e in entries])


@router.post(
    "/{job_id}/participants/{participant_id}/book-slot",
    response_model=ScheduleEntryOut,
)
def book_slot_for_participant(
    job_id: str,
    participant_id: str,
    payload: BookSlotForParticipantRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ScheduleEntryOut:
    """HSD-55 — owner-side slot assignment. The photographer books (or moves)
    a time for a participant they added manually or via CSV. Same semantics
    as the public path: rebooking replaces, a taken slot returns 409."""
    job = job_service.get_job(db, account=account, job_id=job_id)
    participant = participant_service.get_participant(
        db, account=account, participant_id=participant_id
    )
    if participant.job_id != job.id:
        # Participant exists in the account but under a different job.
        raise HTTPException(status_code=404, detail="Participant not found.")
    booking = slot_service.book_slot_for_participant(
        db, job=job, participant=participant, slot_start=payload.slot_start
    )
    return ScheduleEntryOut(
        slot_start=booking.slot_start,
        slot_end=booking.slot_end,
        participant_id=participant.id,
        participant_name=participant.name,
        shot=participant.shot_at is not None,
    )


@router.delete(
    "/{job_id}/participants/{participant_id}/booking",
    status_code=status.HTTP_204_NO_CONTENT,
)
def cancel_participant_booking(
    job_id: str,
    participant_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> None:
    """HSD-55 — free a participant's slot; they stay signed up as a walk-in.
    Idempotent: deleting a non-existent booking is a quiet no-op."""
    job = job_service.get_job(db, account=account, job_id=job_id)
    participant = participant_service.get_participant(
        db, account=account, participant_id=participant_id
    )
    if participant.job_id != job.id:
        raise HTTPException(status_code=404, detail="Participant not found.")
    slot_service.cancel_participant_booking(db, job=job, participant=participant)

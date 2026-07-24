"""Jobs API routes — all auth-required, all account-scoped."""
from fastapi import APIRouter, Depends, Query, status
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
from app.schemas.slots import ScheduleEntryOut, ScheduleOut
from app.services import job_service, slot_service


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

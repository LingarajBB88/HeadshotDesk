"""Jobs API routes — all auth-required, all account-scoped."""
from fastapi import APIRouter, Depends, Query, status
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
from app.services import job_service

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

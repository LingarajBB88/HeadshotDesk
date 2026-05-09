"""
Public API — no auth required. Used by participants signing up via the
shareable signup link `/s/{slug}`.
"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.participant import (
    ParticipantOut,
    PublicJobOut,
    PublicParticipantSignup,
    PublicSignupResult,
)
from app.services import participant_service

router = APIRouter()


@router.get("/jobs/{slug}", response_model=PublicJobOut)
def get_job_for_signup(slug: str, db: Session = Depends(get_db)) -> PublicJobOut:
    """Slim view for the signup-form header (job name, date, location)."""
    job = participant_service.get_job_by_slug(db, slug=slug)
    return PublicJobOut(
        name=job.name,
        client_name=job.client_name,
        shoot_date=job.shoot_date,
        location=job.location,
        branding=None,  # Account-level branding wired up in v0.2
    )


@router.post(
    "/jobs/{slug}/signup",
    response_model=PublicSignupResult,
    status_code=status.HTTP_201_CREATED,
)
def signup(
    slug: str,
    payload: PublicParticipantSignup,
    db: Session = Depends(get_db),
) -> PublicSignupResult:
    p, created = participant_service.public_signup(
        db,
        slug=slug,
        name=payload.name,
        email=payload.email,
        title=payload.title,
    )
    return PublicSignupResult(
        participant=ParticipantOut.model_validate(p),
        created=created,
    )

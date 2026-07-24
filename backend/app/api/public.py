"""
Public API — no auth required. Used by participants signing up via the
shareable signup link `/s/{slug}`, and by the landing page's feature
request form.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.db import get_db
from app.models import FeatureRequest
from app.schemas.participant import (
    ParticipantOut,
    PublicJobOut,
    PublicParticipantSignup,
    PublicSignupResult,
)
from app.schemas.types import StrictEmail
from app.services import email_service, participant_service

logger = logging.getLogger(__name__)

router = APIRouter()


class FeatureRequestCreate(BaseModel):
    """Body for the public feature-request form on the landing page."""
    message: str = Field(min_length=10, max_length=2000)
    email: StrictEmail | None = None


@router.post("/feature-requests", status_code=status.HTTP_204_NO_CONTENT)
def submit_feature_request(
    payload: FeatureRequestCreate,
    db: Session = Depends(get_db),
) -> None:
    """Store a feature request and forward it to the team inbox. The email
    forward is best-effort: a mail hiccup must not lose the stored request
    or fail the submission."""
    fr = FeatureRequest(
        id=new_id("freq"),
        message=payload.message.strip(),
        email=payload.email,
    )
    db.add(fr)
    db.commit()
    try:
        email_service.send_feature_request_email(
            message=fr.message, reply_email=fr.email
        )
    except Exception:  # noqa: BLE001 — stored is what matters
        logger.exception("Feature request email forward failed (id=%s)", fr.id)


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
    # Compliance: explicit consent is required to process the participant's
    # data. The frontend blocks submission client-side; this is the server
    # backstop so a raw API call can't skip it.
    if not payload.consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the privacy terms to sign up.",
        )
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

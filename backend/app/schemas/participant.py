"""Pydantic request/response schemas for the participants API."""
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.types import StrictEmail


# --- Requests ---

class ParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: StrictEmail | None = None
    title: str | None = Field(default=None, max_length=200)


class ParticipantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: StrictEmail | None = None
    title: str | None = Field(default=None, max_length=200)


class CsvImportResult(BaseModel):
    """Reported back to the UI after a CSV upload."""
    created: int
    skipped_duplicates: int
    errors: list[str]  # row-level error messages, e.g. "Row 4: invalid email"


# --- Public (signup form) ---

class PublicJobOut(BaseModel):
    """The slim view a participant sees on the signup page."""
    name: str
    client_name: str | None
    shoot_date: date | None
    location: str | None
    branding: dict | None = None  # account branding overrides

    model_config = {"from_attributes": True}


class PublicParticipantSignup(BaseModel):
    """Body submitted by a participant on /s/{slug}."""
    name: str = Field(min_length=1, max_length=200)
    email: StrictEmail
    title: str | None = Field(default=None, max_length=200)


# --- Responses ---

class ParticipantOut(BaseModel):
    id: str
    job_id: str
    name: str
    email: EmailStr | None
    title: str | None
    shot_at: datetime | None
    photo_count: int = 0  # how many uploaded files are assigned to them
    # F5b.1: token for the public /g/{token} gallery URL. Exposed in this
    # schema so the photographer-facing UI can render a "Copy gallery link"
    # button. It's also returned in the public signup response (the
    # participant gets their own token) — that's an intentional, minor early
    # leak: the participant already has implicit access to their own gallery.
    gallery_token: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ParticipantList(BaseModel):
    items: list[ParticipantOut]
    total: int


class PublicSignupResult(BaseModel):
    """Response from POST /api/v1/public/jobs/{slug}/signup.

    `created` lets the UI distinguish between a fresh signup and an idempotent
    re-submission (same email already on the list). Both return 201/200 so the
    user always sees a success state.
    """
    participant: ParticipantOut
    created: bool

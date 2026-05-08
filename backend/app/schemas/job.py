"""Pydantic request/response schemas for the jobs API."""
from datetime import date, datetime, timezone
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.types import StrictEmail

JobStatus = Literal[
    "draft", "open_for_signup", "in_progress", "delivered", "archived"
]


def _validate_location(v: str | None) -> str | None:
    """Reject pure-digit / no-letter locations like '12345'. Real locations
    always include at least one letter (e.g. 'Office', '100 Main St', 'Studio A').

    Note: requiredness is enforced at the schema level (Field(min_length=...)),
    not here — this validator only fires when a value is actually provided.
    """
    if v is None:
        return v
    v = v.strip()
    if not v:
        # Treat all-whitespace as missing.
        return None
    if not any(c.isalpha() for c in v):
        raise ValueError("Location must contain at least one letter.")
    return v


def _validate_shoot_date_not_past(v: date) -> date:
    """Shoot date must be today or in the future for newly created jobs."""
    today = datetime.now(timezone.utc).date()
    if v < today:
        raise ValueError("Shoot date cannot be in the past.")
    return v


# --- Requests ---

class JobCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    client_name: str | None = Field(default=None, max_length=200)
    client_email: StrictEmail | None = None
    shoot_date: date  # Required at create time.
    location: str = Field(min_length=2, max_length=300)  # Required.

    _validate_location = field_validator("location")(_validate_location)
    _validate_date = field_validator("shoot_date")(_validate_shoot_date_not_past)


class JobUpdate(BaseModel):
    """All fields optional — only provided keys are updated.

    Note: we do NOT enforce shoot_date >= today on update, because a photographer
    might want to record what actually happened after the shoot. Past dates are
    rejected only at creation.
    """
    name: str | None = Field(default=None, min_length=1, max_length=200)
    client_name: str | None = Field(default=None, max_length=200)
    client_email: StrictEmail | None = None
    shoot_date: date | None = None
    location: str | None = Field(default=None, max_length=300)
    status: JobStatus | None = None

    _validate_location = field_validator("location")(_validate_location)


# --- Responses ---

class JobOut(BaseModel):
    id: str
    public_slug: str
    name: str
    client_name: str | None
    client_email: EmailStr | None
    shoot_date: date | None
    location: str | None
    status: JobStatus
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None

    model_config = {"from_attributes": True}


class JobListItem(BaseModel):
    """Lighter shape for list views."""
    id: str
    public_slug: str
    name: str
    client_name: str | None
    shoot_date: date | None
    status: JobStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class JobList(BaseModel):
    items: list[JobListItem]
    total: int

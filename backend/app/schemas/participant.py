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
    # How many rows carried a time that was booked as a slot.
    slots_booked: int = 0


# --- Public (signup form) ---

class PublicJobOut(BaseModel):
    """The slim view a participant sees on the signup page."""
    name: str
    client_name: str | None
    shoot_date: date | None
    # HSD-71: every day the shoot runs on, so the picker can group slots.
    shoot_dates: list[date] = []
    location: str | None
    # HSD-55: lets the signup page know whether to show the slot picker.
    shoot_mode: str = "queue"
    branding: dict | None = None  # account branding overrides
    # HSD-36: the client's logo, shown above the signup form so people see
    # their employer's branding at the very first touchpoint.
    client_logo_url: str | None = None
    # Who is photographing them, and how to reach that person. A signup
    # page without this is a form from nobody.
    studio: dict | None = None

    model_config = {"from_attributes": True}


class PublicParticipantSignup(BaseModel):
    """Body submitted by a participant on /s/{slug}."""
    name: str = Field(min_length=1, max_length=200)
    email: StrictEmail
    title: str | None = Field(default=None, max_length=200)
    # Compliance: must be explicitly true — the signup form's privacy-consent
    # checkbox. Rejected at the API level so a client can't skip it.
    consent: bool = Field(
        description="Participant accepted the privacy terms."
    )
    # The time they picked, on a time-slot job. Booked inside this request
    # rather than a second one, so a participant can't end up signed up
    # with a booking that silently failed, and so they get one email
    # instead of "you're on the list" followed immediately by "you're
    # booked". Null on queue jobs and when nothing was picked.
    slot_start: datetime | None = None


# --- Responses ---

class ParticipantOut(BaseModel):
    id: str
    job_id: str
    name: str
    email: EmailStr | None
    title: str | None
    shot_at: datetime | None
    # Booked but never turned up. Mutually exclusive with shot_at.
    no_show_at: datetime | None = None
    # F5c: timestamp the gallery delivery email was last sent to this
    # participant (null = never sent). The Deliver button on Job detail uses
    # this to skip already-delivered participants. Surface on the participant
    # row so the photographer sees "Delivered 5 May" pills.
    gallery_sent_at: datetime | None = None
    photo_count: int = 0  # how many uploaded files are assigned to them
    # Round-2 polish: how many UNIQUE files this participant has pulled from
    # their gallery. Counts ParticipantDownload rows (caps enforce uniqueness
    # via UNIQUE(participant_id, file_id), so re-downloads don't inflate it).
    # The Job detail Downloads tile sums these across the job to show actual
    # consumption against the budget. Only populated by `list_participants`;
    # single-participant endpoints leave it at 0 since the Downloads tile is
    # job-scoped, not participant-scoped.
    downloads_used: int = 0
    # F5b.2: how many photos this participant starred as favorites, so the
    # photographer can see at a glance who has chosen. Populated by
    # `list_participants` alongside the other counts.
    picks_used: int = 0
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


class SlotWindow(BaseModel):
    """A booked time, as the signup response reports it back."""
    start: datetime
    end: datetime


class PublicSignupResult(BaseModel):
    """Response from POST /api/v1/public/jobs/{slug}/signup.

    `created` lets the UI distinguish between a fresh signup and an idempotent
    re-submission (same email already on the list). Both return 201/200 so the
    user always sees a success state.
    """
    participant: ParticipantOut
    created: bool
    # Set when `slot_start` was sent and the booking succeeded.
    booked_slot: SlotWindow | None = None
    # True when the requested time was taken between loading the page and
    # submitting. The signup still stands; the UI drops them on the picker
    # with fresh availability rather than failing the whole form.
    slot_taken: bool = False

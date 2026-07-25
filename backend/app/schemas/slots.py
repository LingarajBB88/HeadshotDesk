"""Pydantic schemas for time-slot booking (HSD-55)."""
import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


class SlotBreak(BaseModel):
    start: str
    end: str

    @field_validator("start", "end")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError("Times must be HH:MM (24h).")
        return v

    @model_validator(mode="after")
    def _ordered(self) -> "SlotBreak":
        if _minutes(self.end) <= _minutes(self.start):
            raise ValueError("Break end must be after its start.")
        return self


class TimeSlotConfig(BaseModel):
    """Slot generation parameters, stored whole in Job.time_slot_config."""
    start: str
    end: str
    slot_minutes: int = Field(ge=1, le=120)
    buffer_minutes: int = Field(default=0, ge=0, le=60)
    breaks: list[SlotBreak] = Field(default_factory=list, max_length=10)

    @field_validator("start", "end")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError("Times must be HH:MM (24h).")
        return v

    @model_validator(mode="after")
    def _sane(self) -> "TimeSlotConfig":
        if _minutes(self.end) <= _minutes(self.start):
            raise ValueError("Day end must be after day start.")
        span = _minutes(self.end) - _minutes(self.start)
        if self.slot_minutes + self.buffer_minutes > span:
            raise ValueError("Slot length does not fit in the day.")
        for b in self.breaks:
            if _minutes(b.start) < _minutes(self.start) or _minutes(b.end) > _minutes(self.end):
                raise ValueError("Breaks must fall within the day.")
        return self


class SlotOut(BaseModel):
    """One bookable slot as shown to a participant."""
    start: datetime
    end: datetime
    available: bool


class SlotListOut(BaseModel):
    slots: list[SlotOut]


class PublicBookSlotRequest(BaseModel):
    """Body for the public book-slot endpoint. The gallery token proves the
    caller is the participant who just signed up (same token that guards
    their gallery)."""
    gallery_token: str = Field(min_length=20)
    slot_start: datetime


class BookSlotForParticipantRequest(BaseModel):
    """Owner-side slot assignment: the photographer books a time for a
    participant from the job page. Auth comes from the session; no token."""
    slot_start: datetime


class ScheduleEntryOut(BaseModel):
    slot_start: datetime
    slot_end: datetime
    participant_id: str
    participant_name: str
    shot: bool


class ScheduleOut(BaseModel):
    entries: list[ScheduleEntryOut]

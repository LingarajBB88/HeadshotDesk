"""Pydantic schemas for time-slot booking (HSD-55)."""
import re
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
# HSD-71: a slot reference may be date-qualified for multi-day shoots.
_DAY_TIME_RE = re.compile(
    r"^(\d{4}-\d{2}-\d{2}@)?([01]\d|2[0-3]):[0-5]\d$"
)


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


class ExtraSlot(BaseModel):
    """A one-off slot outside the uniform grid, e.g. a 15-minute add-on
    after the day's normal 10-minute slots. Overlapping extras are skipped
    at generation time rather than rejected, so a stale entry can't wedge
    the whole config."""
    # "14:20" (every day) or "2026-09-16@14:20" (that day only).
    start: str
    minutes: int = Field(ge=1, le=120)

    @field_validator("start")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        if not _DAY_TIME_RE.match(v):
            raise ValueError("Times must be HH:MM or YYYY-MM-DD@HH:MM.")
        return v


class DayConfig(BaseModel):
    """Per-day overrides for a multi-day shoot (HSD-71).

    Days rarely run identical hours: day one might be 09:00–17:00 and day
    two a half-day. Any day without an override simply uses the job's base
    settings, so single-day shoots never see this.
    """
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
    def _sane(self) -> "DayConfig":
        if _minutes(self.end) <= _minutes(self.start):
            raise ValueError("Day end must be after day start.")
        return self


class TimeSlotConfig(BaseModel):
    """Slot generation parameters, stored whole in Job.time_slot_config."""
    start: str
    end: str
    slot_minutes: int = Field(ge=1, le=120)
    buffer_minutes: int = Field(default=0, ge=0, le=60)
    breaks: list[SlotBreak] = Field(default_factory=list, max_length=10)
    # Individually removed slots, as HH:MM start times. Generation skips
    # them; restoring is just removing the entry. Times that don't land on
    # the grid are harmless leftovers (e.g. after the grid shifted).
    blocked: list[str] = Field(default_factory=list, max_length=500)
    # One-off slots appended outside the grid, any length.
    extra: list[ExtraSlot] = Field(default_factory=list, max_length=200)
    # HSD-71: per-day settings, keyed by ISO date. Absent day = base config.
    day_overrides: dict[str, DayConfig] = Field(default_factory=dict)

    @field_validator("start", "end")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        if not _TIME_RE.match(v):
            raise ValueError("Times must be HH:MM (24h).")
        return v

    @field_validator("blocked")
    @classmethod
    def _valid_blocked(cls, v: list[str]) -> list[str]:
        for t in v:
            if not _DAY_TIME_RE.match(t):
                raise ValueError(
                    "Blocked times must be HH:MM or YYYY-MM-DD@HH:MM."
                )
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
        # Overlapping or duplicate breaks are always a mistake; one merged
        # break expresses the same thing without ambiguity.
        ordered = sorted(self.breaks, key=lambda b: _minutes(b.start))
        for prev, nxt in zip(ordered, ordered[1:]):
            if _minutes(nxt.start) < _minutes(prev.end):
                raise ValueError("Breaks must not overlap.")
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
    # Default on: someone whose time was set for them has no other way of
    # knowing. Turned off while a schedule is still being drafted, so the
    # photographer can shuffle people without mailing them each time.
    notify: bool = True


class ScheduleEntryOut(BaseModel):
    slot_start: datetime
    slot_end: datetime
    participant_id: str
    participant_name: str
    shot: bool


class ScheduleOut(BaseModel):
    entries: list[ScheduleEntryOut]

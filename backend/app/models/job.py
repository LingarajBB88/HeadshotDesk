"""Job — a single shoot. One job per event/team being photographed."""
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JOB_STATUSES = (
    "draft",
    "open_for_signup",
    "in_progress",
    "delivered",
    "archived",
)

# HSD-55: how shoot day runs. Queue = walk-up, photographer picks who's next
# (the original F4 flow). Time slot = participants book an appointment during
# signup; shoot day is a schedule.
SHOOT_MODES = ("queue", "time_slot")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    public_slug: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    client_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # HSD-36: link to the Client entity (branding owner). Nullable for
    # legacy jobs; the 0010 migration backfills from client_name. When set,
    # client_name mirrors the client's name for display back-compat.
    client_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("clients.id", ondelete="SET NULL"), nullable=True
    )
    client_email: Mapped[str | None] = mapped_column(CITEXT(), nullable=True)
    shoot_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # HSD-71: additional days for a shoot that spans more than one date,
    # as ISO strings ["2026-09-16", "2026-09-17"]. shoot_date stays the
    # first day, so every existing display and email keeps working and no
    # backfill was needed. Slot bookings store absolute timestamps, so
    # they already span days without change.
    extra_shoot_dates: Mapped[list[str] | None] = mapped_column(
        JSONB, nullable=True
    )
    location: Mapped[str | None] = mapped_column(String, nullable=True)

    # Whether a participant may move their own booked time. Off unless the
    # photographer says otherwise: on a corporate shoot the client owns the
    # schedule, not the individual sitting in the chair.
    allow_reschedule: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")
    settings: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # F5b.1: per-job hard cap on unique photos each participant can download
    # from their /g/{token} gallery. Default 1 matches a typical "one final
    # headshot" package. Photographer can bump this per job. 0 = no downloads
    # allowed (useful while still in proofing).
    download_cap: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # F5b.2: let participants star their favorite photo(s) in the gallery,
    # so the photographer knows what to retouch. Off by default — some
    # packages don't want it. pick_cap mirrors how packages are sold
    # ("pick 1", "pick 3"); 0 means unlimited picks.
    picks_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    pick_cap: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    # One-shot nudge when a shot job still hasn't been delivered days later.
    undelivered_nudge_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # HSD-55: shoot-day mode. "queue" (default, walk-up) or "time_slot"
    # (participants self-book during signup).
    shoot_mode: Mapped[str] = mapped_column(
        String, nullable=False, default="queue", server_default="queue"
    )
    # HSD-55: slot configuration when shoot_mode == "time_slot". Shape:
    #   { "start": "09:00", "end": "17:00", "slot_minutes": 5,
    #     "buffer_minutes": 0, "breaks": [{"start": "12:00", "end": "12:30"}] }
    # Times are local to the shoot; the shoot_date column provides the day.
    # JSONB rather than columns because the shape is read/written whole and
    # will grow (capacity > 1 is a planned v0.2 extension).
    time_slot_config: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )

    # HSD-67: token for the client-facing live status dashboard (/c/{token}).
    # Null = not shared. Rotating the token revokes the old link, same
    # pattern as participant gallery tokens.
    client_token: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True
    )

    created_by: Mapped[str] = mapped_column(
        String, ForeignKey("users.id"), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    @property
    def all_shoot_dates(self) -> list[date]:
        """Every day this job runs on, in order. Single-day jobs return one."""
        days: list[date] = []
        if self.shoot_date:
            days.append(self.shoot_date)
        for raw in self.extra_shoot_dates or []:
            try:
                parsed = date.fromisoformat(str(raw))
            except (TypeError, ValueError):
                continue
            if parsed not in days:
                days.append(parsed)
        return sorted(days)

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'open_for_signup', 'in_progress', 'delivered', 'archived')",
            name="ck_jobs_status",
        ),
        CheckConstraint("download_cap >= 0", name="ck_jobs_download_cap_nonneg"),
        Index("idx_jobs_account_id", "account_id"),
        Index("idx_jobs_status", "status"),
    )

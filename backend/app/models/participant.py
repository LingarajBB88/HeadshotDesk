"""Participant — a person being photographed for a Job."""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import CITEXT, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str | None] = mapped_column(CITEXT(), nullable=True)
    title: Mapped[str | None] = mapped_column(String, nullable=True)

    custom_fields: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )

    # Token used for unauthed gallery access (Feature v0.2). Generated at create
    # time so it's ready when the gallery feature ships.
    gallery_token: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    gallery_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Shoot queue: NULL = pending, set = already photographed.
    shot_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Booked but never turned up. Kept as a timestamp so a straggler who
    # appears later can simply be marked shot, which clears this.
    no_show_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Compliance: when the participant accepted the privacy terms on the
    # public signup form. NULL for photographer-added / CSV rows (they never
    # saw the form — the photographer is the controller for those).
    consented_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    job: Mapped["Job"] = relationship("Job")  # noqa: F821

    __table_args__ = (
        Index("idx_participants_job_id", "job_id"),
        Index(
            "idx_participants_job_name_lower",
            "job_id",
            text("lower(name)"),
        ),
    )

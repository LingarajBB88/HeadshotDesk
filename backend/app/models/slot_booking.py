"""SlotBooking — a participant's claimed time slot on a time-slot-mode job.

HSD-55. Slots are not stored as rows; they're computed from the job's
time_slot_config on demand. Only BOOKINGS are rows. Two uniqueness rules do
the heavy lifting:

  • UNIQUE(job_id, slot_start): one booking per slot (capacity 1 in v0.1).
    A concurrent double-book loses at the database, not in application code.
  • UNIQUE(participant_id): one slot per participant. Rebooking replaces
    their previous booking inside a transaction.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class SlotBooking(Base):
    __tablename__ = "slot_bookings"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    participant_id: Mapped[str] = mapped_column(
        String, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    slot_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    slot_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    booked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    job: Mapped["Job"] = relationship("Job")  # noqa: F821
    participant: Mapped["Participant"] = relationship("Participant")  # noqa: F821

    __table_args__ = (
        UniqueConstraint("job_id", "slot_start", name="uq_slot_bookings_job_slot"),
        UniqueConstraint("participant_id", name="uq_slot_bookings_participant"),
        Index("idx_slot_bookings_job_id", "job_id"),
    )

"""
F5b.2 (HSD-25) — ParticipantPick: the photos a participant marked as their
favorites in the gallery.

Separate from ParticipantDownload on purpose: picking is a preference
("retouch this one"), downloading is consumption. A participant can pick a
photo they never download, and download one they never picked.

UNIQUE(participant_id, file_id) makes starring idempotent; un-starring
deletes the row. The per-job cap (Job.settings["pick_cap"]) is enforced in
the service against the count of rows here.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ParticipantPick(Base):
    __tablename__ = "participant_picks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    participant_id: Mapped[str] = mapped_column(
        String, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        String, ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    picked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "participant_id", "file_id", name="uq_participant_picks_pf"
        ),
        Index("idx_participant_picks_participant_id", "participant_id"),
    )

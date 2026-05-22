"""ParticipantDownload — tracks which files a participant has downloaded
from their /g/{token} gallery.

The cap on Job.download_cap is enforced against the number of UNIQUE rows
here (per participant). The UNIQUE(participant_id, file_id) constraint
makes re-downloading the same file idempotent at the DB level — re-downloads
are free, not "another download against your cap."
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ParticipantDownload(Base):
    __tablename__ = "participant_downloads"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    participant_id: Mapped[str] = mapped_column(
        String, ForeignKey("participants.id", ondelete="CASCADE"), nullable=False
    )
    file_id: Mapped[str] = mapped_column(
        String, ForeignKey("files.id", ondelete="CASCADE"), nullable=False
    )
    downloaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    participant: Mapped["Participant"] = relationship("Participant")  # noqa: F821
    file: Mapped["File"] = relationship("File")  # noqa: F821

    __table_args__ = (
        UniqueConstraint(
            "participant_id", "file_id", name="uq_participant_downloads_pf"
        ),
        Index("idx_participant_downloads_participant_id", "participant_id"),
    )

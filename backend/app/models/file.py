"""File — an uploaded image attached to a job (and usually a participant)."""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False
    )
    # Nullable: a file might be uploaded before we can match it to a participant.
    participant_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("participants.id", ondelete="SET NULL"), nullable=True
    )

    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    storage_key: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)

    variant: Mapped[str] = mapped_column(String, nullable=False, default="original")
    source_file_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("files.id", ondelete="CASCADE"), nullable=True
    )

    # SHA-256 of file content, used for content-based dedup so visually-identical
    # files (e.g., Cmd-D'd duplicates in Finder) don't produce duplicate rows.
    # Nullable because legacy rows pre-dating this column don't have a hash.
    content_sha256: Mapped[str | None] = mapped_column(String, nullable=True)

    is_favorite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    ai_status: Mapped[str | None] = mapped_column(String, nullable=True)
    ai_error: Mapped[str | None] = mapped_column(String, nullable=True)

    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    participant: Mapped["Participant | None"] = relationship(  # noqa: F821
        "Participant"
    )

    __table_args__ = (
        CheckConstraint(
            "variant IN ('original', 'thumbnail', 'retouched', 'web', "
            "'crop_linkedin', 'crop_slack', 'crop_badge')",
            name="ck_files_variant",
        ),
        CheckConstraint(
            "ai_status IN ('pending', 'processing', 'completed', 'failed') "
            "OR ai_status IS NULL",
            name="ck_files_ai_status",
        ),
        Index("idx_files_job_id", "job_id"),
        Index("idx_files_participant_id", "participant_id"),
        Index("idx_files_variant", "variant"),
    )

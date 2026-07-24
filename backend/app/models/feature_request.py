"""FeatureRequest — a feature idea submitted from the public roadmap section.

Stored in the database and forwarded to the team inbox by email. No auth:
the landing page form is public. Abuse surface is kept small by length
limits at the schema layer and by storing nothing executable.
"""
from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FeatureRequest(Base):
    __tablename__ = "feature_requests"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional reply-to. Not verified; treat as a hint, not an identity.
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

"""Account — the billable entity. Owns users, jobs, branding, subscription state."""
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    type: Mapped[str] = mapped_column(String, nullable=False)  # 'photographer' | 'corporate'
    name: Mapped[str] = mapped_column(String, nullable=False)

    stripe_customer_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)

    plan: Mapped[str] = mapped_column(String, nullable=False, default="trial")
    plan_renews_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hibernate_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    branding: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    users: Mapped[list["User"]] = relationship(  # noqa: F821
        "User", back_populates="account", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("type IN ('photographer', 'corporate')", name="ck_accounts_type"),
        CheckConstraint(
            "plan IN ('trial', 'solo', 'pro', 'studio', 'hibernate', 'cancelled')",
            name="ck_accounts_plan",
        ),
    )

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

    # This account's own share link: /r/{referral_code}. Every account gets
    # one at signup, because the people who refer are rarely the ones you'd
    # have picked in advance.
    referral_code: Mapped[str | None] = mapped_column(
        String, unique=True, nullable=True, index=True
    )
    # When the trial ends. Stored rather than derived so a referral bonus or
    # a manual extension is a fact on the row, not arithmetic scattered
    # across the codebase. Null on old rows means "created_at + default".
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # The invite code this account was created with, when it took a free
    # beta seat. Kept for the seat count and for knowing which batch of
    # invites actually landed.
    invite_code: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    # Free months banked from referrals that turned into paying customers.
    # A running balance rather than a list of grants: the detail lives on
    # the referral rows, this is the number billing needs to read.
    credit_months: Mapped[int] = mapped_column(
        nullable=False, default=0, server_default="0"
    )

    # Scheduled email markers. Timestamps rather than booleans so "when did
    # we tell them" is answerable, and so the daily job can select on NULL
    # and never send twice.
    trial_ending_email_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    trial_ended_email_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

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
            # 'beta' is a free seat drawn from the capped pool. It behaves
            # like a paid plan (nothing expires) but costs nothing and is
            # counted separately so the pool can't be overspent.
            "plan IN ('trial', 'beta', 'solo', 'pro', 'studio', 'hibernate', "
            "'cancelled')",
            name="ck_accounts_plan",
        ),
    )

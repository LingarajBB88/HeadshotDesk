"""
Referral tracking.

One row per person who arrives through someone's link, created at the click
rather than at signup. That's deliberate: the gap between clicks and signups
is the number that tells you whether a link is being shared but ignored, and
you can't reconstruct it after the fact.

A click with no signup stays as a row forever. That's the point.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Referral(Base):
    __tablename__ = "referrals"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    # Who shared the link. Never null: a referral without a referrer is just
    # a signup.
    referrer_account_id: Mapped[str] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The code as it appeared in the URL. Stored alongside the account id so
    # the history survives a code being regenerated.
    code: Mapped[str] = mapped_column(String, nullable=False, index=True)

    # Filled in when the click turns into an account. Null means the link was
    # opened and nothing came of it.
    referred_account_id: Mapped[str | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True, index=True
    )

    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    signed_up_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # First time the referred account paid for anything. The only number that
    # says whether referrals are worth running.
    converted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Coarse attribution context. Kept for spotting one person clicking their
    # own link fifty times, not for profiling: no cookies beyond the
    # attribution one, no third-party pixels.
    landing_path: Mapped[str | None] = mapped_column(String, nullable=True)
    referer: Mapped[str | None] = mapped_column(String, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String, nullable=True)

    __table_args__ = (
        # The funnel query is "everything for this referrer, newest first".
        Index("ix_referrals_referrer_clicked", "referrer_account_id", "clicked_at"),
    )


class InviteCode(Base):
    """A code that grants a free beta seat.

    Seats are capped globally (see `settings.free_seat_cap`), and a code can
    only hand out what the pool still has. `max_uses` bounds one code; the
    cap bounds all of them together, so handing a code to a mailing list
    can't quietly cost more than the pool.
    """

    __tablename__ = "invite_codes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    code: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    label: Mapped[str | None] = mapped_column(String, nullable=True)

    max_uses: Mapped[int] = mapped_column(nullable=False, default=1)
    used_count: Mapped[int] = mapped_column(nullable=False, default=0)

    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

"""Reward referrers whose referrals become paying customers

The conversion moment was already tracked and did nothing. This turns it
into free months for the person who made the introduction.

The reward is stored on the referral row at the moment it's earned rather
than computed from a rate later, so changing the rate never rewrites what
somebody was already promised. Accounts carry the running balance because
that's the single number billing needs to read.

"Earned" and "settled" are separate columns on purpose: until Stripe ships,
applying a credit is a manual step, and the admin view needs to show what's
outstanding rather than pretending it's already been given.

Revision ID: 0016
Revises: 0015
Create Date: 2026-08-09
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "referrals",
        sa.Column("reward_months", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "referrals",
        sa.Column("reward_settled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "accounts",
        sa.Column("credit_months", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("accounts", "credit_months")
    op.drop_column("referrals", "reward_settled_at")
    op.drop_column("referrals", "reward_months")

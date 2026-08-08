"""Referral tracking and capped free beta seats

Referrals are recorded at the click, not the signup. The gap between the
two is the number that tells you whether a link is being shared and
ignored, and it can't be reconstructed later.

Free seats are capped globally rather than per code, so handing a code to
a mailing list can't quietly cost more than the pool. `plan='beta'` is the
seat itself.

`trial_ends_at` moves the trial deadline onto the row. It was previously
computed as created_at + 31 days wherever it was needed, which left nowhere
to put a referral bonus or a manual extension. Backfilled for existing
accounts so nobody's trial silently changes length.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-08
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

# Must match auth_service.TRIAL_DAYS. Duplicated here on purpose: a
# migration has to keep meaning what it meant on the day it ran, even if
# the constant later changes.
TRIAL_DAYS = 31


def upgrade() -> None:
    op.add_column(
        "accounts", sa.Column("referral_code", sa.String(), nullable=True)
    )
    op.add_column(
        "accounts",
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("accounts", sa.Column("invite_code", sa.String(), nullable=True))
    op.create_unique_constraint(
        "uq_accounts_referral_code", "accounts", ["referral_code"]
    )
    op.create_index("ix_accounts_referral_code", "accounts", ["referral_code"])
    op.create_index("ix_accounts_invite_code", "accounts", ["invite_code"])

    # Existing trials keep the deadline they already had.
    op.execute(
        f"UPDATE accounts SET trial_ends_at = created_at + INTERVAL '{TRIAL_DAYS} days' "
        "WHERE plan = 'trial'"
    )

    # 'beta' joins the allowed plans.
    op.drop_constraint("ck_accounts_plan", "accounts", type_="check")
    op.create_check_constraint(
        "ck_accounts_plan",
        "accounts",
        "plan IN ('trial', 'beta', 'solo', 'pro', 'studio', 'hibernate', "
        "'cancelled')",
    )

    op.create_table(
        "referrals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "referrer_account_id",
            sa.String(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column(
            "referred_account_id",
            sa.String(),
            sa.ForeignKey("accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "clicked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("signed_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("landing_path", sa.String(), nullable=True),
        sa.Column("referer", sa.String(), nullable=True),
        sa.Column("ip_hash", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
    )
    op.create_index("ix_referrals_referrer_account_id", "referrals", ["referrer_account_id"])
    op.create_index("ix_referrals_referred_account_id", "referrals", ["referred_account_id"])
    op.create_index("ix_referrals_code", "referrals", ["code"])
    op.create_index(
        "ix_referrals_referrer_clicked", "referrals", ["referrer_account_id", "clicked_at"]
    )

    op.create_table(
        "invite_codes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("code", sa.String(), nullable=False, unique=True),
        sa.Column("label", sa.String(), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_invite_codes_code", "invite_codes", ["code"])


def downgrade() -> None:
    op.drop_table("invite_codes")
    op.drop_table("referrals")
    op.drop_constraint("ck_accounts_plan", "accounts", type_="check")
    op.create_check_constraint(
        "ck_accounts_plan",
        "accounts",
        "plan IN ('trial', 'solo', 'pro', 'studio', 'hibernate', 'cancelled')",
    )
    op.drop_index("ix_accounts_invite_code", table_name="accounts")
    op.drop_index("ix_accounts_referral_code", table_name="accounts")
    op.drop_constraint("uq_accounts_referral_code", "accounts", type_="unique")
    op.drop_column("accounts", "invite_code")
    op.drop_column("accounts", "trial_ends_at")
    op.drop_column("accounts", "referral_code")

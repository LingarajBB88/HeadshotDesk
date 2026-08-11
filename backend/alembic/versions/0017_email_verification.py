"""Email verification, and the markers scheduled email needs

`users.email_verified_at` has existed since 0001 and nothing ever wrote to
it. This adds the token columns that make it real.

Existing accounts are grandfathered as verified. They're people we already
know; locking them out to prove an address they've been using for weeks
would be hostile, and it would teach them that the product breaks.

Also adds the sent-markers that scheduled email hangs off. Each is a
timestamp rather than a boolean so "when did we tell them" is answerable,
and so a re-run of the daily job can't double-send: the job filters on
NULL.

Revision ID: 0017
Revises: 0016
Create Date: 2026-08-11
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("email_verification_token_hash", sa.String(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_verification_sent_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    # Grandfather everyone who already has an account.
    op.execute(
        "UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL"
    )

    # Scheduled email markers. Nullable timestamps: NULL means "not sent",
    # which is what the daily job selects on.
    op.add_column(
        "accounts",
        sa.Column("trial_ending_email_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "accounts",
        sa.Column("trial_ended_email_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "participants",
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("participants", "reminder_sent_at")
    op.drop_column("accounts", "trial_ended_email_at")
    op.drop_column("accounts", "trial_ending_email_at")
    op.drop_column("users", "email_verification_sent_at")
    op.drop_column("users", "email_verification_token_hash")

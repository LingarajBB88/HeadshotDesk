"""Markers for the gallery nudge and the undelivered-job nudge

Same pattern as 0017: a nullable timestamp per message, set only after a
successful send, so the daily job selects on NULL and can never send twice.

Both are one-shot on purpose. A nudge that repeats gets filtered, and once
a sender is filtered the useful mail goes with it.

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-11
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("gallery_nudge_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "undelivered_nudge_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "undelivered_nudge_at")
    op.drop_column("participants", "gallery_nudge_at")

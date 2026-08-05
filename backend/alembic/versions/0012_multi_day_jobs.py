"""HSD-71 — multi-day shoots: extra dates on a job

A job keeps `shoot_date` as its first/primary day (everything that
displays a date still works, and existing rows need no backfill).
`extra_shoot_dates` holds any additional days as ISO date strings.

Slot bookings already store absolute timestamps, so bookings across
several days need no schema change at all.

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-04
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "extra_shoot_dates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "extra_shoot_dates")

"""time-slot booking: shoot mode, slot config, bookings table

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-23

HSD-55. Adds:
  • jobs.shoot_mode ('queue' default, or 'time_slot') with check constraint
  • jobs.time_slot_config JSONB (nullable; shape documented on the model)
  • slot_bookings table. Slots themselves are computed from config; only
    bookings are stored. UNIQUE(job_id, slot_start) enforces capacity 1;
    UNIQUE(participant_id) enforces one slot per person.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "shoot_mode", sa.String(), nullable=False, server_default="queue"
        ),
    )
    op.create_check_constraint(
        "ck_jobs_shoot_mode", "jobs", "shoot_mode IN ('queue', 'time_slot')"
    )
    op.add_column(
        "jobs", sa.Column("time_slot_config", JSONB, nullable=True)
    )

    op.create_table(
        "slot_bookings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "job_id",
            sa.String(),
            sa.ForeignKey("jobs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "participant_id",
            sa.String(),
            sa.ForeignKey("participants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slot_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("slot_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "booked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("job_id", "slot_start", name="uq_slot_bookings_job_slot"),
        sa.UniqueConstraint("participant_id", name="uq_slot_bookings_participant"),
    )
    op.create_index("idx_slot_bookings_job_id", "slot_bookings", ["job_id"])


def downgrade() -> None:
    op.drop_table("slot_bookings")
    op.drop_column("jobs", "time_slot_config")
    op.drop_constraint("ck_jobs_shoot_mode", "jobs", type_="check")
    op.drop_column("jobs", "shoot_mode")

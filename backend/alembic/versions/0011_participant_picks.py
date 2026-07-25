"""F5b.2 (HSD-25) — participant picks

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-25
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "participant_picks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "participant_id",
            sa.String(),
            sa.ForeignKey("participants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "file_id",
            sa.String(),
            sa.ForeignKey("files.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "picked_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "participant_id", "file_id", name="uq_participant_picks_pf"
        ),
    )
    op.create_index(
        "idx_participant_picks_participant_id",
        "participant_picks",
        ["participant_id"],
    )

    # Per-job settings: off by default so existing jobs are unchanged.
    op.add_column(
        "jobs",
        sa.Column(
            "picks_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "jobs",
        sa.Column(
            "pick_cap", sa.Integer(), nullable=False, server_default=sa.text("1")
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "pick_cap")
    op.drop_column("jobs", "picks_enabled")
    op.drop_index(
        "idx_participant_picks_participant_id", table_name="participant_picks"
    )
    op.drop_table("participant_picks")

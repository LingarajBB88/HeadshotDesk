"""participant shot tracking

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-09

Adds shot_at to participants. NULL = pending; set = already shot.
Used by the shoot queue to track who's been photographed.
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE participants
            ADD COLUMN shot_at TIMESTAMPTZ;

        CREATE INDEX idx_participants_job_pending
            ON participants(job_id)
            WHERE shot_at IS NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_participants_job_pending;
        ALTER TABLE participants
            DROP COLUMN IF EXISTS shot_at;
        """
    )

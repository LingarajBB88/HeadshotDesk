"""Bring pick_cap back in step with download_cap

Starring and downloading are the same allowance seen from two sides: you
star the ones you want, you download the ones you starred. They were kept
in step only by the frontend, at the single moment picks were switched on.
Changing the download cap afterwards left the two numbers diverged, and the
gallery showed both — "download up to 4" next to "star up to 3".

This repairs existing rows. job_service.update_job maintains the invariant
from here on.

Nothing to undo: the previous state was a bug, not a schema.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-09
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Only touch jobs where picks are actually on. A job with picks off has
    # a pick_cap nobody reads, and rewriting it would be noise.
    op.execute(
        "UPDATE jobs SET pick_cap = download_cap "
        "WHERE picks_enabled = true AND pick_cap <> download_cap"
    )


def downgrade() -> None:
    # The old state was two numbers that disagreed. There's nothing
    # meaningful to restore.
    pass

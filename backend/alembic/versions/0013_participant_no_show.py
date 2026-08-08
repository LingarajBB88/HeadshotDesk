"""No-show tracking on participants

Clients ask who didn't turn up — that list is the photographer's evidence
for a re-shoot conversation, and it currently lives in their head.

A timestamp rather than a status enum: it composes with shot_at (marking
someone shot clears the no-show) and records *when* the call was made,
which matters when a straggler appears an hour later.

Revision ID: 0013
Revises: 0012
Create Date: 2026-08-05
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("no_show_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("participants", "no_show_at")

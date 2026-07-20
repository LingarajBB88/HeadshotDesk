"""participant privacy consent timestamp

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-20

Compliance minimal set (pre-beta): records when a participant accepted the
privacy terms on the public signup form. Nullable — participants added
manually or via CSV by the photographer haven't been through the form, so
they have no consent timestamp (the photographer is the data controller
for those entries; HeadshotDesk processes on their behalf).
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("participants", "consented_at")

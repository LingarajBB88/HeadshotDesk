"""feature requests from the public roadmap section

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-23
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feature_requests",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("feature_requests")

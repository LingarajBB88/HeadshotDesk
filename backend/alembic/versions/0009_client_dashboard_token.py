"""HSD-67 — client dashboard share token on jobs

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-25
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("client_token", sa.String(), nullable=True))
    op.create_unique_constraint("uq_jobs_client_token", "jobs", ["client_token"])


def downgrade() -> None:
    op.drop_constraint("uq_jobs_client_token", "jobs", type_="unique")
    op.drop_column("jobs", "client_token")

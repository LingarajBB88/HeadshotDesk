"""Annual plans and the Studio waitlist (D-023 revision 2026-10-25)

  billing_interval    "month" or "year", mirrored from the subscription so
                      the admin MRR and the billing page know which one
                      the customer is on without asking Stripe
  studio_waitlist_at  when the photographer asked to hear about Studio

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-26
"""
import sqlalchemy as sa
from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("billing_interval", sa.String(), nullable=True))
    op.add_column(
        "accounts",
        sa.Column("studio_waitlist_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("accounts", "studio_waitlist_at")
    op.drop_column("accounts", "billing_interval")

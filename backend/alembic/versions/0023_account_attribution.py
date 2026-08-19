"""Record where each account came from

Plausible answers "a Facebook group sent 40 visitors this week". It cannot
answer "which channel produced photographers who are still paying in month
three", because it has no idea who signed up. That second question is the
one that decides where the marketing effort goes, and answering it needs
the source attached to the account.

JSONB rather than columns: the shape of an attribution record changes
whenever a channel does, and none of it is ever queried in a WHERE clause
that would want an index. It is read per account, or aggregated across a few
hundred rows.

First touch is stored, not last. Someone finds you in a Facebook group,
reads for a week, then arrives via a search for your name and signs up. Last
touch credits the search engine. The group did the work.

Revision ID: 0023
Revises: 0022
Create Date: 2026-08-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "attribution",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "attribution")

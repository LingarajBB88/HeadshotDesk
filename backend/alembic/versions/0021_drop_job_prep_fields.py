"""Drop the job directions and prep notes columns

0020 added these on the theory that per-job practical detail belonged in
the participant emails. On seeing them in the create-job form, Lingaraj
decided against the feature entirely. Reverting rather than leaving the
columns behind: dead columns outlive the memory of why they exist, and the
next person to read the Job model would reasonably assume they mean
something.

Dropped in a separate migration rather than by editing 0020, because 0020
has already run in production and Alembic will never re-run it.

Timing note: this drops columns the previous release's model still maps,
so between the pre-deploy migration and the container swap, the old code
would fail to select from jobs. On an app with no live shoots that window
is a few seconds and acceptable. It would not be on a busy one.

Revision ID: 0021
Revises: 0020
Create Date: 2026-08-12
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("jobs", "prep_notes")
    op.drop_column("jobs", "directions")


def downgrade() -> None:
    op.add_column("jobs", sa.Column("directions", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("prep_notes", sa.Text(), nullable=True))

"""Private per-participant notes for the photographer

"Wants glasses off", "retouch the scar on the left cheek, she asked",
"reshoot, blinked in every frame". Today this lives on paper or in the
photographer's head, and by the time they open an editor days later it is
gone.

Strictly photographer-only. This is the field most likely to contain
something blunt about how somebody looks, written in a hurry between
frames. It must never reach the participant it describes, and it must never
reach their employer, who is the one paying. So:

  - it is absent from the client dashboard, which returns names and status
    and nothing else
  - it is absent from the public signup response, which previously returned
    the whole ParticipantOut and would have carried notes straight back to
    the person they were written about

Revision ID: 0024
Revises: 0023
Create Date: 2026-08-20
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "notes")

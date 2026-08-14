"""Let the photographer decide whether participants can move their own time

The booking confirmation used to offer "Pick another slot", pointing at the
public signup page with no identity attached. Same email address, that
worked: the signup is idempotent and the rebooking replaces the old slot.
A different email address made them a brand new participant holding a
second slot, with the first one still blocked.

Two changes come out of that. The link now carries the participant's token,
so a different address is impossible. And whether the link appears at all
is the photographer's call, because on a corporate shoot the client owns
the schedule, not the individual sitting in the chair.

Defaults to false, including for existing jobs. Silently leaving a
rescheduling door open on every shoot already booked is not a default
anyone chose.

Revision ID: 0022
Revises: 0021
Create Date: 2026-08-12
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "allow_reschedule",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "allow_reschedule")

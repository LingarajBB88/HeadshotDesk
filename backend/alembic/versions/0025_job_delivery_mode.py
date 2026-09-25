"""Who receives the photos when a job is delivered

Until now, Deliver emailed every participant their own gallery and that was
the only option. Some corporate clients do not want their staff emailed
directly: HR wants the full set, and distributes internally. Others want
both, so people get theirs and the company keeps a copy for the intranet.

Three modes:

  participants  every participant gets their own private gallery (today's
                behaviour, and the default so nothing changes for existing
                jobs)
  client        only the client contact gets a link, to everything
  both          both of the above

Stored as a string rather than a boolean pair because "who gets the
photos" is one decision with three answers, and two booleans would allow a
fourth state that means nobody gets anything.

Revision ID: 0025
Revises: 0024
Create Date: 2026-09-12
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "delivery_mode",
            sa.String(),
            nullable=False,
            server_default="participants",
        ),
    )
    op.create_check_constraint(
        "ck_jobs_delivery_mode",
        "jobs",
        "delivery_mode IN ('participants', 'client', 'both')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_jobs_delivery_mode", "jobs", type_="check")
    op.drop_column("jobs", "delivery_mode")

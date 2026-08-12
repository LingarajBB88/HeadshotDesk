"""Photographer profile: a public page, and per-job practical details

Two related but separate things.

1. The photographer's profile. 0019 gave them contact details and links,
   which answers "how do I reach you". This answers "who are you": a
   portrait, a tagline, an about paragraph, a city, and a small portfolio.
   It lives at /p/{handle}, so the handle is a public identifier and gets a
   unique index. Nullable, because a handle is only needed the moment they
   decide to publish, and forcing everyone to pick one at signup is a
   pointless step for the majority who never will.

   `profile_published` is deliberately opt-in and defaults false. Anyone can
   start a free trial, and an indexable page carrying arbitrary uploaded
   images, available to any signup, is a spam magnet. Publishing is a
   decision, not a side effect of filling in a field.

   `portfolio` is JSONB rather than a table: it is a short ordered list
   owned entirely by one account, never queried across accounts, and never
   joined. A table would buy nothing and cost a migration.

2. Job directions and prep notes. On the job, not the account, because
   directions to a client's office change with every booking. Prep notes
   are on the job for the same reason: a law firm and a startup get
   different advice, and the photographer already thinks per shoot.

Revision ID: 0020
Revises: 0019
Create Date: 2026-08-12
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("handle", sa.String(), nullable=True))
    # Unique so /p/{handle} resolves to exactly one photographer. Handles are
    # stored already lowercased by the service, so a plain unique index is
    # enough; doing it on lower(handle) would let two rows differ only by
    # case in the database and then collide in the URL.
    op.create_index(
        "ix_accounts_handle", "accounts", ["handle"], unique=True
    )

    op.add_column("accounts", sa.Column("tagline", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("about", sa.Text(), nullable=True))
    op.add_column("accounts", sa.Column("city", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("country", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("portrait_key", sa.String(), nullable=True))
    op.add_column(
        "accounts", sa.Column("portrait_content_type", sa.String(), nullable=True)
    )
    op.add_column(
        "accounts",
        sa.Column(
            "portfolio",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )
    op.add_column(
        "accounts",
        sa.Column(
            "profile_published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    op.add_column("jobs", sa.Column("directions", sa.Text(), nullable=True))
    op.add_column("jobs", sa.Column("prep_notes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "prep_notes")
    op.drop_column("jobs", "directions")
    op.drop_column("accounts", "profile_published")
    op.drop_column("accounts", "portfolio")
    op.drop_column("accounts", "portrait_content_type")
    op.drop_column("accounts", "portrait_key")
    op.drop_column("accounts", "country")
    op.drop_column("accounts", "city")
    op.drop_column("accounts", "about")
    op.drop_column("accounts", "tagline")
    op.drop_index("ix_accounts_handle", table_name="accounts")
    op.drop_column("accounts", "handle")

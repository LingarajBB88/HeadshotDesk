"""Studio profile: contact details and links shown to participants

A participant landing on a signup page has no idea who is photographing
them or how to ask a question. This gives the photographer a place to put
their website, a contact address, a phone number, and arbitrary links, the
most requested being a "how to prepare" post on their own blog.

On the account rather than the job: a website doesn't change per shoot, and
retyping it for every job guarantees it goes stale on half of them.

`contact_email` is deliberately separate from the login email. The address
you sign in with is often not the one you want a hundred strangers replying
to.

`links` is a JSONB list of {label, url} rather than fixed columns, because
the link that matters differs per photographer: a prep guide, an Instagram,
a price list.

Revision ID: 0019
Revises: 0018
Create Date: 2026-08-12
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("website_url", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("contact_email", sa.String(), nullable=True))
    op.add_column("accounts", sa.Column("contact_phone", sa.String(), nullable=True))
    op.add_column(
        "accounts",
        sa.Column(
            "links",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )


def downgrade() -> None:
    op.drop_column("accounts", "links")
    op.drop_column("accounts", "contact_phone")
    op.drop_column("accounts", "contact_email")
    op.drop_column("accounts", "website_url")

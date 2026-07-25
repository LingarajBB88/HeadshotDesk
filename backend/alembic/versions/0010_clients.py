"""HSD-36 — clients table + jobs.client_id, backfilled from client_name

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-25
"""
import uuid

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "account_id",
            sa.String(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("logo_key", sa.String(), nullable=True),
        sa.Column("logo_content_type", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_clients_account_id", "clients", ["account_id"])

    op.add_column("jobs", sa.Column("client_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_jobs_client_id",
        "jobs",
        "clients",
        ["client_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill: one Client per distinct (account, client_name) among existing
    # jobs. Backfilled clients start logo-less; the photographer adds logos
    # from the new Clients page.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT DISTINCT account_id, client_name FROM jobs "
            "WHERE client_name IS NOT NULL AND client_name <> ''"
        )
    ).fetchall()
    for account_id, client_name in rows:
        client_id = f"client_{uuid.uuid4().hex[:26]}"
        conn.execute(
            sa.text(
                "INSERT INTO clients (id, account_id, name) "
                "VALUES (:id, :account_id, :name)"
            ),
            {"id": client_id, "account_id": account_id, "name": client_name},
        )
        conn.execute(
            sa.text(
                "UPDATE jobs SET client_id = :client_id "
                "WHERE account_id = :account_id AND client_name = :name"
            ),
            {
                "client_id": client_id,
                "account_id": account_id,
                "name": client_name,
            },
        )


def downgrade() -> None:
    op.drop_constraint("fk_jobs_client_id", "jobs", type_="foreignkey")
    op.drop_column("jobs", "client_id")
    op.drop_index("idx_clients_account_id", table_name="clients")
    op.drop_table("clients")

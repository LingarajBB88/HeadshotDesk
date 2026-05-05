"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-04

Creates the v0.1 + v0.2 tables in one shot. We hand-wrote the SQL to keep it
readable; future migrations should use op.create_table / op.add_column.
"""
from pathlib import Path

from alembic import op

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL_FILE = Path(__file__).with_name("0001_initial_schema.sql")


def upgrade() -> None:
    sql = SQL_FILE.read_text(encoding="utf-8")
    # Run the whole file as one transaction. PostgreSQL handles multi-statement scripts.
    op.execute(sql)


def downgrade() -> None:
    # Tear down in reverse-dependency order. Drops cascade so we can be terse.
    op.execute(
        """
        DROP TABLE IF EXISTS email_log CASCADE;
        DROP TABLE IF EXISTS usage_events CASCADE;
        DROP TABLE IF EXISTS subscriptions CASCADE;
        DROP TABLE IF EXISTS files CASCADE;
        DROP TABLE IF EXISTS participants CASCADE;
        DROP TABLE IF EXISTS jobs CASCADE;
        DROP TABLE IF EXISTS auth_sessions CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS accounts CASCADE;
        """
    )

"""password reset columns on users

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-06

Adds password_reset_token_hash + password_reset_token_expires_at to users.
We store only the SHA256 hash of the reset token; the raw value is emailed
to the user and never persisted.
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE users
            ADD COLUMN password_reset_token_hash TEXT,
            ADD COLUMN password_reset_token_expires_at TIMESTAMPTZ;

        CREATE INDEX idx_users_password_reset_token_hash
            ON users(password_reset_token_hash)
            WHERE password_reset_token_hash IS NOT NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_users_password_reset_token_hash;
        ALTER TABLE users
            DROP COLUMN IF EXISTS password_reset_token_hash,
            DROP COLUMN IF EXISTS password_reset_token_expires_at;
        """
    )

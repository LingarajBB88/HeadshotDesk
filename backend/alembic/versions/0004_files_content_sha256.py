"""files: content_sha256 for content-based dedup

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-17

Adds content_sha256 to files + a partial index on (job_id, content_sha256)
for fast duplicate lookup during upload. Existing rows get NULL — the
upload pipeline only hashes new uploads going forward.
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE files
            ADD COLUMN content_sha256 TEXT;

        CREATE INDEX idx_files_job_content_sha
            ON files(job_id, content_sha256)
            WHERE content_sha256 IS NOT NULL AND variant = 'original' AND deleted_at IS NULL;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_files_job_content_sha;
        ALTER TABLE files
            DROP COLUMN IF EXISTS content_sha256;
        """
    )

"""F5b.1 gallery: download cap + participant downloads tracking

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-21

Adds:
- jobs.download_cap (INT, default 1) — per-job hard cap on unique photos
  each participant can download from their gallery. Photographer overrides
  in the job edit form. 1 matches a typical "one final headshot per person"
  package.
- participant_downloads table — tracks which photos each participant has
  downloaded from /g/{token}. UNIQUE(participant_id, file_id) makes
  re-downloads idempotent (and free against the cap).

gallery_token already exists on participants (initial schema) and is
generated in participant_service for all creation paths, so no work needed
on the token side.
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE jobs
            ADD COLUMN download_cap INTEGER NOT NULL DEFAULT 1;

        ALTER TABLE jobs
            ADD CONSTRAINT ck_jobs_download_cap_nonneg
            CHECK (download_cap >= 0);

        CREATE TABLE participant_downloads (
            id              TEXT PRIMARY KEY,
            participant_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            file_id         TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
            downloaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_participant_downloads_pf UNIQUE (participant_id, file_id)
        );

        CREATE INDEX idx_participant_downloads_participant_id
            ON participant_downloads(participant_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_participant_downloads_participant_id;
        DROP TABLE IF EXISTS participant_downloads;

        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS ck_jobs_download_cap_nonneg;
        ALTER TABLE jobs DROP COLUMN IF EXISTS download_cap;
        """
    )

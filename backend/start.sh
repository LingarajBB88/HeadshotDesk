#!/bin/sh
# Production entrypoint (Render). Run migrations, then hand off to uvicorn.
# Alembic is idempotent — a deploy with no new migrations is a no-op.
set -e
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000

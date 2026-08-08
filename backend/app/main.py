"""
HeadshotDesk API entrypoint.

Run locally:   uvicorn app.main:app --reload --port 8000
Run via tasks: see scripts/dev.sh
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin,
    auth,
    clients,
    files,
    gallery,
    jobs,
    participants,
    public,
    referrals,
)
from app.config import settings

logger = logging.getLogger(__name__)

app = FastAPI(
    title="HeadshotDesk API",
    version="0.1.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url=None,
)

# CORS — allow the Next.js frontend (localhost in dev, real domain in prod).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.env}


@app.get("/health/storage")
def health_storage() -> dict[str, object]:
    """Round-trip a tiny object through the storage backend.

    Photo and logo uploads fail *silently* when storage writes fail (the
    upload endpoint skips the file and returns 200), which cost a live
    shoot on 2026-07-27. This makes the storage layer answerable without
    digging through logs: hit it after any deploy or credential change.
    """
    from app.services import storage_service

    key = "healthcheck/roundtrip.txt"
    payload = b"headshotdesk-storage-ok"
    mode = "local-disk" if not settings.r2_access_key_id else "r2"
    try:
        storage_service.save(key=key, content=payload, content_type="text/plain")
        got = storage_service.read(key=key)
        storage_service.delete(key=key)
        if got != payload:
            return {"status": "error", "mode": mode, "detail": "read mismatch"}
        return {
            "status": "ok",
            "mode": mode,
            "bucket": settings.r2_bucket if mode == "r2" else None,
            "jurisdiction": settings.r2_jurisdiction or None,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Storage health check failed")
        return {
            "status": "error",
            "mode": mode,
            "bucket": settings.r2_bucket if mode == "r2" else None,
            "detail": f"{type(exc).__name__}: {exc}",
        }


# v0.1 routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
# Participants router has nested + direct routes; mount at /api/v1.
app.include_router(participants.router, prefix="/api/v1", tags=["participants"])
app.include_router(public.router, prefix="/api/v1/public", tags=["public"])
# F5b.1 public gallery — token-only auth, no JWT.
app.include_router(gallery.router, prefix="/api/v1/public/gallery", tags=["gallery"])
# Files router has nested + direct routes; mount at /api/v1.
app.include_router(files.router, prefix="/api/v1", tags=["files"])
# HSD-66 operator dashboard — admin-only, gated in the router's deps.
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
# Referrals: the photographer's own link under /api/v1, the funnel and the
# free-seat pool under /api/v1/admin (that router carries the admin gate).
app.include_router(referrals.router, prefix="/api/v1", tags=["referrals"])
app.include_router(
    referrals.admin_router, prefix="/api/v1/admin", tags=["admin"]
)
# HSD-36 clients (branding owner for jobs).
app.include_router(clients.router, prefix="/api/v1/clients", tags=["clients"])

# Wired up as features ship:
# app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])

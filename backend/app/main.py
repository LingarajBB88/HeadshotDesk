"""
HeadshotDesk API entrypoint.

Run locally:   uvicorn app.main:app --reload --port 8000
Run via tasks: see scripts/dev.sh
"""
import logging

from fastapi import Depends, FastAPI, Response, status
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
    studio,
)
from app.api.deps import require_verified_email
from app.config import settings

logger = logging.getLogger(__name__)

# Error tracking. Initialised before the app so startup failures are caught
# too. Without a DSN this is a no-op, so local development and tests never
# send anything.
if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # Participant names, emails and photos flow through this API. An
        # error report is not a reason to copy any of it to a third party.
        send_default_pii=False,
    )

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
def health(response: Response) -> dict[str, object]:
    """Readiness, not just liveness.

    This is what Render polls, so it has to mean "can serve real traffic".
    It used to return 200 unconditionally without touching the database,
    which meant an instance whose Postgres connection had died looked
    perfectly healthy: never restarted, never alerted on, 500ing every
    request until somebody noticed by hand.

    Returns 503 when the database is unreachable so the platform can act on
    it. Storage is checked separately at /health/storage because a storage
    outage shouldn't take the whole API down: the shoot queue keeps working
    without it.
    """
    from sqlalchemy import text

    from app.db import SessionLocal

    try:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        finally:
            db.close()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Health check failed: database unreachable")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "error",
            "env": settings.env,
            "database": "unreachable",
            "detail": f"{type(exc).__name__}",
        }
    return {"status": "ok", "env": settings.env, "database": "ok"}


@app.get("/health/live")
def health_live() -> dict[str, str]:
    """Liveness: is the process running at all?

    Separate from /health on purpose. If the database is down, restarting
    the container doesn't help and thrashing it makes recovery slower, so
    this stays cheap and always-200 for anything that just needs to know
    the process hasn't wedged.
    """
    return {"status": "ok", "env": settings.env}


@app.get("/health/storage")
def health_storage(response: Response) -> dict[str, object]:
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
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "error", "mode": mode, "detail": "read mismatch"}
        return {
            "status": "ok",
            "mode": mode,
            "bucket": settings.r2_bucket if mode == "r2" else None,
            "jurisdiction": settings.r2_jurisdiction or None,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Storage health check failed")
        # A real status code, so an uptime monitor can watch this without
        # parsing the body. Previously it returned 200 with an error inside,
        # which is invisible to every alerting tool there is.
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "error",
            "mode": mode,
            "bucket": settings.r2_bucket if mode == "r2" else None,
            "detail": f"{type(exc).__name__}: {exc}",
        }


# v0.1 routers
#
# `verified` gates the entire authenticated API. Applied here rather than
# endpoint by endpoint so a new route can't accidentally ship unguarded:
# forgetting one decorator is how a "no fake accounts" rule quietly stops
# being true.
#
# Auth stays open — it's how you get verified in the first place — and the
# public routers are token-only surfaces for participants and clients, who
# have no HeadshotDesk account at all.
verified = [Depends(require_verified_email)]

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(
    jobs.router, prefix="/api/v1/jobs", tags=["jobs"], dependencies=verified
)
# Participants router has nested + direct routes; mount at /api/v1.
app.include_router(
    participants.router,
    prefix="/api/v1",
    tags=["participants"],
    dependencies=verified,
)
app.include_router(public.router, prefix="/api/v1/public", tags=["public"])
# F5b.1 public gallery — token-only auth, no JWT.
app.include_router(gallery.router, prefix="/api/v1/public/gallery", tags=["gallery"])
# Files router has nested + direct routes; mount at /api/v1.
app.include_router(
    files.router, prefix="/api/v1", tags=["files"], dependencies=verified
)
# HSD-66 operator dashboard — admin-only, gated in the router's deps.
app.include_router(admin.router, prefix="/api/v1/admin", tags=["admin"])
# Referrals: the photographer's own link under /api/v1, the funnel and the
# free-seat pool under /api/v1/admin (that router carries the admin gate).
app.include_router(
    referrals.router,
    prefix="/api/v1",
    tags=["referrals"],
    dependencies=verified,
)
app.include_router(
    referrals.admin_router, prefix="/api/v1/admin", tags=["admin"]
)
# HSD-36 clients (branding owner for jobs).
app.include_router(
    clients.router,
    prefix="/api/v1/clients",
    tags=["clients"],
    dependencies=verified,
)
# Studio profile: the photographer's own contact details and links.
app.include_router(
    studio.router, prefix="/api/v1", tags=["studio"], dependencies=verified
)

# Wired up as features ship:
# app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])

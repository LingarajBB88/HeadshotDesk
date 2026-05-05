"""
HeadshotDesk API entrypoint.

Run locally:   uvicorn app.main:app --reload --port 8000
Run via tasks: see scripts/dev.sh
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth
from app.config import settings

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


# v0.1 routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])

# Wired up as features ship:
# app.include_router(jobs.router, prefix="/api/v1/jobs", tags=["jobs"])
# app.include_router(participants.router, prefix="/api/v1/participants", tags=["participants"])
# app.include_router(files.router, prefix="/api/v1/files", tags=["files"])
# app.include_router(public.router, prefix="/api/v1/public", tags=["public"])
# app.include_router(billing.router, prefix="/api/v1/billing", tags=["billing"])

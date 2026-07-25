"""
HSD-36 — Client business logic. Account-scoped CRUD + logo storage.

Logos are public brand assets (they appear on public signup pages and in
emails), so they're served through an unauthenticated endpoint keyed by the
client's unguessable ULID. Bytes live in storage under client-logos/.
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.ids import new_id
from app.models import Account, Client, Job
from app.services import storage_service

MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB

# Accepted upload types → storage extension.
LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/svg+xml": ".svg",
}


def logo_url(client: Client) -> str | None:
    """Absolute URL for the client's logo, or None. Absolute because it's
    embedded in emails and rendered on public pages served from the
    frontend origin."""
    if not client.logo_key:
        return None
    return f"{settings.base_url}/api/v1/public/client-logo/{client.id}"


def list_clients(db: Session, *, account: Account) -> list[Client]:
    return list(
        db.scalars(
            select(Client)
            .where(Client.account_id == account.id)
            .order_by(Client.name.asc())
        ).all()
    )


def get_client(db: Session, *, account: Account, client_id: str) -> Client:
    client = db.get(Client, client_id)
    if client is None or client.account_id != account.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Client not found."
        )
    return client


def job_count(db: Session, *, client: Client) -> int:
    return int(
        db.scalar(
            select(func.count()).select_from(Job).where(Job.client_id == client.id)
        )
        or 0
    )


def create_client(db: Session, *, account: Account, name: str) -> Client:
    name = name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Client name is required.",
        )
    # One client per name per account: repeat bookings should reuse the
    # existing record (that's the whole point of the entity).
    existing = db.scalar(
        select(Client).where(
            Client.account_id == account.id,
            func.lower(Client.name) == name.lower(),
        )
    )
    if existing is not None:
        return existing
    client = Client(id=new_id("client"), account_id=account.id, name=name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def rename_client(
    db: Session, *, account: Account, client_id: str, name: str
) -> Client:
    client = get_client(db, account=account, client_id=client_id)
    name = name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Client name is required.",
        )
    client.name = name
    # Keep the display name on linked jobs in sync (client_name is the
    # legacy free-text field the UI still shows).
    for job in db.scalars(select(Job).where(Job.client_id == client.id)).all():
        job.client_name = name
    db.commit()
    db.refresh(client)
    return client


def delete_client(db: Session, *, account: Account, client_id: str) -> None:
    client = get_client(db, account=account, client_id=client_id)
    if job_count(db, client=client) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This client still has jobs. Reassign or archive them first.",
        )
    if client.logo_key:
        storage_service.delete(key=client.logo_key)
    db.delete(client)
    db.commit()


def set_logo(
    db: Session,
    *,
    account: Account,
    client_id: str,
    content: bytes,
    content_type: str,
) -> Client:
    client = get_client(db, account=account, client_id=client_id)
    ext = LOGO_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logo must be a PNG, JPEG, or SVG.",
        )
    if len(content) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Logo is too large (2 MB max).",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file."
        )
    # Replace: drop the old object when the extension changes so we don't
    # leak orphans under a stale key.
    old_key = client.logo_key
    new_key = f"client-logos/{client.id}{ext}"
    storage_service.save(key=new_key, content=content, content_type=content_type)
    if old_key and old_key != new_key:
        storage_service.delete(key=old_key)
    client.logo_key = new_key
    client.logo_content_type = content_type
    db.commit()
    db.refresh(client)
    return client


def remove_logo(db: Session, *, account: Account, client_id: str) -> Client:
    client = get_client(db, account=account, client_id=client_id)
    if client.logo_key:
        storage_service.delete(key=client.logo_key)
        client.logo_key = None
        client.logo_content_type = None
        db.commit()
        db.refresh(client)
    return client


def read_logo(db: Session, *, client_id: str) -> tuple[bytes, str]:
    """Public read path: bytes + content type, 404 when absent."""
    client = db.get(Client, client_id)
    if client is None or not client.logo_key or not client.logo_content_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found."
        )
    try:
        content = storage_service.read(key=client.logo_key)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found."
        ) from None
    return content, client.logo_content_type

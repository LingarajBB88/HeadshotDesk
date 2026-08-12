"""
Photographer profile: the public page at /p/{handle}.

Three things live here that are easy to get wrong and expensive to fix
later, so they're centralised rather than spread across the API layer.

1. Handles. They address a public URL, so they need to be unique, stable,
   and free of anything that could collide with an app route. A handle that
   shadows /p/settings would be a routing bug that only appears in
   production.

2. Publishing. `profile_published` gates the whole page, and so does the
   owner's email verification. Anyone can start a free trial, so an
   indexable page hosting uploaded images is a spam magnet unless both
   gates hold. `public_profile` is the only read path, and it checks both.

3. Images. Portraits and portfolio shots are public bytes served from an
   unauthenticated endpoint, so type and size are validated on the way in,
   not on the way out.
"""
from __future__ import annotations

import re

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.ids import new_id
from app.models import Account, User
from app.services import storage_service

# A portfolio is a taste of the work, not a gallery. Small enough that a
# photographer picks their best rather than dumping a shoot, and small
# enough that the page stays fast on a phone.
MAX_PORTFOLIO_IMAGES = 8
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

HANDLE_MIN = 3
HANDLE_MAX = 40
_HANDLE_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

# Names that would either collide with a real route or let someone pass
# themselves off as us. `/p/` namespaces the profile pages, so the collision
# risk is small today, but handles get reused in emails, support requests
# and eventually subdomains, and taking them back later is a broken-link
# event for the photographer.
RESERVED_HANDLES = {
    "about", "account", "admin", "api", "app", "assets", "auth", "billing",
    "blog", "contact", "dashboard", "docs", "faq", "g", "gallery", "help",
    "headshotdesk", "home", "jobs", "legal", "login", "logout", "me", "new",
    "p", "photographer", "photographers", "pricing", "privacy", "profile",
    "q", "r", "root", "s", "search", "security", "settings", "signup",
    "static", "status", "support", "team", "terms", "tour", "trial", "www",
}


# --- handles -----------------------------------------------------------


def normalise_handle(raw: str) -> str:
    """Lowercase, trim, and validate. Raises 422 with a message meant to be
    shown to the photographer as-is."""
    value = (raw or "").strip().lower()
    # People paste the whole URL when asked for the last part of it.
    value = value.rstrip("/").rsplit("/", 1)[-1]

    if len(value) < HANDLE_MIN or len(value) > HANDLE_MAX:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Your profile address needs to be between {HANDLE_MIN} and "
                f"{HANDLE_MAX} characters."
            ),
        )
    if not _HANDLE_RE.match(value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Use lowercase letters, numbers, and single hyphens between "
                "words. For example: panther-studios"
            ),
        )
    if value in RESERVED_HANDLES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="That address is reserved. Try another.",
        )
    return value


def suggest_handle(db: Session, *, name: str) -> str:
    """A first guess from the studio name, guaranteed free.

    Only a suggestion: the photographer can overwrite it. The point is that
    the field is never empty when they open it, because a blank slug field
    is where good intentions to publish go to die.
    """
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    base = re.sub(r"-{2,}", "-", base)[:HANDLE_MAX].strip("-")
    if len(base) < HANDLE_MIN or base in RESERVED_HANDLES:
        base = f"studio-{new_id('h')[-6:].lower()}"

    candidate = base
    suffix = 2
    while _handle_taken(db, candidate, exclude_account_id=None):
        tail = f"-{suffix}"
        candidate = base[: HANDLE_MAX - len(tail)] + tail
        suffix += 1
    return candidate


def _handle_taken(
    db: Session, handle: str, *, exclude_account_id: str | None
) -> bool:
    stmt = select(Account.id).where(func.lower(Account.handle) == handle)
    if exclude_account_id is not None:
        stmt = stmt.where(Account.id != exclude_account_id)
    return db.scalar(stmt) is not None


def set_handle(db: Session, *, account: Account, raw: str) -> Account:
    handle = normalise_handle(raw)
    if handle == (account.handle or ""):
        return account
    if _handle_taken(db, handle, exclude_account_id=account.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That address is already taken. Try another.",
        )
    account.handle = handle
    return account


def profile_url(account: Account) -> str | None:
    """Absolute, because it goes in emails. None when there's nothing to
    link: an unpublished profile is a 404, and linking one would be worse
    than not linking at all."""
    if not account.handle or not account.profile_published:
        return None
    return f"{settings.frontend_url.rstrip('/')}/p/{account.handle}"


# --- images ------------------------------------------------------------


def _validate_image(content: bytes, content_type: str) -> str:
    ext = IMAGE_TYPES.get(content_type)
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Images must be JPEG, PNG, or WebP.",
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file."
        )
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That image is too large (5 MB max).",
        )
    return ext


def set_portrait(
    db: Session, *, account: Account, content: bytes, content_type: str
) -> Account:
    ext = _validate_image(content, content_type)
    old_key = account.portrait_key
    new_key = f"profile-portraits/{account.id}{ext}"
    storage_service.save(key=new_key, content=content, content_type=content_type)
    # A format change leaves the old object orphaned under a stale key.
    if old_key and old_key != new_key:
        storage_service.delete(key=old_key)
    account.portrait_key = new_key
    account.portrait_content_type = content_type
    db.commit()
    db.refresh(account)
    return account


def remove_portrait(db: Session, *, account: Account) -> Account:
    if account.portrait_key:
        storage_service.delete(key=account.portrait_key)
        account.portrait_key = None
        account.portrait_content_type = None
        db.commit()
        db.refresh(account)
    return account


def portrait_url(account: Account) -> str | None:
    if not account.portrait_key:
        return None
    return f"{settings.base_url}/api/v1/public/profile-portrait/{account.id}"


def portfolio_image_url(account: Account, image_id: str) -> str:
    return (
        f"{settings.base_url}/api/v1/public/profile-image/"
        f"{account.id}/{image_id}"
    )


def add_portfolio_image(
    db: Session,
    *,
    account: Account,
    content: bytes,
    content_type: str,
    caption: str | None = None,
) -> dict:
    ext = _validate_image(content, content_type)
    existing = list(account.portfolio or [])
    if len(existing) >= MAX_PORTFOLIO_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"A profile holds up to {MAX_PORTFOLIO_IMAGES} images. "
                "Remove one to add another."
            ),
        )
    image_id = new_id("pfimg")
    key = f"profile-portfolio/{account.id}/{image_id}{ext}"
    storage_service.save(key=key, content=content, content_type=content_type)
    entry = {
        "id": image_id,
        "key": key,
        "content_type": content_type,
        "caption": (caption or "").strip()[:120] or None,
    }
    # Reassign rather than append: JSONB columns are only marked dirty when
    # the attribute itself changes, so an in-place append silently doesn't
    # save.
    account.portfolio = existing + [entry]
    db.commit()
    db.refresh(account)
    return entry


def remove_portfolio_image(
    db: Session, *, account: Account, image_id: str
) -> Account:
    existing = list(account.portfolio or [])
    match = next((i for i in existing if i.get("id") == image_id), None)
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found."
        )
    storage_service.delete(key=match["key"])
    account.portfolio = [i for i in existing if i.get("id") != image_id]
    db.commit()
    db.refresh(account)
    return account


def reorder_portfolio(
    db: Session, *, account: Account, image_ids: list[str]
) -> Account:
    """Order is the photographer's editorial choice; the first image is what
    a visitor sees first. Unknown ids are ignored and missing ones keep
    their relative order at the end, so a stale client can't delete work by
    sending an incomplete list."""
    existing = list(account.portfolio or [])
    by_id = {i["id"]: i for i in existing}
    ordered = [by_id[i] for i in image_ids if i in by_id]
    seen = {i["id"] for i in ordered}
    ordered += [i for i in existing if i["id"] not in seen]
    account.portfolio = ordered
    db.commit()
    db.refresh(account)
    return account


def set_caption(
    db: Session, *, account: Account, image_id: str, caption: str | None
) -> Account:
    existing = list(account.portfolio or [])
    if not any(i.get("id") == image_id for i in existing):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Image not found."
        )
    account.portfolio = [
        {**i, "caption": ((caption or "").strip()[:120] or None)}
        if i.get("id") == image_id
        else i
        for i in existing
    ]
    db.commit()
    db.refresh(account)
    return account


def read_portrait(db: Session, *, account_id: str) -> tuple[bytes, str]:
    account = db.get(Account, account_id)
    if (
        account is None
        or not account.portrait_key
        or not account.portrait_content_type
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    try:
        return storage_service.read(key=account.portrait_key), (
            account.portrait_content_type
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        ) from None


def read_portfolio_image(
    db: Session, *, account_id: str, image_id: str
) -> tuple[bytes, str]:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    match = next(
        (i for i in (account.portfolio or []) if i.get("id") == image_id), None
    )
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        )
    try:
        return storage_service.read(key=match["key"]), match["content_type"]
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not found."
        ) from None


# --- the public read path ----------------------------------------------


def owner_is_verified(db: Session, *, account_id: str) -> bool:
    return (
        db.scalar(
            select(User.id).where(
                User.account_id == account_id,
                User.email_verified_at.is_not(None),
            )
        )
        is not None
    )


def public_profile(db: Session, *, handle: str) -> Account:
    """The only read path for a profile page.

    404, not 403, when it isn't publishable. A stranger guessing handles
    should not be able to tell the difference between "nobody has this
    address", "they haven't published yet", and "that account never
    confirmed its email".
    """
    normalised = (handle or "").strip().lower()
    account = db.scalar(
        select(Account).where(func.lower(Account.handle) == normalised)
    )
    if (
        account is None
        or not account.profile_published
        or not owner_is_verified(db, account_id=account.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found."
        )
    return account

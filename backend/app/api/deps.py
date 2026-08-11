"""Shared FastAPI dependencies."""
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db import get_db
from app.models import Account, User


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Decode the Bearer token, look up the user, raise 401 on any failure."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    if payload.get("typ") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Wrong token type.",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject."
        )

    user = db.get(User, user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists."
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """HSD-66 — gate for the operator dashboard. Membership comes from the
    ADMIN_EMAILS env var and is checked server-side on every request; the
    frontend's is_admin flag is cosmetic only."""
    from app.config import settings

    if user.email.lower() not in settings.admin_email_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required."
        )
    return user


def get_current_account(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Account:
    account = db.get(Account, user.account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found."
        )
    return account


def require_verified_email(user: User = Depends(get_current_user)) -> User:
    """Nothing works until the address is confirmed.

    Applied at router level across the whole authenticated API, not per
    endpoint. The narrow version of this gate let an unverified account
    create jobs and upload photos, which meant fake signups could still
    accumulate real data and real storage cost. If the point is to stop
    junk accounts, the gate has to be at the door.

    The handful of routes that stay open are the ones needed to get
    verified: /auth/me, /auth/verify-email, /auth/resend-verification and
    /auth/logout. Everything else 403s with a message the frontend turns
    into the "check your inbox" screen.
    """
    if user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Confirm your email address to start using HeadshotDesk. "
                "We've sent you a link."
            ),
        )
    return user

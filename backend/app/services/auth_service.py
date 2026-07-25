"""
Auth business logic. Routes call into this; the service stays HTTP-agnostic
so it can be reused by background jobs, scripts, or other entrypoints.
"""
from __future__ import annotations

import logging

from datetime import datetime, timezone

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.core.ids import new_id
from app.core.security import (
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    issue_access_token,
    refresh_token_expiry,
    verify_password,
)
from app.models import Account, AuthSession, User
from app.services import email_service

logger = logging.getLogger(__name__)

# Password reset tokens are valid for one hour.
PASSWORD_RESET_TTL = timedelta(hours=1)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _build_token_pair(db: Session, user: User, *, user_agent: str | None, ip: str | None) -> dict:
    """Issue a fresh access + refresh token pair. Persists the AuthSession."""
    refresh_raw = generate_refresh_token()
    session = AuthSession(
        id=new_id("sess"),
        user_id=user.id,
        refresh_token_hash=hash_refresh_token(refresh_raw),
        user_agent=(user_agent or "")[:500] or None,
        ip_address=ip,
        expires_at=refresh_token_expiry(),
    )
    db.add(session)
    db.flush()

    access = issue_access_token(
        user.id,
        claims={"account_id": user.account_id, "role": user.role},
    )
    return {
        "access_token": access,
        "refresh_token": refresh_raw,
        "token_type": "bearer",
        "expires_in": settings.access_token_ttl_minutes * 60,
    }


def signup(
    db: Session,
    *,
    email: str,
    password: str,
    name: str,
    account_name: str,
    account_type: str,
    user_agent: str | None,
    ip: str | None,
) -> tuple[User, Account, dict]:
    """Create a new account + first user (owner). Returns (user, account, tokens)."""
    # Reject duplicate emails up front (cheap check; DB unique constraint is the real guard)
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    account = Account(
        id=new_id("acct"),
        type=account_type,
        name=account_name,
        plan="trial",
    )
    db.add(account)
    db.flush()  # account.id available

    user = User(
        id=new_id("usr"),
        account_id=account.id,
        email=email,
        password_hash=hash_password(password),
        name=name,
        role="owner",
    )
    db.add(user)

    try:
        db.flush()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from e

    tokens = _build_token_pair(db, user, user_agent=user_agent, ip=ip)
    db.commit()
    db.refresh(user)
    db.refresh(account)
    return user, account, tokens


def login(
    db: Session,
    *,
    email: str,
    password: str,
    user_agent: str | None,
    ip: str | None,
) -> tuple[User, Account, dict]:
    user = db.scalar(select(User).where(User.email == email))
    # Constant-ish failure to avoid leaking which emails exist
    if user is None or user.password_hash is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    tokens = _build_token_pair(db, user, user_agent=user_agent, ip=ip)
    db.commit()

    account = db.get(Account, user.account_id)
    return user, account, tokens  # type: ignore[return-value]


def refresh(db: Session, *, refresh_token: str) -> dict:
    """Exchange a valid, unrevoked refresh token for a new access token."""
    token_hash = hash_refresh_token(refresh_token)
    session = db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == token_hash)
    )
    now = _utcnow()
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    user = db.get(User, session.user_id)
    if user is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    access = issue_access_token(
        user.id,
        claims={"account_id": user.account_id, "role": user.role},
    )
    return {
        "access_token": access,
        "token_type": "bearer",
        "expires_in": settings.access_token_ttl_minutes * 60,
    }


def logout(db: Session, *, refresh_token: str) -> None:
    """Revoke the session associated with this refresh token. Idempotent."""
    token_hash = hash_refresh_token(refresh_token)
    session = db.scalar(
        select(AuthSession).where(AuthSession.refresh_token_hash == token_hash)
    )
    if session is not None and session.revoked_at is None:
        session.revoked_at = _utcnow()
        db.commit()


# ============================================================================
# Password reset
# ============================================================================

def request_password_reset(db: Session, *, email: str) -> None:
    """
    Generate a password reset token and email it. Always returns silently —
    we don't reveal whether the email exists in our system, to prevent email
    enumeration attacks.
    """
    user = db.scalar(select(User).where(User.email == email))
    if user is None or user.deleted_at is not None or user.password_hash is None:
        # Pretend we sent the email. Don't leak that the account doesn't exist.
        return

    raw_token = generate_refresh_token()  # reuse: 32 bytes of URL-safe random
    user.password_reset_token_hash = hash_refresh_token(raw_token)
    user.password_reset_token_expires_at = _utcnow() + PASSWORD_RESET_TTL
    db.commit()

    reset_url = f"{settings.frontend_url}/reset-password?token={raw_token}"
    try:
        email_service.send_password_reset_email(
            to_email=user.email,
            reset_url=reset_url,
            user_name=user.name,
        )
    except Exception:  # noqa: BLE001
        # A provider rejection (e.g. Postmark 412 while the account is
        # pending approval) must not surface as a 500: the endpoint is
        # deliberately a quiet 204 either way, and the token stays valid
        # so a retry after the provider recovers still works. Log with
        # traceback for the operator.
        logger.exception(
            "Password reset email to %s failed to send", user.email
        )


def reset_password(db: Session, *, token: str, new_password: str) -> None:
    """Validate token, set new password, invalidate the token + revoke all sessions."""
    token_hash = hash_refresh_token(token)
    user = db.scalar(
        select(User).where(User.password_reset_token_hash == token_hash)
    )
    now = _utcnow()
    if (
        user is None
        or user.password_reset_token_expires_at is None
        or user.password_reset_token_expires_at <= now
        or user.deleted_at is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        )

    # Update password
    user.password_hash = hash_password(new_password)
    # Invalidate the reset token
    user.password_reset_token_hash = None
    user.password_reset_token_expires_at = None

    # Belt and suspenders: revoke every active session for this user, forcing
    # re-login everywhere. If the password was reset because of a compromise,
    # this kicks the attacker out.
    sessions = db.scalars(
        select(AuthSession).where(
            AuthSession.user_id == user.id,
            AuthSession.revoked_at.is_(None),
        )
    ).all()
    for s in sessions:
        s.revoked_at = now

    db.commit()

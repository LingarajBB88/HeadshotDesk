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

# Verification links last a week. Long, deliberately: the realistic failure
# is someone signing up on Friday and coming back to it on Monday, not an
# attacker sitting on a stolen inbox. A short expiry here buys nothing and
# costs support emails.
EMAIL_VERIFICATION_TTL = timedelta(days=7)

# Free trial length, quoted in the welcome email. Kept here rather than
# imported from the admin API so the service layer doesn't depend on a
# route module. api/admin.py holds the copy used for expiry calculations.
TRIAL_DAYS = 31


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
    referral_code: str | None = None,
    invite_code: str | None = None,
) -> tuple[User, Account, dict]:
    """Create a new account + first user (owner). Returns (user, account, tokens).

    A referral code extends the new account's trial; an invite code claims a
    free beta seat if the pool still has one. Neither can fail the signup.
    """
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

    # Referral + invite handling runs after the account exists, so a bad
    # code can never cost someone their signup. Both are best-effort by
    # design: the worst case is an uncredited referral, not a failed
    # registration.
    from app.services import referral_service

    invited = False
    # Captured for the admin notification below: "who is this and how did
    # they find us" is the whole point of that email.
    referrer_name: str | None = None
    try:
        if invite_code:
            invite = referral_service.redeem_invite_code(db, code=invite_code)
            if invite is not None:
                account.plan = "beta"
                account.invite_code = invite.code
                invited = True
        if referral_code:
            row = referral_service.attach_signup(
                db, code=referral_code, account=account
            )
            if row is not None:
                referring = db.get(Account, row.referrer_account_id)
                referrer_name = referring.name if referring else None
            # A beta tester's link passes their seat along: that's the deal
            # during beta, and it means one link per person rather than a
            # separate invite code alongside it. Everyone else's link is
            # attribution only, so seats meant for testers can't leak and
            # the trial is the same length for everybody.
            if row is not None and not invited:
                referrer = db.get(Account, row.referrer_account_id)
                if referrer is not None and referral_service.claim_seat_for_referral(
                    db, referrer=referrer
                ):
                    account.plan = "beta"
                    invited = True
        account.trial_ends_at = referral_service.trial_end_for(invited=invited)
        db.commit()
        db.refresh(account)
    except Exception:  # noqa: BLE001 — the account is what matters
        db.rollback()
        logger.exception("Referral/invite handling failed (account=%s)", account.id)

    # Verification is the ONLY email at signup. The welcome used to go out
    # here too and arrived first, so "here's how to create your first job"
    # landed before "you can't do anything yet". It now follows
    # verification, where its advice is actually actionable.
    try:
        send_verification_email(db, user=user)
    except Exception:  # noqa: BLE001
        logger.exception("Verification email failed (user=%s)", user.id)

    # Tell the team. Last, and best-effort like the rest: an internal
    # notification is never worth failing a registration over.
    try:
        email_service.send_admin_new_signup_email(
            user_name=user.name,
            studio_name=account.name,
            email=user.email,
            plan=account.plan,
            referrer_name=referrer_name,
            invite_code=account.invite_code,
            # Only relevant when a seat was actually taken, and it's the
            # number worth seeing at that moment.
            seats_left=(
                referral_service.seats_remaining(db)
                if account.plan == "beta"
                else None
            ),
        )
    except Exception:  # noqa: BLE001
        logger.exception("Admin signup notification failed (account=%s)", account.id)

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

def send_verification_email(db: Session, *, user: User) -> None:
    """Issue a fresh verification token and email it.

    Best-effort like every other send: a mail failure leaves the token
    valid, so a resend works once the provider recovers.
    """
    if user.email_verified_at is not None:
        return
    raw_token = generate_refresh_token()
    user.email_verification_token_hash = hash_refresh_token(raw_token)
    user.email_verification_sent_at = _utcnow()
    db.commit()

    try:
        email_service.send_email_verification_email(
            to_email=user.email,
            user_name=user.name,
            verify_url=f"{settings.frontend_url}/verify-email?token={raw_token}",
        )
    except Exception:  # noqa: BLE001
        logger.exception("Verification email to %s failed to send", user.email)


def verify_email(db: Session, *, token: str) -> User:
    """Consume a verification token.

    Deliberately explicit about failure, unlike password reset: there's no
    enumeration risk here (the token IS the secret) and a vague error on a
    link someone just clicked is infuriating.
    """
    token_hash = hash_refresh_token(token)
    user = db.scalar(
        select(User).where(User.email_verification_token_hash == token_hash)
    )
    if user is None or user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link isn't valid. Ask for a new one.",
        )
    sent = user.email_verification_sent_at
    if sent is not None and _utcnow() - sent > EMAIL_VERIFICATION_TTL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link has expired. Ask for a new one.",
        )

    user.email_verified_at = _utcnow()
    # One use only.
    user.email_verification_token_hash = None
    db.commit()
    db.refresh(user)

    # Now the welcome makes sense: everything it tells them to do, they can
    # actually do. Best-effort, and only once, since the token is consumed
    # above so this branch can't be re-entered.
    try:
        email_service.send_welcome_email(
            to_email=user.email,
            user_name=user.name,
            trial_days=TRIAL_DAYS,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Welcome email failed (user=%s)", user.id)

    return user


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

    # Tell them it happened. The audience is the person who DIDN'T do this:
    # it's their only signal that someone else took the account.
    try:
        email_service.send_password_changed_email(
            to_email=user.email, user_name=user.name
        )
    except Exception:  # noqa: BLE001 — the reset itself succeeded
        logger.exception("Password-changed notice failed (user=%s)", user.id)

"""Auth API routes: signup, login, refresh, logout, me."""
import ipaddress

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_current_user
from app.db import get_db
from app.models import Account, User
from app.schemas.auth import (
    AccessTokenOnly,
    AccountOut,
    AuthResponse,
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MeResponse,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
    TokenPair,
    UserOut,
)
from app.services import auth_service

router = APIRouter()


def _client_meta(request: Request) -> tuple[str | None, str | None]:
    """Extract user-agent + a validated IP. Behind a proxy you'd parse X-Forwarded-For."""
    user_agent = request.headers.get("user-agent")
    raw_ip = request.client.host if request.client else None
    ip: str | None = None
    if raw_ip:
        try:
            # Validate it's a real IP. TestClient passes "testclient", which is invalid.
            ipaddress.ip_address(raw_ip)
            ip = raw_ip
        except ValueError:
            ip = None
    return user_agent, ip


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthResponse:
    user_agent, ip = _client_meta(request)
    # The query string wins, the cookie is the fallback: someone who follows
    # a fresh link should be credited to that link, not to one they clicked
    # three weeks ago.
    from app.services.referral_service import REFERRAL_COOKIE

    referral_code = payload.referral_code or request.cookies.get(REFERRAL_COOKIE)
    user, account, tokens = auth_service.signup(
        db,
        email=payload.email,
        password=payload.password,
        name=payload.name,
        account_name=payload.account_name,
        account_type=payload.account_type,
        user_agent=user_agent,
        ip=ip,
        referral_code=referral_code,
        invite_code=payload.invite_code,
        attribution=(
            payload.attribution.model_dump() if payload.attribution else None
        ),
    )
    return AuthResponse(
        user=UserOut.model_validate(user),
        account=AccountOut.model_validate(account),
        tokens=TokenPair(**tokens),
    )


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthResponse:
    user_agent, ip = _client_meta(request)
    user, account, tokens = auth_service.login(
        db,
        email=payload.email,
        password=payload.password,
        user_agent=user_agent,
        ip=ip,
    )
    return AuthResponse(
        user=UserOut.model_validate(user),
        account=AccountOut.model_validate(account),
        tokens=TokenPair(**tokens),
    )


@router.post("/refresh", response_model=AccessTokenOnly)
def refresh(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
) -> AccessTokenOnly:
    tokens = auth_service.refresh(db, refresh_token=payload.refresh_token)
    return AccessTokenOnly(**tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    payload: LogoutRequest,
    db: Session = Depends(get_db),
) -> Response:
    auth_service.logout(db, refresh_token=payload.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
) -> Response:
    """
    Always returns 204 — even if the email isn't in our system —
    to prevent email enumeration. The actual reset email is only
    sent if the address belongs to a real account.
    """
    auth_service.request_password_reset(db, email=payload.email)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
) -> Response:
    auth_service.reset_password(
        db, token=payload.token, new_password=payload.new_password
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class VerifyEmailRequest(BaseModel):
    token: str


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
def verify_email(
    payload: VerifyEmailRequest,
    db: Session = Depends(get_db),
) -> Response:
    """Consume a verification link.

    Unauthenticated on purpose: people click these from an email client on
    a phone that isn't logged in, and forcing a login first is how a
    verification flow becomes a support ticket.
    """
    auth_service.verify_email(db, token=payload.token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
def resend_verification(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Send a fresh verification link.

    Quiet 204 whether or not anything was sent: already-verified is not an
    error worth surfacing, it's just nothing to do.
    """
    auth_service.send_verification_email(db, user=user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=MeResponse)
def me(
    user: User = Depends(get_current_user),
    account: Account = Depends(get_current_account),
) -> MeResponse:
    """Return the current user + account. The frontend uses this to bootstrap auth state."""
    from app.config import settings

    return MeResponse(
        user=UserOut.model_validate(user),
        account=AccountOut.model_validate(account),
        is_admin=user.email.lower() in settings.admin_email_set,
    )

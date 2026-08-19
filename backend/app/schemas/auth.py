"""Pydantic request/response schemas for the auth API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.types import StrictEmail


# --- Requests ---

class AttributionIn(BaseModel):
    """First-touch marketing attribution, sent by the signup form."""
    source: str | None = Field(default=None, max_length=120)
    medium: str | None = Field(default=None, max_length=120)
    campaign: str | None = Field(default=None, max_length=120)
    referrer: str | None = Field(default=None, max_length=200)
    landing_path: str | None = Field(default=None, max_length=200)


class SignupRequest(BaseModel):
    email: StrictEmail
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    account_name: str = Field(min_length=1, max_length=120)
    account_type: Literal["photographer", "corporate"] = "photographer"
    # Who sent them. Comes from ?ref= in the URL; the server also falls back
    # to the attribution cookie when the query string was lost along the way.
    referral_code: str | None = Field(default=None, max_length=32)
    # Claims a free beta seat, if the pool still has one. An exhausted pool
    # is silent: the person gets a normal trial rather than an error.
    invite_code: str | None = Field(default=None, max_length=32)
    # Where they came from, captured on their first visit. Every field is
    # attacker-controlled free text from a URL, so lengths are capped and
    # the whole object is stored as-is without being interpolated anywhere
    # that would execute it.
    attribution: AttributionIn | None = None


class LoginRequest(BaseModel):
    email: EmailStr  # Login uses base EmailStr — we just need to look up an existing account.
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: StrictEmail


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


# --- Response shapes ---

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    email_verified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AccountOut(BaseModel):
    id: str
    type: str
    name: str
    plan: str

    model_config = {"from_attributes": True}


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int  # access token lifetime in seconds


class AuthResponse(BaseModel):
    user: UserOut
    account: AccountOut
    tokens: TokenPair


class MeResponse(BaseModel):
    user: UserOut
    account: AccountOut
    # HSD-66: cosmetic flag so the frontend knows to show the Admin nav
    # link. Real enforcement is the require_admin dependency server-side.
    is_admin: bool = False


class AccessTokenOnly(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int

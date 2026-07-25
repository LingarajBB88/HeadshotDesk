"""Pydantic request/response schemas for the auth API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.types import StrictEmail


# --- Requests ---

class SignupRequest(BaseModel):
    email: StrictEmail
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    account_name: str = Field(min_length=1, max_length=120)
    account_type: Literal["photographer", "corporate"] = "photographer"


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

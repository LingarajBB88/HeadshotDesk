"""Pydantic request/response schemas for the auth API."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


# --- Requests ---

class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    account_name: str = Field(min_length=1, max_length=120)
    account_type: Literal["photographer", "corporate"] = "photographer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


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


class AccessTokenOnly(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int

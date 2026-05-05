"""
Auth primitives: password hashing + JWT issue/verify + refresh token helpers.

Strategy:
- Passwords are hashed with Argon2id (modern, memory-hard).
- Access tokens are short-lived JWTs (default 30 min). Stateless verification.
- Refresh tokens are long random strings (32 bytes URL-safe). Stored in DB as SHA256 hashes.
  Hashing means a DB leak doesn't yield usable tokens. Refresh tokens can be revoked.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


# --- Passwords ---

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# --- Access tokens (JWT) ---

def issue_access_token(subject: str, claims: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
        "typ": "access",
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise ValueError(f"invalid token: {e}") from e


# --- Refresh tokens (opaque random strings, hashed at rest) ---

def generate_refresh_token() -> str:
    """Generate a fresh random refresh token. Return raw value to give to the client."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """SHA256 hex digest. Plain hashing is fine — input is high-entropy, no rainbow risk."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_token_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days)

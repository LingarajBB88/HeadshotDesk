"""
Reusable validated types for request schemas.
"""
from typing import Annotated

from pydantic import AfterValidator, EmailStr


def _check_strict_email(value: str) -> str:
    """
    Pydantic's default EmailStr accepts single-char TLDs like `name@gmail.c`,
    which is technically valid in RFC 5321 but virtually always a typo.
    This validator additionally requires:
      - the domain has at least one dot
      - the TLD is at least 2 characters
    """
    domain = value.rsplit("@", 1)[1] if "@" in value else ""
    parts = domain.split(".")
    if len(parts) < 2 or len(parts[-1]) < 2:
        raise ValueError("value is not a valid email address")
    return value


# Drop-in replacement for EmailStr that catches more real-world typos.
StrictEmail = Annotated[EmailStr, AfterValidator(_check_strict_email)]

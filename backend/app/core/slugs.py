"""
Public slug generation for jobs.

Slugs appear in participant signup URLs: headshotdesk.com/s/{slug}
We want them:
- URL-safe (a-z, 0-9, hyphens)
- Reasonably short (10-12 chars typical)
- Hard to guess (so people can't enumerate other shoots)
- Free of confusable chars (no 1/l, 0/O)
"""
import secrets

# Base32 alphabet without confusable characters (Crockford-style)
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def generate_slug(length: int = 10) -> str:
    """Generate a random URL-safe slug. ~10^14 entropy at length=10."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))

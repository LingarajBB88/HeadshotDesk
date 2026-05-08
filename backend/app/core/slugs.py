"""
Public slug generation for jobs.

Slugs appear in participant signup URLs: headshotdesk.com/s/{slug}
We want them:
- URL-safe (a-z, 0-9, hyphens)
- Memorable when possible (derived from job name)
- Hard to guess (random suffix prevents enumeration)
- Free of confusable chars in the random part (no 1/l, 0/O)
"""
import re
import secrets
import unicodedata

# Base32 alphabet without confusable characters (Crockford-style)
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

# Max length of the name-derived prefix. Keeps URLs reasonable even for
# verbose job names like "Quarterly all-hands team headshots, October 2026".
_MAX_NAME_PREFIX = 40


def generate_slug(length: int = 10) -> str:
    """Generate a purely random URL-safe slug. ~10^14 entropy at length=10."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def _slugify(text: str, max_length: int = _MAX_NAME_PREFIX) -> str:
    """
    Convert arbitrary text to a URL-safe slug fragment.
      "Acme HQ Headshots!" → "acme-hq-headshots"
      "Café Q4"            → "cafe-q4"
      "東京カラオケ"        → ""  (no usable chars; caller falls back)
    """
    # Strip accents (é → e). NFKD decomposes; then drop non-ASCII.
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    lower = ascii_only.lower()
    # Replace any run of non-alphanumerics with a single hyphen
    hyphenated = re.sub(r"[^a-z0-9]+", "-", lower).strip("-")
    if len(hyphenated) > max_length:
        hyphenated = hyphenated[:max_length].rstrip("-")
    return hyphenated


def generate_named_slug(name: str) -> str:
    """
    Generate a slug derived from the job name plus a short random suffix.
      generate_named_slug("Acme HQ Headshots") → "acme-hq-headshots-x7d2"
      generate_named_slug("🎉🎊")               → "k3w8sjd9np"  (pure random fallback)

    The 4-char random suffix gives ~10^6 combinations — enough that nobody
    can practically enumerate signup links by guessing common names.
    """
    prefix = _slugify(name)
    if not prefix:
        # Name had no usable chars — fall back to pure random.
        return generate_slug()
    suffix = generate_slug(length=4)
    return f"{prefix}-{suffix}"

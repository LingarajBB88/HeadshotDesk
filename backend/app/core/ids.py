"""ULID-based ID generation. Sortable, URL-safe, 26 chars."""
import ulid


def new_id(prefix: str = "") -> str:
    """
    Generate a prefixed ULID. e.g., new_id('job') -> 'job_01J9R...'
    Prefixes make IDs self-describing in logs and URLs.
    """
    base = ulid.new().str
    return f"{prefix}_{base}" if prefix else base

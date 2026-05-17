"""
Storage abstraction. Uses local disk in dev (no creds needed), R2 in prod.

The interface is small on purpose so file_service stays clean — it just deals
with bytes + keys, doesn't care where they end up.

Storage layout:
    <key> = "{job_id}/{file_id}{ext}"

Local dev paths resolve to /app/uploads/<key> inside the container, which is
volume-mounted to ./backend/uploads on the host so files persist across
container restarts.
"""
from __future__ import annotations

from pathlib import Path

from app.config import settings

_LOCAL_ROOT = Path("/app/uploads")


def _is_local_mode() -> bool:
    """Use local disk if R2 credentials aren't configured."""
    return not (settings.r2_account_id and settings.r2_access_key_id)


def save(*, key: str, content: bytes, content_type: str) -> None:
    """Write a file to storage at the given key."""
    if _is_local_mode():
        path = _LOCAL_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return
    _r2_client().put_object(
        Bucket=settings.r2_bucket,
        Key=key,
        Body=content,
        ContentType=content_type,
    )


def read(*, key: str) -> bytes:
    """Read a file from storage."""
    if _is_local_mode():
        return (_LOCAL_ROOT / key).read_bytes()
    res = _r2_client().get_object(Bucket=settings.r2_bucket, Key=key)
    return res["Body"].read()


def delete(*, key: str) -> None:
    """Best-effort delete. Doesn't raise if the file is already gone."""
    if _is_local_mode():
        path = _LOCAL_ROOT / key
        if path.exists():
            path.unlink()
        return
    _r2_client().delete_object(Bucket=settings.r2_bucket, Key=key)


def exists(*, key: str) -> bool:
    if _is_local_mode():
        return (_LOCAL_ROOT / key).exists()
    try:
        _r2_client().head_object(Bucket=settings.r2_bucket, Key=key)
        return True
    except Exception:  # noqa: BLE001
        return False


# ---------------------------------------------------------------------------
# R2 client (lazy-initialized so dev doesn't need boto3 wired up)

_r2 = None


def _r2_client():  # type: ignore[no-untyped-def]
    global _r2
    if _r2 is not None:
        return _r2
    import boto3

    _r2 = boto3.client(
        service_name="s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )
    return _r2

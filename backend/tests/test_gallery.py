"""End-to-end tests for the public participant gallery (F5b.1).

All endpoints are token-only — no JWT involved. These tests cover:
- Token validation (404s, no info leak)
- Ownership scoping (participant A can't see/touch B's files)
- Download cap enforcement on unique-photo basis
- Re-downloads are free and don't count against cap
"""
import hashlib
import io
import secrets
import zipfile
from datetime import date, timedelta

from fastapi.testclient import TestClient
from PIL import Image


# ============================================================================
# Helpers
# ============================================================================

def _signup(client: TestClient) -> dict:
    payload = {
        "email": f"test_{secrets.token_hex(8)}@example.com",
        "password": "supersecret123",
        "name": "Test User",
        "account_name": f"Studio {secrets.token_hex(4)}",
    }
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _future_date() -> str:
    return (date.today() + timedelta(days=7)).isoformat()


def _create_job(client: TestClient, token: str, **overrides) -> dict:
    payload = {
        "name": "Acme team headshots",
        "shoot_date": _future_date(),
        "location": "HQ",
        **overrides,
    }
    r = client.post("/api/v1/jobs", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def _add_participant(
    client: TestClient, token: str, job_id: str, name: str, email: str
) -> dict:
    r = client.post(
        f"/api/v1/jobs/{job_id}/participants",
        json={"name": name, "email": email},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_jpeg(seed: str = "") -> bytes:
    """Generate a tiny JPEG whose content varies with the seed.

    Identical seeds → identical bytes (useful for content-dedup tests).
    Different seeds → different bytes (so the F5e SHA-256 dedup doesn't
    collapse otherwise-independent test files into the same row, which
    would silently break participant assignment via the sticky-name rule).
    """
    # Use a stable, content-deterministic hash so the same seed reliably
    # produces the same bytes (Python's built-in hash() is salted per process).
    digest = hashlib.md5(seed.encode() if seed else b"empty").digest()
    color = (digest[0], digest[1], digest[2])
    img = Image.new("RGB", (100, 100), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _upload_for(
    client: TestClient, token: str, job_id: str, filename: str
) -> dict:
    r = client.post(
        f"/api/v1/jobs/{job_id}/files",
        files={
            "files": (filename, _make_jpeg(seed=filename), "image/jpeg"),
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ============================================================================
# Token validation — bad / unknown tokens must 404 generically
# ============================================================================

class TestTokenValidation:
    def test_unknown_token_returns_404(self, client: TestClient):
        # A long, random, well-formed token shape that doesn't exist
        r = client.get(f"/api/v1/public/gallery/{secrets.token_urlsafe(40)}")
        assert r.status_code == 404
        assert "not found" in r.json()["detail"].lower()

    def test_short_token_returns_404_without_db_lookup(self, client: TestClient):
        # Short input should be rejected before hitting the DB. Same 404 status
        # so an attacker can't distinguish "too short" from "unknown."
        r = client.get("/api/v1/public/gallery/abc")
        assert r.status_code == 404


# ============================================================================
# Gallery summary endpoint
# ============================================================================

class TestGallerySummary:
    def test_returns_only_own_files(self, client: TestClient):
        """Participant A's gallery shows their files only — not B's."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "alice@example.com")
        bob = _add_participant(client, photographer, job["id"], "Bob", "bob@example.com")

        _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        _upload_for(client, photographer, job["id"], "Alice_002.jpg")
        _upload_for(client, photographer, job["id"], "Bob_001.jpg")

        # Alice's gallery
        r = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["participant_name"] == "Alice"
        assert len(body["files"]) == 2
        assert all("Alice" in f["original_filename"] for f in body["files"])

        # Bob's gallery
        r2 = client.get(f"/api/v1/public/gallery/{bob['gallery_token']}")
        assert r2.status_code == 200
        body2 = r2.json()
        assert len(body2["files"]) == 1
        assert "Bob" in body2["files"][0]["original_filename"]

    def test_archived_job_returns_404(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")

        # Archive the job
        r = client.post(
            f"/api/v1/jobs/{job['id']}/archive", headers=_auth(photographer)
        )
        assert r.status_code == 200

        # Gallery now 404s — same generic message as unknown token
        r = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}")
        assert r.status_code == 404

    def test_default_download_cap_is_one(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")

        r = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}")
        assert r.json()["download_cap"] == 1
        assert r.json()["downloads_used"] == 0

    def test_create_job_with_custom_download_cap(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=3)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")

        r = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}")
        assert r.json()["download_cap"] == 3


# ============================================================================
# Thumbnail endpoint — ownership scoping
# ============================================================================

class TestThumbnailOwnership:
    def test_other_participants_file_returns_404(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        bob = _add_participant(client, photographer, job["id"], "Bob", "b@example.com")

        upload = _upload_for(client, photographer, job["id"], "Bob_001.jpg")
        bobs_file = upload["uploaded"][0]
        # Probing Bob's file_id with Alice's token must NOT succeed
        r = client.get(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{bobs_file['id']}/thumbnail"
        )
        assert r.status_code == 404

    def test_own_file_serves_thumbnail(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        upload = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        f = upload["uploaded"][0]

        r = client.get(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/thumbnail"
        )
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/")
        assert len(r.content) > 0


# ============================================================================
# Download endpoint — cap enforcement, idempotency, ownership
# ============================================================================

class TestDownloadCap:
    def test_first_download_succeeds_and_increments_used(
        self, client: TestClient
    ):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=2)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        upload = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        f = upload["uploaded"][0]

        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/download"
        )
        assert r.status_code == 200
        assert f["original_filename"] in r.headers["content-disposition"]

        # Gallery summary now shows used=1, file marked as downloaded
        s = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}").json()
        assert s["downloads_used"] == 1
        assert s["files"][0]["is_downloaded"] is True

    def test_redownload_does_not_increment_used(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=1)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        upload = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        f = upload["uploaded"][0]

        # First download — uses cap
        r1 = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/download"
        )
        assert r1.status_code == 200

        # Same file again — still 200, used unchanged
        r2 = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/download"
        )
        assert r2.status_code == 200

        s = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}").json()
        assert s["downloads_used"] == 1

    def test_at_cap_new_download_returns_403(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=1)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        u1 = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        u2 = _upload_for(client, photographer, job["id"], "Alice_002.jpg")
        f1 = u1["uploaded"][0]
        f2 = u2["uploaded"][0]

        # Burn the one allowed slot
        r1 = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f1['id']}/download"
        )
        assert r1.status_code == 200

        # Try to grab a second, different file — blocked
        r2 = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f2['id']}/download"
        )
        assert r2.status_code == 403
        assert "limit" in r2.json()["detail"].lower()

    def test_at_cap_redownload_still_works(self, client: TestClient):
        """Even with no remaining cap, the participant can re-grab a photo
        they've already claimed (idempotent insert at the DB level)."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=1)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        upload = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        f = upload["uploaded"][0]

        client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/download"
        )
        # Re-download — still 200 even at cap
        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/download"
        )
        assert r.status_code == 200

    def test_download_cap_zero_blocks_everything(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=0)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        upload = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        f = upload["uploaded"][0]

        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{f['id']}/download"
        )
        assert r.status_code == 403

    def test_download_other_participants_file_returns_404(
        self, client: TestClient
    ):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "a@example.com")
        _bob = _add_participant(client, photographer, job["id"], "Bob", "b@example.com")
        upload = _upload_for(client, photographer, job["id"], "Bob_001.jpg")
        bobs_file = upload["uploaded"][0]

        # Alice tries to download Bob's file — generic 404, no signal
        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/{bobs_file['id']}/download"
        )
        assert r.status_code == 404


# ============================================================================
# Photographer-side: download_cap on Job is editable
# ============================================================================

class TestJobDownloadCapAdmin:
    def test_patch_job_updates_download_cap(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        assert job["download_cap"] == 1

        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"download_cap": 5},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["download_cap"] == 5

    def test_negative_cap_rejected(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"download_cap": -1},
            headers=_auth(token),
        )
        assert r.status_code == 422


# ============================================================================
# Bulk ZIP download — multi-select on the gallery page
# ============================================================================

class TestZipDownload:
    def test_zip_contains_requested_files(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=5)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "a@example.com"
        )
        u1 = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        u2 = _upload_for(client, photographer, job["id"], "Alice_002.jpg")
        f1 = u1["uploaded"][0]
        f2 = u2["uploaded"][0]

        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/zip",
            json={"file_ids": [f1["id"], f2["id"]]},
        )
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/zip"
        # Filename is built from the slugged job + participant
        assert "Acme-team-headshots" in r.headers["content-disposition"]
        assert "Alice" in r.headers["content-disposition"]

        # Open the zip and check both originals are present
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        names = sorted(zf.namelist())
        assert names == ["Alice_001.jpg", "Alice_002.jpg"]

        # downloads_used now reflects two new claims
        s = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}").json()
        assert s["downloads_used"] == 2
        assert sum(1 for f in s["files"] if f["is_downloaded"]) == 2

    def test_zip_over_cap_is_atomic_rejection(self, client: TestClient):
        """If the batch would exceed remaining cap, the request 403s and
        NO download rows are written — atomic."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=1)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "a@example.com"
        )
        u1 = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        u2 = _upload_for(client, photographer, job["id"], "Alice_002.jpg")
        f1 = u1["uploaded"][0]
        f2 = u2["uploaded"][0]

        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/zip",
            json={"file_ids": [f1["id"], f2["id"]]},
        )
        assert r.status_code == 403
        # No partial state — neither file should be marked downloaded
        s = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}").json()
        assert s["downloads_used"] == 0
        assert all(not f["is_downloaded"] for f in s["files"])

    def test_zip_mixed_batch_only_new_counts_against_cap(
        self, client: TestClient
    ):
        """If 2 of 3 requested files are already claimed, only 1 counts as
        a new pick — so it fits when remaining cap = 1."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=3)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "a@example.com"
        )
        u1 = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        u2 = _upload_for(client, photographer, job["id"], "Alice_002.jpg")
        u3 = _upload_for(client, photographer, job["id"], "Alice_003.jpg")
        f1 = u1["uploaded"][0]
        f2 = u2["uploaded"][0]
        f3 = u3["uploaded"][0]

        # Claim two files first via single-file downloads
        for f in (f1, f2):
            client.post(
                f"/api/v1/public/gallery/{alice['gallery_token']}"
                f"/files/{f['id']}/download"
            )
        # Now cap=3, used=2, remaining=1.
        # Bulk-grab all three — 2 are re-downloads (free), 1 is new (uses last).
        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/zip",
            json={"file_ids": [f1["id"], f2["id"], f3["id"]]},
        )
        assert r.status_code == 200, r.text

        s = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}").json()
        assert s["downloads_used"] == 3

    def test_zip_all_redownloads_is_free_even_at_cap(self, client: TestClient):
        """At cap, a bulk request containing ONLY already-claimed files
        succeeds — no new picks, nothing counts."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=1)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "a@example.com"
        )
        u1 = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        f1 = u1["uploaded"][0]
        client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}"
            f"/files/{f1['id']}/download"
        )
        # At cap. Re-bulk-grab just this one — fine.
        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/zip",
            json={"file_ids": [f1["id"]]},
        )
        assert r.status_code == 200

    def test_zip_with_foreign_file_id_returns_404(self, client: TestClient):
        """Including another participant's file_id in the batch must 404
        the whole request — no probing across participants."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer, download_cap=5)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "a@example.com"
        )
        _bob = _add_participant(
            client, photographer, job["id"], "Bob", "b@example.com"
        )
        u1 = _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        u2 = _upload_for(client, photographer, job["id"], "Bob_001.jpg")
        alice_file = u1["uploaded"][0]
        bobs_file = u2["uploaded"][0]

        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/zip",
            json={"file_ids": [alice_file["id"], bobs_file["id"]]},
        )
        assert r.status_code == 404
        # Atomic — even Alice's own file in the batch shouldn't be claimed
        s = client.get(f"/api/v1/public/gallery/{alice['gallery_token']}").json()
        assert s["downloads_used"] == 0

    def test_zip_unknown_token_returns_404(self, client: TestClient):
        r = client.post(
            f"/api/v1/public/gallery/{secrets.token_urlsafe(40)}/files/zip",
            json={"file_ids": ["fil_anything"]},
        )
        assert r.status_code == 404

    def test_zip_empty_file_ids_rejected(self, client: TestClient):
        """Pydantic min_length=1 — empty selection is a 422."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "a@example.com"
        )
        r = client.post(
            f"/api/v1/public/gallery/{alice['gallery_token']}/files/zip",
            json={"file_ids": []},
        )
        assert r.status_code == 422

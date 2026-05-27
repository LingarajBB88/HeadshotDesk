"""F5c — Gallery email delivery tests.

Covers the bulk Deliver endpoint (POST /api/v1/jobs/{job_id}/deliver) and the
per-participant Resend endpoint (POST /api/v1/participants/{id}/resend-gallery).
Mocks `email_service.send_gallery_delivery_email` since we don't want tests to
fire actual Postmark calls (and in dev the function falls back to stdout
without a token anyway, which would clutter pytest output).
"""
import hashlib
import io
import secrets
from datetime import date, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image


# ============================================================================
# Helpers (mirrored from test_gallery for consistency)
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
    client: TestClient,
    token: str,
    job_id: str,
    name: str,
    email: str | None = "x@example.com",
) -> dict:
    body: dict = {"name": name}
    if email:
        body["email"] = email
    r = client.post(
        f"/api/v1/jobs/{job_id}/participants",
        json=body,
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_jpeg(seed: str = "") -> bytes:
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
        files={"files": (filename, _make_jpeg(seed=filename), "image/jpeg")},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ============================================================================
# Bulk Deliver
# ============================================================================

class TestBulkDeliver:
    def test_sends_to_participants_with_photos(self, client: TestClient):
        """Only participants who have at least one assigned photo get emailed."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(client, photographer, job["id"], "Alice", "alice@example.com")
        bob = _add_participant(client, photographer, job["id"], "Bob", "bob@example.com")

        # Alice has photos, Bob doesn't.
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")

        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            r = client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["sent"] == 1
            assert body["skipped_no_photos"] == 1
            assert body["skipped_already_delivered"] == 0
            assert body["skipped_no_email"] == 0
            assert send.call_count == 1
            kwargs = send.call_args.kwargs
            assert kwargs["to_email"] == "alice@example.com"
            assert kwargs["participant_name"] == "Alice"
            assert f"/g/{alice['gallery_token']}" in kwargs["gallery_url"]

        # Alice now has a gallery_sent_at; Bob does not.
        r = client.get(
            f"/api/v1/jobs/{job['id']}/participants", headers=_auth(photographer)
        )
        items = {p["id"]: p for p in r.json()["items"]}
        assert items[alice["id"]]["gallery_sent_at"] is not None
        assert items[bob["id"]]["gallery_sent_at"] is None

    def test_second_click_is_idempotent(self, client: TestClient):
        """Clicking Deliver twice in a row sends each email once."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        _add_participant(client, photographer, job["id"], "Alice", "alice@example.com")
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")

        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            r2 = client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            assert r2.status_code == 200
            body2 = r2.json()
            assert body2["sent"] == 0
            assert body2["skipped_already_delivered"] == 1
            assert send.call_count == 1  # only the first call sent

    def test_skips_participants_without_email(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        _add_participant(
            client, photographer, job["id"], "No Email Joe", email=None
        )
        _upload_for(client, photographer, job["id"], "No Email Joe_001.jpg")

        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            r = client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            assert r.status_code == 200
            body = r.json()
            assert body["sent"] == 0
            assert body["skipped_no_email"] == 1
            assert send.call_count == 0

    def test_job_status_advances_to_delivered_when_all_eligible_sent(
        self, client: TestClient
    ):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        _add_participant(client, photographer, job["id"], "Alice", "alice@example.com")
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")

        with patch("app.services.email_service.send_gallery_delivery_email"):
            client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )

        r = client.get(f"/api/v1/jobs/{job['id']}", headers=_auth(photographer))
        assert r.json()["status"] == "delivered"

    def test_status_advances_when_only_no_email_skips_remain(
        self, client: TestClient
    ):
        """A participant without an email is categorically un-deliverable —
        they won't ever be auto-emailed no matter how many times Deliver is
        clicked. So once every *emailable* participant has been delivered,
        the job advances to `delivered`. Photographer still sees the
        `skipped_no_email` count in the result toast and can handle that
        person manually."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        _add_participant(client, photographer, job["id"], "Alice", "alice@example.com")
        _add_participant(client, photographer, job["id"], "No Email Joe", email=None)
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")
        _upload_for(client, photographer, job["id"], "No Email Joe_001.jpg")

        with patch("app.services.email_service.send_gallery_delivery_email"):
            r = client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            body = r.json()
            assert body["sent"] == 1
            assert body["skipped_no_email"] == 1

        # Job should be marked delivered — the only outstanding participant
        # is uncategorically un-emailable, not "deferred work".
        r = client.get(f"/api/v1/jobs/{job['id']}", headers=_auth(photographer))
        assert r.json()["status"] == "delivered"

    def test_no_photo_skips_dont_block_delivered_status(
        self, client: TestClient
    ):
        """A participant without uploaded photos is categorically un-deliverable
        for this pass — the photographer hasn't shot them yet. They shouldn't
        block the delivered status; the photographer just clicks Deliver
        again once their photos come in."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        _add_participant(
            client, photographer, job["id"], "Alice", "alice@example.com"
        )
        _add_participant(client, photographer, job["id"], "Bob", "bob@example.com")
        # Only Alice has photos at the time of the first Deliver.
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")

        with patch("app.services.email_service.send_gallery_delivery_email"):
            client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )

        r = client.get(f"/api/v1/jobs/{job['id']}", headers=_auth(photographer))
        assert r.json()["status"] == "delivered"

        # Bob's photos come in later. A second Deliver picks him up and the
        # job stays "delivered" (no regression).
        _upload_for(client, photographer, job["id"], "Bob_001.jpg")
        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            r2 = client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            assert r2.json()["sent"] == 1
            assert send.call_count == 1

    def test_send_failure_leaves_participant_unsent_and_status_unchanged(
        self, client: TestClient
    ):
        """If the email send raises, that participant's gallery_sent_at must
        NOT be updated and the job must NOT advance to delivered — they're
        still genuinely eligible-unsent."""
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "alice@example.com"
        )
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")

        with patch(
            "app.services.email_service.send_gallery_delivery_email",
            side_effect=RuntimeError("postmark down"),
        ):
            r = client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            assert r.status_code == 200
            body = r.json()
            assert body["sent"] == 0
            assert len(body["errors"]) == 1
            assert "Alice" in body["errors"][0]

        # gallery_sent_at must still be null on Alice
        r = client.get(
            f"/api/v1/jobs/{job['id']}/participants",
            headers=_auth(photographer),
        )
        items = {p["id"]: p for p in r.json()["items"]}
        assert items[alice["id"]]["gallery_sent_at"] is None

        # And the job must NOT be marked delivered — the only eligible
        # participant didn't actually receive an email.
        r = client.get(f"/api/v1/jobs/{job['id']}", headers=_auth(photographer))
        assert r.json()["status"] != "delivered"

    def test_cross_account_isolation(self, client: TestClient):
        """One photographer can't deliver another's job."""
        a = _signup(client)
        photographer_a = a["tokens"]["access_token"]
        job = _create_job(client, photographer_a)

        b = _signup(client)
        photographer_b = b["tokens"]["access_token"]

        r = client.post(
            f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer_b)
        )
        assert r.status_code == 404


# ============================================================================
# Per-row Resend
# ============================================================================

class TestResendGallery:
    def test_resend_force_sends_even_when_already_delivered(
        self, client: TestClient
    ):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "alice@example.com"
        )
        _upload_for(client, photographer, job["id"], "Alice_001.jpg")

        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            # First delivery via bulk button
            client.post(
                f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(photographer)
            )
            # Then resend should fire even though gallery_sent_at is set
            r = client.post(
                f"/api/v1/participants/{alice['id']}/resend-gallery",
                headers=_auth(photographer),
            )
            assert r.status_code == 200, r.text
            assert send.call_count == 2  # one from Deliver, one from Resend

    def test_resend_rejects_participant_without_photos(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        alice = _add_participant(
            client, photographer, job["id"], "Alice", "alice@example.com"
        )
        # No photos uploaded for Alice yet

        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            r = client.post(
                f"/api/v1/participants/{alice['id']}/resend-gallery",
                headers=_auth(photographer),
            )
            assert r.status_code == 400
            assert "no photos" in r.json()["detail"].lower()
            assert send.call_count == 0

    def test_resend_rejects_participant_without_email(self, client: TestClient):
        a = _signup(client)
        photographer = a["tokens"]["access_token"]
        job = _create_job(client, photographer)
        joe = _add_participant(
            client, photographer, job["id"], "No Email Joe", email=None
        )
        _upload_for(client, photographer, job["id"], "No Email Joe_001.jpg")

        with patch(
            "app.services.email_service.send_gallery_delivery_email"
        ) as send:
            r = client.post(
                f"/api/v1/participants/{joe['id']}/resend-gallery",
                headers=_auth(photographer),
            )
            assert r.status_code == 400
            assert "no email" in r.json()["detail"].lower()
            assert send.call_count == 0

    def test_resend_cross_account_isolation(self, client: TestClient):
        a = _signup(client)
        photographer_a = a["tokens"]["access_token"]
        job = _create_job(client, photographer_a)
        alice = _add_participant(
            client, photographer_a, job["id"], "Alice", "alice@example.com"
        )
        _upload_for(client, photographer_a, job["id"], "Alice_001.jpg")

        b = _signup(client)
        photographer_b = b["tokens"]["access_token"]

        r = client.post(
            f"/api/v1/participants/{alice['id']}/resend-gallery",
            headers=_auth(photographer_b),
        )
        assert r.status_code == 404

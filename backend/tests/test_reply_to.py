"""
Where a participant's reply lands.

Everything sends from HeadshotDesk. Without a ReplyTo header, someone
answering their booking confirmation with "sorry, can I move to the
afternoon" reaches our support inbox, and the photographer never learns the
request was made. That is a silent failure on shoot day, which is the worst
kind.

Photographer-facing mail deliberately has no ReplyTo: we are the right
recipient for a trial warning.
"""
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _signup(client: TestClient) -> dict:
    return client.post(
        "/api/v1/auth/signup",
        json={
            "email": f"p{uuid.uuid4().hex[:8]}@example.com",
            "password": "correct horse battery staple",
            "name": "Pat Photographer",
            "account_name": "Panther Studios",
        },
    ).json()


@pytest.fixture
def outbox(monkeypatch) -> list[dict]:
    """Captures the kwargs handed to Postmark, not to our senders, so this
    tests the header that actually goes out."""
    sent: list[dict] = []
    monkeypatch.setattr(
        "app.services.email_service._send_via_postmark",
        lambda **kw: sent.append(kw),
    )
    # _deliver only reaches Postmark when a token is configured.
    monkeypatch.setattr(
        "app.config.settings.postmark_server_token", "test-token"
    )
    return sent


def _open_job(client: TestClient, tok: str) -> dict:
    job = client.post(
        "/api/v1/jobs",
        json={
            "name": "Acme",
            "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
            "location": "Acme HQ",
        },
        headers=_auth(tok),
    ).json()
    client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"status": "open_for_signup"},
        headers=_auth(tok),
    )
    return job


def _join(client: TestClient, slug: str) -> None:
    client.post(
        f"/api/v1/public/jobs/{slug}/signup",
        json={
            "name": "Jane Doe",
            "email": f"j{uuid.uuid4().hex[:8]}@example.com",
            "consent": True,
        },
    )


class TestParticipantMail:
    def test_uses_the_settings_contact_address(
        self, client: TestClient, outbox
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        client.patch(
            "/api/v1/studio",
            json={"contact_email": "hello@pantherstudios.nl"},
            headers=_auth(tok),
        )
        _join(client, _open_job(client, tok)["public_slug"])

        assert outbox, "nothing was sent"
        assert outbox[-1]["reply_to"] == "hello@pantherstudios.nl"

    def test_falls_back_to_the_owner_login_address(
        self, client: TestClient, outbox
    ):
        """Reaching the photographer at a slightly wrong address beats
        reaching a stranger at the right one."""
        a = _signup(client)
        _join(client, _open_job(client, a["tokens"]["access_token"])["public_slug"])

        assert outbox[-1]["reply_to"] == a["user"]["email"]

    def test_the_contact_address_wins_over_the_login_one(
        self, client: TestClient, outbox
    ):
        """contact_email exists precisely so the login address stays
        private."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        client.patch(
            "/api/v1/studio",
            json={"contact_email": "bookings@pantherstudios.nl"},
            headers=_auth(tok),
        )
        _join(client, _open_job(client, tok)["public_slug"])

        assert outbox[-1]["reply_to"] != a["user"]["email"]


class TestPhotographerMail:
    def test_our_own_mail_has_no_reply_to(self, client: TestClient, outbox):
        """A trial warning should come back to us, not bounce around a
        photographer's own inbox."""
        from app.services import email_service

        email_service.send_trial_ending_email(
            to_email="pat@example.com",
            user_name="Pat",
            studio_name="Panther Studios",
            days_left=7,
            ends_on="Thursday 18 September",
            pricing_url="https://headshotdesk.com/pricing",
        )
        assert outbox[-1].get("reply_to") is None

"""
Notification coverage.

Every one of these is best-effort by design: the thing being announced is
already committed. So each case asserts two things — the right email goes
out, and a mail failure never undoes the action that triggered it.
"""
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _future_date() -> str:
    return (date.today() + timedelta(days=14)).isoformat()


def _signup(client: TestClient, email: str | None = None) -> dict:
    import uuid

    return client.post(
        "/api/v1/auth/signup",
        json={
            "email": email or f"p{uuid.uuid4().hex[:8]}@example.com",
            "password": "correct horse battery staple",
            "name": "Pat Photographer",
            "account_name": "Panther Studios",
        },
    ).json()


def _slot_job(client: TestClient, token: str, **extra) -> dict:
    body = {
        "name": "Acme headshots",
        "shoot_date": _future_date(),
        "location": "Acme HQ",
        "shoot_mode": "time_slot",
        "time_slot_config": {
            "start": "09:00",
            "end": "10:00",
            "slot_minutes": 10,
            "buffer_minutes": 0,
            "breaks": [],
        },
        **extra,
    }
    return client.post("/api/v1/jobs", json=body, headers=_auth(token)).json()


def _public_signup(client: TestClient, slug: str, name: str, email: str) -> dict:
    r = client.post(
        f"/api/v1/public/jobs/{slug}/signup",
        json={"name": name, "email": email, "consent": True},
    )
    return r.json()["participant"]


@pytest.fixture
def outbox(monkeypatch) -> dict[str, list[dict]]:
    """Capture every outbound email by kind."""
    box: dict[str, list[dict]] = {}
    for fn in (
        "send_welcome_email",
        "send_password_changed_email",
        "send_signup_confirmation_email",
        "send_slot_confirmation_email",
        "send_slot_cancelled_email",
        "send_client_delivery_email",
    ):
        box[fn] = []
        monkeypatch.setattr(
            f"app.services.email_service.{fn}",
            (lambda key: lambda **kw: box[key].append(kw))(fn),
        )
    return box


class TestPhotographerEmails:
    def test_signup_sends_welcome(self, client: TestClient, outbox):
        a = _signup(client, "new@example.com")
        assert a["user"]["email"] == "new@example.com"
        assert len(outbox["send_welcome_email"]) == 1
        assert outbox["send_welcome_email"][0]["to_email"] == "new@example.com"
        assert outbox["send_welcome_email"][0]["trial_days"] > 0

    def test_signup_survives_email_failure(self, client: TestClient, monkeypatch):
        def boom(**_kw):
            raise RuntimeError("postmark down")

        monkeypatch.setattr("app.services.email_service.send_welcome_email", boom)
        r = client.post(
            "/api/v1/auth/signup",
            json={
                "email": "resilient@example.com",
                "password": "correct horse battery staple",
                "name": "Pat",
                "account_name": "Studio",
            },
        )
        assert r.status_code in (200, 201), r.text
        assert r.json()["tokens"]["access_token"]


class TestParticipantEmails:
    def test_public_signup_is_confirmed(self, client: TestClient, outbox):
        a = _signup(client)
        job = _slot_job(client, a["tokens"]["access_token"])
        _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")

        sent = outbox["send_signup_confirmation_email"]
        assert len(sent) == 1
        assert sent[0]["to_email"] == "jane@example.com"
        assert sent[0]["time_slots"] is True

    def test_resubmitting_the_form_does_not_mail_twice(
        self, client: TestClient, outbox
    ):
        """Signup is idempotent, so a second submit must stay quiet."""
        a = _signup(client)
        job = _slot_job(client, a["tokens"]["access_token"])
        _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")

        assert len(outbox["send_signup_confirmation_email"]) == 1

    def test_queue_job_confirmation_carries_the_queue_link(
        self, client: TestClient, outbox
    ):
        a = _signup(client)
        job = client.post(
            "/api/v1/jobs",
            json={"name": "Walk-up day", "shoot_date": _future_date()},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        p = _public_signup(client, job["public_slug"], "Ann One", "ann@example.com")

        sent = outbox["send_signup_confirmation_email"][0]
        assert sent["time_slots"] is False
        assert p["gallery_token"] in sent["queue_url"]


class TestSlotChangeEmails:
    def _booked(self, client: TestClient, token: str) -> tuple[dict, dict, str]:
        job = _slot_job(client, token)
        p = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": p["gallery_token"], "slot_start": slots[0]["start"]},
        )
        return job, p, slots[1]["start"]

    def test_photographer_moving_a_slot_tells_the_participant(
        self, client: TestClient, outbox
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job, p, other = self._booked(client, tok)
        outbox["send_slot_confirmation_email"].clear()

        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/book-slot",
            json={"slot_start": other},
            headers=_auth(tok),
        )
        assert r.status_code == 200, r.text
        sent = outbox["send_slot_confirmation_email"]
        assert len(sent) == 1
        # Wording differs: they didn't ask for this.
        assert sent[0]["moved"] is True

    def test_notify_false_stays_quiet(self, client: TestClient, outbox):
        """Shuffling a draft schedule shouldn't mail everyone repeatedly."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job, p, other = self._booked(client, tok)
        outbox["send_slot_confirmation_email"].clear()

        client.post(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/book-slot",
            json={"slot_start": other, "notify": False},
            headers=_auth(tok),
        )
        assert outbox["send_slot_confirmation_email"] == []

    def test_cancelling_names_the_time_being_cancelled(
        self, client: TestClient, outbox
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job, p, _ = self._booked(client, tok)

        r = client.delete(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/booking",
            headers=_auth(tok),
        )
        assert r.status_code == 204
        sent = outbox["send_slot_cancelled_email"]
        assert len(sent) == 1
        assert sent[0]["to_email"] == "jane@example.com"
        assert sent[0]["time_label"]  # the slot they must not turn up for

    def test_cancelling_a_nonexistent_booking_is_silent(
        self, client: TestClient, outbox
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _slot_job(client, tok)
        p = _public_signup(client, job["public_slug"], "Nobody", "no@example.com")

        client.delete(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/booking",
            headers=_auth(tok),
        )
        assert outbox["send_slot_cancelled_email"] == []

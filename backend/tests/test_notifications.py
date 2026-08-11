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


def _signup(client: TestClient, email: str | None = None, **extra) -> dict:
    import uuid

    return client.post(
        "/api/v1/auth/signup",
        json={
            "email": email or f"p{uuid.uuid4().hex[:8]}@example.com",
            "password": "correct horse battery staple",
            "name": "Pat Photographer",
            "account_name": "Panther Studios",
            **extra,
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
        "send_admin_new_signup_email",
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


class TestAdminSignupNotification:
    """Goes to the team inbox, not the person signing up. Its job is to
    answer 'who is this and how did they find us'."""

    def test_every_signup_notifies_the_team(self, client: TestClient, outbox):
        a = _signup(client, "brand.new@example.com")
        sent = outbox["send_admin_new_signup_email"]
        assert len(sent) == 1
        assert sent[0]["email"] == "brand.new@example.com"
        assert sent[0]["plan"] == "trial"
        assert sent[0]["referrer_name"] is None

    def test_it_names_the_referrer(self, client: TestClient, outbox):
        a = _signup(client)
        code = client.get(
            "/api/v1/me/referral", headers=_auth(a["tokens"]["access_token"])
        ).json()["code"]
        outbox["send_admin_new_signup_email"].clear()

        _signup(client, referral_code=code)

        sent = outbox["send_admin_new_signup_email"]
        assert len(sent) == 1
        assert sent[0]["referrer_name"] == "Panther Studios"

    def test_a_failure_here_cannot_break_signup(
        self, client: TestClient, monkeypatch
    ):
        """An internal notification is never worth failing a registration
        over."""

        def boom(**_kw):
            raise RuntimeError("postmark down")

        monkeypatch.setattr(
            "app.services.email_service.send_admin_new_signup_email", boom
        )
        r = client.post(
            "/api/v1/auth/signup",
            json={
                "email": "resilient2@example.com",
                "password": "correct horse battery staple",
                "name": "Pat",
                "account_name": "Studio",
            },
        )
        assert r.status_code in (200, 201)
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


class TestGalleryEmailCopy:
    """The gallery email states this job's rules. Telling someone entitled
    to three photos to "pick the one you like" is the kind of small
    wrongness that generates a support email."""

    def _render(self, **gallery) -> str:
        from app.services.email_service import render_email

        return render_email(
            "gallery_delivery",
            {
                "participant": {"first_name": "Jane", "name": "Jane Doe"},
                "photographer": {"display_name": "Pat"},
                "job": {"name": "STX", "client_name": "STX"},
                "client": {"logo_url": None},
                "app": {"name": "HeadshotDesk"},
                "gallery": {
                    "url": "https://example.com/g/tok",
                    "photo_count": 12,
                    "download_cap": 3,
                    "picks_enabled": False,
                    **gallery,
                },
            },
        )["text"]

    def test_multi_download_cap_is_stated(self):
        body = self._render(download_cap=3)
        assert "download 3 of them" in body
        assert "12 photos" in body

    def test_single_download_reads_naturally(self):
        body = self._render(download_cap=1)
        assert "Pick the one you want" in body
        assert "download 1 of them" not in body

    def test_no_cap_means_unlimited(self):
        body = self._render(download_cap=None)
        assert "as many as you like" in body

    def test_one_photo_is_singular(self):
        body = self._render(photo_count=1)
        assert "is 1 photo" in body

    def test_favourites_only_mentioned_when_enabled(self):
        assert "Star your favourites" not in self._render(picks_enabled=False)
        assert "Star your favourites" in self._render(picks_enabled=True)

    def test_delivery_passes_the_job_rules(self, client: TestClient, outbox):
        """Not just the template: the delivery path must actually send them."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = client.post(
            "/api/v1/jobs",
            json={
                "name": "STX",
                "shoot_date": _future_date(),
                "download_cap": 3,
            },
            headers=_auth(tok),
        ).json()
        assert job["download_cap"] == 3


class TestHealthChecks:
    """The health check is what Render acts on, so it has to mean
    'can serve real traffic', not 'the process started'."""

    def test_health_reports_database_state(self, client: TestClient):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["database"] == "ok"

    def test_health_is_503_when_the_database_is_gone(
        self, client: TestClient, monkeypatch
    ):
        """Without this, a dead connection looks healthy forever."""

        def broken():
            raise RuntimeError("connection refused")

        monkeypatch.setattr("app.db.SessionLocal", broken)
        r = client.get("/health")
        assert r.status_code == 503
        assert r.json()["database"] == "unreachable"

    def test_liveness_stays_up_when_the_database_is_gone(
        self, client: TestClient, monkeypatch
    ):
        """Restarting the container doesn't fix Postgres, and thrashing it
        makes recovery slower."""

        def broken():
            raise RuntimeError("connection refused")

        monkeypatch.setattr("app.db.SessionLocal", broken)
        assert client.get("/health/live").status_code == 200


class TestCapInvariant:
    """Starring and downloading are one allowance. The gallery showed both
    numbers, so any divergence was visible on a single screen."""

    def _job(self, client: TestClient, tok: str, **extra) -> dict:
        return client.post(
            "/api/v1/jobs",
            json={"name": "Caps", "shoot_date": _future_date(), **extra},
            headers=_auth(tok),
        ).json()

    def test_changing_the_download_cap_moves_the_pick_cap(
        self, client: TestClient
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = self._job(client, tok, download_cap=3)
        client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"picks_enabled": True},
            headers=_auth(tok),
        )

        updated = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"download_cap": 4},
            headers=_auth(tok),
        ).json()

        assert updated["download_cap"] == 4
        assert updated["pick_cap"] == 4

    def test_an_explicit_pick_cap_still_wins(self, client: TestClient):
        """The invariant is a default, not a cage: sending both is honoured."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = self._job(client, tok, download_cap=3)

        updated = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"download_cap": 4, "pick_cap": 2},
            headers=_auth(tok),
        ).json()

        assert updated["download_cap"] == 4
        assert updated["pick_cap"] == 2


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

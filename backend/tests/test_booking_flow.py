"""
Booking on a time-slot job.

Two defects drove these tests.

1. Signup and booking were separate requests, so a participant who did both
   in one go received "you're on the list" and then immediately "you're
   booked", and a browser dying between the two left someone signed up with
   no booking and no email saying so.

2. The confirmation offered "Pick another slot" pointing at the bare signup
   page. With the same address that worked, because signup is idempotent
   and rebooking replaces. With a different address the person became a
   second participant holding a second slot, while their first stayed
   blocked. The link now carries their token, and only appears when the
   photographer allows it.
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
def outbox(monkeypatch) -> dict[str, list[dict]]:
    box: dict[str, list[dict]] = {}
    for fn in ("send_signup_confirmation_email", "send_slot_confirmation_email"):
        box[fn] = []
        monkeypatch.setattr(
            f"app.services.email_service.{fn}",
            (lambda key: lambda **kw: box[key].append(kw))(fn),
        )
    return box


@pytest.fixture
def slot_job(client: TestClient):
    """An open time-slot job with a morning of slots."""
    a = _signup(client)
    tok = a["tokens"]["access_token"]
    shoot_day = date.today() + timedelta(days=7)
    job = client.post(
        "/api/v1/jobs",
        json={
            "name": "Acme",
            "shoot_date": shoot_day.isoformat(),
            "location": "Acme HQ",
            "shoot_mode": "time_slot",
        },
        headers=_auth(tok),
    ).json()
    client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={
            "time_slot_config": {
                "start": "09:00",
                "end": "12:00",
                "slot_minutes": 15,
                "breaks": [],
            },
            "status": "open_for_signup",
        },
        headers=_auth(tok),
    )
    slots = client.get(f"/api/v1/public/jobs/{job['public_slug']}/slots").json()
    # Fail here rather than with an IndexError three frames deep when the
    # config shape drifts. Every test below assumes there are slots.
    assert slots["slots"], "fixture produced no bookable slots"
    return {"tok": tok, "job": job, "slots": slots["slots"]}


def _join(client: TestClient, slug: str, slot_start: str | None = None) -> dict:
    body: dict = {
        "name": "Jane Doe",
        "email": f"j{uuid.uuid4().hex[:8]}@example.com",
        "consent": True,
    }
    if slot_start:
        body["slot_start"] = slot_start
    r = client.post(f"/api/v1/public/jobs/{slug}/signup", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


class TestOneEmailNotTwo:
    def test_booking_during_signup_sends_only_the_booking_email(
        self, client: TestClient, slot_job, outbox
    ):
        slug = slot_job["job"]["public_slug"]
        result = _join(client, slug, slot_job["slots"][0]["start"])

        assert result["booked_slot"] is not None
        assert len(outbox["send_slot_confirmation_email"]) == 1
        assert outbox["send_signup_confirmation_email"] == []

    def test_signing_up_without_a_time_still_gets_told_to_pick_one(
        self, client: TestClient, slot_job, outbox
    ):
        _join(client, slot_job["job"]["public_slug"])

        assert len(outbox["send_signup_confirmation_email"]) == 1
        assert outbox["send_slot_confirmation_email"] == []

    def test_a_taken_slot_keeps_the_signup(
        self, client: TestClient, slot_job, outbox
    ):
        """Losing the race is ordinary. Failing the whole form over it
        would throw away a signup that is already valid."""
        slug = slot_job["job"]["public_slug"]
        wanted = slot_job["slots"][0]["start"]
        _join(client, slug, wanted)

        second = _join(client, slug, wanted)
        assert second["slot_taken"] is True
        assert second["booked_slot"] is None
        assert second["participant"]["id"]
        # They still need to hear something, and it must not claim a time.
        assert len(outbox["send_signup_confirmation_email"]) == 1


class TestRescheduleLink:
    def test_absent_by_default(self, client: TestClient, slot_job, outbox):
        """Off unless the photographer opens it. Silently letting people
        move their own appointment is not a default anyone chose."""
        _join(client, slot_job["job"]["public_slug"], slot_job["slots"][0]["start"])
        assert outbox["send_slot_confirmation_email"][0]["reschedule_url"] is None

    def test_present_and_token_carrying_when_allowed(
        self, client: TestClient, slot_job, outbox
    ):
        client.patch(
            f"/api/v1/jobs/{slot_job['job']['id']}",
            json={"allow_reschedule": True},
            headers=_auth(slot_job["tok"]),
        )
        result = _join(
            client, slot_job["job"]["public_slug"], slot_job["slots"][0]["start"]
        )

        url = outbox["send_slot_confirmation_email"][0]["reschedule_url"]
        assert url is not None
        # The token is the whole fix: it names the participant, so the page
        # can move the booking they hold instead of creating another.
        assert f"t={result['participant']['gallery_token']}" in url

    def test_the_photographers_links_ride_along(
        self, client: TestClient, slot_job, outbox
    ):
        client.patch(
            "/api/v1/studio",
            json={"links": [{"label": "How to prepare", "url": "https://p.nl/x"}]},
            headers=_auth(slot_job["tok"]),
        )
        _join(client, slot_job["job"]["public_slug"], slot_job["slots"][0]["start"])

        links = outbox["send_slot_confirmation_email"][0]["links"]
        assert links and links[0]["label"] == "How to prepare"


class TestRebookingDoesNotStrandSlots:
    def test_the_same_participant_moving_frees_their_old_slot(
        self, client: TestClient, slot_job
    ):
        """The behaviour the token link relies on."""
        slug = slot_job["job"]["public_slug"]
        first, second = (s["start"] for s in slot_job["slots"][:2])
        result = _join(client, slug, first)
        token = result["participant"]["gallery_token"]

        client.post(
            f"/api/v1/public/jobs/{slug}/book-slot",
            json={"gallery_token": token, "slot_start": second},
        )

        slots = client.get(f"/api/v1/public/jobs/{slug}/slots").json()["slots"]
        by_start = {s["start"]: s["available"] for s in slots}
        assert by_start[first] is True, "the old slot should have been released"
        assert by_start[second] is False

"""HSD-55 — time-slot booking: config validation, slot generation, booking,
race behavior, rebooking, mode rules, and the schedule view."""
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient


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


def _create_slot_job(client: TestClient, token: str, **config_overrides) -> dict:
    r = client.post(
        "/api/v1/jobs",
        json={
            "name": "Slot shoot",
            "shoot_date": _future_date(),
            "location": "Studio",
            "shoot_mode": "time_slot",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    job = r.json()
    config = {
        "start": "09:00",
        "end": "10:00",
        "slot_minutes": 10,
        "buffer_minutes": 0,
        "breaks": [],
        **config_overrides,
    }
    r = client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"time_slot_config": config},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


def _public_signup(client: TestClient, slug: str, name: str, email: str) -> dict:
    r = client.post(
        f"/api/v1/public/jobs/{slug}/signup",
        json={"name": name, "email": email, "consent": True},
    )
    assert r.status_code == 201, r.text
    return r.json()["participant"]


class TestSlotGeneration:
    def test_slots_generated_from_config(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)  # 09:00-10:00, 10min → 6 slots

        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}/slots")
        assert r.status_code == 200
        slots = r.json()["slots"]
        assert len(slots) == 6
        assert all(s["available"] for s in slots)
        assert slots[0]["start"].endswith("09:00:00Z") or "09:00" in slots[0]["start"]

    def test_breaks_and_buffer_respected(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        # 09:00-10:00, 10min slots + 5min buffer, break 09:15-09:30.
        # Grid: 09:00-09:10 ok; next cursor 09:15 overlaps break → jump to
        # 09:30; 09:30-09:40 ok; next 09:45-09:55 ok; next 10:00 doesn't fit.
        job = _create_slot_job(
            client,
            token,
            buffer_minutes=5,
            breaks=[{"start": "09:15", "end": "09:30"}],
        )
        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}/slots")
        slots = r.json()["slots"]
        starts = [s["start"][11:16] for s in slots]
        assert starts == ["09:00", "09:30", "09:45"]

    def test_invalid_config_rejected(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        r = client.post(
            "/api/v1/jobs",
            json={
                "name": "Bad config",
                "shoot_date": _future_date(),
                "location": "Studio",
                "shoot_mode": "time_slot",
            },
            headers=_auth(token),
        )
        job = r.json()
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    "start": "17:00",
                    "end": "09:00",  # end before start
                    "slot_minutes": 10,
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 422

    def test_queue_mode_job_has_no_slots(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        r = client.post(
            "/api/v1/jobs",
            json={
                "name": "Queue job",
                "shoot_date": _future_date(),
                "location": "Studio",
            },
            headers=_auth(token),
        )
        job = r.json()
        assert job["shoot_mode"] == "queue"
        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}/slots")
        assert r.json()["slots"] == []


class TestBooking:
    def test_book_and_see_unavailable(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        p = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": p["gallery_token"], "slot_start": slots[0]["start"]},
        )
        assert r.status_code == 200, r.text

        refreshed = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert refreshed[0]["available"] is False
        assert all(s["available"] for s in refreshed[1:])

    def test_double_booking_conflicts(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        bob = _public_signup(client, job["public_slug"], "Bob Ray", "bob@example.com")

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        first = slots[0]["start"]
        r1 = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": first},
        )
        assert r1.status_code == 200
        r2 = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": bob["gallery_token"], "slot_start": first},
        )
        assert r2.status_code == 409

    def test_rebooking_replaces_previous_slot(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": slots[0]["start"]},
        )
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": slots[1]["start"]},
        )
        assert r.status_code == 200

        refreshed = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert refreshed[0]["available"] is True  # old slot freed
        assert refreshed[1]["available"] is False

    def test_off_grid_time_rejected(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={
                "gallery_token": jane["gallery_token"],
                "slot_start": f"{_future_date()}T09:03:00Z",
            },
        )
        assert r.status_code == 400

    def test_unknown_token_404(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={
                "gallery_token": secrets.token_urlsafe(40),
                "slot_start": slots[0]["start"],
            },
        )
        assert r.status_code == 404


class TestModeRules:
    def test_switching_to_queue_clears_bookings(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": slots[0]["start"]},
        )

        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"shoot_mode": "queue"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        schedule = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()
        assert schedule["entries"] == []

    def test_mode_locked_after_shooting_starts(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        # Mark shot → job in_progress → mode locked.
        r = client.post(
            f"/api/v1/participants/{jane['id']}/mark-shot", headers=_auth(token)
        )
        assert r.status_code == 200
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"shoot_mode": "queue"},
            headers=_auth(token),
        )
        assert r.status_code == 409


class TestSchedule:
    def test_schedule_lists_bookings_chronologically(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        bob = _public_signup(client, job["public_slug"], "Bob Ray", "bob@example.com")
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        # Bob books a LATER slot first; Jane books earlier. Schedule must
        # come back chronological, not insertion-ordered.
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": bob["gallery_token"], "slot_start": slots[3]["start"]},
        )
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": slots[1]["start"]},
        )

        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert [e["participant_name"] for e in entries] == ["Jane Doe", "Bob Ray"]
        assert entries[0]["shot"] is False

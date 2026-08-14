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


class TestBookingConfirmationEmail:
    """Booking your own slot sends a confirmation. It's the participant's
    only record of when to turn up."""

    def test_booking_sends_confirmation(self, client: TestClient, monkeypatch):
        sent: list[dict] = []
        monkeypatch.setattr(
            "app.services.email_service.send_slot_confirmation_email",
            lambda **kw: sent.append(kw),
        )
        a = _signup(client)
        job = _create_slot_job(client, a["tokens"]["access_token"])
        p = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]

        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": p["gallery_token"], "slot_start": slots[0]["start"]},
        )
        assert r.status_code == 200, r.text
        assert len(sent) == 1
        assert sent[0]["to_email"] == "jane@example.com"
        assert sent[0]["participant_name"] == "Jane Doe"
        assert sent[0]["time_label"] == slots[0]["start"][11:16]
        assert sent[0]["minutes"] > 0
        # No reschedule link unless the photographer opened it on this job.
        # It used to point at the bare signup page, where a different email
        # address created a second participant holding a second slot.
        assert sent[0]["reschedule_url"] is None

    def test_email_failure_does_not_lose_the_booking(
        self, client: TestClient, monkeypatch
    ):
        def boom(**_kw):
            raise RuntimeError("postmark down")

        monkeypatch.setattr(
            "app.services.email_service.send_slot_confirmation_email", boom
        )
        a = _signup(client)
        job = _create_slot_job(client, a["tokens"]["access_token"])
        p = _public_signup(client, job["public_slug"], "Jane Doe", "jane@example.com")
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]

        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": p["gallery_token"], "slot_start": slots[0]["start"]},
        )
        assert r.status_code == 200
        refreshed = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert refreshed[0]["available"] is False


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


class TestConfigChangeWithBookings:
    def test_config_change_refused_while_bookings_exist(self, client: TestClient):
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
            json={
                "time_slot_config": {
                    "start": "10:00",
                    "end": "12:00",
                    "slot_minutes": 15,
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 409
        assert "booked" in r.json()["detail"].lower()

    def test_config_change_with_clear_flag_cancels_bookings(
        self, client: TestClient
    ):
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
            json={
                "time_slot_config": {
                    "start": "10:00",
                    "end": "12:00",
                    "slot_minutes": 15,
                },
                "clear_slot_bookings": True,
            },
            headers=_auth(token),
        )
        assert r.status_code == 200
        schedule = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()
        assert schedule["entries"] == []
        # New grid live: 10:00 start, 15-minute slots.
        new_slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert new_slots[0]["start"][11:16] == "10:00"
        assert all(s["available"] for s in new_slots)


class TestMultiDay:
    """HSD-71 — one job spanning several shoot days."""

    def _multi_day_job(self, client: TestClient, token: str) -> tuple[dict, str, str]:
        day1 = (date.today() + timedelta(days=7)).isoformat()
        day2 = (date.today() + timedelta(days=8)).isoformat()
        r = client.post(
            "/api/v1/jobs",
            json={
                "name": "Two-day shoot",
                "shoot_date": day1,
                "extra_shoot_dates": [day2],
                "location": "HQ",
                "shoot_mode": "time_slot",
            },
            headers=_auth(token),
        )
        assert r.status_code == 201, r.text
        job = r.json()
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    "start": "09:00",
                    "end": "10:00",
                    "slot_minutes": 10,
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        return r.json(), day1, day2

    def test_slots_generated_for_every_day(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, day1, day2 = self._multi_day_job(client, token)

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert len(slots) == 12  # 6 per day
        days = sorted({s["start"][:10] for s in slots})
        assert days == sorted([day1, day2])
        # Ordered chronologically across the day boundary.
        assert slots == sorted(slots, key=lambda s: s["start"])

        pub = client.get(f"/api/v1/public/jobs/{job['public_slug']}").json()
        assert pub["shoot_dates"] == sorted([day1, day2])

    def test_booking_on_the_second_day(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, _day1, day2 = self._multi_day_job(client, token)
        p = _public_signup(client, job["public_slug"], "Jane", "jane@example.com")

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        second_day = next(s for s in slots if s["start"].startswith(day2))
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={
                "gallery_token": p["gallery_token"],
                "slot_start": second_day["start"],
            },
        )
        assert r.status_code == 200, r.text
        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert entries[0]["slot_start"].startswith(day2)

    def test_removing_a_day_cancels_only_its_bookings(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, day1, day2 = self._multi_day_job(client, token)
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]

        keep = next(s for s in slots if s["start"].startswith(day1))
        drop = next(s for s in slots if s["start"].startswith(day2))
        for name, email, slot in [
            ("Stays", "stays@example.com", keep),
            ("Goes", "goes@example.com", drop),
        ]:
            p = _public_signup(client, job["public_slug"], name, email)
            r = client.post(
                f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
                json={"gallery_token": p["gallery_token"], "slot_start": slot["start"]},
            )
            assert r.status_code == 200, r.text

        # Dropping day 2 strands one booking → refused without the flag.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"extra_shoot_dates": []},
            headers=_auth(token),
        )
        assert r.status_code == 409
        assert "1 booked slot" in r.json()["detail"]

        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"extra_shoot_dates": [], "clear_slot_bookings": True},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert [e["participant_name"] for e in entries] == ["Stays"]

    def test_day_can_have_its_own_hours(self, client: TestClient):
        """Day two is a half-day: its own window and slot length, without
        touching day one."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, day1, day2 = self._multi_day_job(client, token)

        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    **job["time_slot_config"],
                    "day_overrides": {
                        day2: {
                            "start": "13:00",
                            "end": "14:00",
                            "slot_minutes": 20,
                            "buffer_minutes": 0,
                            "breaks": [],
                        }
                    },
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        d1 = [s["start"][11:16] for s in slots if s["start"].startswith(day1)]
        d2 = [s["start"][11:16] for s in slots if s["start"].startswith(day2)]
        # Day one keeps 09:00-10:00 in 10s; day two is 13:00-14:00 in 20s.
        assert d1 == ["09:00", "09:10", "09:20", "09:30", "09:40", "09:50"]
        assert d2 == ["13:00", "13:20", "13:40"]

    def test_blocked_time_can_target_one_day(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, day1, day2 = self._multi_day_job(client, token)

        # Remove 09:20 on day 2 only.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    **job["time_slot_config"],
                    "blocked": [f"{day2}@09:20"],
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        day1_times = [s["start"][11:16] for s in slots if s["start"].startswith(day1)]
        day2_times = [s["start"][11:16] for s in slots if s["start"].startswith(day2)]
        assert "09:20" in day1_times
        assert "09:20" not in day2_times


class TestSmartConfigChange:
    """Config changes only cancel bookings that fall off the new grid."""

    def _book(self, client, job, name, email, slot_start):
        p = _public_signup(client, job["public_slug"], name, email)
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": p["gallery_token"], "slot_start": slot_start},
        )
        assert r.status_code == 200, r.text
        return p

    def test_extending_the_day_keeps_bookings(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)  # 09:00–10:00, 10-min slots
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        self._book(client, job, "Jane", "jane@example.com", slots[0]["start"])

        # Extend the day: every existing slot still exists → no 409, no flag.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    "start": "09:00",
                    "end": "12:00",
                    "slot_minutes": 10,
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert len(entries) == 1  # booking survived
        fresh = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert len(fresh) == 18  # 09:00–12:00 in 10-min slots
        assert fresh[0]["available"] is False

    def test_block_and_restore_individual_slot(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)  # 09:00–10:00, 6 slots
        cfg = job["time_slot_config"]

        # Remove 09:20: grid drops to 5 slots, cadence unchanged.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": {**cfg, "blocked": ["09:20"]}},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        starts = [s["start"][11:16] for s in slots]
        assert starts == ["09:00", "09:10", "09:30", "09:40", "09:50"]

        # A blocked time can't be booked (off-grid → 400).
        jane = _public_signup(client, job["public_slug"], "Jane", "jane@example.com")
        blocked_start = slots[0]["start"].replace("09:00", "09:20")
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": blocked_start},
        )
        assert r.status_code == 400

        # Removing a BOOKED slot needs the confirm flag (409 first).
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": slots[0]["start"]},
        )
        assert r.status_code == 200
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": {**cfg, "blocked": ["09:00", "09:20"]}},
            headers=_auth(token),
        )
        assert r.status_code == 409

        # Restore 09:20: back to 6 slots.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": {**cfg, "blocked": []}},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert len(slots) == 6

    def test_stale_removals_pruned_on_cadence_change(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)  # 09:00–10:00, 10-min slots
        cfg = job["time_slot_config"]

        # Remove 09:20 on the 10-minute grid.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": {**cfg, "blocked": ["09:20"]}},
            headers=_auth(token),
        )
        assert r.status_code == 200

        # Switch to 17-minute slots: 09:20 doesn't land on the new grid
        # (09:00, 09:17, 09:34) — the stale removal must be pruned, not
        # left to silently eat a future slot.
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    **cfg,
                    "slot_minutes": 17,
                    "blocked": ["09:20"],
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["time_slot_config"]["blocked"] == []
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert slots[0]["start"][11:16] == "09:00"

    def test_extra_slot_with_custom_length(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)  # 09:00–10:00, 10-min slots
        cfg = job["time_slot_config"]

        # Append a 25-minute slot after the day, plus one overlapping the
        # grid (skipped silently).
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={
                "time_slot_config": {
                    **cfg,
                    "extra": [
                        {"start": "10:00", "minutes": 25},
                        {"start": "09:05", "minutes": 30},  # overlaps → skipped
                    ],
                }
            },
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert len(slots) == 7  # 6 grid + 1 extra
        last = slots[-1]
        assert last["start"][11:16] == "10:00"
        assert last["end"][11:16] == "10:25"

        # The extra slot is bookable like any other.
        jane = _public_signup(client, job["public_slug"], "Jane", "jane@example.com")
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": last["start"]},
        )
        assert r.status_code == 200, r.text

    def test_partial_change_cancels_only_nonfitting(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)  # 09:00–10:00
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        jane = self._book(client, job, "Jane", "jane@example.com", slots[0]["start"])
        self._book(client, job, "Bob", "bob@example.com", slots[5]["start"])  # 09:50

        # Shrink to 09:00–09:30: Jane (09:00) fits, Bob (09:50) doesn't.
        new_cfg = {"start": "09:00", "end": "09:30", "slot_minutes": 10}
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": new_cfg},
            headers=_auth(token),
        )
        assert r.status_code == 409
        assert "1 booked slot" in r.json()["detail"]

        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": new_cfg, "clear_slot_bookings": True},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert len(entries) == 1
        assert entries[0]["participant_name"] == "Jane"
        assert jane  # silence unused warning


class TestOwnerAssignment:
    """HSD-55 follow-up: the photographer assigns times to manually added
    participants from the job page."""

    def _add_participant(self, client, token, job_id, name="Manual Mike"):
        r = client.post(
            f"/api/v1/jobs/{job_id}/participants",
            json={"name": name, "email": "mike@example.com"},
            headers=_auth(token),
        )
        assert r.status_code == 201, r.text
        return r.json()

    def test_owner_books_slot_for_participant(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        p = self._add_participant(client, token, job["id"])
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]

        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/book-slot",
            json={"slot_start": slots[0]["start"]},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        assert r.json()["participant_id"] == p["id"]
        # The slot now shows unavailable publicly, and the schedule lists it.
        fresh = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        assert fresh[0]["available"] is False
        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert [e["participant_id"] for e in entries] == [p["id"]]

    def test_owner_booking_taken_slot_conflicts(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        jane = _public_signup(client, job["public_slug"], "Jane", "jane@example.com")
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": jane["gallery_token"], "slot_start": slots[0]["start"]},
        )
        p = self._add_participant(client, token, job["id"])
        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/book-slot",
            json={"slot_start": slots[0]["start"]},
            headers=_auth(token),
        )
        assert r.status_code == 409

    def test_owner_cancels_booking(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_slot_job(client, token)
        p = self._add_participant(client, token, job["id"])
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        client.post(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/book-slot",
            json={"slot_start": slots[0]["start"]},
            headers=_auth(token),
        )
        r = client.delete(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/booking",
            headers=_auth(token),
        )
        assert r.status_code == 204
        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert entries == []
        # Idempotent: cancelling again is still 204.
        r = client.delete(
            f"/api/v1/jobs/{job['id']}/participants/{p['id']}/booking",
            headers=_auth(token),
        )
        assert r.status_code == 204

    def test_other_accounts_participant_is_404(self, client: TestClient):
        a = _signup(client)
        token_a = a["tokens"]["access_token"]
        job_a = _create_slot_job(client, token_a)
        slots = client.get(
            f"/api/v1/public/jobs/{job_a['public_slug']}/slots"
        ).json()["slots"]
        b = _signup(client)
        token_b = b["tokens"]["access_token"]
        job_b = _create_slot_job(client, token_b)
        p_b = self._add_participant(client, token_b, job_b["id"])

        # Account A tries to book A's slot for B's participant.
        r = client.post(
            f"/api/v1/jobs/{job_a['id']}/participants/{p_b['id']}/book-slot",
            json={"slot_start": slots[0]["start"]},
            headers=_auth(token_a),
        )
        assert r.status_code == 404


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

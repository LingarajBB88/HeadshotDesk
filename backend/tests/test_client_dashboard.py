"""HSD-67 — client dashboard: share/revoke lifecycle + public data shape."""
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


def _create_job(client: TestClient, token: str, **extra) -> dict:
    r = client.post(
        "/api/v1/jobs",
        json={
            "name": "Corp shoot",
            "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
            "location": "HQ",
            **extra,
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestClientLinkLifecycle:
    def test_share_returns_stable_token(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)

        r1 = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        )
        assert r1.status_code == 200
        assert "/c/" in r1.json()["url"]
        # Sharing again returns the same link (doesn't rotate silently).
        r2 = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        )
        assert r2.json()["client_token"] == r1.json()["client_token"]

    def test_revoke_kills_the_link(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        ct = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        ).json()["client_token"]

        assert client.get(f"/api/v1/public/client/{ct}").status_code == 200
        r = client.delete(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        )
        assert r.status_code == 204
        assert client.get(f"/api/v1/public/client/{ct}").status_code == 404
        # Re-sharing generates a fresh token.
        ct2 = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        ).json()["client_token"]
        assert ct2 != ct

    def test_other_accounts_job_is_404(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        b = _signup(client)
        r = client.post(
            f"/api/v1/jobs/{job['id']}/client-link",
            headers=_auth(b["tokens"]["access_token"]),
        )
        assert r.status_code == 404


class TestClientDashboardData:
    def test_counts_and_privacy(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)

        # Two public signups; no photos yet.
        for name, email in [("Jane Doe", "jane@example.com"), ("Bob R", "bob@example.com")]:
            r = client.post(
                f"/api/v1/public/jobs/{job['public_slug']}/signup",
                json={"name": name, "email": email, "consent": True},
            )
            assert r.status_code == 201

        ct = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        ).json()["client_token"]
        r = client.get(f"/api/v1/public/client/{ct}")
        assert r.status_code == 200
        data = r.json()
        assert data["job_name"] == "Corp shoot"
        assert data["participants_total"] == 2
        assert data["photographed"] == 0
        assert data["delivered"] == 0
        assert data["photos_uploaded"] == 0
        assert {p["name"] for p in data["participants"]} == {"Jane Doe", "Bob R"}
        # Privacy: no emails or gallery tokens anywhere in the payload.
        assert "jane@example.com" not in r.text
        assert "gallery" not in r.text

    def test_slot_stats_for_time_slot_jobs(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token, shoot_mode="time_slot")
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
        assert r.status_code == 200

        p = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Jane", "email": "jane@example.com", "consent": True},
        ).json()["participant"]
        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/book-slot",
            json={"gallery_token": p["gallery_token"], "slot_start": slots[0]["start"]},
        )

        ct = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        ).json()["client_token"]
        data = client.get(f"/api/v1/public/client/{ct}").json()
        assert data["slots_total"] == 6
        assert data["slots_booked"] == 1
        jane = next(p for p in data["participants"] if p["name"] == "Jane")
        assert jane["slot_time"] == "09:00"
        assert jane["status"] == "signed_up"


class TestMultiDay:
    def test_per_day_breakdown_on_a_two_day_job(self, client: TestClient, db_session):
        from datetime import datetime, timezone

        from app.models import Participant

        a = _signup(client)
        token = a["tokens"]["access_token"]
        day1 = date.today() - timedelta(days=1)
        day2 = date.today() + timedelta(days=6)
        job = _create_job(
            client,
            token,
            shoot_date=day1.isoformat(),
            extra_shoot_dates=[day2.isoformat()],
            shoot_mode="time_slot",
        )
        r = client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"time_slot_config": {"start": "09:00", "end": "10:00", "slot_minutes": 30}},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text

        slots = client.get(
            f"/api/v1/public/jobs/{job['public_slug']}/slots"
        ).json()["slots"]
        by_day = {}
        for s in slots:
            by_day.setdefault(s["start"][:10], []).append(s)
        assert set(by_day) == {day1.isoformat(), day2.isoformat()}

        # Jane on day one (already shot), Bob on day one (no-show),
        # Carol booked for day two, Dave signed up with no time.
        people = {}
        for name, day in [("Jane", day1), ("Bob", day1), ("Carol", day2)]:
            # Past slots are not bookable publicly, so book via the
            # photographer's endpoint for day one.
            p = client.post(
                f"/api/v1/jobs/{job['id']}/participants",
                json={"name": name, "email": f"{name.lower()}@example.com"},
                headers=_auth(token),
            ).json()
            slot = next(
                s for s in by_day[day.isoformat()]
                if s["available"]
            )
            r = client.post(
                f"/api/v1/jobs/{job['id']}/participants/{p['id']}/book-slot",
                json={"slot_start": slot["start"]},
                headers=_auth(token),
            )
            assert r.status_code == 200, r.text
            slot["available"] = False
            people[name] = p
        people["Dave"] = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Dave", "email": "dave@example.com"},
            headers=_auth(token),
        ).json()

        db_session.get(Participant, people["Jane"]["id"]).shot_at = datetime.now(timezone.utc)
        db_session.get(Participant, people["Bob"]["id"]).no_show_at = datetime.now(timezone.utc)
        db_session.commit()

        ct = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        ).json()["client_token"]
        data = client.get(f"/api/v1/public/client/{ct}").json()

        assert data["shoot_dates"] == [day1.isoformat(), day2.isoformat()]
        d1, d2 = data["days"]
        assert d1["date"] == day1.isoformat() and d1["is_past"] is True
        assert (d1["signed_up"], d1["photographed"], d1["no_shows"]) == (2, 1, 1)
        assert d1["slots_booked"] == 2
        assert d2["date"] == day2.isoformat() and d2["is_past"] is False
        assert (d2["signed_up"], d2["photographed"], d2["no_shows"]) == (1, 0, 0)
        assert d2["slots_booked"] == 1
        # Job-wide totals still count everyone, including Dave.
        assert data["participants_total"] == 4

        rows = {p["name"]: p for p in data["participants"]}
        assert rows["Carol"]["day"] == day2.isoformat()
        assert rows["Dave"]["day"] is None
        # Booked people come first in date order, then the unplaced.
        assert [p["name"] for p in data["participants"]][-1] == "Dave"

    def test_single_day_job_has_no_day_blocks(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        ct = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(token)
        ).json()["client_token"]
        data = client.get(f"/api/v1/public/client/{ct}").json()
        assert len(data["shoot_dates"]) == 1
        assert data["days"] == []

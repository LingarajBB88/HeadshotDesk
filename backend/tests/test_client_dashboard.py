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

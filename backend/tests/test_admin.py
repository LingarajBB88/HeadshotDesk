"""HSD-66 — operator dashboard: role gating + metrics correctness."""
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.config import settings


def _signup(client: TestClient, email: str | None = None) -> dict:
    payload = {
        "email": email or f"test_{secrets.token_hex(8)}@example.com",
        "password": "supersecret123",
        "name": "Test User",
        "account_name": f"Studio {secrets.token_hex(4)}",
    }
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201
    out = r.json()
    out["_email"] = payload["email"]
    return out


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _admin_signup(client: TestClient, monkeypatch) -> dict:
    """Create a user and grant it admin via the settings allowlist."""
    a = _signup(client)
    monkeypatch.setattr(
        type(settings),
        "admin_email_set",
        property(lambda self: frozenset({a["_email"].lower()})),
    )
    return a


class TestAdminGate:
    def test_non_admin_gets_403(self, client: TestClient):
        a = _signup(client)
        r = client.get(
            "/api/v1/admin/overview",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 403

    def test_anonymous_gets_401(self, client: TestClient):
        r = client.get("/api/v1/admin/overview")
        assert r.status_code == 401

    def test_me_reports_is_admin_flag(self, client: TestClient, monkeypatch):
        a = _admin_signup(client, monkeypatch)
        r = client.get(
            "/api/v1/auth/me", headers=_auth(a["tokens"]["access_token"])
        )
        assert r.status_code == 200
        assert r.json()["is_admin"] is True

        b = _signup(client)
        r = client.get(
            "/api/v1/auth/me", headers=_auth(b["tokens"]["access_token"])
        )
        assert r.json()["is_admin"] is False


class TestAdminData:
    def test_overview_counts_accounts_and_jobs(
        self, client: TestClient, monkeypatch
    ):
        admin = _admin_signup(client, monkeypatch)
        token = admin["tokens"]["access_token"]

        # A second account with one job.
        other = _signup(client)
        r = client.post(
            "/api/v1/jobs",
            json={
                "name": "Corp shoot",
                "shoot_date": (date.today() + timedelta(days=5)).isoformat(),
                "location": "Office",
            },
            headers=_auth(other["tokens"]["access_token"]),
        )
        assert r.status_code == 201

        r = client.get("/api/v1/admin/overview", headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        assert data["accounts_total"] >= 2
        assert data["jobs_total"] >= 1
        assert data["trials_in_flight"] >= 2  # fresh signups are trials
        assert data["mrr_eur"] == 0  # nobody pays yet
        assert len(data["recent_signups"]) >= 2

    def test_accounts_search_by_email(self, client: TestClient, monkeypatch):
        admin = _admin_signup(client, monkeypatch)
        token = admin["tokens"]["access_token"]
        needle = f"needle_{secrets.token_hex(4)}@example.com"
        _signup(client, email=needle)

        r = client.get(
            "/api/v1/admin/accounts",
            params={"search": needle},
            headers=_auth(token),
        )
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["email"] == needle
        assert items[0]["status"] == "trial"
        assert items[0]["trial_days_left"] is not None

"""
Email verification.

A hard gate: nothing in the authenticated API works until the address is
confirmed. The earlier, narrower version let unverified accounts create
jobs and upload photos, which meant fake signups still accumulated real
data and real storage cost. If the point is to stop junk accounts, the gate
belongs at the door.

The only routes that stay open are the ones needed to get through it.
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


def _token_for(db_session, account_id: str) -> str:
    """Grab the raw token by re-issuing one we can hash-match."""
    from app.core.security import generate_refresh_token, hash_refresh_token
    from app.models import User
    from sqlalchemy import select

    user = db_session.scalar(select(User).where(User.account_id == account_id))
    raw = generate_refresh_token()
    user.email_verification_token_hash = hash_refresh_token(raw)
    db_session.commit()
    return raw


@pytest.mark.unverified
class TestVerificationFlow:
    def test_new_accounts_start_unverified(self, client: TestClient):
        a = _signup(client)
        assert a["user"]["email_verified_at"] is None

    def test_valid_token_verifies(self, client: TestClient, db_session):
        a = _signup(client)
        raw = _token_for(db_session, a["account"]["id"])

        r = client.post("/api/v1/auth/verify-email", json={"token": raw})
        assert r.status_code == 204

        me = client.get(
            "/api/v1/auth/me", headers=_auth(a["tokens"]["access_token"])
        ).json()
        assert me["user"]["email_verified_at"] is not None

    def test_token_is_single_use(self, client: TestClient, db_session):
        a = _signup(client)
        raw = _token_for(db_session, a["account"]["id"])

        assert client.post("/api/v1/auth/verify-email", json={"token": raw}).status_code == 204
        assert client.post("/api/v1/auth/verify-email", json={"token": raw}).status_code == 400

    def test_garbage_token_is_rejected_clearly(self, client: TestClient):
        """No enumeration risk here, so the error can be honest."""
        r = client.post("/api/v1/auth/verify-email", json={"token": "nope"})
        assert r.status_code == 400
        assert "new one" in r.json()["detail"]

    def test_expired_token_is_rejected(self, client: TestClient, db_session):
        from datetime import datetime, timezone

        from sqlalchemy import select

        from app.models import User

        a = _signup(client)
        raw = _token_for(db_session, a["account"]["id"])
        user = db_session.scalar(
            select(User).where(User.account_id == a["account"]["id"])
        )
        user.email_verification_sent_at = datetime.now(timezone.utc) - timedelta(
            days=30
        )
        db_session.commit()

        r = client.post("/api/v1/auth/verify-email", json={"token": raw})
        assert r.status_code == 400
        assert "expired" in r.json()["detail"]

    def test_resend_is_quiet_when_already_verified(
        self, client: TestClient, db_session
    ):
        a = _signup(client)
        raw = _token_for(db_session, a["account"]["id"])
        client.post("/api/v1/auth/verify-email", json={"token": raw})

        r = client.post(
            "/api/v1/auth/resend-verification",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 204


@pytest.mark.unverified
class TestTheGate:
    """Nothing works before verification. The narrow version of this let
    fake accounts create jobs and upload photos, which meant they still
    accumulated real data and real storage cost."""

    def _create_job(self, client: TestClient, tok: str):
        return client.post(
            "/api/v1/jobs",
            json={
                "name": "Acme",
                "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
                "location": "Acme HQ",
            },
            headers=_auth(tok),
        )

    def test_unverified_cannot_create_a_job(self, client: TestClient):
        a = _signup(client)
        r = self._create_job(client, a["tokens"]["access_token"])
        assert r.status_code == 403
        assert "Confirm your email" in r.json()["detail"]

    def test_unverified_cannot_list_jobs(self, client: TestClient):
        a = _signup(client)
        r = client.get(
            "/api/v1/jobs", headers=_auth(a["tokens"]["access_token"])
        )
        assert r.status_code == 403

    def test_unverified_cannot_reach_clients_or_referrals(
        self, client: TestClient
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        assert client.get("/api/v1/clients", headers=_auth(tok)).status_code == 403
        assert (
            client.get("/api/v1/me/referral", headers=_auth(tok)).status_code == 403
        )

    def test_the_routes_needed_to_get_verified_stay_open(
        self, client: TestClient
    ):
        """Otherwise there's no way out of the gate."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        assert client.get("/api/v1/auth/me", headers=_auth(tok)).status_code == 200
        assert (
            client.post(
                "/api/v1/auth/resend-verification", headers=_auth(tok)
            ).status_code
            == 204
        )

    def test_verifying_opens_everything(self, client: TestClient, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        raw = _token_for(db_session, a["account"]["id"])
        client.post("/api/v1/auth/verify-email", json={"token": raw})

        job = self._create_job(client, tok)
        assert job.status_code == 201
        r = client.get(f"/api/v1/public/jobs/{job.json()['public_slug']}")
        assert r.status_code == 200

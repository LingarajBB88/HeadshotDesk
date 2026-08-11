"""
Email verification.

The gate is deliberately narrow: an unverified photographer can work, they
just can't make us email strangers. Locking them out entirely would strand
someone who signs up an hour before a shoot, which is a support call at the
worst possible moment.
"""
import uuid
from datetime import date, timedelta

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


class TestTheGate:
    def _job(self, client: TestClient, tok: str) -> dict:
        return client.post(
            "/api/v1/jobs",
            json={
                "name": "Acme",
                "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
            },
            headers=_auth(tok),
        ).json()

    def test_unverified_can_still_do_the_work(self, client: TestClient):
        """Creating jobs and running a shoot must not be blocked."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = self._job(client, tok)
        assert job["id"]

        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane Doe", "email": "jane@example.com"},
            headers=_auth(tok),
        )
        assert r.status_code == 201

    def test_unverified_cannot_deliver_galleries(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = self._job(client, tok)

        r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
        assert r.status_code == 403
        assert "Confirm your email" in r.json()["detail"]

    def test_unverified_signup_page_is_not_public(self, client: TestClient):
        """404, not 403: a stranger guessing a slug shouldn't learn anything
        about the account behind it."""
        a = _signup(client)
        job = self._job(client, a["tokens"]["access_token"])

        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}")
        assert r.status_code == 404

    def test_verifying_opens_the_signup_page(self, client: TestClient, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = self._job(client, tok)
        raw = _token_for(db_session, a["account"]["id"])
        client.post("/api/v1/auth/verify-email", json={"token": raw})

        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}")
        assert r.status_code == 200

    def test_verifying_allows_delivery(self, client: TestClient, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = self._job(client, tok)
        raw = _token_for(db_session, a["account"]["id"])
        client.post("/api/v1/auth/verify-email", json={"token": raw})

        r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
        # Nothing to deliver, but the gate is open.
        assert r.status_code == 200

"""
Referral tracking and free beta seats.

The theme running through these: neither a referral code nor an invite code
may ever cost someone their signup. A bad code, an exhausted pool, a
self-referral — all of them degrade to "you got a normal account" rather
than an error.
"""
import uuid

import pytest
from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _signup(client: TestClient, **extra) -> dict:
    body = {
        "email": f"p{uuid.uuid4().hex[:8]}@example.com",
        "password": "correct horse battery staple",
        "name": "Pat Photographer",
        "account_name": "Panther Studios",
        **extra,
    }
    r = client.post("/api/v1/auth/signup", json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _my_code(client: TestClient, token: str) -> str:
    r = client.get("/api/v1/me/referral", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["code"]


class TestReferralCodes:
    def test_code_is_minted_on_first_look_and_is_stable(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        first = _my_code(client, tok)
        assert first
        assert _my_code(client, tok) == first

    def test_two_accounts_get_different_codes(self, client: TestClient):
        a = _signup(client)
        b = _signup(client)
        assert _my_code(client, a["tokens"]["access_token"]) != _my_code(
            client, b["tokens"]["access_token"]
        )

    def test_link_records_a_click_and_redirects(self, client: TestClient):
        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])

        r = client.get(f"/api/v1/public/r/{code}", follow_redirects=False)
        assert r.status_code == 302
        assert "signup" in r.headers["location"]

        stats = client.get(
            "/api/v1/me/referral", headers=_auth(a["tokens"]["access_token"])
        ).json()
        assert stats["clicks"] == 1
        assert stats["signups"] == 0

    def test_unknown_code_still_reaches_the_site(self, client: TestClient):
        """A mistyped link should land somewhere useful, not on an error."""
        r = client.get("/api/v1/public/r/NOTREAL", follow_redirects=False)
        assert r.status_code == 302


class TestAttribution:
    def test_signup_through_a_link_is_credited(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        code = _my_code(client, tok)
        client.get(f"/api/v1/public/r/{code}", follow_redirects=False)

        _signup(client, referral_code=code)

        stats = client.get("/api/v1/me/referral", headers=_auth(tok)).json()
        assert stats["signups"] == 1
        # The click and the signup are one row, not two.
        assert stats["clicks"] == 1

    def test_signup_without_a_prior_click_still_counts(self, client: TestClient):
        """Links get pasted as plain text. Credit shouldn't need a cookie."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        code = _my_code(client, tok)

        _signup(client, referral_code=code)

        stats = client.get("/api/v1/me/referral", headers=_auth(tok)).json()
        assert stats["signups"] == 1

    def test_referred_account_gets_a_longer_trial(
        self, client: TestClient, db_session
    ):
        from app.models import Account
        from app.services import referral_service

        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])

        plain = _signup(client)
        referred = _signup(client, referral_code=code)

        plain_end = db_session.get(Account, plain["account"]["id"]).trial_ends_at
        referred_end = db_session.get(
            Account, referred["account"]["id"]
        ).trial_ends_at
        assert plain_end is not None and referred_end is not None
        gained = (referred_end - plain_end).days
        # Allow a day of slack: the two signups aren't simultaneous.
        assert gained >= referral_service.REFERRAL_BONUS_DAYS - 1

    def test_bad_code_does_not_break_signup(self, client: TestClient):
        a = _signup(client, referral_code="TOTALLYWRONG")
        assert a["tokens"]["access_token"]

    def test_self_referral_is_not_credited(self, client: TestClient, db_session):
        """The obvious way to farm a bonus, so it's refused explicitly."""
        from app.models import Account
        from app.services import referral_service

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        code = _my_code(client, tok)
        account = db_session.get(Account, a["account"]["id"])

        row = referral_service.attach_signup(db_session, code=code, account=account)
        assert row is None


class TestFreeSeats:
    def test_invite_claims_a_seat(self, client: TestClient, db_session, monkeypatch):
        from app.services import referral_service

        monkeypatch.setattr("app.config.settings.free_seat_cap", 5)
        invite = referral_service.create_invite_code(db_session, label="Test")

        a = _signup(client, invite_code=invite.code)
        assert a["account"]["plan"] == "beta"
        assert referral_service.seats_used(db_session) == 1

    def test_exhausted_pool_falls_back_to_a_normal_trial(
        self, client: TestClient, db_session, monkeypatch
    ):
        """Running out of seats must not turn anyone away."""
        from app.services import referral_service

        monkeypatch.setattr("app.config.settings.free_seat_cap", 1)
        invite = referral_service.create_invite_code(db_session, max_uses=10)

        first = _signup(client, invite_code=invite.code)
        second = _signup(client, invite_code=invite.code)

        assert first["account"]["plan"] == "beta"
        assert second["account"]["plan"] == "trial"

    def test_max_uses_is_respected(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.services import referral_service

        monkeypatch.setattr("app.config.settings.free_seat_cap", 50)
        invite = referral_service.create_invite_code(db_session, max_uses=1)

        first = _signup(client, invite_code=invite.code)
        second = _signup(client, invite_code=invite.code)

        assert first["account"]["plan"] == "beta"
        assert second["account"]["plan"] == "trial"

    def test_revoked_code_stops_working(
        self, client: TestClient, db_session, monkeypatch
    ):
        from datetime import datetime, timezone

        from app.services import referral_service

        monkeypatch.setattr("app.config.settings.free_seat_cap", 50)
        invite = referral_service.create_invite_code(db_session, max_uses=5)
        invite.revoked_at = datetime.now(timezone.utc)
        db_session.commit()

        a = _signup(client, invite_code=invite.code)
        assert a["account"]["plan"] == "trial"

    def test_unknown_invite_does_not_break_signup(self, client: TestClient):
        a = _signup(client, invite_code="NOPE99")
        assert a["account"]["plan"] == "trial"

    def test_zero_cap_gives_out_nothing(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.services import referral_service

        monkeypatch.setattr("app.config.settings.free_seat_cap", 0)
        invite = referral_service.create_invite_code(db_session, max_uses=5)

        a = _signup(client, invite_code=invite.code)
        assert a["account"]["plan"] == "trial"


class TestAdminGate:
    def test_referral_overview_needs_admin(self, client: TestClient):
        a = _signup(client)
        r = client.get(
            "/api/v1/admin/referrals", headers=_auth(a["tokens"]["access_token"])
        )
        assert r.status_code == 403

    def test_minting_a_code_needs_admin(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/admin/invite-codes",
            json={"max_uses": 1},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 403

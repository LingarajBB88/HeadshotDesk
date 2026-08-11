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

    def test_a_referral_does_not_change_the_trial_length(
        self, client: TestClient, db_session
    ):
        """One reward, on one side. Arriving through a link is attribution,
        not a discount: the two-sided version was impossible to state
        without people assuming both parties got both halves."""
        from app.models import Account

        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])

        plain = _signup(client)
        referred = _signup(client, referral_code=code)

        plain_end = db_session.get(Account, plain["account"]["id"]).trial_ends_at
        referred_end = db_session.get(
            Account, referred["account"]["id"]
        ).trial_ends_at
        assert plain_end is not None and referred_end is not None
        # Same length. Signups aren't simultaneous, so allow a day of slack.
        assert abs((referred_end - plain_end).days) <= 1

    def test_the_referrer_gets_no_extra_trial_days(
        self, client: TestClient, db_session
    ):
        """Only the joiner's trial is extended. The referrer's reward is a
        free month once that person pays, not more trial for themselves."""
        from app.models import Account

        a = _signup(client)
        before = db_session.get(Account, a["account"]["id"]).trial_ends_at
        code = _my_code(client, a["tokens"]["access_token"])

        _signup(client, referral_code=code)

        db_session.expire_all()
        after = db_session.get(Account, a["account"]["id"]).trial_ends_at
        assert after == before

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


def _cap_of(db_session, headroom: int) -> int:
    """A seat cap relative to what's already taken.

    The suite shares one database, so an absolute cap like 5 silently
    depends on how many beta accounts earlier tests created. That made
    these pass alone and fail in a full run.
    """
    from app.services import referral_service

    return referral_service.seats_used(db_session) + headroom


class TestFreeSeats:
    def test_invite_claims_a_seat(self, client: TestClient, db_session, monkeypatch):
        from app.services import referral_service

        before = referral_service.seats_used(db_session)
        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 5)
        )
        invite = referral_service.create_invite_code(db_session, label="Test")

        a = _signup(client, invite_code=invite.code)
        assert a["account"]["plan"] == "beta"
        # Relative, for the same reason as _cap_of: the database is shared.
        assert referral_service.seats_used(db_session) == before + 1

    def test_exhausted_pool_falls_back_to_a_normal_trial(
        self, client: TestClient, db_session, monkeypatch
    ):
        """Running out of seats must not turn anyone away."""
        from app.services import referral_service

        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 1)
        )
        invite = referral_service.create_invite_code(db_session, max_uses=10)

        first = _signup(client, invite_code=invite.code)
        second = _signup(client, invite_code=invite.code)

        assert first["account"]["plan"] == "beta"
        assert second["account"]["plan"] == "trial"

    def test_max_uses_is_respected(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.services import referral_service

        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 50)
        )
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

        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 50)
        )
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


class TestBetaTestersPassSeatsOn:
    """During beta, a tester's link is the invite. One link per person
    rather than a code alongside it."""

    def test_beta_referrer_grants_a_seat(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.services import referral_service

        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 10)
        )
        invite = referral_service.create_invite_code(db_session, max_uses=1)
        tester = _signup(client, invite_code=invite.code)
        assert tester["account"]["plan"] == "beta"

        code = _my_code(client, tester["tokens"]["access_token"])
        friend = _signup(client, referral_code=code)

        assert friend["account"]["plan"] == "beta"

    def test_trial_referrer_grants_days_not_a_seat(
        self, client: TestClient, monkeypatch
    ):
        """Otherwise a trial user could give away seats meant for testers."""
        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 10)
        )
        a = _signup(client)
        assert a["account"]["plan"] == "trial"

        code = _my_code(client, a["tokens"]["access_token"])
        friend = _signup(client, referral_code=code)

        assert friend["account"]["plan"] == "trial"

    def test_empty_pool_falls_back_to_a_normal_trial(
        self, client: TestClient, db_session, monkeypatch
    ):
        """Running out of seats must not turn anyone away, and the referral
        is still credited."""
        from app.models import Account
        from app.services import referral_service

        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 1)
        )
        invite = referral_service.create_invite_code(db_session, max_uses=1)
        tester = _signup(client, invite_code=invite.code)
        # The tester took the only seat.
        code = _my_code(client, tester["tokens"]["access_token"])

        friend = _signup(client, referral_code=code)
        assert friend["account"]["plan"] == "trial"
        row = db_session.get(Account, friend["account"]["id"])
        assert row.trial_ends_at is not None
        stats = client.get(
            "/api/v1/me/referral", headers=_auth(tester["tokens"]["access_token"])
        ).json()
        assert stats["signups"] == 1


class TestRewards:
    def _convert(self, db_session, account_id: str) -> None:
        from app.models import Account
        from app.services import referral_service

        referral_service.mark_converted(
            db_session, account=db_session.get(Account, account_id)
        )

    def test_referrer_earns_months_when_a_referral_pays(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.models import Account

        monkeypatch.setattr("app.config.settings.referral_reward_months", 1)
        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])
        friend = _signup(client, referral_code=code)

        self._convert(db_session, friend["account"]["id"])

        referrer = db_session.get(Account, a["account"]["id"])
        db_session.refresh(referrer)
        assert referrer.credit_months == 1

    def test_converting_twice_does_not_pay_twice(
        self, client: TestClient, db_session, monkeypatch
    ):
        """The obvious future caller is a Stripe webhook, and webhooks
        get retried."""
        from app.models import Account

        monkeypatch.setattr("app.config.settings.referral_reward_months", 1)
        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])
        friend = _signup(client, referral_code=code)

        self._convert(db_session, friend["account"]["id"])
        self._convert(db_session, friend["account"]["id"])

        referrer = db_session.get(Account, a["account"]["id"])
        db_session.refresh(referrer)
        assert referrer.credit_months == 1

    def test_settling_clears_the_balance_once(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.models import Account
        from app.services import referral_service

        monkeypatch.setattr("app.config.settings.referral_reward_months", 2)
        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])
        friend = _signup(client, referral_code=code)
        self._convert(db_session, friend["account"]["id"])

        owed = referral_service.outstanding_rewards(db_session)
        assert len(owed) == 1 and owed[0]["months"] == 2

        referral_service.settle_reward(
            db_session, referral_id=owed[0]["referral_id"]
        )
        referral_service.settle_reward(
            db_session, referral_id=owed[0]["referral_id"]
        )

        referrer = db_session.get(Account, a["account"]["id"])
        db_session.refresh(referrer)
        assert referrer.credit_months == 0
        assert referral_service.outstanding_rewards(db_session) == []

    def test_zero_rate_records_conversion_without_paying(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.models import Account

        monkeypatch.setattr("app.config.settings.referral_reward_months", 0)
        a = _signup(client)
        code = _my_code(client, a["tokens"]["access_token"])
        friend = _signup(client, referral_code=code)

        self._convert(db_session, friend["account"]["id"])

        referrer = db_session.get(Account, a["account"]["id"])
        db_session.refresh(referrer)
        assert referrer.credit_months == 0
        stats = client.get(
            "/api/v1/me/referral", headers=_auth(a["tokens"]["access_token"])
        ).json()
        assert stats["converted"] == 1


class TestInviteChain:
    def test_chain_records_who_invited_whom(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.services import referral_service

        monkeypatch.setattr(
            "app.config.settings.free_seat_cap", _cap_of(db_session, 10)
        )
        a = _signup(client)
        code_a = _my_code(client, a["tokens"]["access_token"])
        b = _signup(client, referral_code=code_a)
        code_b = _my_code(client, b["tokens"]["access_token"])
        c = _signup(client, referral_code=code_b)

        nodes = {n["account_id"]: n for n in referral_service.invite_chain(db_session)}
        assert nodes[b["account"]["id"]]["parent_id"] == a["account"]["id"]
        assert nodes[c["account"]["id"]]["parent_id"] == b["account"]["id"]
        assert nodes[a["account"]["id"]]["parent_id"] is None


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

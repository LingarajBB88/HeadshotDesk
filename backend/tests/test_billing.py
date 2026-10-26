"""HSD-21: plans, paywalls, Stripe checkout and webhook (Stripe mocked)."""
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.ids import new_id


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _signup(client: TestClient) -> dict:
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "email": f"b_{secrets.token_hex(6)}@pantherstudios.nl",
            "password": "supersecret123",
            "name": "Pat Photographer",
            "account_name": "Panther Studios",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _job(client, tok, name="Acme") -> dict:
    r = client.post(
        "/api/v1/jobs",
        json={"name": name, "shoot_date": date.today().isoformat(), "location": "Acme HQ"},
        headers=_auth(tok),
    )
    return r


def _set_plan(db_session, account_id: str, plan: str, **extra) -> None:
    from app.models import Account

    acct = db_session.get(Account, account_id)
    acct.plan = plan
    for k, v in extra.items():
        setattr(acct, k, v)
    db_session.commit()


@pytest.fixture
def billing_on(monkeypatch):
    monkeypatch.setattr(settings, "stripe_secret_key", "sk_test_fake")
    monkeypatch.setattr(settings, "stripe_price_starter_usd", "price_starter_usd")
    monkeypatch.setattr(settings, "stripe_price_pro_usd", "price_pro_usd")
    monkeypatch.setattr(settings, "stripe_price_starter_usd_year", "price_starter_usd_year")
    monkeypatch.setattr(settings, "stripe_price_pro_usd_year", "price_pro_usd_year")
    monkeypatch.setattr(settings, "stripe_webhook_secret", "whsec_fake")


class TestEntitlement:
    def _acct(self, plan, **kw):
        from app.models import Account

        a = Account(id="a", type="photographer", name="x", plan=plan, created_at=datetime.now(timezone.utc))
        for k, v in kw.items():
            setattr(a, k, v)
        return a

    def test_states(self):
        from app.services.billing_service import entitlement

        now = datetime.now(timezone.utc)
        trial = entitlement(self._acct("trial", trial_ends_at=now + timedelta(days=10)))
        assert trial.state == "trial" and not trial.can_deliver and not trial.read_only
        expired = entitlement(self._acct("trial", trial_ends_at=now - timedelta(days=1)))
        assert expired.state == "expired" and expired.read_only
        starter = entitlement(self._acct("starter"))
        assert starter.can_deliver and starter.max_active_jobs == 1 and starter.max_participants is None
        for p in ("pro", "solo", "studio", "beta"):
            e = entitlement(self._acct(p))
            assert e.can_deliver and e.max_active_jobs is None, p
        assert entitlement(self._acct("cancelled")).read_only


class TestPaywallsOff:
    def test_nothing_is_gated_while_billing_is_off(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok).json()
        r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert client.get("/api/v1/billing", headers=_auth(tok)).json()["can_deliver"] is True
        r = client.post("/api/v1/billing/checkout", json={"plan": "pro"}, headers=_auth(tok))
        assert r.status_code == 503


class TestPaywallsOn:
    def test_trial_cannot_deliver_or_resend(self, client: TestClient, billing_on):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok).json()
        r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
        assert r.status_code == 402
        assert "paid plan" in r.json()["detail"]
        status = client.get("/api/v1/billing", headers=_auth(tok)).json()
        assert status["state"] == "trial" and status["can_deliver"] is False

    def test_trial_gallery_link_does_not_open(self, client: TestClient, billing_on, db_session):
        from app.models import Participant

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok).json()
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Mara Visser", "email": "mara@example.com"},
            headers=_auth(tok),
        ).json()
        assert client.get(f"/api/v1/public/gallery/{p['gallery_token']}").status_code == 404
        # Delivered while paying: stays live afterwards.
        db_session.get(Participant, p["id"]).gallery_sent_at = datetime.now(timezone.utc)
        db_session.commit()
        assert client.get(f"/api/v1/public/gallery/{p['gallery_token']}").status_code == 200

    def test_beta_and_pro_deliver(self, client: TestClient, billing_on, db_session):
        for plan in ("beta", "pro"):
            a = _signup(client)
            tok = a["tokens"]["access_token"]
            _set_plan(db_session, a["account"]["id"], plan)
            job = _job(client, tok).json()
            r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
            assert r.status_code == 200, (plan, r.text)

    def test_expired_trial_is_read_only(self, client: TestClient, billing_on, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok).json()
        _set_plan(
            db_session, a["account"]["id"], "trial",
            trial_ends_at=datetime.now(timezone.utc) - timedelta(days=2),
            plan_renews_at=None,
        )
        assert _job(client, tok, "Second").status_code == 402
        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Mara Visser", "email": "mara@example.com"},
            headers=_auth(tok),
        )
        assert r.status_code == 402
        assert client.get("/api/v1/billing", headers=_auth(tok)).json()["read_only"] is True

    def test_starter_limits(self, client: TestClient, billing_on, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        _set_plan(db_session, a["account"]["id"], "starter")
        job = _job(client, tok).json()
        r = _job(client, tok, "Second")
        assert r.status_code == 402 and "one active job" in r.json()["detail"]
        # Archiving the first frees the slot.
        client.post(f"/api/v1/jobs/{job['id']}/archive", headers=_auth(tok))
        assert _job(client, tok, "Third").status_code == 201

    def test_starter_has_no_participant_cap(self, client: TestClient, billing_on, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        _set_plan(db_session, a["account"]["id"], "starter")
        job = _job(client, tok).json()
        for i in range(45):
            r = client.post(
                f"/api/v1/jobs/{job['id']}/participants",
                json={"name": f"Person {i}", "email": f"p{i}_{uuid.uuid4().hex[:4]}@example.com"},
                headers=_auth(tok),
            )
            assert r.status_code == 201, r.text

    def test_read_only_account_refuses_public_signups_politely(self, client: TestClient, billing_on, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok).json()
        client.patch(f"/api/v1/jobs/{job['id']}", json={"status": "open_for_signup"}, headers=_auth(tok))
        _set_plan(
            db_session, a["account"]["id"], "trial",
            trial_ends_at=datetime.now(timezone.utc) - timedelta(days=2), plan_renews_at=None,
        )
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Walk In", "email": "walkin@example.com", "consent": True},
        )
        assert r.status_code == 409
        assert "plan" not in r.json()["detail"].lower()


class FakeStripe:
    def __init__(self):
        self.calls = []
        fake = self

        class Customer:
            @staticmethod
            def create(**kw):
                fake.calls.append(("customer", kw))
                # Unique like Stripe's: stripe_customer_id is unique on
                # accounts, so a fixed ID collides across tests.
                return {"id": f"cus_{secrets.token_hex(6)}"}

        class _Session:
            @staticmethod
            def create(**kw):
                fake.calls.append(("checkout", kw))
                return {"url": "https://checkout.stripe.test/s/abc"}

        class _Portal:
            @staticmethod
            def create(**kw):
                fake.calls.append(("portal", kw))
                return {"url": "https://billing.stripe.test/p/abc"}

        self.Customer = Customer
        self.checkout = SimpleNamespace(Session=_Session)
        self.billing_portal = SimpleNamespace(Session=_Portal)


class TestStripe:
    def test_checkout_creates_customer_and_returns_url(self, client: TestClient, billing_on, monkeypatch, db_session):
        from app.models import Account
        from app.services import billing_service

        fake = FakeStripe()
        monkeypatch.setattr(billing_service, "_stripe", lambda: fake)
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        r = client.post("/api/v1/billing/checkout", json={"plan": "pro"}, headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert r.json()["url"].startswith("https://checkout.stripe.test")
        checkout = [kw for kind, kw in fake.calls if kind == "checkout"][0]
        assert checkout["line_items"][0]["price"] == "price_pro_usd"
        assert checkout["client_reference_id"] == a["account"]["id"]
        db_session.expire_all()
        customer_id = db_session.get(Account, a["account"]["id"]).stripe_customer_id
        assert customer_id and customer_id.startswith("cus_")

        # EUR isn't configured, so it isn't offered.
        r = client.post("/api/v1/billing/checkout", json={"plan": "pro", "currency": "eur"}, headers=_auth(tok))
        assert r.status_code == 422

    def test_annual_checkout_uses_the_yearly_price(self, client: TestClient, billing_on, monkeypatch):
        from app.services import billing_service

        fake = FakeStripe()
        monkeypatch.setattr(billing_service, "_stripe", lambda: fake)
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        status = client.get("/api/v1/billing", headers=_auth(tok)).json()
        assert status["intervals"] == ["month", "year"]
        r = client.post(
            "/api/v1/billing/checkout",
            json={"plan": "starter", "interval": "year"},
            headers=_auth(tok),
        )
        assert r.status_code == 200, r.text
        checkout = [kw for kind, kw in fake.calls if kind == "checkout"][0]
        assert checkout["line_items"][0]["price"] == "price_starter_usd_year"
        assert checkout["metadata"]["interval"] == "year"

    def test_yearly_is_not_offered_without_a_price(self, client: TestClient, billing_on, monkeypatch):
        monkeypatch.setattr(settings, "stripe_price_pro_usd_year", "")
        monkeypatch.setattr(settings, "stripe_price_starter_usd_year", "")
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        assert client.get("/api/v1/billing", headers=_auth(tok)).json()["intervals"] == ["month"]
        r = client.post("/api/v1/billing/checkout", json={"plan": "pro", "interval": "year"}, headers=_auth(tok))
        assert r.status_code == 422

    def test_studio_waitlist_is_remembered_once(self, client: TestClient, billing_on, db_session):
        from app.models import Account

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        assert client.get("/api/v1/billing", headers=_auth(tok)).json()["studio_waitlist"] is False
        assert client.post("/api/v1/billing/studio-waitlist", headers=_auth(tok)).status_code == 204
        db_session.expire_all()
        first = db_session.get(Account, a["account"]["id"]).studio_waitlist_at
        assert first is not None
        assert client.post("/api/v1/billing/studio-waitlist", headers=_auth(tok)).status_code == 204
        db_session.expire_all()
        assert db_session.get(Account, a["account"]["id"]).studio_waitlist_at == first
        assert client.get("/api/v1/billing", headers=_auth(tok)).json()["studio_waitlist"] is True

    def test_subscription_events_set_and_clear_the_plan(self, client: TestClient, billing_on, db_session):
        from app.models import Account
        from app.services import billing_service

        a = _signup(client)
        acct_id = a["account"]["id"]
        _set_plan(db_session, acct_id, "trial", stripe_customer_id=f"cus_{secrets.token_hex(4)}")
        customer = db_session.get(Account, acct_id).stripe_customer_id
        sub = {
            "id": f"sub_{secrets.token_hex(4)}",
            "customer": customer,
            "status": "active",
            "metadata": {},
            "items": {"data": [{"price": {"id": "price_starter_usd", "currency": "usd"}, "current_period_end": 1900000000}]},
        }
        billing_service.handle_event(db_session, {"type": "customer.subscription.created", "data": {"object": sub}})
        db_session.expire_all()
        acct = db_session.get(Account, acct_id)
        assert acct.plan == "starter" and acct.billing_currency == "usd"
        assert acct.billing_interval == "month"
        assert acct.current_period_end is not None

        sub["items"]["data"][0]["price"]["id"] = "price_pro_usd_year"
        billing_service.handle_event(db_session, {"type": "customer.subscription.updated", "data": {"object": sub}})
        db_session.expire_all()
        acct = db_session.get(Account, acct_id)
        assert acct.plan == "pro" and acct.billing_interval == "year"

        sub["status"] = "canceled"
        billing_service.handle_event(db_session, {"type": "customer.subscription.deleted", "data": {"object": sub}})
        db_session.expire_all()
        assert db_session.get(Account, acct_id).plan == "cancelled"

    def test_a_beta_seat_survives_a_cancelled_subscription(self, client: TestClient, billing_on, db_session):
        from app.models import Account
        from app.services import billing_service

        a = _signup(client)
        acct_id = a["account"]["id"]
        _set_plan(db_session, acct_id, "beta", stripe_customer_id=f"cus_{secrets.token_hex(4)}")
        customer = db_session.get(Account, acct_id).stripe_customer_id
        sub = {"id": f"sub_{secrets.token_hex(4)}", "customer": customer, "status": "canceled", "metadata": {},
               "items": {"data": [{"price": {"id": "price_pro_usd", "currency": "usd"}}]}}
        billing_service.handle_event(db_session, {"type": "customer.subscription.deleted", "data": {"object": sub}})
        db_session.expire_all()
        assert db_session.get(Account, acct_id).plan == "beta"

    def test_webhook_rejects_a_bad_signature(self, client: TestClient, billing_on):
        r = client.post(
            "/api/v1/billing/webhook",
            content=b'{"type":"customer.subscription.updated"}',
            headers={"Stripe-Signature": "t=1,v1=nope"},
        )
        assert r.status_code == 400

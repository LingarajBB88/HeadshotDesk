"""
Where an account came from.

Plausible answers "a Facebook group sent 40 visitors". It cannot answer
"which channel produced photographers still paying in month three", because
it never learns who signed up. That is what this stores.

The values arrive from a URL, so they are attacker-controlled free text.
Lengths are capped at the schema and nothing is interpolated anywhere that
would execute it.
"""
import uuid

from fastapi.testclient import TestClient


def _payload(**extra) -> dict:
    return {
        "email": f"p{uuid.uuid4().hex[:8]}@example.com",
        "password": "correct horse battery staple",
        "name": "Pat Photographer",
        "account_name": "Panther Studios",
        **extra,
    }


class TestItIsStored:
    def test_a_utm_tagged_signup_keeps_its_source(
        self, client: TestClient, db_session
    ):
        from app.models import Account

        r = client.post(
            "/api/v1/auth/signup",
            json=_payload(
                attribution={
                    "source": "facebook",
                    "medium": "group",
                    "campaign": "headshot-photographers-nl",
                    "referrer": "facebook.com/groups/123",
                    "landing_path": "/for-clients",
                }
            ),
        )
        assert r.status_code in (200, 201), r.text

        account = db_session.get(Account, r.json()["account"]["id"])
        assert account.attribution["source"] == "facebook"
        assert account.attribution["campaign"] == "headshot-photographers-nl"
        assert account.attribution["landing_path"] == "/for-clients"

    def test_a_referrer_alone_is_enough(self, client: TestClient, db_session):
        """Most real traffic has no UTM tags on it."""
        from app.models import Account

        r = client.post(
            "/api/v1/auth/signup",
            json=_payload(
                attribution={
                    "source": None,
                    "medium": None,
                    "campaign": None,
                    "referrer": "news.ycombinator.com/item",
                    "landing_path": "/",
                }
            ),
        )
        account = db_session.get(Account, r.json()["account"]["id"])
        assert account.attribution["referrer"] == "news.ycombinator.com/item"


class TestItStaysOutOfTheWay:
    def test_signing_up_without_it_still_works(
        self, client: TestClient, db_session
    ):
        """Old clients, blocked storage, and anyone with JavaScript off."""
        from app.models import Account

        r = client.post("/api/v1/auth/signup", json=_payload())
        assert r.status_code in (200, 201), r.text

        account = db_session.get(Account, r.json()["account"]["id"])
        assert account.attribution is None

    def test_an_all_empty_record_is_stored_as_nothing(
        self, client: TestClient, db_session
    ):
        """Otherwise a direct visit looks like a recorded source that
        happens to be blank, and the numbers quietly lie."""
        from app.models import Account

        r = client.post(
            "/api/v1/auth/signup",
            json=_payload(
                attribution={
                    "source": None,
                    "medium": None,
                    "campaign": None,
                    "referrer": None,
                    "landing_path": None,
                }
            ),
        )
        account = db_session.get(Account, r.json()["account"]["id"])
        assert account.attribution is None

    def test_absurd_values_are_rejected_not_truncated(
        self, client: TestClient
    ):
        """A cap the client cannot talk its way past."""
        r = client.post(
            "/api/v1/auth/signup",
            json=_payload(attribution={"source": "x" * 5000}),
        )
        assert r.status_code == 422


class TestTheAdminEmailCarriesIt:
    def test_the_source_arrives_with_the_notification(
        self, client: TestClient, monkeypatch
    ):
        """Knowing the channel when you hear about the signup is the whole
        point. Looking it up later is a thing nobody does."""
        sent: list[dict] = []
        monkeypatch.setattr(
            "app.services.email_service.send_admin_new_signup_email",
            lambda **kw: sent.append(kw),
        )
        client.post(
            "/api/v1/auth/signup",
            json=_payload(
                attribution={
                    "source": "linkedin",
                    "medium": "post",
                    "campaign": None,
                    "referrer": None,
                    "landing_path": "/",
                }
            ),
        )
        assert sent, "no admin notification was sent"
        assert sent[-1]["attribution"]["source"] == "linkedin"

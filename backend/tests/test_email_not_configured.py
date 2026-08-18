"""
Production must never silently skip a send.

This is the postmortem of a real incident. The daily cron ran without
POSTMARK_SERVER_TOKEN, printed two trial warnings to the log, returned
normally, and the caller marked them as sent. The marker exists to prevent
double-sends, so those two emails can never go out. Render reported the job
as successful.

The sent-marker design was already right: it is only written after a send
returns. The flaw was that a missing token looked exactly like a successful
send.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient


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


@pytest.fixture
def production_without_token(monkeypatch):
    """A service that thinks it is production but has no mail credentials.
    Exactly the state the cron shipped in."""
    monkeypatch.setattr("app.config.settings.env", "production")
    monkeypatch.setattr("app.config.settings.postmark_server_token", "")


class TestRefusesToPretend:
    def test_sending_raises_instead_of_logging(self, production_without_token):
        from app.services import email_service

        with pytest.raises(email_service.EmailNotConfigured):
            email_service.send_trial_ending_email(
                to_email="pat@example.com",
                user_name="Pat",
                studio_name="Panther Studios",
                days_left=7,
                ends_on="Thursday 18 September",
                pricing_url="https://headshotdesk.com/pricing",
            )

    def test_development_still_logs(self, monkeypatch, capsys):
        """The dev preview is the whole reason this path exists."""
        from app.services import email_service

        monkeypatch.setattr("app.config.settings.env", "development")
        monkeypatch.setattr("app.config.settings.postmark_server_token", "")
        email_service.send_trial_ending_email(
            to_email="pat@example.com",
            user_name="Pat",
            studio_name="Panther Studios",
            days_left=7,
            ends_on="Thursday 18 September",
            pricing_url="https://headshotdesk.com/pricing",
        )
        assert "[DEV EMAIL]" in capsys.readouterr().out


class TestTheMarkerIsNotBurned:
    def test_a_failed_send_leaves_it_for_tomorrow(
        self, client: TestClient, db_session, production_without_token
    ):
        """The actual damage. Without this, a misconfigured service
        permanently consumes everyone's one warning."""
        from app.models import Account
        from app.services import scheduled_email_service

        a = _signup(client)
        acct = db_session.get(Account, a["account"]["id"])
        acct.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=3)
        db_session.commit()

        sent = scheduled_email_service.send_trial_ending(db_session)

        db_session.expire_all()
        acct = db_session.get(Account, a["account"]["id"])
        assert sent == 0
        assert acct.trial_ending_email_at is None, (
            "the warning was marked as sent even though nothing was sent"
        )

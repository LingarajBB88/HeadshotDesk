"""
Scheduled email.

The property that matters most: running the job twice must not send twice.
Cron jobs get re-run by hand by someone unsure whether the first attempt
worked, and nobody should get two "your trial is ending" emails for it.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

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


@pytest.fixture
def outbox(monkeypatch) -> dict[str, list[dict]]:
    box: dict[str, list[dict]] = {}
    for fn in (
        "send_trial_ending_email",
        "send_trial_ended_email",
        "send_shoot_reminder_email",
    ):
        box[fn] = []
        monkeypatch.setattr(
            f"app.services.email_service.{fn}",
            (lambda key: lambda **kw: box[key].append(kw))(fn),
        )
    return box


def _set_trial_end(db_session, account_id: str, days_from_now: int) -> None:
    from app.models import Account

    acct = db_session.get(Account, account_id)
    acct.trial_ends_at = datetime.now(timezone.utc) + timedelta(days=days_from_now)
    db_session.commit()


class TestTrialEmails:
    def test_warns_inside_the_window(self, client: TestClient, db_session, outbox):
        from app.services import scheduled_email_service

        a = _signup(client)
        _set_trial_end(db_session, a["account"]["id"], 5)

        assert scheduled_email_service.send_trial_ending(db_session) >= 1
        sent = outbox["send_trial_ending_email"]
        assert any(m["to_email"] == a["user"]["email"] for m in sent)
        assert all("pricing" in m["pricing_url"] for m in sent)

    def test_silent_outside_the_window(
        self, client: TestClient, db_session, outbox
    ):
        from app.services import scheduled_email_service

        a = _signup(client)
        _set_trial_end(db_session, a["account"]["id"], 25)

        scheduled_email_service.send_trial_ending(db_session)
        assert not any(
            m["to_email"] == a["user"]["email"]
            for m in outbox["send_trial_ending_email"]
        )

    def test_running_twice_does_not_send_twice(
        self, client: TestClient, db_session, outbox
    ):
        """The whole reason the sent-markers exist."""
        from app.services import scheduled_email_service

        a = _signup(client)
        _set_trial_end(db_session, a["account"]["id"], 3)

        scheduled_email_service.send_trial_ending(db_session)
        scheduled_email_service.send_trial_ending(db_session)

        mine = [
            m
            for m in outbox["send_trial_ending_email"]
            if m["to_email"] == a["user"]["email"]
        ]
        assert len(mine) == 1

    def test_expired_trials_get_the_ended_email(
        self, client: TestClient, db_session, outbox
    ):
        from app.services import scheduled_email_service

        a = _signup(client)
        _set_trial_end(db_session, a["account"]["id"], -1)

        scheduled_email_service.send_trial_ended(db_session)
        assert any(
            m["to_email"] == a["user"]["email"]
            for m in outbox["send_trial_ended_email"]
        )

    def test_a_send_failure_leaves_it_for_tomorrow(
        self, client: TestClient, db_session, monkeypatch
    ):
        """Marking sent before the send would mean a Postmark outage
        silently swallows the warning forever."""
        from app.models import Account
        from app.services import scheduled_email_service

        def boom(**_kw):
            raise RuntimeError("postmark down")

        monkeypatch.setattr(
            "app.services.email_service.send_trial_ending_email", boom
        )
        a = _signup(client)
        _set_trial_end(db_session, a["account"]["id"], 3)

        scheduled_email_service.send_trial_ending(db_session)

        db_session.expire_all()
        acct = db_session.get(Account, a["account"]["id"])
        assert acct.trial_ending_email_at is None


class TestShootReminders:
    def _verified_job(self, client: TestClient, db_session, shoot_date: date) -> tuple:
        from sqlalchemy import select

        from app.core.security import generate_refresh_token, hash_refresh_token
        from app.models import User

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        # Reminders only go out for accounts with a confirmed address.
        raw = generate_refresh_token()
        user = db_session.scalar(
            select(User).where(User.account_id == a["account"]["id"])
        )
        user.email_verification_token_hash = hash_refresh_token(raw)
        db_session.commit()
        client.post("/api/v1/auth/verify-email", json={"token": raw})

        job = client.post(
            "/api/v1/jobs",
            json={
                "name": "Acme",
                "shoot_date": shoot_date.isoformat(),
                "location": "Acme HQ",
            },
            headers=_auth(tok),
        ).json()
        return a, tok, job

    def test_reminds_the_day_before(self, client: TestClient, db_session, outbox):
        from app.services import scheduled_email_service

        tomorrow = date.today() + timedelta(days=1)
        _, tok, job = self._verified_job(client, db_session, tomorrow)
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane Doe", "email": "jane@example.com"},
            headers=_auth(tok),
        )

        scheduled_email_service.send_shoot_reminders(db_session)
        assert any(
            m["to_email"] == "jane@example.com"
            for m in outbox["send_shoot_reminder_email"]
        )

    def test_does_not_remind_for_a_shoot_next_week(
        self, client: TestClient, db_session, outbox
    ):
        from app.services import scheduled_email_service

        later = date.today() + timedelta(days=8)
        _, tok, job = self._verified_job(client, db_session, later)
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Far Future", "email": "far@example.com"},
            headers=_auth(tok),
        )

        scheduled_email_service.send_shoot_reminders(db_session)
        assert not any(
            m["to_email"] == "far@example.com"
            for m in outbox["send_shoot_reminder_email"]
        )

    def test_reminders_are_not_repeated(
        self, client: TestClient, db_session, outbox
    ):
        from app.services import scheduled_email_service

        tomorrow = date.today() + timedelta(days=1)
        _, tok, job = self._verified_job(client, db_session, tomorrow)
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Once Only", "email": "once@example.com"},
            headers=_auth(tok),
        )

        scheduled_email_service.send_shoot_reminders(db_session)
        scheduled_email_service.send_shoot_reminders(db_session)

        mine = [
            m
            for m in outbox["send_shoot_reminder_email"]
            if m["to_email"] == "once@example.com"
        ]
        assert len(mine) == 1

    @pytest.mark.unverified
    def test_unverified_accounts_send_nothing(
        self, client: TestClient, db_session, outbox
    ):
        """Same rule as the signup page: no mail to strangers until the
        photographer has confirmed who they are."""
        from app.services import scheduled_email_service

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = client.post(
            "/api/v1/jobs",
            json={
                "name": "Unverified",
                "shoot_date": (date.today() + timedelta(days=1)).isoformat(),
                "location": "Acme HQ",
            },
            headers=_auth(tok),
        ).json()
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Nope", "email": "nope@example.com"},
            headers=_auth(tok),
        )

        scheduled_email_service.send_shoot_reminders(db_session)
        assert not any(
            m["to_email"] == "nope@example.com"
            for m in outbox["send_shoot_reminder_email"]
        )


class TestNudges:
    """One-shot nudges. A reminder that repeats gets filtered, and once a
    sender is filtered the useful mail goes with it."""

    def _verified(self, client: TestClient, db_session) -> dict:
        from sqlalchemy import select

        from app.core.security import generate_refresh_token, hash_refresh_token
        from app.models import User

        a = _signup(client)
        raw = generate_refresh_token()
        user = db_session.scalar(
            select(User).where(User.account_id == a["account"]["id"])
        )
        user.email_verification_token_hash = hash_refresh_token(raw)
        db_session.commit()
        client.post("/api/v1/auth/verify-email", json={"token": raw})
        return a

    def test_gallery_nudge_only_after_the_wait(
        self, client: TestClient, db_session, monkeypatch
    ):
        from app.models import Participant
        from app.services import email_service, scheduled_email_service

        sent: list[dict] = []
        monkeypatch.setattr(
            email_service, "send_gallery_nudge_email", lambda **kw: sent.append(kw)
        )
        a = self._verified(client, db_session)
        tok = a["tokens"]["access_token"]
        job = client.post(
            "/api/v1/jobs",
            json={
                "name": "Nudge",
                "shoot_date": date.today().isoformat(),
                "location": "Acme HQ",
            },
            headers=_auth(tok),
        ).json()
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane", "email": "jane.nudge@example.com"},
            headers=_auth(tok),
        ).json()

        row = db_session.get(Participant, p["id"])
        # Delivered just now: too soon to nag.
        row.gallery_sent_at = datetime.now(timezone.utc)
        db_session.commit()
        scheduled_email_service.send_gallery_nudges(db_session)
        assert sent == []

        # Delivered a week ago and still untouched.
        row.gallery_sent_at = datetime.now(timezone.utc) - timedelta(days=7)
        db_session.commit()
        scheduled_email_service.send_gallery_nudges(db_session)
        assert any(m["to_email"] == "jane.nudge@example.com" for m in sent)

        # And never twice.
        before = len(sent)
        scheduled_email_service.send_gallery_nudges(db_session)
        assert len(sent) == before

    def test_undelivered_nudge_needs_someone_actually_shot(
        self, client: TestClient, db_session, monkeypatch
    ):
        """A job with no photographed participants isn't late, it just
        hasn't happened."""
        from app.models import Job, Participant
        from app.services import email_service, scheduled_email_service

        sent: list[dict] = []
        monkeypatch.setattr(
            email_service,
            "send_undelivered_nudge_email",
            lambda **kw: sent.append(kw),
        )
        a = self._verified(client, db_session)
        tok = a["tokens"]["access_token"]
        job = client.post(
            "/api/v1/jobs",
            json={
                "name": "Late",
                "shoot_date": date.today().isoformat(),
                "location": "Acme HQ",
            },
            headers=_auth(tok),
        ).json()
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane", "email": "jane.late@example.com"},
            headers=_auth(tok),
        ).json()

        row = db_session.get(Job, job["id"])
        row.shoot_date = date.today() - timedelta(days=5)
        db_session.commit()

        # Nobody shot yet: silence.
        scheduled_email_service.send_undelivered_nudges(db_session)
        assert sent == []

        db_session.get(Participant, p["id"]).shot_at = datetime.now(timezone.utc)
        db_session.commit()
        scheduled_email_service.send_undelivered_nudges(db_session)
        assert len(sent) == 1
        assert sent[0]["count"] == 1

        # One nudge per job, forever.
        scheduled_email_service.send_undelivered_nudges(db_session)
        assert len(sent) == 1

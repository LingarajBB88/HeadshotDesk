"""HSD-81: the walkthrough demo job, and the reserved-domain email guard."""
import io
import secrets

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.config import settings


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _signup(client: TestClient) -> dict:
    email = f"demo_{secrets.token_hex(6)}@pantherstudios.nl"
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "password": "supersecret123",
            "name": "Pat Photographer",
            "account_name": "Panther Studios",
        },
    )
    assert r.status_code == 201
    out = r.json()
    out["_email"] = email
    return out


def _jpeg(color: str = "white") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 75), color).save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def admin(client: TestClient, monkeypatch) -> dict:
    a = _signup(client)
    monkeypatch.setattr(
        type(settings),
        "admin_email_set",
        property(lambda self: frozenset({a["_email"].lower()})),
    )
    return a


@pytest.fixture(autouse=True)
def no_disk(monkeypatch):
    from app.services import storage_service

    monkeypatch.setattr(storage_service, "save", lambda **kw: None)


def _post(client, token, files):
    return client.post(
        "/api/v1/admin/demo-job",
        files=[("files", f) for f in files],
        headers=_auth(token),
    )


class TestDemoJob:
    def test_non_admin_is_refused(self, client: TestClient):
        a = _signup(client)
        r = _post(client, a["tokens"]["access_token"], [("x.jpg", _jpeg(), "image/jpeg")])
        assert r.status_code == 403

    def test_builds_a_mid_shoot_two_day_job(self, client: TestClient, admin, db_session):
        from app.models import Job, Participant, ParticipantPick, SlotBooking

        tok = admin["tokens"]["access_token"]
        files = [
            ("Mara Visser_001.jpg", _jpeg(), "image/jpeg"),
            ("Mara Visser_002.jpg", _jpeg("grey"), "image/jpeg"),
            ("IMG_4021.jpg", _jpeg(), "image/jpeg"),
            ("IMG_4022.jpg", _jpeg(), "image/jpeg"),
            ("DSC0001.jpg", _jpeg(), "image/jpeg"),
            ("DSC0002.jpg", _jpeg(), "image/jpeg"),
        ]
        r = _post(client, tok, files)
        assert r.status_code == 200, r.text
        out = r.json()
        # Mara's two frames are one person; each generic file is its own.
        assert out["people_photographed"] == 5
        assert out["photos"] == 6

        job = db_session.get(Job, out["job_id"])
        assert job.settings.get("demo") is True
        assert job.status == "in_progress"
        assert len(job.all_shoot_dates) == 2

        people = db_session.scalars(select(Participant).where(Participant.job_id == job.id)).all()
        names = {p.name for p in people}
        assert "Mara Visser" in names
        assert "Jane Doe" not in names
        # Every address is undeliverable by design.
        assert all(p.email.endswith("@example.com") for p in people)
        assert job.client_email.endswith("@example.com")
        # The states a walkthrough needs to show.
        assert any(p.gallery_sent_at for p in people)
        assert any(p.shot_at and not p.gallery_sent_at for p in people)
        assert any(p.no_show_at for p in people)
        assert any(not p.shot_at and not p.no_show_at for p in people)
        assert any(p.notes for p in people)
        assert db_session.scalars(
            select(ParticipantPick).join(Participant).where(Participant.job_id == job.id)
        ).first() is not None
        bookings = db_session.scalars(select(SlotBooking).where(SlotBooking.job_id == job.id)).all()
        assert len(bookings) == len(people)

    def test_running_again_replaces_the_previous_demo(self, client: TestClient, admin, db_session):
        from app.models import Job

        tok = admin["tokens"]["access_token"]
        first = _post(client, tok, [("a.jpg", _jpeg(), "image/jpeg")]).json()["job_id"]
        second = _post(client, tok, [("b.jpg", _jpeg(), "image/jpeg")]).json()["job_id"]
        db_session.expire_all()
        assert db_session.get(Job, first).archived_at is not None
        assert db_session.get(Job, second).archived_at is None

    def test_rejects_non_images(self, client: TestClient, admin):
        r = _post(client, admin["tokens"]["access_token"], [("notes.txt", b"hi", "text/plain")])
        assert r.status_code == 400


class TestReservedAddressGuard:
    def test_reserved_domains_are_recognised(self):
        from app.services.email_service import is_reserved_address

        for addr in ["a@example.com", "hr@EXAMPLE.org", "x@mail.example.net", "y@studio.test", "z@foo.invalid"]:
            assert is_reserved_address(addr), addr
        for addr in ["info@pantherstudios.nl", "jane@examples.com", "a@example.co"]:
            assert not is_reserved_address(addr), addr

    def test_postmark_is_never_called_for_a_reserved_address(self, monkeypatch):
        import sys
        import types

        from app.services import email_service

        calls = []
        fake = types.ModuleType("postmarker.core")
        fake.PostmarkClient = lambda **kw: calls.append(kw)  # would fail if reached
        monkeypatch.setitem(sys.modules, "postmarker", types.ModuleType("postmarker"))
        monkeypatch.setitem(sys.modules, "postmarker.core", fake)
        email_service._send_via_postmark(
            to_email="mara.visser@example.com", subject="s", text_body="t", html_body="h"
        )
        assert calls == []

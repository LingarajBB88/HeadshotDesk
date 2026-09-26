"""
Who receives the photos.

Three modes per job. The risk sits at both ends: emailing staff on a job
where the client asked you not to, and handing an employer every frame on a
job where the participants were told the photos were for them.

The client link is the other half. It hangs off a token that already
existed for the progress dashboard, so the tests below check it refuses on
a job that never opted in, and refuses before delivery.
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


@pytest.fixture
def outbox(monkeypatch) -> dict[str, list[dict]]:
    box: dict[str, list[dict]] = {
        "send_gallery_delivery_email": [],
        "send_client_delivery_email": [],
    }
    for fn in box:
        monkeypatch.setattr(
            f"app.services.email_service.{fn}",
            (lambda key: lambda **kw: box[key].append(kw))(fn),
        )
    return box


def _job_with_photos(
    client: TestClient, db_session, tok: str, mode: str
) -> dict:
    """A job with one photographed participant holding one photo."""
    from app.core.ids import new_id
    from app.models import File

    job = client.post(
        "/api/v1/jobs",
        json={
            "name": "Acme",
            "shoot_date": (date.today() + timedelta(days=1)).isoformat(),
            "location": "Acme HQ",
        },
        headers=_auth(tok),
    ).json()
    client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={
            "status": "open_for_signup",
            "client_email": "hr@acme.example",
            "delivery_mode": mode,
        },
        headers=_auth(tok),
    )
    p = client.post(
        f"/api/v1/public/jobs/{job['public_slug']}/signup",
        json={
            "name": "Jane Doe",
            "email": f"j{uuid.uuid4().hex[:6]}@example.com",
            "consent": True,
        },
    ).json()["participant"]

    # A delivered photo, written directly: uploading through the API needs
    # real image bytes and a storage round-trip that this test does not care
    # about.
    db_session.add(
        File(
            id=new_id("file"),
            job_id=job["id"],
            participant_id=p["id"],
            original_filename="jane_001.jpg",
            storage_key=f"test/{uuid.uuid4().hex}.jpg",
            mime_type="image/jpeg",
            size_bytes=1024,
            variant="original",
        )
    )
    db_session.commit()
    return {"job": job, "participant": p}


def _deliver(client: TestClient, tok: str, job_id: str) -> dict:
    r = client.post(f"/api/v1/jobs/{job_id}/deliver", headers=_auth(tok))
    assert r.status_code in (200, 201), r.text
    return r.json()


class TestWhoGetsEmailed:
    def test_participants_mode_emails_each_person(self, client: TestClient, db_session, outbox):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "participants")
        _deliver(client, tok, made["job"]["id"])

        assert len(outbox["send_gallery_delivery_email"]) == 1
        # The client still hears that it is done, without photos attached.
        assert outbox["send_client_delivery_email"][0]["photos_url"] is None

    def test_client_mode_emails_nobody_individually(self, client: TestClient, db_session, outbox):
        """The whole point: staff must not be contacted on these jobs."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")
        _deliver(client, tok, made["job"]["id"])

        assert outbox["send_gallery_delivery_email"] == []
        sent = outbox["send_client_delivery_email"][0]
        assert sent["photos_url"], "the client got no link to the photos"
        assert sent["participants_emailed"] is False

    def test_both_mode_does_both(self, client: TestClient, db_session, outbox):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "both")
        _deliver(client, tok, made["job"]["id"])

        assert len(outbox["send_gallery_delivery_email"]) == 1
        sent = outbox["send_client_delivery_email"][0]
        assert sent["photos_url"]
        assert sent["participants_emailed"] is True

    def test_a_client_job_still_reaches_delivered(self, client: TestClient, db_session, outbox):
        """Otherwise the undelivered nudge chases a job that is finished."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")
        _deliver(client, tok, made["job"]["id"])

        job = client.get(
            f"/api/v1/jobs/{made['job']['id']}", headers=_auth(tok)
        ).json()
        assert job["status"] == "delivered"

    def test_a_client_job_delivers_people_without_an_email(
        self, client: TestClient, db_session, outbox
    ):
        """Nobody is emailed on a client job, so an email is not a condition
        for handing someone's photos over."""
        from app.models import Participant

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")
        db_session.get(Participant, made["participant"]["id"]).email = None
        db_session.commit()

        result = _deliver(client, tok, made["job"]["id"])
        assert result["sent"] == 1
        assert result["skipped_no_email"] == 0
        job = client.get(
            f"/api/v1/jobs/{made['job']['id']}", headers=_auth(tok)
        ).json()
        assert job["status"] == "delivered"


class TestTheClientLink:
    def _token(self, client: TestClient, tok: str, job_id: str) -> str:
        return client.post(
            f"/api/v1/jobs/{job_id}/client-link", headers=_auth(tok)
        ).json()["client_token"]

    def test_it_lists_photos_grouped_by_person(self, client: TestClient, db_session, outbox):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")
        _deliver(client, tok, made["job"]["id"])
        ct = self._token(client, tok, made["job"]["id"])

        r = client.get(f"/api/v1/public/client/{ct}/photos")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["photo_count"] == 1
        assert body["people"][0]["name"] == "Jane Doe"

    def test_it_carries_no_email_addresses(self, client: TestClient, db_session, outbox):
        """The client hired the photographer, not the staff list."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")
        _deliver(client, tok, made["job"]["id"])
        ct = self._token(client, tok, made["job"]["id"])

        body = client.get(f"/api/v1/public/client/{ct}/photos").text
        assert made["participant"]["email"] not in body

    def test_a_participants_only_job_refuses(self, client: TestClient, db_session, outbox):
        """A photographer who never chose to hand photos to the employer
        must not have it happen because someone found the link."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "participants")
        _deliver(client, tok, made["job"]["id"])
        ct = self._token(client, tok, made["job"]["id"])

        assert client.get(f"/api/v1/public/client/{ct}/photos").status_code == 404

    def test_it_refuses_before_delivery(self, client: TestClient, db_session, outbox):
        """Half-finished work in front of the client is how you get asked
        about frames you were going to cull."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")
        ct = self._token(client, tok, made["job"]["id"])

        assert client.get(f"/api/v1/public/client/{ct}/photos").status_code == 404

    def test_an_unknown_token_is_404(self, client: TestClient, db_session):
        assert client.get("/api/v1/public/client/nope/photos").status_code == 404


class TestTheSignupPageSaysSo:
    def test_it_flags_a_client_delivery_job(self, client: TestClient, db_session):
        """Consenting to "deliver my headshots" is not consenting to hand
        every frame to your employer."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "client")

        public = client.get(
            f"/api/v1/public/jobs/{made['job']['public_slug']}"
        ).json()
        assert public["photos_go_to_client"] is True

    def test_a_normal_job_is_unchanged(self, client: TestClient, db_session):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        made = _job_with_photos(client, db_session, tok, "participants")

        public = client.get(
            f"/api/v1/public/jobs/{made['job']['public_slug']}"
        ).json()
        assert public["photos_go_to_client"] is False

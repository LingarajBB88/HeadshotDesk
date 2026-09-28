"""Photoshop files: accepted on upload, matched like any photo, and handed
only to the client. A participant's gallery never lists one."""
import io
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.ids import new_id
from app.models import File
from app.models.file import PSD_MIME


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


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "white").save(buf, format="JPEG")
    return buf.getvalue()


def _job(client: TestClient, tok: str, mode: str) -> dict:
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
    return job


def _participant(client: TestClient, tok: str, job_id: str, name: str) -> dict:
    return client.post(
        f"/api/v1/jobs/{job_id}/participants",
        json={"name": name, "email": f"{uuid.uuid4().hex[:6]}@example.com"},
        headers=_auth(tok),
    ).json()


def _add_file(db_session, job_id: str, participant_id: str, filename: str, mime: str) -> str:
    fid = new_id("file")
    db_session.add(
        File(
            id=fid,
            job_id=job_id,
            participant_id=participant_id,
            original_filename=filename,
            storage_key=f"test/{uuid.uuid4().hex}",
            mime_type=mime,
            size_bytes=1024,
            variant="original",
        )
    )
    db_session.commit()
    return fid


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


class TestUpload:
    def test_a_psd_is_accepted_whatever_the_browser_calls_it(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok, "client")
        _participant(client, tok, job["id"], "Jane Doe")

        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files=[
                # Chrome on a Mac, Finder, and Windows all disagree here.
                ("files", ("Jane_Doe_001.psd", b"8BPS" + b"\0" * 64, "application/octet-stream")),
                ("files", ("Jane_Doe_002.psd", b"8BPS" + b"\0" * 64, "image/vnd.adobe.photoshop")),
                ("files", ("Jane_Doe_003.psd", b"8BPS" + b"\0" * 64, "")),
            ],
            headers=_auth(tok),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["skipped"] == []
        assert len(body["uploaded"]) == 3
        # One canonical type, and matched by filename like any photo.
        assert {f["mime_type"] for f in body["uploaded"]} == {PSD_MIME}
        assert body["matched"] == 3

    def test_other_unknown_types_are_still_refused(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok, "client")
        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files=[("files", ("layers.tif", b"II*\0", "application/octet-stream"))],
            headers=_auth(tok),
        )
        assert r.json()["uploaded"] == []


class TestWhoSeesIt:
    def test_the_participant_gallery_hides_it(self, client: TestClient, db_session, outbox):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok, "both")
        p = _participant(client, tok, job["id"], "Jane Doe")
        jpg = _add_file(db_session, job["id"], p["id"], "jane_001.jpg", "image/jpeg")
        psd = _add_file(db_session, job["id"], p["id"], "jane_001.psd", PSD_MIME)

        r = client.get(f"/api/v1/public/gallery/{p['gallery_token']}")
        assert r.status_code == 200, r.text
        ids = {f["id"] for f in r.json()["files"]}
        assert jpg in ids and psd not in ids

        # Nor can it be fetched by id through the gallery.
        r = client.post(f"/api/v1/public/gallery/{p['gallery_token']}/files/{psd}/download")
        assert r.status_code == 404

    def test_the_client_link_carries_it_with_a_label(self, client: TestClient, db_session, outbox, monkeypatch):
        from app.services import storage_service

        monkeypatch.setattr(storage_service, "read", lambda *, key: b"bytes")
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok, "client")
        p = _participant(client, tok, job["id"], "Jane Doe")
        _add_file(db_session, job["id"], p["id"], "jane_001.jpg", "image/jpeg")
        _add_file(db_session, job["id"], p["id"], "jane_001.psd", PSD_MIME)
        assert client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok)).status_code == 200
        ct = client.post(f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(tok)).json()["client_token"]

        photos = client.get(f"/api/v1/public/client/{ct}/photos").json()["people"][0]["photos"]
        assert [(ph["filename"], ph["is_psd"]) for ph in photos] == [
            ("jane_001.jpg", False),
            ("jane_001.psd", True),
        ]


class TestDelivery:
    def test_psd_only_person_is_not_deliverable_on_a_participants_job(
        self, client: TestClient, db_session, outbox
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok, "participants")
        p = _participant(client, tok, job["id"], "Jane Doe")
        _add_file(db_session, job["id"], p["id"], "jane_001.psd", PSD_MIME)

        r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert r.json()["sent"] == 0
        assert r.json()["skipped_no_photos"] == 1
        assert outbox["send_gallery_delivery_email"] == []

    def test_on_a_both_job_the_gallery_email_counts_only_what_it_shows(
        self, client: TestClient, db_session, outbox
    ):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _job(client, tok, "both")
        jane = _participant(client, tok, job["id"], "Jane Doe")
        bob = _participant(client, tok, job["id"], "Bob Ray")
        _add_file(db_session, job["id"], jane["id"], "jane_001.jpg", "image/jpeg")
        _add_file(db_session, job["id"], jane["id"], "jane_001.psd", PSD_MIME)
        # Bob has only a PSD: the client's link is his delivery.
        _add_file(db_session, job["id"], bob["id"], "bob_001.psd", PSD_MIME)

        r = client.post(f"/api/v1/jobs/{job['id']}/deliver", headers=_auth(tok))
        assert r.status_code == 200, r.text
        assert r.json()["sent"] == 2
        emails = outbox["send_gallery_delivery_email"]
        assert len(emails) == 1
        assert emails[0]["participant_name"] == "Jane Doe"
        assert emails[0]["photo_count"] == 1
        assert len(outbox["send_client_delivery_email"]) == 1

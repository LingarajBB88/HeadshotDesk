"""
The photographer's private note on a participant.

The feature is small. The privacy boundary is not. This is the field where
"reshoot, blinked in every frame" or something blunter about how somebody
looks gets written in a hurry between frames, and there are exactly two
audiences who must never see it: the person it describes, and their
employer, who is the one paying the invoice.

The public signup response used to return the whole ParticipantOut, so a
note added to that schema would have been handed straight back to the
participant on their next submit. Hence PublicParticipantOut.
"""
import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient

NOTE = "Reshoot, blinked in every frame. Retouch: soften scar, she asked."


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


def _open_job(client: TestClient, tok: str) -> dict:
    job = client.post(
        "/api/v1/jobs",
        json={
            "name": "Acme",
            "shoot_date": (date.today() + timedelta(days=3)).isoformat(),
            "location": "Acme HQ",
        },
        headers=_auth(tok),
    ).json()
    client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"status": "open_for_signup", "client_email": "hr@acme.example"},
        headers=_auth(tok),
    )
    return job


def _join(client: TestClient, slug: str, email: str) -> dict:
    return client.post(
        f"/api/v1/public/jobs/{slug}/signup",
        json={"name": "Jane Doe", "email": email, "consent": True},
    ).json()


class TestTheNoteWorks:
    def test_it_saves_and_comes_back(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        email = f"j{uuid.uuid4().hex[:6]}@example.com"
        pid = _join(client, job["public_slug"], email)["participant"]["id"]

        r = client.patch(
            f"/api/v1/participants/{pid}",
            json={"notes": NOTE},
            headers=_auth(tok),
        )
        assert r.status_code == 200, r.text
        assert r.json()["notes"] == NOTE

        listed = client.get(
            f"/api/v1/jobs/{job['id']}/participants", headers=_auth(tok)
        ).json()["items"]
        assert listed[0]["notes"] == NOTE

    def test_it_can_be_cleared(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        pid = _join(
            client, job["public_slug"], f"j{uuid.uuid4().hex[:6]}@example.com"
        )["participant"]["id"]
        client.patch(
            f"/api/v1/participants/{pid}", json={"notes": NOTE}, headers=_auth(tok)
        )

        r = client.patch(
            f"/api/v1/participants/{pid}",
            json={"notes": None},
            headers=_auth(tok),
        )
        assert r.json()["notes"] is None

    def test_saving_a_note_does_not_disturb_the_rest_of_the_row(
        self, client: TestClient
    ):
        """The UI sends only `notes`. A sparse update must stay sparse."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        email = f"j{uuid.uuid4().hex[:6]}@example.com"
        pid = _join(client, job["public_slug"], email)["participant"]["id"]

        r = client.patch(
            f"/api/v1/participants/{pid}",
            json={"notes": NOTE},
            headers=_auth(tok),
        ).json()
        assert r["name"] == "Jane Doe"
        assert r["email"] == email


class TestItStaysPrivate:
    def test_the_participant_never_sees_it(self, client: TestClient):
        """Re-submitting the signup form returns the participant's own
        record. It must not carry the note written about them."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        email = f"j{uuid.uuid4().hex[:6]}@example.com"
        first = _join(client, job["public_slug"], email)
        client.patch(
            f"/api/v1/participants/{first['participant']['id']}",
            json={"notes": NOTE},
            headers=_auth(tok),
        )

        again = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Jane Doe", "email": email, "consent": True},
        )
        assert "notes" not in again.json()["participant"]
        assert NOTE not in again.text

    def test_the_client_dashboard_never_shows_it(self, client: TestClient):
        """The client is the employer. They see progress, not opinions."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        pid = _join(
            client, job["public_slug"], f"j{uuid.uuid4().hex[:6]}@example.com"
        )["participant"]["id"]
        client.patch(
            f"/api/v1/participants/{pid}", json={"notes": NOTE}, headers=_auth(tok)
        )

        share = client.post(
            f"/api/v1/jobs/{job['id']}/client-link", headers=_auth(tok)
        )
        assert share.status_code in (200, 201), share.text
        token = share.json()["client_token"]

        dashboard = client.get(f"/api/v1/public/client/{token}")
        assert dashboard.status_code == 200, dashboard.text
        assert NOTE not in dashboard.text

    def test_another_account_cannot_read_or_write_it(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        pid = _join(
            client, job["public_slug"], f"j{uuid.uuid4().hex[:6]}@example.com"
        )["participant"]["id"]
        client.patch(
            f"/api/v1/participants/{pid}", json={"notes": NOTE}, headers=_auth(tok)
        )

        stranger = _signup(client)
        r = client.patch(
            f"/api/v1/participants/{pid}",
            json={"notes": "overwritten"},
            headers=_auth(stranger["tokens"]["access_token"]),
        )
        assert r.status_code == 404


class TestLimits:
    def test_a_novel_is_rejected(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = _open_job(client, tok)
        pid = _join(
            client, job["public_slug"], f"j{uuid.uuid4().hex[:6]}@example.com"
        )["participant"]["id"]

        r = client.patch(
            f"/api/v1/participants/{pid}",
            json={"notes": "x" * 5000},
            headers=_auth(tok),
        )
        assert r.status_code == 422

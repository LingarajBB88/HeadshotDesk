"""
Studio profile: the photographer's contact details and links.

The security-relevant bit is the URL validation. These render as anchors on
a public page that strangers open from an email, so a javascript: URL would
be stored XSS, not a formatting quirk.
"""
import uuid
from datetime import date, timedelta

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


def _job(client: TestClient, tok: str) -> dict:
    return client.post(
        "/api/v1/jobs",
        json={
            "name": "Acme",
            "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
            "location": "Acme HQ",
        },
        headers=_auth(tok),
    ).json()


class TestProfileCrud:
    def test_starts_empty_and_saves(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]

        before = client.get("/api/v1/studio", headers=_auth(tok)).json()
        assert before["website_url"] is None
        assert before["links"] == []
        assert before["name"] == "Panther Studios"

        r = client.patch(
            "/api/v1/studio",
            json={
                "website_url": "https://pantherstudios.nl",
                "contact_email": "hello@pantherstudios.nl",
                "contact_phone": "+31 6 1234 5678",
                "links": [
                    {"label": "How to prepare", "url": "https://p.nl/prepare"}
                ],
            },
            headers=_auth(tok),
        )
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["contact_email"] == "hello@pantherstudios.nl"
        assert saved["links"][0]["label"] == "How to prepare"

    def test_a_bare_domain_is_upgraded(self, client: TestClient):
        """Photographers type "pantherstudios.nl", not the scheme."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]

        r = client.patch(
            "/api/v1/studio",
            json={"website_url": "pantherstudios.nl"},
            headers=_auth(tok),
        )
        assert r.json()["website_url"] == "https://pantherstudios.nl"

    def test_fields_can_be_cleared(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        client.patch(
            "/api/v1/studio",
            json={"contact_phone": "+31 6 1234 5678"},
            headers=_auth(tok),
        )

        r = client.patch(
            "/api/v1/studio", json={"contact_phone": None}, headers=_auth(tok)
        )
        assert r.json()["contact_phone"] is None

    def test_profiles_are_account_scoped(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        client.patch(
            "/api/v1/studio",
            json={"website_url": "https://one.example"},
            headers=_auth(a1["tokens"]["access_token"]),
        )

        other = client.get(
            "/api/v1/studio", headers=_auth(a2["tokens"]["access_token"])
        ).json()
        assert other["website_url"] is None


class TestUrlSafety:
    """These become anchors on a page strangers open from an email."""

    def _patch(self, client: TestClient, tok: str, url: str):
        return client.patch(
            "/api/v1/studio",
            json={"links": [{"label": "Click", "url": url}]},
            headers=_auth(tok),
        )

    def test_script_urls_are_rejected(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        for bad in [
            "javascript:alert(1)",
            "JavaScript:alert(1)",
            "data:text/html;base64,PHNjcmlwdD4=",
            "vbscript:msgbox(1)",
            "file:///etc/passwd",
        ]:
            r = self._patch(client, tok, bad)
            assert r.status_code == 422, f"{bad} was accepted"

    def test_nonsense_is_rejected(self, client: TestClient):
        a = _signup(client)
        r = self._patch(client, a["tokens"]["access_token"], "not a url at all")
        assert r.status_code == 422

    def test_too_many_links_rejected(self, client: TestClient):
        """An unbounded public link list is a link farm waiting to happen."""
        a = _signup(client)
        r = client.patch(
            "/api/v1/studio",
            json={
                "links": [
                    {"label": f"L{i}", "url": f"https://e.com/{i}"}
                    for i in range(9)
                ]
            },
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422


class TestParticipantFacing:
    def test_signup_page_carries_the_studio_block(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        client.patch(
            "/api/v1/studio",
            json={
                "website_url": "https://pantherstudios.nl",
                "links": [{"label": "How to prepare", "url": "https://p.nl/x"}],
            },
            headers=_auth(tok),
        )
        job = _job(client, tok)

        public = client.get(f"/api/v1/public/jobs/{job['public_slug']}").json()
        assert public["studio"]["name"] == "Panther Studios"
        assert public["studio"]["website_url"] == "https://pantherstudios.nl"
        assert public["studio"]["links"][0]["label"] == "How to prepare"

    def test_block_is_null_when_nothing_is_set(self, client: TestClient):
        """So the frontend skips the section instead of drawing an empty
        card with just a studio name in it."""
        a = _signup(client)
        job = _job(client, a["tokens"]["access_token"])

        public = client.get(f"/api/v1/public/jobs/{job['public_slug']}").json()
        assert public["studio"] is None

    def test_login_email_is_not_published(self, client: TestClient):
        """contact_email exists precisely so the login address stays
        private."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        client.patch(
            "/api/v1/studio",
            json={"website_url": "https://pantherstudios.nl"},
            headers=_auth(tok),
        )
        job = _job(client, tok)

        body = client.get(f"/api/v1/public/jobs/{job['public_slug']}").text
        assert a["user"]["email"] not in body

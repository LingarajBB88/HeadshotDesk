"""HSD-36 — clients: CRUD, logo upload, job linking, public surfaces."""
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient

# A 1x1 transparent PNG, tiny but valid.
_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049"
    "454e44ae426082"
)


def _signup(client: TestClient) -> dict:
    payload = {
        "email": f"test_{secrets.token_hex(8)}@example.com",
        "password": "supersecret123",
        "name": "Test User",
        "account_name": f"Studio {secrets.token_hex(4)}",
    }
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_client(client: TestClient, token: str, name="Invest NL") -> dict:
    r = client.post(
        "/api/v1/clients", json={"name": name}, headers=_auth(token)
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_job(client: TestClient, token: str, **extra) -> dict:
    r = client.post(
        "/api/v1/jobs",
        json={
            "name": "Corp shoot",
            "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
            "location": "HQ",
            **extra,
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


class TestClientCrud:
    def test_create_list_rename(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token)
        assert c["logo_url"] is None
        assert c["jobs_total"] == 0

        # Creating the same name again reuses the record (repeat business).
        c2 = _create_client(client, token, name="invest nl")
        assert c2["id"] == c["id"]

        r = client.patch(
            f"/api/v1/clients/{c['id']}",
            json={"name": "Invest NL B.V."},
            headers=_auth(token),
        )
        assert r.status_code == 200
        items = client.get("/api/v1/clients", headers=_auth(token)).json()["items"]
        assert [i["name"] for i in items] == ["Invest NL B.V."]

    def test_delete_blocked_while_jobs_reference(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token)
        _create_job(client, token, client_id=c["id"])
        r = client.delete(f"/api/v1/clients/{c['id']}", headers=_auth(token))
        assert r.status_code == 409

    def test_cross_account_is_404(self, client: TestClient):
        a = _signup(client)
        c = _create_client(client, a["tokens"]["access_token"])
        b = _signup(client)
        r = client.patch(
            f"/api/v1/clients/{c['id']}",
            json={"name": "Hijack"},
            headers=_auth(b["tokens"]["access_token"]),
        )
        assert r.status_code == 404


class TestLogo:
    def test_upload_and_public_serve(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token)

        r = client.post(
            f"/api/v1/clients/{c['id']}/logo",
            files={"file": ("logo.png", _PNG, "image/png")},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        logo_url = r.json()["logo_url"]
        assert logo_url and f"/api/v1/public/client-logo/{c['id']}" in logo_url

        # Publicly served with the right content type, no auth.
        r = client.get(f"/api/v1/public/client-logo/{c['id']}")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("image/png")
        assert r.content == _PNG

        # Remove: public serve 404s again.
        r = client.delete(f"/api/v1/clients/{c['id']}/logo", headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["logo_url"] is None
        assert client.get(f"/api/v1/public/client-logo/{c['id']}").status_code == 404

    def test_wrong_type_rejected(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token)
        r = client.post(
            f"/api/v1/clients/{c['id']}/logo",
            files={"file": ("logo.gif", b"GIF89a....", "image/gif")},
            headers=_auth(token),
        )
        assert r.status_code == 400


class TestJobLinking:
    def test_job_links_client_and_mirrors_name(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token, name="Acme Corp")
        job = _create_job(client, token, client_id=c["id"])
        assert job["client_id"] == c["id"]
        assert job["client_name"] == "Acme Corp"

    def test_signup_page_exposes_logo(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token)
        client.post(
            f"/api/v1/clients/{c['id']}/logo",
            files={"file": ("logo.png", _PNG, "image/png")},
            headers=_auth(token),
        )
        job = _create_job(client, token, client_id=c["id"])

        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}")
        assert r.status_code == 200
        assert r.json()["client_logo_url"] is not None

        # Jobs without a client stay logo-less, no broken surface.
        job2 = _create_job(client, token)
        r = client.get(f"/api/v1/public/jobs/{job2['public_slug']}")
        assert r.json()["client_logo_url"] is None

    def test_gallery_exposes_logo(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        c = _create_client(client, token)
        client.post(
            f"/api/v1/clients/{c['id']}/logo",
            files={"file": ("logo.png", _PNG, "image/png")},
            headers=_auth(token),
        )
        job = _create_job(client, token, client_id=c["id"])
        p = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Jane", "email": "jane@example.com", "consent": True},
        ).json()["participant"]

        r = client.get(f"/api/v1/public/gallery/{p['gallery_token']}")
        assert r.status_code == 200
        assert r.json()["client_logo_url"] is not None

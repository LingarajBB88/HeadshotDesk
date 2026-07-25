"""F5b.2 (HSD-25) — participant favorites: toggle, cap, per-job switch."""
import io
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient
from PIL import Image


def _make_jpeg() -> bytes:
    """Tiny in-memory JPEG for upload tests (matches test_files' helper)."""
    buf = io.BytesIO()
    Image.new("RGB", (60, 60), color="white").save(buf, format="JPEG")
    return buf.getvalue()


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


def _job_with_photos(
    client: TestClient, token: str, *, picks_enabled=True, pick_cap=1, photos=3
) -> tuple[dict, dict, list[str]]:
    """Job + one participant with `photos` assigned files."""
    r = client.post(
        "/api/v1/jobs",
        json={
            "name": "Picks shoot",
            "shoot_date": (date.today() + timedelta(days=3)).isoformat(),
            "location": "Studio",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    job = r.json()

    r = client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={"picks_enabled": picks_enabled, "pick_cap": pick_cap},
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    job = r.json()

    p = client.post(
        f"/api/v1/jobs/{job['id']}/participants",
        json={"name": "Jane Doe", "email": "jane@example.com"},
        headers=_auth(token),
    ).json()

    file_ids: list[str] = []
    for i in range(photos):
        up = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": (f"Jane Doe_{i}.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_ids.append(up["uploaded"][0]["id"])
    return job, p, file_ids


class TestPickToggle:
    def test_star_and_unstar(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, p, files = _job_with_photos(client, token, pick_cap=2)
        gt = p["gallery_token"]

        g = client.get(f"/api/v1/public/gallery/{gt}").json()
        assert g["picks_enabled"] is True
        assert g["pick_cap"] == 2
        assert g["picks_used"] == 0
        assert all(f["is_picked"] is False for f in g["files"])

        r = client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[0]}/pick",
            json={"picked": True},
        )
        assert r.status_code == 200, r.text
        assert r.json()["picks_used"] == 1

        # Idempotent: starring again stays at 1.
        r = client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[0]}/pick",
            json={"picked": True},
        )
        assert r.json()["picks_used"] == 1

        g = client.get(f"/api/v1/public/gallery/{gt}").json()
        assert g["picks_used"] == 1
        picked = [f for f in g["files"] if f["is_picked"]]
        assert [f["id"] for f in picked] == [files[0]]

        # Un-star.
        r = client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[0]}/pick",
            json={"picked": False},
        )
        assert r.json()["picks_used"] == 0

    def test_cap_enforced(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, p, files = _job_with_photos(client, token, pick_cap=1)
        gt = p["gallery_token"]

        client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[0]}/pick",
            json={"picked": True},
        )
        r = client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[1]}/pick",
            json={"picked": True},
        )
        assert r.status_code == 409
        assert "pick 1 photo" in r.json()["detail"].lower()

        # Unpicking frees the slot.
        client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[0]}/pick",
            json={"picked": False},
        )
        r = client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[1]}/pick",
            json={"picked": True},
        )
        assert r.status_code == 200

    def test_unlimited_when_cap_zero(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, p, files = _job_with_photos(client, token, pick_cap=0)
        gt = p["gallery_token"]
        for fid in files:
            r = client.post(
                f"/api/v1/public/gallery/{gt}/files/{fid}/pick",
                json={"picked": True},
            )
            assert r.status_code == 200
        assert client.get(f"/api/v1/public/gallery/{gt}").json()["picks_used"] == 3

    def test_disabled_job_refuses(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, p, files = _job_with_photos(client, token, picks_enabled=False)
        gt = p["gallery_token"]
        g = client.get(f"/api/v1/public/gallery/{gt}").json()
        assert g["picks_enabled"] is False
        r = client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[0]}/pick",
            json={"picked": True},
        )
        assert r.status_code == 403

    def test_other_gallery_photo_is_404(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, p, files = _job_with_photos(client, token)
        other = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Bob R", "email": "bob@example.com"},
            headers=_auth(token),
        ).json()
        r = client.post(
            f"/api/v1/public/gallery/{other['gallery_token']}/files/{files[0]}/pick",
            json={"picked": True},
        )
        assert r.status_code == 404


class TestPhotographerView:
    def test_counts_and_flags_visible(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job, p, files = _job_with_photos(client, token, pick_cap=2)
        gt = p["gallery_token"]
        client.post(
            f"/api/v1/public/gallery/{gt}/files/{files[1]}/pick",
            json={"picked": True},
        )

        rows = client.get(
            f"/api/v1/jobs/{job['id']}/participants", headers=_auth(token)
        ).json()["items"]
        jane = next(r for r in rows if r["name"] == "Jane Doe")
        assert jane["picks_used"] == 1

        files_out = client.get(
            f"/api/v1/jobs/{job['id']}/files", headers=_auth(token)
        ).json()["items"]
        picked = [f for f in files_out if f["picked_by_participant"]]
        assert [f["id"] for f in picked] == [files[1]]

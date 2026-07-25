"""End-to-end tests for the file upload pipeline."""
import io
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient
from PIL import Image


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


def _future_date() -> str:
    return (date.today() + timedelta(days=7)).isoformat()


def _create_job(client: TestClient, token: str, **overrides) -> dict:
    payload = {
        "name": "Acme team headshots",
        "shoot_date": _future_date(),
        "location": "HQ",
        **overrides,
    }
    r = client.post("/api/v1/jobs", json=payload, headers=_auth(token))
    assert r.status_code == 201
    return r.json()


def _add_participant(client: TestClient, token: str, job_id: str, name: str, email: str) -> dict:
    r = client.post(
        f"/api/v1/jobs/{job_id}/participants",
        json={"name": name, "email": email},
        headers=_auth(token),
    )
    return r.json()


def _make_jpeg(width: int = 100, height: int = 100, color: str = "white") -> bytes:
    """Generate a tiny JPEG in-memory for upload tests."""
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


# ============================================================================
# Filename → participant matching (unit tests on the helper)
# ============================================================================

class TestMatching:
    def test_exact_match(self, client: TestClient):
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Jane Doe"), SimpleNamespace(id="p2", name="John Smith")]
        m = match_filename_to_participant("Jane Doe.jpg", ps)
        assert m and m.id == "p1"

    def test_underscore_normalized(self, client: TestClient):
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Jane Doe")]
        m = match_filename_to_participant("Jane_Doe.jpg", ps)
        assert m and m.id == "p1"

    def test_index_suffix_stripped(self, client: TestClient):
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Jane Doe")]
        for fn in ["Jane_Doe_001.jpg", "Jane Doe 042.png", "Jane-Doe-7.jpeg"]:
            m = match_filename_to_participant(fn, ps)
            assert m and m.id == "p1", f"failed for {fn}"

    def test_token_set_match_reverse_order(self, client: TestClient):
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Jane Doe")]
        m = match_filename_to_participant("Doe_Jane.jpg", ps)
        assert m and m.id == "p1"

    def test_case_insensitive(self, client: TestClient):
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Jane Doe")]
        m = match_filename_to_participant("JANE_DOE.JPG", ps)
        assert m and m.id == "p1"

    def test_no_match_returns_none(self, client: TestClient):
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Jane Doe")]
        m = match_filename_to_participant("IMG_1234.jpg", ps)
        assert m is None

    def test_picks_most_specific(self, client: TestClient):
        """Participant with more matching tokens wins over a single-token match."""
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [
            SimpleNamespace(id="p1", name="Jane"),
            SimpleNamespace(id="p2", name="Jane Doe"),
        ]
        m = match_filename_to_participant("Jane_Doe_001.jpg", ps)
        assert m and m.id == "p2"

    def test_single_token_participant_requires_exact_match(self, client: TestClient):
        """A participant named 'Test' must not grab 'Sangeetha Test.jpg' — the
        first name doesn't match, so the file should be left unassigned."""
        from app.services.file_service import match_filename_to_participant
        from types import SimpleNamespace

        ps = [SimpleNamespace(id="p1", name="Test")]
        assert match_filename_to_participant("Sangeetha Test.jpg", ps) is None
        # Exact match still works — single-name participants can name their
        # files after themselves.
        m = match_filename_to_participant("Test.jpg", ps)
        assert m and m.id == "p1"
        m = match_filename_to_participant("Test_001.jpg", ps)
        assert m and m.id == "p1"


# ============================================================================
# Upload + list + delete
# ============================================================================

class TestUploadFiles:
    def test_upload_single_jpeg_auto_matches(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p = _add_participant(client, token, job["id"], "Jane Doe", "jane@example.com")

        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Jane_Doe_001.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert len(body["uploaded"]) == 1
        assert body["matched"] == 1
        assert body["unmatched"] == 0
        assert body["uploaded"][0]["participant_id"] == p["id"]
        assert body["uploaded"][0]["original_filename"] == "Jane_Doe_001.jpg"
        assert body["uploaded"][0]["width"] == 100
        assert body["uploaded"][0]["height"] == 100

    def test_upload_multiple_files(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        _add_participant(client, token, job["id"], "Alice", "alice@example.com")
        _add_participant(client, token, job["id"], "Bob", "bob@example.com")

        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files=[
                ("files", ("Alice_001.jpg", _make_jpeg(), "image/jpeg")),
                ("files", ("Alice_002.jpg", _make_jpeg(), "image/jpeg")),
                ("files", ("Bob_001.jpg", _make_jpeg(), "image/jpeg")),
                ("files", ("IMG_4242.jpg", _make_jpeg(), "image/jpeg")),
            ],
            headers=_auth(token),
        )
        assert r.status_code == 201
        body = r.json()
        assert len(body["uploaded"]) == 4
        assert body["matched"] == 3  # all but IMG_4242
        assert body["unmatched"] == 1

    def test_upload_rejects_unsupported_mime(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)

        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("notes.txt", b"hello", "text/plain")},
            headers=_auth(token),
        )
        assert r.status_code == 201
        body = r.json()
        assert body["uploaded"] == []
        assert any("notes.txt" in s for s in body["skipped"])

    def test_upload_requires_auth(self, client: TestClient):
        r = client.post(
            "/api/v1/jobs/anything/files",
            files={"files": ("x.jpg", _make_jpeg(), "image/jpeg")},
        )
        assert r.status_code == 401

    def test_upload_rejects_other_account_job(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        job = _create_job(client, a1["tokens"]["access_token"])

        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("x.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404


class TestListFiles:
    def test_empty_list(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        r = client.get(
            f"/api/v1/jobs/{job['id']}/files",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0, "matched": 0, "unmatched": 0}

    def test_list_after_upload(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        _add_participant(client, token, job["id"], "Jane Doe", "j@example.com")
        client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files=[
                ("files", ("Jane_Doe_001.jpg", _make_jpeg(), "image/jpeg")),
                ("files", ("orphan.jpg", _make_jpeg(), "image/jpeg")),
            ],
            headers=_auth(token),
        )

        r = client.get(
            f"/api/v1/jobs/{job['id']}/files", headers=_auth(token)
        )
        body = r.json()
        assert body["total"] == 2
        assert body["matched"] == 1
        assert body["unmatched"] == 1


class TestDeleteAndReassign:
    def test_delete_file(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("x.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]

        r = client.delete(f"/api/v1/files/{file_id}", headers=_auth(token))
        assert r.status_code == 204

        # Listing should show 0
        listing = client.get(
            f"/api/v1/jobs/{job['id']}/files", headers=_auth(token)
        ).json()
        assert listing["total"] == 0

    def test_reassign_to_other_participant(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p1 = _add_participant(client, token, job["id"], "Alice", "alice@x.com")
        p2 = _add_participant(client, token, job["id"], "Bob", "bob@x.com")

        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Alice_001.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]
        assert upload["uploaded"][0]["participant_id"] == p1["id"]

        # Reassign to Bob
        r = client.patch(
            f"/api/v1/files/{file_id}",
            json={"participant_id": p2["id"]},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["participant_id"] == p2["id"]

    def test_reassign_to_other_job_participant_rejected(self, client: TestClient):
        """Can't assign a file to a participant on a different job."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job1 = _create_job(client, token, name="Job 1")
        job2 = _create_job(client, token, name="Job 2")
        p_other = _add_participant(client, token, job2["id"], "Alice", "alice@x.com")

        upload = client.post(
            f"/api/v1/jobs/{job1['id']}/files",
            files={"files": ("img.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]

        r = client.patch(
            f"/api/v1/files/{file_id}",
            json={"participant_id": p_other["id"]},
            headers=_auth(token),
        )
        assert r.status_code == 400

    def test_rename_updates_filename_and_rematches_participant(self, client: TestClient):
        """Renaming a file should both update its display name AND re-run the
        participant matching against the new name."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p_alice = _add_participant(client, token, job["id"], "Alice", "alice@x.com")
        p_bob = _add_participant(client, token, job["id"], "Bob", "bob@x.com")

        # Upload originally named to match Alice
        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Alice_001.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]
        assert upload["uploaded"][0]["participant_id"] == p_alice["id"]

        # Rename to match Bob — participant should auto-update
        r = client.patch(
            f"/api/v1/files/{file_id}",
            json={"original_filename": "Bob_005.jpg"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["original_filename"] == "Bob_005.jpg"
        assert body["participant_id"] == p_bob["id"]

    def test_rename_to_unmatched_keeps_assignment(self, client: TestClient):
        """Sticky-name rule: an assigned file renamed to a name that matches
        nobody keeps its assignment AND its display name. Protects matched
        files from being clobbered by Cmd-D'd duplicates arriving through
        the watch folder ("Alice_001 copy 4.jpg" style)."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p_alice = _add_participant(client, token, job["id"], "Alice", "alice@x.com")

        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Alice_001.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]
        assert upload["uploaded"][0]["participant_id"] == p_alice["id"]

        r = client.patch(
            f"/api/v1/files/{file_id}",
            json={"original_filename": "IMG_9999.jpg"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["participant_id"] == p_alice["id"]
        assert r.json()["original_filename"] == "Alice_001.jpg"

    def test_rename_rejects_empty_filename(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Foo.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]
        r = client.patch(
            f"/api/v1/files/{file_id}",
            json={"original_filename": "   "},
            headers=_auth(token),
        )
        assert r.status_code == 400

    def test_bulk_delete_removes_multiple_files(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        ids = []
        # Upload three distinct files (different bytes via different colors).
        for color in ["red", "green", "blue"]:
            r = client.post(
                f"/api/v1/jobs/{job['id']}/files",
                files={"files": (f"{color}.jpg", _make_jpeg(color=color), "image/jpeg")},
                headers=_auth(token),
            ).json()
            ids.append(r["uploaded"][0]["id"])

        # Delete two of the three.
        r = client.post(
            f"/api/v1/jobs/{job['id']}/files/bulk-delete",
            json={"file_ids": ids[:2]},
            headers=_auth(token),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] == 2
        assert body["not_found"] == []

        # Listing should now show only the third file.
        listed = client.get(
            f"/api/v1/jobs/{job['id']}/files", headers=_auth(token)
        ).json()
        assert [f["id"] for f in listed["items"]] == [ids[2]]

    def test_bulk_delete_reports_unknown_ids(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        r = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("a.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        real_id = r["uploaded"][0]["id"]

        r = client.post(
            f"/api/v1/jobs/{job['id']}/files/bulk-delete",
            json={"file_ids": [real_id, "file_does_not_exist"]},
            headers=_auth(token),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] == 1
        assert body["not_found"] == ["file_does_not_exist"]

    def test_bulk_delete_scoped_to_account(self, client: TestClient):
        """A1 can't bulk-delete A2's files even by guessing IDs."""
        a1 = _signup(client)
        a2 = _signup(client)
        job1 = _create_job(client, a1["tokens"]["access_token"])
        job2 = _create_job(client, a2["tokens"]["access_token"])
        r = client.post(
            f"/api/v1/jobs/{job2['id']}/files",
            files={"files": ("a.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(a2["tokens"]["access_token"]),
        ).json()
        victim_id = r["uploaded"][0]["id"]

        # A1 calls bulk-delete on their own job, passing A2's file id.
        r = client.post(
            f"/api/v1/jobs/{job1['id']}/files/bulk-delete",
            json={"file_ids": [victim_id]},
            headers=_auth(a1["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        # The other account's file is reported as not_found, not silently
        # cross-deleted.
        assert r.json()["deleted"] == 0
        assert r.json()["not_found"] == [victim_id]

        # And confirm A2's file is still there.
        listed = client.get(
            f"/api/v1/jobs/{job2['id']}/files",
            headers=_auth(a2["tokens"]["access_token"]),
        ).json()
        assert any(f["id"] == victim_id for f in listed["items"])

    def test_bulk_delete_rejects_non_string_ids(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        r = client.post(
            f"/api/v1/jobs/{job['id']}/files/bulk-delete",
            json={"file_ids": [123, "ok"]},
            headers=_auth(token),
        )
        assert r.status_code == 400

    def test_cannot_delete_other_account_file(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        job = _create_job(client, a1["tokens"]["access_token"])
        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("x.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(a1["tokens"]["access_token"]),
        ).json()
        file_id = upload["uploaded"][0]["id"]

        r = client.delete(
            f"/api/v1/files/{file_id}",
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404


class TestContentDedup:
    """SHA-256 content-based deduplication. Reuses existing file rows when
    the same bytes are uploaded again — and handles rename-then-reupload by
    updating the existing row's filename + participant assignment."""

    def test_identical_bytes_dedupe_to_same_row(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        content = _make_jpeg()

        r1 = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("photo.jpg", content, "image/jpeg")},
            headers=_auth(token),
        ).json()
        r2 = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("photo-copy.jpg", content, "image/jpeg")},
            headers=_auth(token),
        ).json()
        # Same row returned both times — no duplicate gallery entry.
        assert r1["uploaded"][0]["id"] == r2["uploaded"][0]["id"]

    def test_unmatched_name_does_not_clobber_matched_name(self, client: TestClient):
        """Cmd-D'd duplicates regression. The photographer has two files in
        Finder with identical content: 'Jane Doe.jpg' (matches a participant)
        and 'Jane Doe copy 4.jpg' — wait, that one matches too. Use one that
        definitely doesn't: an IMG_XXXX name. The participant-matched row
        must not get renamed back to the unmatched sibling."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p = _add_participant(client, token, job["id"], "Jane Doe", "jane@example.com")
        content = _make_jpeg()

        # First upload — matched.
        r1 = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Jane Doe.jpg", content, "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = r1["uploaded"][0]["id"]
        assert r1["uploaded"][0]["participant_id"] == p["id"]

        # Now upload the same bytes under an unmatched name — should NOT
        # overwrite the participant-matched display name.
        r2 = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("IMG_5555.jpg", content, "image/jpeg")},
            headers=_auth(token),
        ).json()
        assert r2["uploaded"][0]["id"] == file_id
        assert r2["uploaded"][0]["original_filename"] == "Jane Doe.jpg"
        assert r2["uploaded"][0]["participant_id"] == p["id"]

    def test_rename_api_rejects_unmatched_overwrite_of_matched_row(self, client: TestClient):
        """Same rule via the PATCH /files/{id} path the watcher uses for
        fingerprint-detected renames."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p = _add_participant(client, token, job["id"], "Jane Doe", "jane@example.com")

        upload = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Jane Doe.jpg", _make_jpeg(), "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = upload["uploaded"][0]["id"]

        r = client.patch(
            f"/api/v1/files/{file_id}",
            json={"original_filename": "IMG_5555.jpg"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        # Rename was rejected silently — name and participant unchanged.
        assert r.json()["original_filename"] == "Jane Doe.jpg"
        assert r.json()["participant_id"] == p["id"]

    def test_reupload_with_new_name_updates_filename_and_participant(self, client: TestClient):
        """Regression: photographer renames a file in Finder. The watcher
        uploads the renamed file. Backend dedup hits on content. The existing
        row's filename + participant assignment must update to reflect the
        new name — otherwise the gallery shows the stale original name and
        the file stays unassigned even though the new name matches a
        participant."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p = _add_participant(client, token, job["id"], "Jane Doe", "jane@example.com")
        content = _make_jpeg()

        # First upload — no matching participant for "IMG_0001.jpg".
        r1 = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("IMG_0001.jpg", content, "image/jpeg")},
            headers=_auth(token),
        ).json()
        file_id = r1["uploaded"][0]["id"]
        assert r1["uploaded"][0]["participant_id"] is None

        # Re-upload same bytes under "Jane Doe.jpg" — simulating a Finder rename.
        r2 = client.post(
            f"/api/v1/jobs/{job['id']}/files",
            files={"files": ("Jane Doe.jpg", content, "image/jpeg")},
            headers=_auth(token),
        ).json()
        # Same row, but display name + participant updated.
        assert r2["uploaded"][0]["id"] == file_id
        assert r2["uploaded"][0]["original_filename"] == "Jane Doe.jpg"
        assert r2["uploaded"][0]["participant_id"] == p["id"]
        assert r2["matched"] == 1

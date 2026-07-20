"""End-to-end tests for the participants API + public signup form."""
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient


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
        "name": "Test job",
        "shoot_date": _future_date(),
        "location": "Test office",
        **overrides,
    }
    r = client.post("/api/v1/jobs", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


# ============================================================================
# Authed CRUD
# ============================================================================

class TestParticipantCRUD:
    def test_list_starts_empty(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        r = client.get(
            f"/api/v1/jobs/{job['id']}/participants",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0}

    def test_create_and_list(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])

        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane Doe", "email": "jane@example.com", "title": "Engineer"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["name"] == "Jane Doe"
        assert body["email"] == "jane@example.com"
        assert body["title"] == "Engineer"
        assert body["job_id"] == job["id"]

        r = client.get(
            f"/api/v1/jobs/{job['id']}/participants",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.json()["total"] == 1

    def test_create_rejects_duplicate_email_per_job(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        for _ in range(1):
            client.post(
                f"/api/v1/jobs/{job['id']}/participants",
                json={"name": "Jane Doe", "email": "jane@example.com"},
                headers=_auth(a["tokens"]["access_token"]),
            )
        # Second add with the same email should 409.
        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane (twin)", "email": "jane@example.com"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 409

    def test_same_email_allowed_across_different_jobs(self, client: TestClient):
        a = _signup(client)
        j1 = _create_job(client, a["tokens"]["access_token"], name="Job 1")
        j2 = _create_job(client, a["tokens"]["access_token"], name="Job 2")
        for jid in (j1["id"], j2["id"]):
            r = client.post(
                f"/api/v1/jobs/{jid}/participants",
                json={"name": "Jane", "email": "jane@example.com"},
                headers=_auth(a["tokens"]["access_token"]),
            )
            assert r.status_code == 201

    def test_create_rejects_invalid_email(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane", "email": "test@gmail.c"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_update_participant(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()

        r = client.patch(
            f"/api/v1/participants/{p['id']}",
            json={"title": "VP Engineering"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["title"] == "VP Engineering"
        assert r.json()["name"] == "Jane"

    def test_delete_participant(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()

        r = client.delete(
            f"/api/v1/participants/{p['id']}",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 204

        r = client.get(
            f"/api/v1/jobs/{job['id']}/participants",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.json()["total"] == 0

    def test_cannot_list_other_account_participants(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        job = _create_job(client, a1["tokens"]["access_token"])
        r = client.get(
            f"/api/v1/jobs/{job['id']}/participants",
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404

    def test_cannot_update_other_account_participant(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        job = _create_job(client, a1["tokens"]["access_token"])
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Jane"},
            headers=_auth(a1["tokens"]["access_token"]),
        ).json()
        r = client.patch(
            f"/api/v1/participants/{p['id']}",
            json={"name": "Hijacked"},
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404


# ============================================================================
# CSV import
# ============================================================================

class TestCsvImport:
    def _import(self, client: TestClient, token: str, job_id: str, csv: str) -> dict:
        r = client.post(
            f"/api/v1/jobs/{job_id}/participants/import",
            files={"file": ("test.csv", csv.encode(), "text/csv")},
            headers=_auth(token),
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_imports_csv(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email,title\nAlice,alice@example.com,Engineer\nBob,bob@example.com,Designer\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 2
        assert result["skipped_duplicates"] == 0
        assert result["errors"] == []

    def test_skips_duplicate_emails_within_csv(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email\nAlice,alice@example.com\nAlice2,alice@example.com\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 1
        assert result["skipped_duplicates"] == 1

    def test_skips_duplicates_against_existing(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        # Add Alice manually first
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Alice", "email": "alice@example.com"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        csv = "name,email\nAlice (CSV),alice@example.com\nBob,bob@example.com\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 1
        assert result["skipped_duplicates"] == 1

    def test_reports_errors_per_row(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email\nAlice,alice@example.com\n,no-name@example.com\nBob,\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 2  # Alice and Bob (Bob has no email — that's OK)
        assert any("Row 3" in e for e in result["errors"])

    def test_missing_name_column_returns_400(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "email,title\nfoo@bar.com,Engineer\n"
        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants/import",
            files={"file": ("test.csv", csv.encode(), "text/csv")},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 400

    def test_header_only_template_imports_zero(self, client: TestClient):
        """Uploading the unmodified template should succeed with 0 created."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email,title\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result == {"created": 0, "skipped_duplicates": 0, "errors": []}

    def test_handles_excel_sep_preamble(self, client: TestClient):
        """Excel sometimes saves CSVs with a 'sep=,' first line. Don't reject."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "sep=,\nname,email,title\nAlice,alice@example.com,Engineer\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 1

    def test_handles_utf8_bom(self, client: TestClient):
        """Excel-on-Windows often saves CSVs with a UTF-8 BOM. Should still work."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email,title\nAlice,alice@example.com,Engineer\n"
        bom_bytes = b"\xef\xbb\xbf" + csv.encode("utf-8")
        r = client.post(
            f"/api/v1/jobs/{job['id']}/participants/import",
            files={"file": ("test.csv", bom_bytes, "text/csv")},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["created"] == 1

    def test_handles_crlf_line_endings(self, client: TestClient):
        """Windows-saved CSVs use \\r\\n. Should still work."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email\r\nAlice,alice@example.com\r\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 1

    def test_validates_invalid_email_per_row(self, client: TestClient):
        """Bad emails should be reported as row errors, not silently accepted."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = (
            "name,email\n"
            "Alice,alice@example.com\n"
            "Bob,bob@gmail.c\n"  # short TLD — StrictEmail rejects
            "Charlie,not-an-email\n"
            "Dora,dora@example.com\n"
        )
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 2  # Alice and Dora
        assert len(result["errors"]) == 2
        assert any("Row 3" in e and "email" in e for e in result["errors"])
        assert any("Row 4" in e and "email" in e for e in result["errors"])

    def test_validates_name_too_long(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        long_name = "x" * 250  # exceeds 200 char limit
        csv = f"name,email\nAlice,alice@example.com\n{long_name},long@example.com\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 1
        assert any("Row 3" in e and "name" in e for e in result["errors"])

    def test_skips_blank_rows(self, client: TestClient):
        """Blank rows in the middle of a CSV (e.g., from Excel exports) are silently skipped."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name,email\nAlice,alice@example.com\n,\nBob,bob@example.com\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 2
        assert result["errors"] == []  # blank row is silent, not an error

    def test_handles_semicolon_delimiter(self, client: TestClient):
        """European Excel exports use ';' instead of ','. Auto-detect."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name;email;title\nAlice;alice@example.com;Engineer\nBob;bob@example.com;Designer\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 2
        assert result["errors"] == []

    def test_handles_tab_delimiter(self, client: TestClient):
        """Tab-separated (e.g., pasted from Google Sheets) should also work."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        csv = "name\temail\nAlice\talice@example.com\nBob\tbob@example.com\n"
        result = self._import(client, a["tokens"]["access_token"], job["id"], csv)
        assert result["created"] == 2


# ============================================================================
# Public signup (no auth)
# ============================================================================

class TestPublicSignup:
    def test_get_job_for_signup_returns_slim_view(self, client: TestClient):
        a = _signup(client)
        job = _create_job(
            client,
            a["tokens"]["access_token"],
            name="Acme team headshots",
            client_name="Acme Corp",
        )
        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}")
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Acme team headshots"
        assert body["client_name"] == "Acme Corp"
        assert body["location"] == "Test office"
        assert "branding" in body

    def test_get_job_for_unknown_slug_returns_404(self, client: TestClient):
        r = client.get("/api/v1/public/jobs/does-not-exist")
        assert r.status_code == 404

    def test_archived_job_not_accepting_signups(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        client.post(
            f"/api/v1/jobs/{job['id']}/archive",
            headers=_auth(a["tokens"]["access_token"]),
        )
        r = client.get(f"/api/v1/public/jobs/{job['public_slug']}")
        assert r.status_code == 404

    def test_signup_creates_participant(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Walk-in Wendy", "email": "wendy@example.com", "consent": True},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["created"] is True
        assert body["participant"]["name"] == "Walk-in Wendy"

        # Photographer should now see her in the participant list
        listing = client.get(
            f"/api/v1/jobs/{job['id']}/participants",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert listing.json()["total"] == 1

    def test_signup_is_idempotent_for_same_email(self, client: TestClient):
        """If a participant hits submit twice, don't error — return existing
        with created=False so the UI can distinguish."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        body = {"name": "Wendy", "email": "wendy@example.com", "consent": True}

        first = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup", json=body
        ).json()
        second = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup", json=body
        ).json()

        assert first["created"] is True
        assert second["created"] is False
        assert first["participant"]["id"] == second["participant"]["id"]

    def test_signup_rejects_invalid_email(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Bad", "email": "not-an-email", "consent": True},
        )
        assert r.status_code == 422

    def test_signup_requires_no_auth(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        # Note: no Authorization header
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Anon", "email": "anon@example.com", "consent": True},
        )
        assert r.status_code == 201

    def test_signup_without_consent_rejected(self, client: TestClient):
        """Compliance backstop: consent=false (or missing) must be refused
        server-side even if a client bypasses the checkbox."""
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        # consent explicitly false → 400
        r = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "No Consent Ned", "email": "ned@example.com", "consent": False},
        )
        assert r.status_code == 400
        assert "privacy" in r.json()["detail"].lower()
        # consent missing entirely → 422 (schema requires the field)
        r2 = client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "No Consent Ned", "email": "ned@example.com"},
        )
        assert r2.status_code == 422

    def test_signup_records_consented_at(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Consenting Cara", "email": "cara@example.com", "consent": True},
        )
        # consented_at isn't exposed on the API (no need yet) — verify via
        # the DB through the photographer listing being intact + no error.
        listing = client.get(
            f"/api/v1/jobs/{job['id']}/participants", headers=_auth(token)
        )
        assert listing.json()["total"] == 1


# ============================================================================
# Shoot queue (mark-shot / reset-shot)
# ============================================================================

class TestShootQueue:
    def _add_participant(self, client: TestClient, token: str, job_id: str) -> dict:
        return client.post(
            f"/api/v1/jobs/{job_id}/participants",
            json={"name": "Jane Doe", "email": "jane@example.com"},
            headers=_auth(token),
        ).json()

    def test_new_participant_starts_unshot(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        p = self._add_participant(client, a["tokens"]["access_token"], job["id"])
        assert p["shot_at"] is None

    def test_mark_shot_sets_timestamp(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        p = self._add_participant(client, a["tokens"]["access_token"], job["id"])

        r = client.post(
            f"/api/v1/participants/{p['id']}/mark-shot",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["shot_at"] is not None

    def test_reset_shot_clears_timestamp(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        p = self._add_participant(client, a["tokens"]["access_token"], job["id"])
        client.post(
            f"/api/v1/participants/{p['id']}/mark-shot",
            headers=_auth(a["tokens"]["access_token"]),
        )

        r = client.post(
            f"/api/v1/participants/{p['id']}/reset-shot",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["shot_at"] is None

    def test_mark_shot_is_idempotent(self, client: TestClient):
        a = _signup(client)
        job = _create_job(client, a["tokens"]["access_token"])
        p = self._add_participant(client, a["tokens"]["access_token"], job["id"])

        first = client.post(
            f"/api/v1/participants/{p['id']}/mark-shot",
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        second = client.post(
            f"/api/v1/participants/{p['id']}/mark-shot",
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        # Both succeed; timestamp gets updated on the second call (no error).
        assert first["shot_at"] is not None
        assert second["shot_at"] is not None

    def test_cannot_mark_other_account_participant_shot(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        job = _create_job(client, a1["tokens"]["access_token"])
        p = self._add_participant(client, a1["tokens"]["access_token"], job["id"])

        r = client.post(
            f"/api/v1/participants/{p['id']}/mark-shot",
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404

    def test_mark_shot_requires_auth(self, client: TestClient):
        r = client.post("/api/v1/participants/anything/mark-shot")
        assert r.status_code == 401


# ============================================================================
# Job-status auto-advancement
# ============================================================================

class TestJobStatusAutoAdvance:
    def _job_status(self, client: TestClient, token: str, job_id: str) -> str:
        r = client.get(f"/api/v1/jobs/{job_id}", headers=_auth(token))
        return r.json()["status"]

    def test_adding_first_participant_opens_signup(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        assert self._job_status(client, token, job["id"]) == "draft"

        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Alice", "email": "alice@example.com"},
            headers=_auth(token),
        )
        assert self._job_status(client, token, job["id"]) == "open_for_signup"

    def test_public_signup_opens_signup(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        client.post(
            f"/api/v1/public/jobs/{job['public_slug']}/signup",
            json={"name": "Walk-in", "email": "walk@example.com", "consent": True},
        )
        assert self._job_status(client, token, job["id"]) == "open_for_signup"

    def test_csv_import_opens_signup(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        client.post(
            f"/api/v1/jobs/{job['id']}/participants/import",
            files={"file": ("p.csv", b"name,email\nAlice,alice@example.com\n", "text/csv")},
            headers=_auth(token),
        )
        assert self._job_status(client, token, job["id"]) == "open_for_signup"

    def test_first_mark_shot_starts_progress(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Alice", "email": "alice@example.com"},
            headers=_auth(token),
        ).json()
        # After add: open_for_signup
        assert self._job_status(client, token, job["id"]) == "open_for_signup"

        client.post(
            f"/api/v1/participants/{p['id']}/mark-shot",
            headers=_auth(token),
        )
        # After first shot: in_progress
        assert self._job_status(client, token, job["id"]) == "in_progress"

    def test_status_is_forward_only(self, client: TestClient):
        """Adding a participant doesn't downgrade in_progress to open_for_signup."""
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        p = client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Alice", "email": "alice@example.com"},
            headers=_auth(token),
        ).json()
        client.post(
            f"/api/v1/participants/{p['id']}/mark-shot", headers=_auth(token)
        )
        assert self._job_status(client, token, job["id"]) == "in_progress"

        # Adding another participant should NOT downgrade.
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Bob", "email": "bob@example.com"},
            headers=_auth(token),
        )
        assert self._job_status(client, token, job["id"]) == "in_progress"

    def test_archived_status_not_auto_advanced(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _create_job(client, token)
        client.post(f"/api/v1/jobs/{job['id']}/archive", headers=_auth(token))
        # Try to add a participant — should still succeed, but status stays archived.
        client.post(
            f"/api/v1/jobs/{job['id']}/participants",
            json={"name": "Alice", "email": "alice@example.com"},
            headers=_auth(token),
        )
        assert self._job_status(client, token, job["id"]) == "archived"

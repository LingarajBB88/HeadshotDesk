"""End-to-end tests for the jobs API. Reuses the auth API to create accounts."""
import secrets
from datetime import date, timedelta

from fastapi.testclient import TestClient


def _signup(client: TestClient) -> dict:
    """Create a fresh account and return the access token + ids."""
    payload = {
        "email": f"test_{secrets.token_hex(8)}@example.com",
        "password": "supersecret123",
        "name": "Test User",
        "account_name": f"Studio {secrets.token_hex(4)}",
    }
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# Tomorrow as ISO string — used as a default valid shoot_date in tests.
def _future_date() -> str:
    return (date.today() + timedelta(days=7)).isoformat()


# ============================================================================
# Auth required
# ============================================================================

class TestJobsAuthRequired:
    def test_create_requires_auth(self, client: TestClient):
        r = client.post("/api/v1/jobs", json={"name": "Test", "shoot_date": _future_date(), "location": "Test office"})
        assert r.status_code == 401

    def test_list_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/jobs")
        assert r.status_code == 401

    def test_get_requires_auth(self, client: TestClient):
        r = client.get("/api/v1/jobs/job_anything")
        assert r.status_code == 401

    def test_update_requires_auth(self, client: TestClient):
        r = client.patch("/api/v1/jobs/job_anything", json={"name": "x", "shoot_date": _future_date(), "location": "Test office"})
        assert r.status_code == 401

    def test_archive_requires_auth(self, client: TestClient):
        r = client.post("/api/v1/jobs/job_anything/archive")
        assert r.status_code == 401


# ============================================================================
# Create
# ============================================================================

class TestCreateJob:
    def test_create_minimal_job(self, client: TestClient):
        a = _signup(client)
        future = _future_date()
        r = client.post(
            "/api/v1/jobs",
            json={"name": "Acme team headshots", "shoot_date": future, "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["name"] == "Acme team headshots"
        assert body["status"] == "draft"
        assert body["public_slug"]
        assert len(body["public_slug"]) == 10
        assert body["client_name"] is None
        assert body["shoot_date"] == future
        assert body["archived_at"] is None

    def test_create_full_job(self, client: TestClient):
        a = _signup(client)
        # Far future so the test doesn't go stale.
        future = (date.today() + timedelta(days=180)).isoformat()
        r = client.post(
            "/api/v1/jobs",
            json={
                "name": "Quarterly headshots",
                "client_name": "Acme Corp",
                "client_email": "hr@acme.example",
                "shoot_date": future,
                "location": "Acme HQ, 14th floor",
            },
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 201
        body = r.json()
        assert body["client_name"] == "Acme Corp"
        assert body["client_email"] == "hr@acme.example"
        assert body["shoot_date"] == future
        assert body["location"] == "Acme HQ, 14th floor"

    def test_create_rejects_empty_name(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/jobs",
            json={"name": "", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_create_rejects_email_with_short_tld(self, client: TestClient):
        """Catches typos like 'name@gmail.c' that base EmailStr would accept."""
        a = _signup(client)
        for bad in ["test@gmail.c", "x@y.z", "user@domain"]:
            r = client.post(
                "/api/v1/jobs",
                json={"name": "Test", "shoot_date": _future_date(), "client_email": bad, "location": "Test office"},
                headers=_auth(a["tokens"]["access_token"]),
            )
            assert r.status_code == 422, f"expected 422 for {bad}, got {r.status_code}"

    def test_create_accepts_normal_email(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/jobs",
            json={"name": "Test", "shoot_date": _future_date(), "client_email": "client@acme.example", "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 201

    def test_each_job_gets_unique_slug(self, client: TestClient):
        a = _signup(client)
        slugs = set()
        for i in range(5):
            r = client.post(
                "/api/v1/jobs",
                json={"name": f"Job {i}", "shoot_date": _future_date(), "location": "Test office"},
                headers=_auth(a["tokens"]["access_token"]),
            )
            slugs.add(r.json()["public_slug"])
        assert len(slugs) == 5

    def test_create_rejects_missing_shoot_date(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/jobs",
            json={"name": "Test"},  # deliberately no shoot_date
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_create_rejects_past_shoot_date(self, client: TestClient):
        a = _signup(client)
        past = (date.today() - timedelta(days=1)).isoformat()
        r = client.post(
            "/api/v1/jobs",
            json={"name": "Test", "shoot_date": past, "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_create_accepts_today(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/jobs",
            json={"name": "Test", "shoot_date": date.today().isoformat(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 201

    def test_create_rejects_pure_digit_location(self, client: TestClient):
        a = _signup(client)
        for bad in ["12345", "5", "   123 "]:
            r = client.post(
                "/api/v1/jobs",
                json={"name": "Test", "shoot_date": _future_date(), "location": bad},
                headers=_auth(a["tokens"]["access_token"]),
            )
            assert r.status_code == 422, f"expected 422 for location={bad!r}"

    def test_create_accepts_normal_location(self, client: TestClient):
        a = _signup(client)
        for ok in ["Office", "100 Main St", "Studio A", "TBD", "5A"]:
            r = client.post(
                "/api/v1/jobs",
                json={"name": "Test", "shoot_date": _future_date(), "location": ok},
                headers=_auth(a["tokens"]["access_token"]),
            )
            assert r.status_code == 201, f"expected 201 for location={ok!r}"

    def test_create_rejects_missing_location(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/jobs",
            json={"name": "Test", "shoot_date": _future_date()},  # no location
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422


# ============================================================================
# List
# ============================================================================

class TestListJobs:
    def test_empty_list_for_new_account(self, client: TestClient):
        a = _signup(client)
        r = client.get("/api/v1/jobs", headers=_auth(a["tokens"]["access_token"]))
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0}

    def test_list_returns_own_jobs(self, client: TestClient):
        a = _signup(client)
        for name in ["Alpha", "Beta", "Gamma"]:
            client.post(
                "/api/v1/jobs",
                json={"name": name, "shoot_date": _future_date(), "location": "Test office"},
                headers=_auth(a["tokens"]["access_token"]),
            )
        r = client.get("/api/v1/jobs", headers=_auth(a["tokens"]["access_token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 3
        names = {item["name"] for item in body["items"]}
        assert names == {"Alpha", "Beta", "Gamma"}

    def test_list_does_not_leak_across_accounts(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        client.post(
            "/api/v1/jobs",
            json={"name": "Account 1 secret", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a1["tokens"]["access_token"]),
        )
        # Account 2 should see no jobs
        r = client.get("/api/v1/jobs", headers=_auth(a2["tokens"]["access_token"]))
        assert r.status_code == 200
        assert r.json()["total"] == 0

    def test_archived_jobs_hidden_by_default(self, client: TestClient):
        a = _signup(client)
        created = client.post(
            "/api/v1/jobs",
            json={"name": "Will be archived", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        client.post(
            f"/api/v1/jobs/{created['id']}/archive",
            headers=_auth(a["tokens"]["access_token"]),
        )

        # Default — hidden
        default = client.get(
            "/api/v1/jobs", headers=_auth(a["tokens"]["access_token"])
        ).json()
        assert default["total"] == 0

        # With include_archived=true — visible
        all_ = client.get(
            "/api/v1/jobs?include_archived=true",
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        assert all_["total"] == 1


# ============================================================================
# Get
# ============================================================================

class TestGetJob:
    def test_get_own_job(self, client: TestClient):
        a = _signup(client)
        created = client.post(
            "/api/v1/jobs",
            json={"name": "My job", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        r = client.get(
            f"/api/v1/jobs/{created['id']}",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["id"] == created["id"]

    def test_get_other_account_job_returns_404(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        created = client.post(
            "/api/v1/jobs",
            json={"name": "A1 only", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a1["tokens"]["access_token"]),
        ).json()
        r = client.get(
            f"/api/v1/jobs/{created['id']}",
            headers=_auth(a2["tokens"]["access_token"]),
        )
        # Same response as not-found — don't leak existence
        assert r.status_code == 404

    def test_get_nonexistent_returns_404(self, client: TestClient):
        a = _signup(client)
        r = client.get(
            "/api/v1/jobs/job_does_not_exist",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 404


# ============================================================================
# Update
# ============================================================================

class TestUpdateJob:
    def test_update_name(self, client: TestClient):
        a = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "Original", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        r = client.patch(
            f"/api/v1/jobs/{j['id']}",
            json={"name": "Updated", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Updated"

    def test_partial_update_does_not_overwrite_other_fields(self, client: TestClient):
        a = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "Original", "client_name": "Original Client", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        r = client.patch(
            f"/api/v1/jobs/{j['id']}",
            json={"name": "Renamed", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        body = r.json()
        assert body["name"] == "Renamed"
        assert body["client_name"] == "Original Client"

    def test_update_status(self, client: TestClient):
        a = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "Test", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        r = client.patch(
            f"/api/v1/jobs/{j['id']}",
            json={"status": "open_for_signup"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "open_for_signup"

    def test_update_invalid_status_rejected(self, client: TestClient):
        a = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "Test", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        r = client.patch(
            f"/api/v1/jobs/{j['id']}",
            json={"status": "fake_status"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_cannot_update_other_account_job(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "A1", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a1["tokens"]["access_token"]),
        ).json()
        r = client.patch(
            f"/api/v1/jobs/{j['id']}",
            json={"name": "Hijacked", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404


# ============================================================================
# Archive
# ============================================================================

class TestArchiveJob:
    def test_archive_sets_status_and_timestamp(self, client: TestClient):
        a = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "Old", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        r = client.post(
            f"/api/v1/jobs/{j['id']}/archive",
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "archived"
        assert body["archived_at"] is not None

    def test_archive_is_idempotent(self, client: TestClient):
        a = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "Old", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        first = client.post(
            f"/api/v1/jobs/{j['id']}/archive",
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        second = client.post(
            f"/api/v1/jobs/{j['id']}/archive",
            headers=_auth(a["tokens"]["access_token"]),
        ).json()
        assert first["archived_at"] == second["archived_at"]

    def test_cannot_archive_other_account_job(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        j = client.post(
            "/api/v1/jobs",
            json={"name": "A1", "shoot_date": _future_date(), "location": "Test office"},
            headers=_auth(a1["tokens"]["access_token"]),
        ).json()
        r = client.post(
            f"/api/v1/jobs/{j['id']}/archive",
            headers=_auth(a2["tokens"]["access_token"]),
        )
        assert r.status_code == 404

"""
End-to-end tests for the auth API.

These tests use a real Postgres (the dev DB inside docker compose) and create
unique users per test via random emails so re-runs don't collide.
"""
import secrets

from fastapi.testclient import TestClient


def random_email() -> str:
    return f"test_{secrets.token_hex(8)}@example.com"


def signup_payload(**overrides) -> dict:
    return {
        "email": random_email(),
        "password": "supersecret123",
        "name": "Test User",
        "account_name": "Test Studio",
        **overrides,
    }


# ============================================================================
# Signup
# ============================================================================

class TestSignup:
    def test_signup_creates_account_and_returns_tokens(self, client: TestClient):
        r = client.post("/api/v1/auth/signup", json=signup_payload())
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["user"]["email"]
        assert data["user"]["role"] == "owner"
        assert data["account"]["plan"] == "trial"
        assert data["account"]["type"] == "photographer"
        assert data["tokens"]["access_token"]
        assert data["tokens"]["refresh_token"]
        assert data["tokens"]["token_type"] == "bearer"

    def test_signup_duplicate_email_returns_409(self, client: TestClient):
        email = random_email()
        first = client.post("/api/v1/auth/signup", json=signup_payload(email=email))
        assert first.status_code == 201
        second = client.post("/api/v1/auth/signup", json=signup_payload(email=email))
        assert second.status_code == 409
        assert "already exists" in second.json()["detail"].lower()

    def test_signup_short_password_returns_422(self, client: TestClient):
        r = client.post("/api/v1/auth/signup", json=signup_payload(password="short"))
        assert r.status_code == 422

    def test_signup_invalid_email_returns_422(self, client: TestClient):
        r = client.post("/api/v1/auth/signup", json=signup_payload(email="not-an-email"))
        assert r.status_code == 422

    def test_signup_missing_field_returns_422(self, client: TestClient):
        payload = signup_payload()
        del payload["account_name"]
        r = client.post("/api/v1/auth/signup", json=payload)
        assert r.status_code == 422


# ============================================================================
# Login
# ============================================================================

class TestLogin:
    def test_login_with_correct_credentials_succeeds(self, client: TestClient):
        payload = signup_payload()
        client.post("/api/v1/auth/signup", json=payload)
        r = client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": payload["password"]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["tokens"]["access_token"]

    def test_login_wrong_password_returns_401(self, client: TestClient):
        payload = signup_payload()
        client.post("/api/v1/auth/signup", json=payload)
        r = client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": "wrong-password"},
        )
        assert r.status_code == 401

    def test_login_unknown_email_returns_401(self, client: TestClient):
        r = client.post(
            "/api/v1/auth/login",
            json={"email": random_email(), "password": "anything12345"},
        )
        assert r.status_code == 401

    def test_login_does_not_leak_which_was_wrong(self, client: TestClient):
        """Security: wrong-email and wrong-password must return identical errors."""
        payload = signup_payload()
        client.post("/api/v1/auth/signup", json=payload)

        wrong_password = client.post(
            "/api/v1/auth/login",
            json={"email": payload["email"], "password": "wrong"},
        )
        wrong_email = client.post(
            "/api/v1/auth/login",
            json={"email": random_email(), "password": "anything12345"},
        )
        assert wrong_password.status_code == wrong_email.status_code == 401
        assert wrong_password.json()["detail"] == wrong_email.json()["detail"]


# ============================================================================
# Email case-insensitivity (Postgres CITEXT)
# ============================================================================

class TestEmailCaseInsensitive:
    def test_signup_with_uppercase_login_with_lowercase_works(self, client: TestClient):
        upper = f"Test_{secrets.token_hex(8)}@EXAMPLE.COM"
        client.post("/api/v1/auth/signup", json=signup_payload(email=upper))
        r = client.post(
            "/api/v1/auth/login",
            json={"email": upper.lower(), "password": "supersecret123"},
        )
        assert r.status_code == 200

    def test_duplicate_email_caught_across_case(self, client: TestClient):
        local = secrets.token_hex(8)
        client.post(
            "/api/v1/auth/signup",
            json=signup_payload(email=f"foo_{local}@example.com"),
        )
        r = client.post(
            "/api/v1/auth/signup",
            json=signup_payload(email=f"FOO_{local}@example.com"),
        )
        assert r.status_code == 409


# ============================================================================
# /me — current user
# ============================================================================

class TestMe:
    def test_me_without_token_returns_401(self, client: TestClient):
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_me_with_garbage_token_returns_401(self, client: TestClient):
        r = client.get(
            "/api/v1/auth/me", headers={"Authorization": "Bearer notatoken"}
        )
        assert r.status_code == 401

    def test_me_with_valid_token_returns_user(self, client: TestClient):
        payload = signup_payload()
        signup = client.post("/api/v1/auth/signup", json=payload).json()
        token = signup["tokens"]["access_token"]
        r = client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert r.status_code == 200
        body = r.json()
        # Note: comparison is case-insensitive because the email is stored CITEXT,
        # but Pydantic EmailStr normalizes to lowercase on the way out.
        assert body["user"]["email"].lower() == payload["email"].lower()
        assert body["account"]["name"] == payload["account_name"]

    def test_me_using_refresh_token_as_access_returns_401(self, client: TestClient):
        """Refresh tokens are opaque; they must not work as JWT access tokens."""
        signup = client.post("/api/v1/auth/signup", json=signup_payload()).json()
        refresh = signup["tokens"]["refresh_token"]
        r = client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"}
        )
        assert r.status_code == 401


# ============================================================================
# Refresh + logout
# ============================================================================

class TestRefreshAndLogout:
    def test_refresh_returns_working_access_token(self, client: TestClient):
        """Refresh must return a usable access token. We verify it works on /me."""
        signup = client.post("/api/v1/auth/signup", json=signup_payload()).json()
        refresh = signup["tokens"]["refresh_token"]
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 200
        new_access = r.json()["access_token"]
        assert new_access  # non-empty
        # The returned token must actually authenticate.
        # (We don't assert it differs from the original — JWTs issued in the same
        # second with the same claims encode to identical bytes, which is fine.)
        me = client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"}
        )
        assert me.status_code == 200

    def test_refresh_with_invalid_token_returns_401(self, client: TestClient):
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage"})
        assert r.status_code == 401

    def test_logout_revokes_session(self, client: TestClient):
        signup = client.post("/api/v1/auth/signup", json=signup_payload()).json()
        refresh = signup["tokens"]["refresh_token"]

        logout = client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        assert logout.status_code == 204

        # Refresh should now fail
        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
        assert r.status_code == 401

    def test_logout_is_idempotent(self, client: TestClient):
        """Calling logout twice with the same token should not raise."""
        signup = client.post("/api/v1/auth/signup", json=signup_payload()).json()
        refresh = signup["tokens"]["refresh_token"]
        client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        # Second call — token already revoked
        second = client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
        assert second.status_code == 204

    def test_logout_with_unknown_token_returns_204(self, client: TestClient):
        """Don't leak whether a token was valid or not."""
        r = client.post(
            "/api/v1/auth/logout", json={"refresh_token": "never-existed"}
        )
        assert r.status_code == 204

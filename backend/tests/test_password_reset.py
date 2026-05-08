"""Tests for the forgot/reset password flow."""
import secrets
from unittest.mock import patch

from fastapi.testclient import TestClient


def _signup_payload(**overrides) -> dict:
    return {
        "email": f"test_{secrets.token_hex(8)}@example.com",
        "password": "supersecret123",
        "name": "Test User",
        "account_name": "Test Studio",
        **overrides,
    }


def _signup(client: TestClient) -> dict:
    payload = _signup_payload()
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201
    return {"signup": r.json(), "credentials": payload}


class TestForgotPassword:
    def test_unknown_email_still_returns_204(self, client: TestClient):
        """Don't leak whether an email exists."""
        with patch("app.services.email_service.send_password_reset_email") as send:
            r = client.post(
                "/api/v1/auth/forgot-password",
                json={"email": f"nobody_{secrets.token_hex(4)}@example.com"},
            )
            assert r.status_code == 204
            send.assert_not_called()

    def test_known_email_triggers_email(self, client: TestClient):
        ctx = _signup(client)
        with patch("app.services.email_service.send_password_reset_email") as send:
            r = client.post(
                "/api/v1/auth/forgot-password",
                json={"email": ctx["credentials"]["email"]},
            )
            assert r.status_code == 204
            assert send.call_count == 1
            kwargs = send.call_args.kwargs
            assert kwargs["to_email"].lower() == ctx["credentials"]["email"].lower()
            assert "/reset-password?token=" in kwargs["reset_url"]
            # The reset URL must include a token (the bit after token=)
            token = kwargs["reset_url"].split("token=", 1)[1]
            assert len(token) >= 32

    def test_invalid_email_format_returns_422(self, client: TestClient):
        r = client.post(
            "/api/v1/auth/forgot-password", json={"email": "not-an-email"}
        )
        assert r.status_code == 422


class TestResetPassword:
    def _request_reset_and_get_token(self, client: TestClient, email: str) -> str:
        with patch("app.services.email_service.send_password_reset_email") as send:
            client.post("/api/v1/auth/forgot-password", json={"email": email})
            return send.call_args.kwargs["reset_url"].split("token=", 1)[1]

    def test_reset_with_valid_token_works(self, client: TestClient):
        ctx = _signup(client)
        email = ctx["credentials"]["email"]
        token = self._request_reset_and_get_token(client, email)

        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "brand-new-pass-456"},
        )
        assert r.status_code == 204

        # Old password must not work
        old = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": ctx["credentials"]["password"]},
        )
        assert old.status_code == 401

        # New password works
        new = client.post(
            "/api/v1/auth/login",
            json={"email": email, "password": "brand-new-pass-456"},
        )
        assert new.status_code == 200

    def test_reset_with_invalid_token_returns_400(self, client: TestClient):
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": "garbage-token", "new_password": "doesnotmatter1"},
        )
        assert r.status_code == 400

    def test_reset_token_is_single_use(self, client: TestClient):
        ctx = _signup(client)
        token = self._request_reset_and_get_token(client, ctx["credentials"]["email"])

        first = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "new-pass-once-789"},
        )
        assert first.status_code == 204

        # Same token replayed
        second = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "another-attempt-42"},
        )
        assert second.status_code == 400

    def test_reset_revokes_existing_sessions(self, client: TestClient):
        """After password reset, refresh tokens issued before the reset must fail."""
        ctx = _signup(client)
        old_refresh = ctx["signup"]["tokens"]["refresh_token"]

        token = self._request_reset_and_get_token(client, ctx["credentials"]["email"])
        client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "rotated-pass-101"},
        )

        # The pre-reset refresh token must no longer work
        r = client.post(
            "/api/v1/auth/refresh", json={"refresh_token": old_refresh}
        )
        assert r.status_code == 401

    def test_reset_short_password_rejected(self, client: TestClient):
        ctx = _signup(client)
        token = self._request_reset_and_get_token(client, ctx["credentials"]["email"])
        r = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "short"},
        )
        assert r.status_code == 422

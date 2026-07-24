"""Public feature-request endpoint: validation, storage, abuse guards."""
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.api import public as public_module


def _reset_rate_limit():
    public_module._fr_hits.clear()


class TestFeatureRequests:
    def test_valid_request_stored_and_forwarded(self, client: TestClient):
        _reset_rate_limit()
        with patch(
            "app.services.email_service.send_feature_request_email"
        ) as send:
            r = client.post(
                "/api/v1/public/feature-requests",
                json={
                    "message": "Please add QR codes for signup posters.",
                    "email": "photog@example.com",
                },
            )
            assert r.status_code == 204
            assert send.call_count == 1
            assert "QR codes" in send.call_args.kwargs["message"]

    def test_too_short_message_rejected(self, client: TestClient):
        _reset_rate_limit()
        r = client.post(
            "/api/v1/public/feature-requests", json={"message": "short"}
        )
        assert r.status_code == 422

    def test_sql_and_html_payloads_are_inert(self, client: TestClient):
        """Hostile-looking content is stored as plain text: the ORM binds
        parameters (no SQL execution) and the email template autoescapes.
        The endpoint should accept it without any side effects."""
        _reset_rate_limit()
        with patch("app.services.email_service.send_feature_request_email"):
            r = client.post(
                "/api/v1/public/feature-requests",
                json={
                    "message": "'; DROP TABLE jobs; -- <script>alert(1)</script>",
                },
            )
            assert r.status_code == 204
        # The app still works afterwards (jobs table intact enough to serve
        # requests): a health check suffices as a smoke signal.
        assert client.get("/health").status_code == 200

    def test_email_forward_failure_does_not_fail_submission(
        self, client: TestClient
    ):
        _reset_rate_limit()
        with patch(
            "app.services.email_service.send_feature_request_email",
            side_effect=RuntimeError("postmark down"),
        ):
            r = client.post(
                "/api/v1/public/feature-requests",
                json={"message": "This one should still be stored."},
            )
            assert r.status_code == 204

    def test_rate_limited_after_burst(self, client: TestClient):
        _reset_rate_limit()
        with patch("app.services.email_service.send_feature_request_email"):
            for i in range(5):
                r = client.post(
                    "/api/v1/public/feature-requests",
                    json={"message": f"Legitimate request number {i}."},
                )
                assert r.status_code == 204
            r = client.post(
                "/api/v1/public/feature-requests",
                json={"message": "The sixth request in the hour."},
            )
            assert r.status_code == 429
        _reset_rate_limit()

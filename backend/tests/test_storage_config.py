"""Guard against the R2 misconfiguration that broke a live shoot.

A Cloudflare API token pasted into R2_ACCOUNT_ID builds an invalid
endpoint hostname; uploads then fail the storage write, get silently
skipped, and the API still answers 200. These tests keep the validation
that turns that into a loud, self-explaining error.
"""
import pytest

from app.services.storage_service import _validate_account_id


class TestAccountIdValidation:
    def test_accepts_real_account_id(self):
        _validate_account_id("8f2b1c4d5e6a7b8c9d0e1f2a3b4c5d6e")  # no raise

    def test_rejects_api_token(self):
        # Shape only — never a real token in the repo. Cloudflare account
        # API tokens carry the cfat_ prefix; that prefix is the signal.
        fake_token = "cfat_" + "x" * 46
        with pytest.raises(ValueError, match="API token"):
            _validate_account_id(fake_token)

    def test_rejects_wrong_length(self):
        with pytest.raises(ValueError, match="32 hex"):
            _validate_account_id("abc123")

    def test_rejects_non_hex(self):
        with pytest.raises(ValueError, match="32 hex"):
            _validate_account_id("zzzz1c4d5e6a7b8c9d0e1f2a3b4c5d6e")

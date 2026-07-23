"""
Application configuration. All values come from environment variables.
Never hardcode secrets. See .env.example for the full list.
"""
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Core ---
    env: str = Field(default="development")  # development | staging | production
    debug: bool = Field(default=True)
    base_url: str = Field(default="http://localhost:8000")
    frontend_url: str = Field(default="http://localhost:3000")

    # --- Database ---
    database_url: str = Field(
        default="postgresql+psycopg://headshotdesk:headshotdesk@localhost:5432/headshotdesk"
    )

    @field_validator("database_url")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        """Managed hosts (Render, Heroku-style) hand out postgres:// or
        postgresql:// URLs. SQLAlchemy would route those to psycopg2; we use
        psycopg3, so rewrite the scheme to the explicit driver form."""
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+psycopg://", 1)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        return v

    # --- Redis (for RQ background jobs) ---
    redis_url: str = Field(default="redis://localhost:6379/0")

    # --- Auth ---
    jwt_secret: str = Field(default="dev-secret-change-me")
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 30

    # --- Storage (Cloudflare R2, S3-compatible) ---
    r2_account_id: str = Field(default="")
    r2_access_key_id: str = Field(default="")
    r2_secret_access_key: str = Field(default="")
    r2_bucket: str = Field(default="headshotdesk-dev")
    r2_public_base_url: str = Field(default="")  # if using a custom domain
    # Jurisdiction-restricted buckets (e.g. "eu") use a different endpoint:
    # {account}.{jurisdiction}.r2.cloudflarestorage.com. Empty = default
    # namespace. Prod uses "eu" — participant photos stay on EU infra.
    r2_jurisdiction: str = Field(default="")

    # --- Stripe ---
    stripe_secret_key: str = Field(default="")
    stripe_webhook_secret: str = Field(default="")
    stripe_price_solo: str = Field(default="")
    stripe_price_pro: str = Field(default="")
    stripe_price_studio: str = Field(default="")
    stripe_price_hibernate: str = Field(default="")
    stripe_price_ai_overage: str = Field(default="")  # metered

    # --- Email (Postmark) ---
    postmark_server_token: str = Field(default="")
    email_from: str = Field(default="HeadshotDesk <noreply@headshotdesk.com>")

    # --- AI providers (only needed for v0.2) ---
    replicate_api_token: str = Field(default="")
    photoroom_api_key: str = Field(default="")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

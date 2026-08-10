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

    # --- Free beta seats ---
    # How many accounts can hold a free 'beta' plan at once. Invite codes
    # draw from this one pool, so handing a code to a mailing list can't
    # cost more than you meant to give away. Raise it in the environment
    # without a deploy; 0 means no free seats are available.
    free_seat_cap: int = Field(default=25)

    # --- Referral rewards ---
    # Free months a referrer earns each time someone they introduced starts
    # paying. Recorded on the referral row when earned, so changing this
    # never rewrites a reward somebody was already promised. 0 turns
    # rewards off without removing the tracking.
    referral_reward_months: int = Field(default=1)

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

    # --- Admin (HSD-66) ---
    # Comma-separated list of user emails allowed into the operator
    # dashboard. Enforced server-side on every /admin endpoint.
    admin_emails: str = Field(default="info@pantherstudios.nl")

    @property
    def admin_email_set(self) -> frozenset[str]:
        return frozenset(
            e.strip().lower() for e in self.admin_emails.split(",") if e.strip()
        )

    # --- Email (Postmark) ---
    postmark_server_token: str = Field(default="")
    email_from: str = Field(default="HeadshotDesk <noreply@headshotdesk.com>")
    # Where public feature requests are forwarded.
    feedback_to_email: str = Field(default="info@pantherstudios.nl")
    # Signature on product emails. A real name reads like a person wrote
    # it and makes replying feel natural, which is how we hear about
    # problems early.
    email_sender_name: str = Field(default="Lingaraj")
    email_sender_role: str = Field(default="HeadshotDesk")
    # Contact address printed in the signature. NOT a Reply-To header —
    # replies go to EMAIL_FROM. Empty falls back to feedback_to_email.
    email_support_address: str = Field(default="")

    # --- AI providers (only needed for v0.2) ---
    replicate_api_token: str = Field(default="")
    photoroom_api_key: str = Field(default="")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

"""
Transactional email. In production wires up to Postmark.
In dev (no token configured) logs the email to stdout so the developer
can grab the link from the logs without setting up real email.
"""
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def send_password_reset_email(*, to_email: str, reset_url: str, user_name: str) -> None:
    """Send (or log) the password reset email."""
    if not settings.postmark_server_token:
        # Dev mode: print to logs so we can copy the link.
        logger.warning(
            "[DEV EMAIL] Password reset for %s (%s)\nReset URL: %s",
            user_name,
            to_email,
            reset_url,
        )
        # Also print to stdout so it shows up in `docker compose logs backend`
        print(
            f"\n[DEV EMAIL] Password reset for {user_name} <{to_email}>\n"
            f"            Reset URL: {reset_url}\n",
            flush=True,
        )
        return

    # Production path — Postmark.
    try:
        from postmarker.core import PostmarkClient
    except ImportError:
        logger.error("postmarker not installed but POSTMARK_SERVER_TOKEN is set")
        return

    client = PostmarkClient(server_token=settings.postmark_server_token)
    client.emails.send(
        From=settings.email_from,
        To=to_email,
        Subject="Reset your HeadshotDesk password",
        TextBody=(
            f"Hi {user_name},\n\n"
            f"Click the link below to reset your HeadshotDesk password.\n"
            f"This link will expire in 1 hour.\n\n"
            f"{reset_url}\n\n"
            f"If you didn't request this, you can safely ignore this email.\n"
        ),
        HtmlBody=(
            f"<p>Hi {user_name},</p>"
            f"<p>Click the link below to reset your HeadshotDesk password. "
            f"This link will expire in 1 hour.</p>"
            f'<p><a href="{reset_url}">Reset your password</a></p>'
            f"<p>If you didn't request this, you can safely ignore this email.</p>"
        ),
        MessageStream="outbound",
    )

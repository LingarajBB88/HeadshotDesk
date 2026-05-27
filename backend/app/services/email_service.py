"""
Transactional email. In production wires up to Postmark.
In dev (no token configured) logs the email to stdout so the developer
can grab the link from the logs without setting up real email.
"""
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def _send_via_postmark(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:
    """Shared Postmark send path. Lazily imports postmarker so dev environments
    without the package installed still boot."""
    try:
        from postmarker.core import PostmarkClient
    except ImportError:
        logger.error("postmarker not installed but POSTMARK_SERVER_TOKEN is set")
        return

    client = PostmarkClient(server_token=settings.postmark_server_token)
    client.emails.send(
        From=settings.email_from,
        To=to_email,
        Subject=subject,
        TextBody=text_body,
        HtmlBody=html_body,
        MessageStream="outbound",
    )


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

    _send_via_postmark(
        to_email=to_email,
        subject="Reset your HeadshotDesk password",
        text_body=(
            f"Hi {user_name},\n\n"
            f"Click the link below to reset your HeadshotDesk password.\n"
            f"This link will expire in 1 hour.\n\n"
            f"{reset_url}\n\n"
            f"If you didn't request this, you can safely ignore this email.\n"
        ),
        html_body=(
            f"<p>Hi {user_name},</p>"
            f"<p>Click the link below to reset your HeadshotDesk password. "
            f"This link will expire in 1 hour.</p>"
            f'<p><a href="{reset_url}">Reset your password</a></p>'
            f"<p>If you didn't request this, you can safely ignore this email.</p>"
        ),
    )


def send_gallery_delivery_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    gallery_url: str,
) -> None:
    """Send (or log) the gallery delivery email — the F5c notification that
    tells a participant their headshots are ready.

    The email is one-way: a clear notification with a CTA back into the gallery.
    Replies aren't expected — all post-delivery communication is meant to live
    in-app on the gallery itself (see the in-app messaging follow-up ticket).
    Keep the body short, warm, and inside HeadshotDesk's understated voice.
    """
    subject = f"Your headshots are ready — {job_name}"
    text_body = (
        f"Hi {participant_name.split()[0] if participant_name else 'there'},\n\n"
        f"Your headshots from {job_name} are ready to view and download.\n\n"
        f"{gallery_url}\n\n"
        f"— {photographer_name}\n"
    )
    html_body = (
        f"<p>Hi {participant_name.split()[0] if participant_name else 'there'},</p>"
        f"<p>Your headshots from <strong>{job_name}</strong> are ready to view "
        f"and download.</p>"
        f'<p><a href="{gallery_url}" '
        f'style="display:inline-block;background:#5B6CFF;color:#FFFFFF;'
        f'padding:10px 18px;border-radius:8px;text-decoration:none;'
        f'font-weight:600;">View your gallery</a></p>'
        f"<p>— {photographer_name}</p>"
    )

    if not settings.postmark_server_token:
        # Dev mode: print to logs so we can copy the link.
        logger.warning(
            "[DEV EMAIL] Gallery delivery for %s (%s)\nGallery URL: %s",
            participant_name,
            to_email,
            gallery_url,
        )
        print(
            f"\n[DEV EMAIL] Gallery for {participant_name} <{to_email}>\n"
            f"            Subject: {subject}\n"
            f"            Gallery URL: {gallery_url}\n",
            flush=True,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )

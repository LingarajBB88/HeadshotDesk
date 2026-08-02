"""
Transactional email. In production wires up to Postmark.
In dev (no token configured) logs the email to stdout so the developer
can grab the link from the logs without setting up real email.

HSD-48 — every body lives in app/templates/emails/ as a 3-file bundle
({name}.subject.txt + {name}.txt + {name}.html) and renders through
template_service.render_email. No hardcoded copy in this module.
"""
import logging

from app.config import settings
from app.services.template_service import render_email

logger = logging.getLogger(__name__)

# Canonical "app" context for templates. Variable namespace lives in
# docs/EMAIL_TEMPLATES.md.
_APP_CONTEXT = {
    "name": "HeadshotDesk",
    "url": "https://headshotdesk.com",
    # Product email is signed by a person, not a no-reply robot: these go
    # to a few hundred photographers, and a name invites the reply that
    # tells us something is broken. Override via env when the team grows.
    "sender_name": settings.email_sender_name,
    "sender_role": settings.email_sender_role,
    "support_email": settings.email_support_address or settings.feedback_to_email,
}


def _first_name(full_name: str | None) -> str:
    """Robustly pull the first name. Falls back to 'there' so a name-less
    template doesn't render 'Hi ,'."""
    if not full_name:
        return "there"
    first = full_name.strip().split()[0] if full_name.strip() else ""
    return first or "there"


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


def _log_dev_email(
    *,
    label: str,
    to_email: str,
    recipient_name: str,
    subject: str,
    text_body: str,
    extra_url: str | None = None,
) -> None:
    """Pretty-print the rendered email to stdout/logs in dev mode so the
    developer can preview copy without touching real Postmark."""
    logger.warning("[DEV EMAIL] %s for %s (%s)", label, recipient_name, to_email)
    body_indented = "\n".join(
        "            " + line for line in text_body.splitlines()
    )
    url_line = f"            URL: {extra_url}\n" if extra_url else ""
    print(
        f"\n[DEV EMAIL] {label} for {recipient_name} <{to_email}>\n"
        f"            Subject: {subject}\n"
        f"{url_line}"
        f"            ───── body ─────\n"
        f"{body_indented}\n"
        f"            ────────────────\n",
        flush=True,
    )


def send_password_reset_email(*, to_email: str, reset_url: str, user_name: str) -> None:
    """Send (or log) the password reset email."""
    rendered = render_email(
        "password_reset",
        {
            "user": {"name": user_name},
            "reset": {"url": reset_url, "expires_in": "1 hour"},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Password reset",
            to_email=to_email,
            recipient_name=user_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=reset_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
    )


def send_feature_request_email(*, message: str, reply_email: str | None) -> None:
    """Forward a public feature request to the team inbox
    (settings.feedback_to_email). Internal notification, not
    participant-facing."""
    rendered = render_email(
        "feature_request",
        {
            "request": {"message": message, "email": reply_email or "none"},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Feature request",
            to_email=settings.feedback_to_email,
            recipient_name="Team",
            subject=rendered["subject"],
            text_body=rendered["text"],
        )
        return

    _send_via_postmark(
        to_email=settings.feedback_to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
    )


def send_gallery_delivery_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    gallery_url: str,
    client_logo_url: str | None = None,
    client_name: str | None = None,
) -> None:
    """Send (or log) the F5c gallery delivery email — the one-way notification
    that tells a participant their headshots are ready, with a CTA back into
    the gallery.

    The actual copy lives in app/templates/emails/gallery_delivery.{subject.txt,
    txt, html}. To change voice or wording, edit those files — don't touch
    this function.
    """
    rendered = render_email(
        "gallery_delivery",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {"display_name": photographer_name},
            "job": {"name": job_name, "client_name": client_name},
            "gallery": {"url": gallery_url},
            # HSD-36: client branding in the email header, when set.
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Gallery delivery",
            to_email=to_email,
            recipient_name=participant_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=gallery_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
    )

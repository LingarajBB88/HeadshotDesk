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

# The line under the sender's name. Computed once here rather than assembled
# as "<role>, <company>" in seven templates, because doing it there produced
# "HeadshotDesk, HeadshotDesk" the moment the role was misconfigured, and it
# would have had to be fixed seven times.
_APP_CONTEXT["signature_line"] = (
    _APP_CONTEXT["name"]
    if not _APP_CONTEXT["sender_role"]
    or _APP_CONTEXT["sender_role"].strip().lower()
    == _APP_CONTEXT["name"].strip().lower()
    else f"{_APP_CONTEXT['sender_role']}, {_APP_CONTEXT['name']}"
)


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
    reply_to: str | None = None,
) -> None:
    """Shared Postmark send path. Lazily imports postmarker so dev environments
    without the package installed still boot.

    `reply_to` is the photographer's address on anything sent to a
    participant or a client. Without it, someone replying to their booking
    confirmation to ask for a different time reaches HeadshotDesk support
    instead of the person who can actually move them, and the photographer
    never learns the request was made. Left unset on photographer-facing
    mail, where we are the right recipient.
    """
    try:
        from postmarker.core import PostmarkClient
    except ImportError:
        logger.error("postmarker not installed but POSTMARK_SERVER_TOKEN is set")
        return

    client = PostmarkClient(server_token=settings.postmark_server_token)
    kwargs = {
        "From": settings.email_from,
        "To": to_email,
        "Subject": subject,
        "TextBody": text_body,
        "HtmlBody": html_body,
        "MessageStream": "outbound",
    }
    if reply_to:
        kwargs["ReplyTo"] = reply_to
    client.emails.send(**kwargs)


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


def send_slot_confirmation_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    day_label: str,
    time_label: str,
    minutes: int,
    location: str | None = None,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    moved: bool = False,
    reschedule_url: str | None = None,
    links: list[dict] | None = None,
    profile_url: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Confirm a booked time slot to the participant.

    Sent when someone books their own slot on the public signup page. It's
    the only record they have of when to turn up, so it carries the time
    and the place.

    `reschedule_url` is None unless the photographer allows participants to
    move their own time. When present it carries the participant's token,
    so following it moves the booking they already hold rather than
    creating a second one under a different address.

    Copy lives in app/templates/emails/slot_confirmation.{subject.txt, txt,
    html}. Edit those to change the wording, not this function.
    """
    rendered = render_email(
        "slot_confirmation",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {
                "display_name": photographer_name,
                "profile_url": profile_url,
                "links": links or [],
            },
            "job": {
                "name": job_name,
                "client_name": client_name,
                "location": location,
            },
            "booking": {
                "day_label": day_label,
                "time": time_label,
                "minutes": minutes,
                "reschedule_url": reschedule_url,
                # Someone whose time was moved for them needs to be told
                # that, not congratulated on a booking they didn't make.
                "moved": moved,
            },
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Slot moved" if moved else "Slot confirmation",
            to_email=to_email,
            recipient_name=participant_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=reschedule_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
        reply_to=reply_to,
    )


def send_welcome_email(
    *, to_email: str, user_name: str, trial_days: int
) -> None:
    """Greet a new photographer and point them at the one thing worth doing
    first. Copy lives in app/templates/emails/welcome.{subject.txt, txt, html}.
    """
    rendered = render_email(
        "welcome",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "trial": {"days": trial_days},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Welcome",
            to_email=to_email,
            recipient_name=user_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
    )


def send_email_verification_email(
    *, to_email: str, user_name: str, verify_url: str
) -> None:
    """Ask a new photographer to confirm their address.

    Its own message rather than a link inside the welcome email: it needs a
    subject line that says what it wants, and it needs to be findable again
    a week later.
    """
    from app.services.auth_service import EMAIL_VERIFICATION_TTL

    rendered = render_email(
        "email_verification",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "verify": {
                "url": verify_url,
                "days": EMAIL_VERIFICATION_TTL.days,
            },
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Email verification",
            to_email=to_email,
            recipient_name=user_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=verify_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
    )


def send_password_changed_email(*, to_email: str, user_name: str) -> None:
    """Security notice after a password reset completes.

    Its real audience is the person who did NOT change their password: it's
    the only signal they'd get that someone else took their account.
    """
    rendered = render_email(
        "password_changed",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Password changed",
            to_email=to_email,
            recipient_name=user_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
    )


def send_trial_ending_email(
    *,
    to_email: str,
    user_name: str,
    studio_name: str,
    days_left: int,
    ends_on: str,
    pricing_url: str,
) -> None:
    """Warn a photographer their trial is nearly up.

    Copy lives in app/templates/emails/trial_ending.{subject.txt, txt, html}.
    """
    rendered = render_email(
        "trial_ending",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "trial": {
                "studio_name": studio_name,
                "days_left": days_left,
                "ends_on": ends_on,
                "pricing_url": pricing_url,
            },
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="Trial ending",
        to_email=to_email,
        recipient_name=user_name,
        rendered=rendered,
        extra_url=pricing_url,
    )


def send_trial_ended_email(
    *, to_email: str, user_name: str, studio_name: str, pricing_url: str
) -> None:
    """Tell a photographer their trial has run out."""
    rendered = render_email(
        "trial_ended",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "trial": {"studio_name": studio_name, "pricing_url": pricing_url},
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="Trial ended",
        to_email=to_email,
        recipient_name=user_name,
        rendered=rendered,
        extra_url=pricing_url,
    )


def send_shoot_reminder_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    queue_url: str,
    signup_url: str,
    time_label: str | None = None,
    location: str | None = None,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    profile_url: str | None = None,
    reschedule_url: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Remind a participant they're being photographed tomorrow.

    The cheapest thing in the product that reduces no-shows.
    """
    rendered = render_email(
        "shoot_reminder",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {
                "display_name": photographer_name,
                "profile_url": profile_url,
            },
            "job": {
                "name": job_name,
                "location": location,
                "client_name": client_name,
            },
            "reminder": {
                "time": time_label,
                "queue_url": queue_url,
                "signup_url": signup_url,
                "reschedule_url": reschedule_url,
            },
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="Shoot reminder",
        to_email=to_email,
        recipient_name=participant_name,
        rendered=rendered,
        extra_url=signup_url,
        reply_to=reply_to,
    )


def send_referral_reward_email(
    *,
    to_email: str,
    user_name: str,
    referred_name: str,
    months: int,
) -> None:
    """Tell a referrer they've earned free months.

    Worth sending even though it needs no action: a reward nobody is told
    about doesn't make anyone share the link a second time.
    """
    rendered = render_email(
        "referral_reward",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "reward": {"referred_name": referred_name, "months": months},
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="Referral reward",
        to_email=to_email,
        recipient_name=user_name,
        rendered=rendered,
    )


def send_no_show_followup_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    signup_url: str,
    can_rebook: bool,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Follow up with someone who didn't turn up.

    Blame-free by design: half of no-shows are a meeting that overran, and
    an email that reads like a telling-off doesn't get a reply.
    """
    rendered = render_email(
        "no_show_followup",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {"display_name": photographer_name},
            "job": {"name": job_name, "client_name": client_name},
            "followup": {"signup_url": signup_url, "can_rebook": can_rebook},
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="No-show follow-up",
        to_email=to_email,
        recipient_name=participant_name,
        rendered=rendered,
        extra_url=signup_url,
        reply_to=reply_to,
    )


def send_gallery_nudge_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    gallery_url: str,
    download_cap: int | None = None,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Remind someone their gallery is sitting unopened.

    One nudge, never a second: the target is people who forgot, not people
    who decided.
    """
    rendered = render_email(
        "gallery_nudge",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {"display_name": photographer_name},
            "job": {"name": job_name, "client_name": client_name},
            "gallery": {"url": gallery_url, "download_cap": download_cap},
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="Gallery nudge",
        to_email=to_email,
        recipient_name=participant_name,
        rendered=rendered,
        extra_url=gallery_url,
        reply_to=reply_to,
    )


def send_undelivered_nudge_email(
    *,
    to_email: str,
    user_name: str,
    job_name: str,
    job_url: str,
    count: int,
    days_ago: int,
) -> None:
    """Tell a photographer a shot job still hasn't been delivered."""
    rendered = render_email(
        "undelivered_nudge",
        {
            "user": {"name": user_name, "first_name": _first_name(user_name)},
            "job": {"name": job_name},
            "nudge": {"job_url": job_url, "count": count, "days_ago": days_ago},
            "app": _APP_CONTEXT,
        },
    )
    _deliver(
        label="Undelivered nudge",
        to_email=to_email,
        recipient_name=user_name,
        rendered=rendered,
        extra_url=job_url,
    )


def send_admin_new_signup_email(
    *,
    user_name: str,
    studio_name: str,
    email: str,
    plan: str,
    referrer_name: str | None = None,
    invite_code: str | None = None,
    seats_left: int | None = None,
) -> None:
    """Tell the team someone signed up.

    Goes to the team inbox, not to the person who signed up. Carries where
    they came from, because "who is this and how did they find us" is the
    only question worth answering on a phone at the weekend.
    """
    via = None
    if invite_code:
        via = "invited"
    elif referrer_name:
        via = f"via {referrer_name}"

    rendered = render_email(
        "admin_new_signup",
        {
            "signup": {
                "user_name": user_name,
                "studio_name": studio_name,
                "email": email,
                "plan": plan,
                "referrer_name": referrer_name,
                "invite_code": invite_code,
                "seats_left": seats_left,
                "via": via,
                "admin_url": f"{_APP_CONTEXT['url']}/admin",
            },
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Admin: new signup",
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


def _deliver(
    *,
    label: str,
    to_email: str,
    recipient_name: str,
    rendered: dict,
    extra_url: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Log in development, send in production.

    Factored out because every sender above it repeated the same six lines,
    and a copy-paste slip there means an email that silently never sends.
    """
    if not settings.postmark_server_token:
        _log_dev_email(
            label=label,
            to_email=to_email,
            recipient_name=recipient_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=extra_url,
        )
        return
    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
        reply_to=reply_to,
    )


def send_client_delivery_email(
    *,
    to_email: str,
    photographer_name: str,
    job_name: str,
    sent: int,
    total: int,
    not_photographed: int,
    dashboard_url: str | None = None,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Tell the photographer's client that galleries have gone out.

    Counts only: the client sees how many people got their photos, never who.
    Copy lives in app/templates/emails/client_delivery.{subject.txt, txt, html}.
    """
    rendered = render_email(
        "client_delivery",
        {
            "photographer": {"display_name": photographer_name},
            "job": {"name": job_name, "client_name": client_name},
            "delivery": {
                "sent": sent,
                "total": total,
                "not_photographed": not_photographed,
            },
            "dashboard": {"url": dashboard_url},
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Client delivery",
            to_email=to_email,
            recipient_name=client_name or "Client",
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=dashboard_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
        reply_to=reply_to,
    )


def send_slot_cancelled_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    day_label: str,
    time_label: str,
    signup_url: str,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Tell a participant their booked time is gone.

    Copy lives in app/templates/emails/slot_cancelled.{subject.txt, txt, html}.
    """
    rendered = render_email(
        "slot_cancelled",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {"display_name": photographer_name},
            "job": {"name": job_name, "client_name": client_name},
            "booking": {
                "day_label": day_label,
                "time": time_label,
                "signup_url": signup_url,
            },
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Slot cancelled",
            to_email=to_email,
            recipient_name=participant_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=signup_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
        reply_to=reply_to,
    )


def send_signup_confirmation_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    signup_url: str,
    queue_url: str,
    time_slots: bool,
    shoot_date: str | None = None,
    location: str | None = None,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    profile_url: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Acknowledge a public signup.

    On queue-mode jobs this is the only message a participant receives until
    their gallery arrives, so it carries the date, place, and their live
    queue link. On slot jobs it's followed by a booking confirmation.

    Copy lives in app/templates/emails/signup_confirmation.{subject.txt, txt,
    html}.
    """
    rendered = render_email(
        "signup_confirmation",
        {
            "participant": {
                "name": participant_name,
                "first_name": _first_name(participant_name),
            },
            "photographer": {
                "display_name": photographer_name,
                "profile_url": profile_url,
            },
            "job": {
                "name": job_name,
                "client_name": client_name,
                "shoot_date": shoot_date,
                "location": location,
            },
            "signup": {
                "url": signup_url,
                "queue_url": queue_url,
                "time_slots": time_slots,
            },
            "client": {"logo_url": client_logo_url},
            "app": _APP_CONTEXT,
        },
    )

    if not settings.postmark_server_token:
        _log_dev_email(
            label="Signup confirmation",
            to_email=to_email,
            recipient_name=participant_name,
            subject=rendered["subject"],
            text_body=rendered["text"],
            extra_url=signup_url if time_slots else queue_url,
        )
        return

    _send_via_postmark(
        to_email=to_email,
        subject=rendered["subject"],
        text_body=rendered["text"],
        html_body=rendered["html"],
        reply_to=reply_to,
    )


def send_gallery_delivery_email(
    *,
    to_email: str,
    participant_name: str,
    photographer_name: str,
    job_name: str,
    gallery_url: str,
    photo_count: int = 0,
    download_cap: int | None = None,
    picks_enabled: bool = False,
    client_logo_url: str | None = None,
    client_name: str | None = None,
    reply_to: str | None = None,
) -> None:
    """Send (or log) the F5c gallery delivery email — the one-way notification
    that tells a participant their headshots are ready, with a CTA back into
    the gallery.

    The rules differ per job: how many photos are waiting, how many the
    person may keep, whether they're being asked to star favourites. Saying
    "download the one you like" to someone entitled to three is the kind of
    small wrongness that generates a support email, so all of it is passed
    in and the template adapts.

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
            "gallery": {
                "url": gallery_url,
                "photo_count": photo_count,
                # None means unlimited. Zero would mean "none", which is a
                # different sentence, so the template checks for null.
                "download_cap": download_cap,
                "picks_enabled": picks_enabled,
            },
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
        reply_to=reply_to,
    )

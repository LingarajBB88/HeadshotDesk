"""
HSD-48 — Template-aware messaging foundation.

Every outbound communication HeadshotDesk emits (emails, eventually any
participant-visible system message) is rendered through this service.
No hardcoded strings in code; templates live as files under
`app/templates/`, named variables come from a documented namespace
(see docs/EMAIL_TEMPLATES.md).

Why this exists:
  • Makes the v0.2 "photographer can edit message copy" feature a UI
    on top of existing templates instead of a refactor of every send
    code path.
  • Catches missing variables loudly in dev (StrictUndefined) instead
    of silently emitting "Hi !" in production.
  • Single canonical place to enumerate variables — the v0.2
    customization UI will read this contract to show chips.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from jinja2 import (
    Environment,
    FileSystemLoader,
    StrictUndefined,
    select_autoescape,
)

# Templates live alongside the app code so they get packaged with deploys.
# Email templates conventionally live under emails/; future namespaces can
# go in their own subdirs (sms/, pages/, etc.) without changing this loader.
_TEMPLATES_ROOT = Path(__file__).resolve().parent.parent / "templates"


@lru_cache(maxsize=1)
def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATES_ROOT)),
        # Autoescape ON for .html (XSS safety on participant.name etc.),
        # OFF for plain text. select_autoescape handles this by suffix.
        autoescape=select_autoescape(
            enabled_extensions=("html", "htm"),
            default_for_string=False,
            default=False,
        ),
        # StrictUndefined makes missing variables raise UndefinedError at
        # render time. Dev / CI surfaces it immediately; prevents silently
        # broken emails ("Hi ,").
        undefined=StrictUndefined,
        # No need for HTML-style trim/lstrip — emails are short.
        trim_blocks=False,
        lstrip_blocks=False,
        keep_trailing_newline=True,
    )


def render_template(name: str, context: dict) -> str:
    """Render a single template file relative to the templates root.

    `name` is the relative path including subdirs and extension, e.g.
    "emails/gallery_delivery.txt". Returns the rendered string.

    Raises jinja2.UndefinedError if a referenced variable is missing
    from `context` — intentional: fail fast in dev rather than send
    broken copy.
    """
    template = _env().get_template(name)
    return template.render(**context)


def render_email(name: str, context: dict) -> dict:
    """Convenience wrapper for a 3-file email bundle.

    Given a logical email name like "gallery_delivery", loads:
      emails/{name}.subject.txt — the subject line
      emails/{name}.txt         — the plain-text body
      emails/{name}.html        — the HTML body

    Returns: {"subject": str, "text": str, "html": str}.

    Subject is single-line; we strip trailing whitespace so a template
    file ending in \\n doesn't end up with a literal newline in the
    email header (which would be invalid).
    """
    subject = render_template(f"emails/{name}.subject.txt", context).strip()
    text = render_template(f"emails/{name}.txt", context)
    html = render_template(f"emails/{name}.html", context)
    return {"subject": subject, "text": text, "html": html}

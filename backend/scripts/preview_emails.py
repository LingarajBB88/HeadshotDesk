"""
Render every email template with sample data into one HTML page.

Reading the copy is the only way to catch the things tests never will: a
sentence that promises something the product doesn't do, a link labelled
wrongly, two emails that say the same thing. This renders all of them side
by side so the whole set can be read in one sitting.

Uses the real Jinja environment, StrictUndefined included, so a template
referencing a variable nobody passes fails here rather than in someone's
inbox.

    python scripts/preview_emails.py            # writes email-preview.html
    python scripts/preview_emails.py --out x.html
"""
from __future__ import annotations

import argparse
import html
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# app/services/__init__.py eagerly imports every service, which drags in
# SQLAlchemy, FastAPI and the database layer for what is a pure template
# render. Stubbing the package keeps this script runnable with nothing but
# Jinja and pydantic-settings installed, which matters because the point of
# it is to be easy to run.
_pkg = types.ModuleType("app.services")
_pkg.__path__ = [str(ROOT / "app" / "services")]
sys.modules.setdefault("app.services", _pkg)

from app.services.email_service import _APP_CONTEXT  # noqa: E402
from app.services.template_service import render_email  # noqa: E402

PHOTOGRAPHER = {
    "display_name": "Panther Studios",
    "profile_url": "https://headshotdesk.com/p/panther-studios",
    "links": [
        {"label": "How to prepare for your headshots session",
         "url": "https://pantherstudios.nl/prepare"},
        {"label": "Directions to the studio",
         "url": "https://pantherstudios.nl/directions"},
    ],
}
PARTICIPANT = {"first_name": "Jane", "name": "Jane Doe"}
JOB = {
    "name": "Invest-NL Headshots",
    "client_name": "Invest-NL",
    "shoot_date": "Thursday 13 August",
    "location": "Panther Studios, Amsterdam",
}
CLIENT = {"logo_url": None}
USER = {"first_name": "Lingaraj", "name": "Lingaraj Bhat"}

SIGNUP_URL = "https://headshotdesk.com/s/invest-nl-headshots"
RESCHEDULE_URL = f"{SIGNUP_URL}?t=PARTICIPANT_TOKEN"

# One case per template. Where a template branches on something that
# changes the message materially, both branches are rendered.
CASES: list[tuple[str, str, dict]] = [
    (
        "signup_confirmation",
        "Signup confirmation (walk-up queue job)",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "signup": {"url": SIGNUP_URL,
                       "queue_url": "https://headshotdesk.com/q/TOKEN",
                       "time_slots": False},
        },
    ),
    (
        "signup_confirmation",
        "Signup confirmation (slot job, no time picked yet)",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "signup": {"url": SIGNUP_URL,
                       "queue_url": "https://headshotdesk.com/q/TOKEN",
                       "time_slots": True},
        },
    ),
    (
        "slot_confirmation",
        "Booking confirmation (rescheduling off, the default)",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "booking": {"day_label": "Thursday 13 August", "time": "09:00",
                        "minutes": 15, "reschedule_url": None, "moved": False},
        },
    ),
    (
        "slot_confirmation",
        "Booking confirmation (rescheduling on)",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "booking": {"day_label": "Thursday 13 August", "time": "09:00",
                        "minutes": 15, "reschedule_url": RESCHEDULE_URL,
                        "moved": False},
        },
    ),
    (
        "slot_confirmation",
        "Booking moved by the photographer",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "booking": {"day_label": "Thursday 13 August", "time": "11:30",
                        "minutes": 15, "reschedule_url": None, "moved": True},
        },
    ),
    (
        "slot_cancelled",
        "Booking cancelled",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "booking": {"day_label": "Thursday 13 August", "time": "09:00",
                        "signup_url": SIGNUP_URL},
        },
    ),
    (
        "shoot_reminder",
        "Shoot reminder, day before (booked time, rescheduling off)",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "reminder": {"time": "09:00",
                         "queue_url": "https://headshotdesk.com/q/TOKEN",
                         "signup_url": SIGNUP_URL, "reschedule_url": None},
        },
    ),
    (
        "shoot_reminder",
        "Shoot reminder, day before (walk-up queue)",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "reminder": {"time": None,
                         "queue_url": "https://headshotdesk.com/q/TOKEN",
                         "signup_url": SIGNUP_URL, "reschedule_url": None},
        },
    ),
    (
        "gallery_delivery",
        "Gallery delivered",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "gallery": {"url": "https://headshotdesk.com/g/TOKEN",
                        "photo_count": 12, "download_cap": 3,
                        "picks_enabled": True, "pick_cap": 3},
        },
    ),
    (
        "gallery_nudge",
        "Gallery nudge, 4 days later",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "gallery": {"url": "https://headshotdesk.com/g/TOKEN",
                        "photo_count": 12, "download_cap": 3,
                        "picks_enabled": True, "pick_cap": 3},
            "nudge": {"days_ago": 4, "count": 12,
                      "job_url": "https://headshotdesk.com/jobs/JOB"},
        },
    ),
    (
        "no_show_followup",
        "Did not attend",
        {
            "participant": PARTICIPANT, "photographer": PHOTOGRAPHER,
            "job": JOB, "client": CLIENT,
            "followup": {"signup_url": SIGNUP_URL, "can_rebook": True},
        },
    ),
    (
        "client_delivery",
        "To your client, when the job is delivered",
        {
            "photographer": PHOTOGRAPHER, "job": JOB, "client": CLIENT,
            "user": USER,
            "delivery": {"sent": 24, "total": 26, "not_photographed": 2},
            "dashboard": {"url": "https://headshotdesk.com/c/CLIENTTOKEN"},
        },
    ),
    (
        "email_verification",
        "Confirm your email (photographer)",
        {"user": USER, "verify": {"url": "https://headshotdesk.com/verify-email?token=X",
                                  "days": 7}},
    ),
    (
        "welcome",
        "Welcome, after verifying (photographer)",
        {"user": USER, "trial": {"days": 31}},
    ),
    (
        "trial_ending",
        "Trial ending in 7 days (photographer)",
        {"user": USER,
         "trial": {"days_left": 7, "ends_on": "Thursday 18 September",
                   "studio_name": "Panther Studios",
                   "pricing_url": "https://headshotdesk.com/pricing"}},
    ),
    (
        "trial_ended",
        "Trial ended (photographer)",
        {"user": USER,
         "trial": {"days_left": 0, "ends_on": "Thursday 18 September",
                   "studio_name": "Panther Studios",
                   "pricing_url": "https://headshotdesk.com/pricing"}},
    ),
    (
        "undelivered_nudge",
        "Job shot but not delivered, 3 days on (photographer)",
        {"user": USER, "job": JOB,
         "nudge": {"days_ago": 3, "count": 24,
                   "job_url": "https://headshotdesk.com/jobs/JOB"}},
    ),
    (
        "password_reset",
        "Password reset (photographer)",
        {"user": USER,
         "reset": {"url": "https://headshotdesk.com/reset?token=X",
                   "expires_in": "1 hour"}},
    ),
    (
        "password_changed",
        "Password changed (photographer)",
        {"user": USER},
    ),
    (
        "referral_reward",
        "Referral turned into a paying customer (photographer)",
        {"user": USER, "reward": {"months": 1, "referred_name": "Sam Okafor"}},
    ),
]

PAGE_CSS = """
body{font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,
sans-serif;color:#0B0F1A;background:#F6F7F9;margin:0;padding:32px}
.wrap{max-width:920px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px}
.lede{color:#475569;margin:0 0 28px}
.card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;
margin:0 0 22px;overflow:hidden}
.hd{padding:14px 18px;border-bottom:1px solid #E5E7EB;background:#FAFBFC}
.who{font-size:11px;letter-spacing:.08em;text-transform:uppercase;
color:#64748B;margin:0 0 3px}
.name{font-weight:600;margin:0}
.subj{margin:6px 0 0;color:#0B0F1A}
.subj span{color:#64748B}
.body{padding:18px}
pre{white-space:pre-wrap;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,
monospace;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;
padding:12px;margin:0;color:#334155}
details{margin-top:12px}
summary{cursor:pointer;color:#5B6CFF;font-size:13px}
"""


def audience(template: str) -> str:
    photographer_facing = {
        "email_verification", "welcome", "trial_ending", "trial_ended",
        "undelivered_nudge", "password_reset", "password_changed",
        "referral_reward", "admin_new_signup", "feature_request",
    }
    if template == "client_delivery":
        return "Your client"
    return "Photographer" if template in photographer_facing else "Participant"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="email-preview.html")
    args = ap.parse_args()

    parts = [
        "<!doctype html><meta charset='utf-8'>",
        "<title>HeadshotDesk emails</title>",
        f"<style>{PAGE_CSS}</style>",
        "<div class='wrap'><h1>Every email HeadshotDesk sends</h1>",
        "<p class='lede'>Rendered from the live templates with sample data. "
        "Plain-text versions are collapsed under each one.</p>",
    ]

    failures = 0
    for template, label, ctx in CASES:
        try:
            r = render_email(template, {**ctx, "app": _APP_CONTEXT})
        except Exception as exc:  # noqa: BLE001
            failures += 1
            parts.append(
                f"<div class='card'><div class='hd'><p class='name'>{label}</p>"
                f"<p class='subj' style='color:#B91C1C'>FAILED: "
                f"{html.escape(str(exc))}</p></div></div>"
            )
            continue
        parts.append(
            "<div class='card'>"
            f"<div class='hd'><p class='who'>{audience(template)} &middot; "
            f"{template}</p><p class='name'>{html.escape(label)}</p>"
            f"<p class='subj'><span>Subject:</span> "
            f"{html.escape(r['subject'])}</p></div>"
            f"<div class='body'>{r['html']}"
            f"<details><summary>Plain text</summary>"
            f"<pre>{html.escape(r['text'])}</pre></details>"
            "</div></div>"
        )

    parts.append("</div>")
    Path(args.out).write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {args.out} ({len(CASES) - failures}/{len(CASES)} rendered)")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

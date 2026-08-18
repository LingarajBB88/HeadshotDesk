#!/usr/bin/env python
"""
Daily scheduled email. Run by Render cron (see render.yaml).

Safe to run twice: every send is gated on a NULL timestamp that's set
immediately after, so a manual re-run at 2am by someone unsure whether the
first one worked can't double-send.

Usage:
    python scripts/send_scheduled_emails.py          # send
    python scripts/send_scheduled_emails.py --dry    # count only, send nothing
"""
import logging
import sys

sys.path.insert(0, "/app")

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.services import scheduled_email_service  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("scheduled-email")


def main() -> int:
    dry = "--dry" in sys.argv

    # Preflight, before touching the database. POSTMARK_SERVER_TOKEN is
    # sync:false in render.yaml, so it has to be set per service and this
    # one was missed. The run then printed the emails to the log, returned
    # normally, and the caller marked them sent: two trial warnings that can
    # now never go out, on a job Render reported as successful.
    #
    # Failing here means one clear line instead of a stack trace per
    # recipient, and a red job in the dashboard.
    if not dry and settings.env == "production" and not settings.postmark_server_token:
        logger.error(
            "POSTMARK_SERVER_TOKEN is not set on this service. Refusing to "
            "run: sending would be skipped silently and the sent-markers "
            "would be burned. Set it in the Render dashboard for "
            "headshotdesk-daily-email, it is not inherited from the API."
        )
        return 1

    db = SessionLocal()
    try:
        if dry:
            # Report what would go out without sending. Useful the first
            # time this runs against production, when the honest question
            # is "how many emails is this about to send?".
            from sqlalchemy import select

            from app.models import Account

            pending = db.scalars(
                select(Account).where(
                    Account.plan == "trial",
                    Account.trial_ending_email_at.is_(None),
                )
            ).all()
            logger.info("Dry run. %d trial accounts not yet warned.", len(pending))
            return 0

        results = scheduled_email_service.run_daily(db)
        logger.info("Daily email run: %s", results)
        # Non-zero exit on any step that blew up, so Render marks the job
        # failed and it's visible rather than buried in logs.
        return 1 if any(v < 0 for v in results.values()) else 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

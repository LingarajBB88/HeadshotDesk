"""
One-time cleanup: remove pytest residue from the dev database.

Before tests got their own database (see tests/conftest.py), every pytest
run left fake studios behind — accounts whose owner logs in with an
@example.com address. Real users can't have those (example.com is the
IETF-reserved test domain), so deleting by that pattern is safe. All child
rows (users, jobs, clients, participants, files, bookings, downloads,
sessions) go with them via DB-level cascades.

Run inside the backend container:
    docker compose exec backend python scripts/purge_test_data.py
"""
import sys
from pathlib import Path

# Running as `python scripts/purge_test_data.py` puts scripts/ on the
# path, not the app root — add the parent so `app` imports resolve.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.db import engine


def main() -> None:
    with engine.begin() as conn:
        count = conn.execute(
            text(
                "SELECT count(DISTINCT account_id) FROM users "
                "WHERE email LIKE '%@example.com'"
            )
        ).scalar()
        if not count:
            print("Nothing to purge — no @example.com accounts found.")
            return
        conn.execute(
            text(
                "DELETE FROM accounts WHERE id IN ("
                "  SELECT DISTINCT account_id FROM users "
                "  WHERE email LIKE '%@example.com')"
            )
        )
        print(f"Purged {count} test account(s) and everything they owned.")


if __name__ == "__main__":
    main()

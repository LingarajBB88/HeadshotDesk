"""
Shared pytest fixtures.

Test isolation: tests run against a dedicated database (`<name>_test`,
derived from DATABASE_URL) so pytest runs never pollute the dev database
with fake studios — the admin dashboard made that residue painfully
visible. The redirect must happen before anything imports app.config,
which caches settings at import time.
"""
import os

# --- Redirect DATABASE_URL to the test database (before app imports) -----
_base_url = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg://headshotdesk:headshotdesk@localhost:5432/headshotdesk",
)
_base_name = _base_url.rsplit("/", 1)[-1].split("?")[0]
_TEST_NAME = f"{_base_name}_test"
_TEST_URL = _base_url.rsplit("/", 1)[0] + "/" + _TEST_NAME
os.environ["DATABASE_URL"] = _TEST_URL

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

from app.main import app  # noqa: E402  (imports app.db bound to the test URL)


def _ensure_test_database() -> None:
    """Create the test database if missing, then rebuild the schema from the
    models. drop_all+create_all keeps the schema current with the code
    without needing migrations to run in tests."""
    # Maintenance connection to the dev DB (which always exists) with
    # autocommit — CREATE DATABASE can't run inside a transaction.
    admin_engine = create_engine(
        _base_url.replace("postgres://", "postgresql+psycopg://").replace(
            "postgresql://", "postgresql+psycopg://"
        ),
        isolation_level="AUTOCOMMIT",
    )
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"),
            {"n": _TEST_NAME},
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{_TEST_NAME}"'))
    admin_engine.dispose()

    from app import models  # noqa: F401  (register all tables on Base)
    from app.db import Base, engine

    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS citext"))
        conn.commit()
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture(scope="session", autouse=True)
def _test_db() -> None:
    _ensure_test_database()


@pytest.fixture
def client() -> TestClient:
    """In-process FastAPI client. Doesn't require a running uvicorn."""
    return TestClient(app)


@pytest.fixture
def db_session():
    """A plain session for tests that need to reach past the API — seeding a
    row, or calling a service function directly to check a rule the HTTP
    layer can't express."""
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def auto_verify_signups(request, monkeypatch):
    """Treat accounts created during tests as verified.

    Verification is a hard gate on the whole authenticated API, so without
    this every test in the suite would have to perform the same three-line
    verification dance before it could assert anything about jobs, files or
    galleries. That buries what each test is actually about, and two hundred
    copies of the same setup is two hundred chances to get it subtly wrong.

    The gate itself is real and tested properly in test_email_verification.py.
    Tests that need an unverified account opt out:

        @pytest.mark.unverified
        def test_something(...): ...
    """
    if "unverified" in request.keywords:
        return

    from datetime import datetime, timezone

    from app.services import auth_service

    real_signup = auth_service.signup

    def verified_signup(db, **kwargs):
        user, account, tokens = real_signup(db, **kwargs)
        if user.email_verified_at is None:
            user.email_verified_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(user)
        return user, account, tokens

    # The route resolves auth_service.signup at call time, so patching the
    # module attribute is enough.
    monkeypatch.setattr(auth_service, "signup", verified_signup)

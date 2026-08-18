"""
SQLAlchemy engine + session setup.
Models live in app/models/ and inherit from `Base`.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    # Never in production, whatever DEBUG says. Echoed SQL puts participant
    # email addresses and gallery tokens into the log in plain text, and a
    # gallery token is the only thing standing between a stranger and
    # someone's photos. It also drowns the one line per run that anyone
    # actually reads.
    echo=settings.debug and settings.env != "production",
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=Session)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

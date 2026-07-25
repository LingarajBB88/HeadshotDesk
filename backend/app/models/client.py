"""
HSD-36 — Client: the company being photographed. Owned by the photographer's
account, one-to-many with jobs. Exists so branding (the client's logo) is
uploaded once and inherited by every job for that client — corporate headshot
work is highly repeat business.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    account_id: Mapped[str] = mapped_column(
        String, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Logo lives in storage (R2 in prod) under client-logos/<id><ext>.
    # Key + content type here; bytes served via the public logo endpoint.
    logo_key: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_content_type: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (Index("idx_clients_account_id", "account_id"),)

"""
HSD-66 — Operator (admin) dashboard API.

Audience: HeadshotDesk staff only, gated by require_admin (ADMIN_EMAILS env
var, enforced here — never trust a frontend role check). Read-only for the
launch cut: accounts list with usage stats, subscription/trial status, and
top-line business metrics. Manual admin actions (extend trial, comp a month)
are the v0.2 expansion.

Subscription status is derived until Stripe billing ships:
  • plan in (solo, pro, studio)  → active
  • plan == hibernate            → hibernating
  • plan == cancelled            → cancelled
  • plan == trial                → trial while inside the 31-day window,
                                   soft_locked after it (matches the
                                   pricing model's day-31 soft lock).
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db import get_db
from app.models import Account, File, Job, Participant, ParticipantDownload, User

router = APIRouter(dependencies=[Depends(require_admin)])

TRIAL_DAYS = 31

# Monthly price per plan in EUR — mirrors the public pricing page. Used for
# the MRR headline until Stripe is the source of truth.
PLAN_PRICES = {"solo": 29, "pro": 44, "studio": 89, "hibernate": 7}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _derive_status(account: Account) -> tuple[str, int | None]:
    """Returns (status, trial_days_left). trial_days_left only for trials."""
    if account.plan in ("solo", "pro", "studio"):
        return "active", None
    if account.plan == "hibernate":
        return "hibernating", None
    if account.plan == "cancelled":
        return "cancelled", None
    expires = account.created_at + timedelta(days=TRIAL_DAYS)
    days_left = (expires - _utcnow()).days
    if days_left < 0:
        return "soft_locked", None
    return "trial", days_left


class AdminAccountRow(BaseModel):
    account_id: str
    name: str
    email: str | None
    plan: str
    status: str
    trial_days_left: int | None
    signed_up_at: datetime
    jobs_total: int
    jobs_this_month: int
    participants_total: int
    photos_uploaded: int
    galleries_delivered: int
    downloads_used: int


class AdminOverview(BaseModel):
    accounts_total: int
    paying_customers: int
    trials_in_flight: int
    soft_locked: int
    hibernating: int
    cancelled: int
    mrr_eur: int
    jobs_total: int
    jobs_this_month: int
    participants_total: int
    photos_uploaded: int
    recent_signups: list[AdminAccountRow]


class AdminAccountList(BaseModel):
    items: list[AdminAccountRow]
    total: int


def _account_rows(
    db: Session,
    *,
    search: str | None = None,
    status_filter: str | None = None,
    limit: int | None = None,
) -> list[AdminAccountRow]:
    accounts = list(
        db.scalars(select(Account).order_by(Account.created_at.desc())).all()
    )

    # Owner email per account: earliest user on the account.
    emails: dict[str, str] = {}
    for u in db.scalars(select(User).order_by(User.created_at.asc())).all():
        emails.setdefault(u.account_id, u.email)

    # Usage stats in a handful of grouped queries (no N+1).
    month_start = _utcnow().replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    jobs_total = dict(
        db.execute(
            select(Job.account_id, func.count()).group_by(Job.account_id)
        ).all()
    )
    jobs_month = dict(
        db.execute(
            select(Job.account_id, func.count())
            .where(Job.created_at >= month_start)
            .group_by(Job.account_id)
        ).all()
    )
    participant_stats = {
        row[0]: (row[1], row[2])
        for row in db.execute(
            select(
                Job.account_id,
                func.count(Participant.id),
                func.count(Participant.gallery_sent_at),
            )
            .join(Job, Job.id == Participant.job_id)
            .group_by(Job.account_id)
        ).all()
    }
    # Unique downloads per account. ParticipantDownload rows are unique per
    # (participant, file), so a plain count is already unique pulls.
    downloads = dict(
        db.execute(
            select(Job.account_id, func.count())
            .select_from(ParticipantDownload)
            .join(Participant, Participant.id == ParticipantDownload.participant_id)
            .join(Job, Job.id == Participant.job_id)
            .group_by(Job.account_id)
        ).all()
    )
    photos = dict(
        db.execute(
            select(Job.account_id, func.count(File.id))
            .join(Job, Job.id == File.job_id)
            .where(File.deleted_at.is_(None), File.variant == "original")
            .group_by(Job.account_id)
        ).all()
    )

    rows: list[AdminAccountRow] = []
    for a in accounts:
        status, days_left = _derive_status(a)
        email = emails.get(a.id)
        if search:
            q = search.lower()
            if q not in (email or "").lower() and q not in a.name.lower():
                continue
        if status_filter and status != status_filter:
            continue
        p_total, p_delivered = participant_stats.get(a.id, (0, 0))
        p_downloads = downloads.get(a.id, 0)
        rows.append(
            AdminAccountRow(
                account_id=a.id,
                name=a.name,
                email=email,
                plan=a.plan,
                status=status,
                trial_days_left=days_left,
                signed_up_at=a.created_at,
                jobs_total=jobs_total.get(a.id, 0),
                jobs_this_month=jobs_month.get(a.id, 0),
                participants_total=p_total,
                photos_uploaded=photos.get(a.id, 0),
                galleries_delivered=p_delivered,
                downloads_used=int(p_downloads),
            )
        )
        if limit and len(rows) >= limit:
            break
    return rows


@router.get("/overview", response_model=AdminOverview)
def overview(db: Session = Depends(get_db)) -> AdminOverview:
    rows = _account_rows(db)
    by_status: dict[str, int] = {}
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
    mrr = sum(PLAN_PRICES.get(r.plan, 0) for r in rows)
    return AdminOverview(
        accounts_total=len(rows),
        paying_customers=by_status.get("active", 0),
        trials_in_flight=by_status.get("trial", 0),
        soft_locked=by_status.get("soft_locked", 0),
        hibernating=by_status.get("hibernating", 0),
        cancelled=by_status.get("cancelled", 0),
        mrr_eur=mrr,
        jobs_total=sum(r.jobs_total for r in rows),
        jobs_this_month=sum(r.jobs_this_month for r in rows),
        participants_total=sum(r.participants_total for r in rows),
        photos_uploaded=sum(r.photos_uploaded for r in rows),
        recent_signups=rows[:8],  # already newest-first
    )


@router.get("/accounts", response_model=AdminAccountList)
def accounts(
    search: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=30),
    db: Session = Depends(get_db),
) -> AdminAccountList:
    rows = _account_rows(db, search=search, status_filter=status)
    return AdminAccountList(items=rows, total=len(rows))

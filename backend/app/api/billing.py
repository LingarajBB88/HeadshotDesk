"""Billing API (HSD-21): status, Checkout, Customer Portal, Stripe webhook."""
from typing import Literal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, get_current_user
from app.config import settings
from app.db import get_db
from app.models import Account, User
from app.services import billing_service

router = APIRouter()


class BillingStatus(BaseModel):
    billing_enabled: bool
    plan: str
    state: str
    can_deliver: bool
    read_only: bool
    trial_days_left: int | None
    max_active_jobs: int | None
    max_participants: int | None
    active_jobs: int
    participants: int
    subscription_status: str | None
    current_period_end: str | None
    currency: str | None
    currencies: list[str]
    has_customer: bool


@router.get("", response_model=BillingStatus)
def get_status(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> BillingStatus:
    ent = billing_service.entitlement(account)
    return BillingStatus(
        billing_enabled=settings.billing_enabled,
        plan=account.plan,
        state=ent.state,
        can_deliver=ent.can_deliver or not settings.billing_enabled,
        read_only=ent.read_only and settings.billing_enabled,
        trial_days_left=ent.trial_days_left,
        max_active_jobs=ent.max_active_jobs,
        max_participants=ent.max_participants,
        active_jobs=billing_service.active_job_count(db, account),
        participants=billing_service.participant_count(db, account),
        subscription_status=account.subscription_status,
        current_period_end=(
            account.current_period_end.isoformat() if account.current_period_end else None
        ),
        currency=account.billing_currency,
        currencies=billing_service.offered_currencies(),
        has_customer=bool(account.stripe_customer_id),
    )


class CheckoutRequest(BaseModel):
    plan: Literal["starter", "pro"]
    currency: Literal["usd", "eur"] | None = None


class RedirectOut(BaseModel):
    url: str


@router.post("/checkout", response_model=RedirectOut)
def checkout(
    payload: CheckoutRequest,
    user: User = Depends(get_current_user),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> RedirectOut:
    url = billing_service.create_checkout(
        db, account=account, user=user, plan=payload.plan, currency=payload.currency
    )
    return RedirectOut(url=url)


@router.post("/portal", response_model=RedirectOut)
def portal(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> RedirectOut:
    return RedirectOut(url=billing_service.create_portal(db, account=account))


@router.post("/webhook", include_in_schema=False)
async def webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    payload = await request.body()
    event = billing_service.parse_webhook(payload, stripe_signature)
    billing_service.handle_event(db, event)
    return {"received": True}

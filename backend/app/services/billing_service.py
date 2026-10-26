"""
Billing (HSD-21) and the entitlements that follow from it (D-023).

Two halves:

1. Entitlement: what an account may do right now, decided from the row
   alone, with no call to Stripe. Every paywall asks `entitlement()`.
2. Stripe: Checkout to subscribe, the Customer Portal to manage, and a
   webhook that mirrors the subscription back onto the account.

The rules, from D-023:

  trial      free for a month. Set up, add people, shoot, upload, preview.
             Not: sending galleries or delivery emails ("free to test the
             workflow, pay to deliver real work").
  expired    trial over, nothing bought: read-only. Data kept, subscribe
             any time to unlock.
  starter    $25. Everything, one active job at a time, unlimited
             participants.
  pro        $59. Everything, unlimited. 'solo' (old ladder) counts as
             unlimited too, so no early account loses anything.
  studio     $100. Pro plus the identity and service layer (own email
             domain, white-label, priority support, concierge onboarding).
             Sold as a priced waitlist until those exist; an account on
             'studio' today is unlimited like Pro.
  beta       a free seat: unlimited, nothing expires.
  hibernate  read-only, galleries stay live (the plan itself is HSD-22).
  cancelled  read-only.

Monthly or annual (two months free) for Starter and Pro. The private
founding offer for beta partners is a Stripe promotion code, not code
here: Checkout accepts promotion codes.

None of the paywalls apply until billing is switched on
(`settings.billing_enabled`). Locking people out before there is a way to
pay would be the worst possible order of operations.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Account, Job, Participant, User

logger = logging.getLogger(__name__)

TRIAL_DAYS = 31
STARTER_ACTIVE_JOBS = 1
# No participant cap on Starter (Lingaraj, 2026-10-25): one active job
# already defines the tier, and a cap would turn a good shoot into a
# support ticket.
STARTER_PARTICIPANTS: int | None = None

PLANS_SOLD = ("starter", "pro")
INTERVALS = ("month", "year")
UNLIMITED_PAID = ("pro", "solo", "studio")
# Stripe subscription statuses during which the customer keeps access.
# past_due keeps access while Stripe retries the card; unpaid and
# canceled do not.
_LIVE_STATUSES = ("active", "trialing", "past_due")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def trial_expires_at(account: Account) -> datetime:
    return (
        account.plan_renews_at
        or account.trial_ends_at
        or (account.created_at + timedelta(days=TRIAL_DAYS))
    )


@dataclass
class Entitlement:
    state: str  # trial | expired | starter | pro | beta | hibernate | cancelled
    can_deliver: bool
    read_only: bool
    max_active_jobs: int | None = None
    max_participants: int | None = None
    trial_days_left: int | None = None
    reasons: dict[str, str] = field(default_factory=dict)


def entitlement(account: Account) -> Entitlement:
    plan = account.plan
    if plan == "beta":
        return Entitlement("beta", can_deliver=True, read_only=False)
    if plan in UNLIMITED_PAID:
        return Entitlement("pro", can_deliver=True, read_only=False)
    if plan == "starter":
        return Entitlement(
            "starter",
            can_deliver=True,
            read_only=False,
            max_active_jobs=STARTER_ACTIVE_JOBS,
            max_participants=STARTER_PARTICIPANTS,
        )
    if plan == "hibernate":
        return Entitlement("hibernate", can_deliver=False, read_only=True)
    if plan == "cancelled":
        return Entitlement("cancelled", can_deliver=False, read_only=True)
    # trial
    days_left = (trial_expires_at(account) - _utcnow()).days
    if days_left < 0:
        return Entitlement("expired", can_deliver=False, read_only=True)
    return Entitlement("trial", can_deliver=False, read_only=False, trial_days_left=days_left)


# --- Paywalls -----------------------------------------------------------------
#
# 402 Payment Required, with a plain-language detail the frontend shows as
# is next to a "See plans" link. Never raised while billing is off.

_DELIVER_TRIAL = (
    "Delivering photos is part of a paid plan. Your free month covers setting "
    "up, shooting and previewing. Choose a plan to send galleries."
)
_READ_ONLY = (
    "Your account is read-only. Your jobs and photos are kept; choose a plan "
    "to keep working."
)


def _payment_required(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=detail)


def require_can_deliver(account: Account | None) -> None:
    if account is None or not settings.billing_enabled:
        return
    ent = entitlement(account)
    if ent.can_deliver:
        return
    raise _payment_required(_READ_ONLY if ent.read_only else _DELIVER_TRIAL)


def require_writable(account: Account | None) -> None:
    if account is None or not settings.billing_enabled:
        return
    if entitlement(account).read_only:
        raise _payment_required(_READ_ONLY)


def active_job_count(db: Session, account: Account) -> int:
    return db.scalar(
        select(func.count()).select_from(Job).where(
            Job.account_id == account.id, Job.archived_at.is_(None)
        )
    ) or 0


def participant_count(db: Session, account: Account) -> int:
    return db.scalar(
        select(func.count())
        .select_from(Participant)
        .join(Job, Job.id == Participant.job_id)
        .where(Job.account_id == account.id, Job.archived_at.is_(None))
    ) or 0


def require_can_create_job(db: Session, account: Account | None) -> None:
    if account is None or not settings.billing_enabled:
        return
    require_writable(account)
    ent = entitlement(account)
    if ent.max_active_jobs is not None and active_job_count(db, account) >= ent.max_active_jobs:
        raise _payment_required(
            "Starter includes one active job. Archive a finished job, or move "
            "to Pro for unlimited jobs."
        )


def require_can_add_participants(db: Session, account: Account | None, adding: int = 1) -> None:
    if account is None or not settings.billing_enabled:
        return
    require_writable(account)
    ent = entitlement(account)
    if ent.max_participants is not None and (
        participant_count(db, account) + adding > ent.max_participants
    ):
        raise _payment_required(
            f"Starter includes {ent.max_participants} participants. Move to Pro "
            "for unlimited participants."
        )


# --- Stripe -------------------------------------------------------------------


def _stripe():
    import stripe

    stripe.api_key = settings.stripe_secret_key
    return stripe


def price_id(plan: str, currency: str, interval: str = "month") -> str | None:
    suffix = "" if interval == "month" else f"_{interval}"
    return getattr(settings, f"stripe_price_{plan}_{currency}{suffix}", "") or None


def plan_for_price(price: str | None) -> tuple[str, str] | None:
    """(plan, interval) for a configured price ID, else None."""
    if not price:
        return None
    for plan in PLANS_SOLD:
        for currency in ("usd", "eur"):
            for interval in INTERVALS:
                if price_id(plan, currency, interval) == price:
                    return plan, interval
    return None


def offered_currencies() -> list[str]:
    return [c for c in ("usd", "eur") if price_id("pro", c)]


def offered_intervals(currency: str) -> list[str]:
    return [i for i in INTERVALS if price_id("pro", currency, i)]


def join_studio_waitlist(db: Session, account: Account) -> None:
    if account.studio_waitlist_at is None:
        account.studio_waitlist_at = _utcnow()
        db.commit()


def _require_billing() -> None:
    if not settings.billing_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Billing isn't switched on yet.",
        )


def _ensure_customer(db: Session, account: Account, user: User) -> str:
    if account.stripe_customer_id:
        return account.stripe_customer_id
    customer = _stripe().Customer.create(
        email=user.email,
        name=account.name,
        metadata={"account_id": account.id},
    )
    account.stripe_customer_id = customer["id"]
    db.commit()
    return account.stripe_customer_id


def create_checkout(
    db: Session,
    *,
    account: Account,
    user: User,
    plan: str,
    currency: str | None = None,
    interval: str = "month",
) -> str:
    """Returns the Stripe Checkout URL for subscribing to `plan`."""
    _require_billing()
    if plan not in PLANS_SOLD:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown plan.")
    if interval not in INTERVALS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown billing period.")
    # Once a customer has paid in one currency, Stripe keeps them there.
    currency = (account.billing_currency or currency or "usd").lower()
    price = price_id(plan, currency, interval)
    if not price:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "That plan isn't offered in this currency and billing period.",
        )
    if account.stripe_subscription_id and account.subscription_status in _LIVE_STATUSES:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You already have a subscription. Change plan from Manage billing.",
        )
    customer = _ensure_customer(db, account, user)
    try:
        session = _stripe().checkout.Session.create(
            mode="subscription",
            customer=customer,
            client_reference_id=account.id,
            line_items=[{"price": price, "quantity": 1}],
            success_url=f"{settings.frontend_url}/settings/billing?checkout=success",
            cancel_url=f"{settings.frontend_url}/settings/billing?checkout=cancelled",
            allow_promotion_codes=True,
            billing_address_collection="required",
            tax_id_collection={"enabled": True},
            # Collecting a tax ID on an existing customer means Checkout
            # may write the business name and address back to them.
            customer_update={"name": "auto", "address": "auto"},
            subscription_data={"metadata": {"account_id": account.id}},
            metadata={"account_id": account.id, "plan": plan, "interval": interval},
        )
    except Exception as exc:  # noqa: BLE001 — any Stripe error
        logger.exception("Stripe Checkout failed for account %s", account.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Stripe couldn't open the checkout. Please try again in a moment.",
        ) from exc
    return session["url"]


def create_portal(db: Session, *, account: Account) -> str:
    _require_billing()
    if not account.stripe_customer_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "There's no subscription to manage yet.")
    try:
        portal = _stripe().billing_portal.Session.create(
            customer=account.stripe_customer_id,
            return_url=f"{settings.frontend_url}/settings/billing",
        )
    except Exception as exc:  # noqa: BLE001 — any Stripe error
        logger.exception("Stripe portal failed for account %s", account.id)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Stripe couldn't open the billing page. Please try again in a moment.",
        ) from exc
    return portal["url"]


def _account_for(db: Session, *, customer: str | None, account_id: str | None) -> Account | None:
    if account_id:
        acct = db.get(Account, account_id)
        if acct:
            return acct
    if customer:
        return db.scalar(select(Account).where(Account.stripe_customer_id == customer))
    return None


def apply_subscription(db: Session, sub: dict) -> Account | None:
    """Mirror a Stripe subscription object onto its account."""
    account = _account_for(
        db,
        customer=sub.get("customer"),
        account_id=(sub.get("metadata") or {}).get("account_id"),
    )
    if account is None:
        logger.warning("Stripe subscription %s has no matching account", sub.get("id"))
        return None
    items = (sub.get("items") or {}).get("data") or []
    price = items[0]["price"] if items else {}
    matched = plan_for_price(price.get("id"))
    plan, interval = matched if matched else (None, None)
    status_ = sub.get("status")
    account.stripe_subscription_id = sub.get("id")
    account.subscription_status = status_
    if not account.stripe_customer_id and sub.get("customer"):
        account.stripe_customer_id = sub["customer"]
    if price.get("currency"):
        account.billing_currency = price["currency"]
    if interval:
        account.billing_interval = interval
    period_end = sub.get("current_period_end") or (items[0].get("current_period_end") if items else None)
    account.current_period_end = (
        datetime.fromtimestamp(period_end, tz=timezone.utc) if period_end else None
    )
    if status_ in _LIVE_STATUSES and plan:
        account.plan = plan
    elif status_ in ("canceled", "unpaid", "incomplete_expired"):
        # A beta seat is never taken away by a lapsed card.
        if account.plan != "beta":
            account.plan = "cancelled"
    db.commit()
    return account


def handle_event(db: Session, event: dict) -> None:
    kind = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}
    if kind == "checkout.session.completed" and obj.get("subscription"):
        sub = _stripe().Subscription.retrieve(obj["subscription"])
        sub = dict(sub)
        sub.setdefault("metadata", {})
        sub["metadata"] = {**(sub.get("metadata") or {}), "account_id": obj.get("client_reference_id")}
        apply_subscription(db, sub)
    elif kind in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        apply_subscription(db, obj)
    else:
        logger.info("Stripe event %s ignored", kind)


def parse_webhook(payload: bytes, signature: str | None) -> dict:
    if not settings.stripe_webhook_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook secret not configured.")
    try:
        event = _stripe().Webhook.construct_event(
            payload, signature or "", settings.stripe_webhook_secret
        )
    except Exception as exc:  # noqa: BLE001 — bad signature or payload
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid Stripe signature.") from exc
    return event if isinstance(event, dict) else event.to_dict()

"""
Referral API.

Two audiences: a photographer looking at their own link and its numbers,
and the operator looking at the whole funnel and the free-seat pool.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_account, require_admin
from app.config import settings
from app.db import get_db
from app.models import Account
from app.services import referral_service

router = APIRouter()

# Admin routes live on their own router so the whole group carries the same
# gate, rather than each endpoint remembering to ask.
admin_router = APIRouter(dependencies=[Depends(require_admin)])


class MyReferralOut(BaseModel):
    """What a photographer sees about their own link."""
    code: str
    url: str
    clicks: int
    signups: int
    converted: int
    # True when this account is a beta tester AND the pool still has room,
    # so their link currently hands out a free seat rather than bonus days.
    # The UI has to say which, or the photographer will promise the wrong
    # thing to a friend.
    grants_seat: bool
    seats_remaining: int
    # Free months earned from referrals who started paying, and how many
    # each one is worth. Both shown so the offer is legible before anyone
    # has earned anything.
    credit_months: int
    reward_months_each: int


@router.get("/me/referral", response_model=MyReferralOut)
def my_referral(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> MyReferralOut:
    """This account's share link, minting a code on first look."""
    code = referral_service.ensure_referral_code(db, account=account)
    stats = referral_service.referrer_stats(db, account=account)
    return MyReferralOut(
        code=code,
        url=f"{settings.frontend_url}/r/{code}",
        clicks=stats["clicks"],
        signups=stats["signups"],
        converted=stats["converted"],
        grants_seat=referral_service.claim_seat_for_referral(db, referrer=account),
        seats_remaining=referral_service.seats_remaining(db),
        credit_months=account.credit_months or 0,
        reward_months_each=referral_service.reward_months(),
    )


# --- Admin ------------------------------------------------------------------

class FunnelOut(BaseModel):
    clicks: int
    signups: int
    converted: int
    click_to_signup_pct: int
    signup_to_paid_pct: int


class SeatsOut(BaseModel):
    cap: int
    used: int
    remaining: int


class TopReferrerOut(BaseModel):
    account_id: str
    account_name: str
    code: str | None
    clicks: int
    signups: int
    converted: int


class InviteCodeOut(BaseModel):
    id: str
    code: str
    label: str | None
    max_uses: int
    used_count: int
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChainNodeOut(BaseModel):
    """One account in the invite tree. Flat with a parent pointer; the
    frontend nests it."""
    account_id: str
    name: str
    plan: str
    parent_id: str | None
    joined_at: datetime | None


class OutstandingRewardOut(BaseModel):
    referral_id: str
    referrer_account_id: str
    referrer_name: str
    months: int
    converted_at: datetime | None


class ReferralOverviewOut(BaseModel):
    funnel: FunnelOut
    seats: SeatsOut
    top_referrers: list[TopReferrerOut]
    invite_codes: list[InviteCodeOut]
    chain: list[ChainNodeOut]
    outstanding_rewards: list[OutstandingRewardOut]
    reward_months_each: int


@admin_router.get("/referrals", response_model=ReferralOverviewOut)
def referral_overview(
    db: Session = Depends(get_db),
) -> ReferralOverviewOut:
    """Everything about referrals and the free-seat pool on one screen."""
    from sqlalchemy import select

    from app.models import InviteCode

    codes = list(
        db.scalars(
            select(InviteCode).order_by(InviteCode.created_at.desc())
        ).all()
    )
    return ReferralOverviewOut(
        funnel=FunnelOut(**referral_service.funnel(db)),
        seats=SeatsOut(
            cap=referral_service.seat_cap(db),
            used=referral_service.seats_used(db),
            remaining=referral_service.seats_remaining(db),
        ),
        top_referrers=[
            TopReferrerOut(**r) for r in referral_service.top_referrers(db)
        ],
        invite_codes=[InviteCodeOut.model_validate(c) for c in codes],
        chain=[ChainNodeOut(**n) for n in referral_service.invite_chain(db)],
        outstanding_rewards=[
            OutstandingRewardOut(**r)
            for r in referral_service.outstanding_rewards(db)
        ],
        reward_months_each=referral_service.reward_months(),
    )


class CreateInviteRequest(BaseModel):
    label: str | None = Field(default=None, max_length=120)
    max_uses: int = Field(default=1, ge=1, le=500)
    expires_at: datetime | None = None


@admin_router.post(
    "/invite-codes",
    response_model=InviteCodeOut,
    status_code=status.HTTP_201_CREATED,
)
def create_invite(
    payload: CreateInviteRequest,
    db: Session = Depends(get_db),
) -> InviteCodeOut:
    """Mint a code. It can only ever hand out seats the global pool still
    has, so `max_uses` is a ceiling rather than a promise."""
    invite = referral_service.create_invite_code(
        db,
        label=payload.label,
        max_uses=payload.max_uses,
        expires_at=payload.expires_at,
    )
    return InviteCodeOut.model_validate(invite)


@admin_router.post("/referrals/{referral_id}/settle-reward")
def settle_reward(referral_id: str, db: Session = Depends(get_db)) -> dict:
    """Mark a reward as applied to a bill and take it off the balance.

    Manual until billing can do it itself. Recording it here is what stops
    the same free month being given twice by two people looking at the same
    list a week apart.
    """
    row = referral_service.settle_reward(db, referral_id=referral_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Referral not found.")
    return {
        "referral_id": row.id,
        "settled_at": row.reward_settled_at,
    }


@admin_router.post("/invite-codes/{invite_id}/revoke", response_model=InviteCodeOut)
def revoke_invite(
    invite_id: str,
    db: Session = Depends(get_db),
) -> InviteCodeOut:
    """Stop a code working. Seats already claimed through it stay claimed:
    revoking is not a way to evict people."""
    from datetime import timezone

    from app.models import InviteCode

    invite = db.get(InviteCode, invite_id)
    if invite is None:
        raise HTTPException(status_code=404, detail="Code not found.")
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(invite)
    return InviteCodeOut.model_validate(invite)

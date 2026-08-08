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
    # Quoted in the UI so the pitch is accurate without hardcoding it there.
    bonus_days: int


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
        bonus_days=referral_service.REFERRAL_BONUS_DAYS,
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


class ReferralOverviewOut(BaseModel):
    funnel: FunnelOut
    seats: SeatsOut
    top_referrers: list[TopReferrerOut]
    invite_codes: list[InviteCodeOut]


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

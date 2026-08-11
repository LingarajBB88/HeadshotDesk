"""
Referrals and free beta seats.

Two connected ideas:

1. Every account gets a share link. Clicking it records a row before any
   signup happens, so "shared but ignored" is visible rather than invisible.
2. Free beta seats come out of one capped pool. Invite codes draw from it;
   when the pool is empty a code politely does nothing and the person gets
   the normal trial. Nobody is turned away because a number ran out.

Attribution is deliberately modest: one first-party cookie, an IP hash for
spotting someone clicking their own link, no third-party anything.
"""
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.models import Account, InviteCode, Referral

logger = logging.getLogger(__name__)

# Cookie carrying the referral between the click and the signup, which are
# usually different sessions ("I'll do it tonight"). 30 days is long enough
# to cover that without claiming credit for a decision made months later.
REFERRAL_COOKIE = "hd_ref"
REFERRAL_COOKIE_DAYS = 30

# Trial length. Everyone gets the same one.
#
# There used to be a bonus for arriving through a referral link, which made
# the offer two-sided and hard to state: the joiner's trial was longer, the
# referrer's wasn't, and "14 extra days" sat next to "1 free month" in a way
# nobody could hold in their head. One reward, on the side that matters:
# refer someone, they start paying, you get a free month.
TRIAL_DAYS = 31

# Codes are read aloud and typed by hand, so the alphabet drops the
# characters people confuse: 0/O, 1/I/l.
_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _random_code(length: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def _hash_ip(ip: str | None) -> str | None:
    """One-way hash. Enough to notice one machine clicking fifty times,
    useless for identifying anyone."""
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:32]


# --- Referral codes ---------------------------------------------------------

def ensure_referral_code(db: Session, *, account: Account) -> str:
    """This account's share code, minting one on first use.

    Lazy rather than at signup so existing accounts get a code the first
    time they look, with no backfill migration.
    """
    if account.referral_code:
        return account.referral_code
    for _ in range(5):
        candidate = _random_code()
        account.referral_code = candidate
        try:
            db.commit()
            return candidate
        except IntegrityError:
            db.rollback()
            db.refresh(account)
    # Five collisions against a 32^8 space means something else is wrong.
    raise RuntimeError("Could not allocate a referral code.")


def account_for_code(db: Session, *, code: str) -> Account | None:
    if not code:
        return None
    return db.scalar(
        select(Account).where(Account.referral_code == code.strip().upper())
    )


# --- Click tracking ---------------------------------------------------------

def record_click(
    db: Session,
    *,
    code: str,
    landing_path: str | None = None,
    referer: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
) -> Referral | None:
    """Log that someone opened a referral link. Returns None for an unknown
    code, so a mistyped link still lands on the site rather than erroring."""
    referrer = account_for_code(db, code=code)
    if referrer is None:
        return None
    row = Referral(
        id=new_id("ref"),
        referrer_account_id=referrer.id,
        code=referrer.referral_code or code,
        landing_path=landing_path,
        referer=referer,
        ip_hash=_hash_ip(ip),
        user_agent=(user_agent or "")[:500] or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def attach_signup(
    db: Session, *, code: str | None, account: Account
) -> Referral | None:
    """Credit a new account to whoever referred it.

    Reuses the most recent un-converted click from the same code when there
    is one, so the click and the signup are one row and the funnel doesn't
    double-count. Falls back to creating a row if the click was never
    recorded (cookie blocked, link shared as plain text).

    Self-referral is refused: it's the obvious way to farm a bonus.
    """
    if not code:
        return None
    referrer = account_for_code(db, code=code)
    if referrer is None or referrer.id == account.id:
        return None

    row = db.scalar(
        select(Referral)
        .where(
            Referral.referrer_account_id == referrer.id,
            Referral.referred_account_id.is_(None),
        )
        .order_by(Referral.clicked_at.desc())
        .limit(1)
    )
    if row is None:
        row = Referral(
            id=new_id("ref"),
            referrer_account_id=referrer.id,
            code=referrer.referral_code or code,
        )
        db.add(row)

    row.referred_account_id = account.id
    row.signed_up_at = _utcnow()
    db.commit()
    db.refresh(row)
    return row


def reward_months() -> int:
    """Free months a referrer earns per referral that starts paying."""
    from app.config import settings

    return max(int(getattr(settings, "referral_reward_months", 0) or 0), 0)


def mark_converted(db: Session, *, account: Account) -> None:
    """Called when a referred account first pays.

    Credits the referrer with free months and banks them on the account.
    Idempotent: converting twice can't pay twice, which matters because the
    obvious future caller is a Stripe webhook and webhooks get retried.

    The reward is written onto the referral row as well as the balance, so
    changing the rate later never rewrites what someone was already
    promised, and the admin view can show what's owed but not yet applied.
    """
    row = db.scalar(
        select(Referral).where(Referral.referred_account_id == account.id)
    )
    if row is None or row.converted_at is not None:
        return
    row.converted_at = _utcnow()

    months = reward_months()
    if months > 0:
        referrer = db.get(Account, row.referrer_account_id)
        if referrer is not None:
            row.reward_months = months
            referrer.credit_months = (referrer.credit_months or 0) + months
    db.commit()


def settle_reward(db: Session, *, referral_id: str) -> Referral | None:
    """Mark a reward as applied to a bill, and take it off the balance.

    Manual until billing can do it: the point is that the admin view stops
    showing it as outstanding, and the balance reflects what's still owed.
    """
    row = db.get(Referral, referral_id)
    if row is None or row.reward_settled_at is not None or not row.reward_months:
        return row
    row.reward_settled_at = _utcnow()
    referrer = db.get(Account, row.referrer_account_id)
    if referrer is not None:
        referrer.credit_months = max(
            (referrer.credit_months or 0) - row.reward_months, 0
        )
    db.commit()
    db.refresh(row)
    return row


def outstanding_rewards(db: Session) -> list[dict]:
    """Rewards earned but not yet applied to a bill."""
    rows = db.execute(
        select(Referral, Account)
        .join(Account, Account.id == Referral.referrer_account_id)
        .where(
            Referral.reward_months > 0,
            Referral.reward_settled_at.is_(None),
        )
        .order_by(Referral.converted_at.asc())
    ).all()
    return [
        {
            "referral_id": r.id,
            "referrer_account_id": a.id,
            "referrer_name": a.name,
            "months": r.reward_months,
            "converted_at": r.converted_at,
        }
        for r, a in rows
    ]


# --- Free beta seats --------------------------------------------------------

def seats_used(db: Session) -> int:
    """Free seats currently occupied."""
    return int(
        db.scalar(
            select(func.count()).select_from(Account).where(Account.plan == "beta")
        )
        or 0
    )


def seat_cap(db: Session) -> int:
    """How many free seats exist in total.

    Read from settings so it can be raised without a deploy, and clamped at
    zero: a negative cap would read as unlimited.
    """
    from app.config import settings

    return max(int(getattr(settings, "free_seat_cap", 0) or 0), 0)


def seats_remaining(db: Session) -> int:
    return max(seat_cap(db) - seats_used(db), 0)


def claim_seat_for_referral(db: Session, *, referrer: Account) -> bool:
    """Should a person referred by `referrer` get a free beta seat?

    Only beta testers pass their seat along. That's the deal during beta:
    you're in for free, and so is whoever you vouch for. A trial user's link
    still works, it just grants the bonus days instead, so nobody can give
    away seats that were meant for testers.

    Returns False when the pool is empty, which is not a failure: the caller
    falls back to the bonus trial and the person still gets an account.
    """
    if referrer.plan != "beta":
        return False
    return seats_remaining(db) > 0


def redeem_invite_code(db: Session, *, code: str | None) -> InviteCode | None:
    """Claim a free seat, or return None and let the caller fall back to the
    normal trial.

    Every failure path is quiet on purpose. Someone who typed a valid code
    the day after the pool emptied should get an account, not an error page.
    """
    if not code:
        return None
    normalized = code.strip().upper()
    invite = db.scalar(select(InviteCode).where(InviteCode.code == normalized))
    if invite is None:
        return None
    now = _utcnow()
    if invite.revoked_at is not None:
        return None
    if invite.expires_at is not None and invite.expires_at <= now:
        return None
    if invite.used_count >= invite.max_uses:
        return None
    if seats_remaining(db) <= 0:
        logger.info("Invite %s valid but the free seat pool is empty", normalized)
        return None

    invite.used_count += 1
    db.commit()
    db.refresh(invite)
    return invite


def create_invite_code(
    db: Session,
    *,
    label: str | None = None,
    max_uses: int = 1,
    expires_at: datetime | None = None,
) -> InviteCode:
    for _ in range(5):
        invite = InviteCode(
            id=new_id("inv"),
            code=_random_code(6),
            label=label,
            max_uses=max(int(max_uses), 1),
            expires_at=expires_at,
        )
        db.add(invite)
        try:
            db.commit()
            db.refresh(invite)
            return invite
        except IntegrityError:
            db.rollback()
    raise RuntimeError("Could not allocate an invite code.")


# --- Trial length -----------------------------------------------------------

def trial_end_for(*, invited: bool) -> datetime | None:
    """When a new account's trial should end.

    None for a free beta seat: it doesn't expire, which is the whole point
    of the seat. Everyone else gets the same trial whether or not they
    arrived through someone's link.
    """
    if invited:
        return None
    return _utcnow() + timedelta(days=TRIAL_DAYS)


# --- Reporting --------------------------------------------------------------

def referrer_stats(db: Session, *, account: Account) -> dict:
    """What one photographer sees about their own link."""
    rows = list(
        db.scalars(
            select(Referral).where(Referral.referrer_account_id == account.id)
        ).all()
    )
    return {
        "code": account.referral_code,
        "clicks": len(rows),
        "signups": sum(1 for r in rows if r.referred_account_id),
        "converted": sum(1 for r in rows if r.converted_at),
    }


def funnel(db: Session) -> dict:
    """Whole-product referral numbers for the admin overview."""
    rows = list(db.scalars(select(Referral)).all())
    signups = sum(1 for r in rows if r.referred_account_id)
    converted = sum(1 for r in rows if r.converted_at)
    return {
        "clicks": len(rows),
        "signups": signups,
        "converted": converted,
        # Rounded to whole percent: the sample is small enough that decimals
        # would imply precision that isn't there.
        "click_to_signup_pct": round(signups / len(rows) * 100) if rows else 0,
        "signup_to_paid_pct": round(converted / signups * 100) if signups else 0,
    }


def invite_chain(db: Session) -> list[dict]:
    """Who invited whom, as a flat list of nodes with parent pointers.

    Flat rather than nested: the frontend renders the tree, and a flat list
    survives the case that always eventually happens, a cycle or an orphan,
    without recursing forever.

    Only accounts that actually signed up appear. A click that went nowhere
    belongs in the funnel numbers, not in a family tree.
    """
    rows = db.execute(
        select(Referral, Account)
        .join(Account, Account.id == Referral.referred_account_id)
        .order_by(Referral.signed_up_at.asc())
    ).all()

    # Everyone who has referred someone, so roots can be named too.
    referrer_ids = {r.referrer_account_id for r, _ in rows}
    referrers = {
        a.id: a
        for a in db.scalars(
            select(Account).where(Account.id.in_(referrer_ids))
        ).all()
    } if referrer_ids else {}

    nodes: dict[str, dict] = {}
    for account_id, account in referrers.items():
        nodes[account_id] = {
            "account_id": account_id,
            "name": account.name,
            "plan": account.plan,
            "parent_id": None,
            "joined_at": account.created_at,
        }
    for referral, referred in rows:
        nodes[referred.id] = {
            "account_id": referred.id,
            "name": referred.name,
            "plan": referred.plan,
            "parent_id": referral.referrer_account_id,
            "joined_at": referral.signed_up_at or referred.created_at,
        }
    return list(nodes.values())


def top_referrers(db: Session, *, limit: int = 20) -> list[dict]:
    """Who's actually bringing people in, best first."""
    rows = db.execute(
        select(
            Account.id,
            Account.name,
            Account.referral_code,
            func.count(Referral.id).label("clicks"),
            func.count(Referral.referred_account_id).label("signups"),
            func.count(Referral.converted_at).label("converted"),
        )
        .join(Referral, Referral.referrer_account_id == Account.id)
        .group_by(Account.id, Account.name, Account.referral_code)
        .order_by(
            func.count(Referral.referred_account_id).desc(),
            func.count(Referral.id).desc(),
        )
        .limit(limit)
    ).all()
    return [
        {
            "account_id": r.id,
            "account_name": r.name,
            "code": r.referral_code,
            "clicks": r.clicks,
            "signups": r.signups,
            "converted": r.converted,
        }
        for r in rows
    ]

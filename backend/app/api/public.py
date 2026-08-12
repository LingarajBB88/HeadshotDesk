"""
Public API — no auth required. Used by participants signing up via the
shareable signup link `/s/{slug}`, and by the landing page's feature
request form.
"""
import io
import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.db import get_db
from app.models import FeatureRequest
from app.schemas.participant import (
    ParticipantOut,
    PublicJobOut,
    PublicParticipantSignup,
    PublicSignupResult,
)
from app.schemas.slots import PublicBookSlotRequest, SlotListOut, SlotOut
from app.schemas.types import StrictEmail
from app.services import (
    email_service,
    notify_service,
    participant_service,
    slot_service,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class FeatureRequestCreate(BaseModel):
    """Body for the public feature-request form on the landing page."""
    message: str = Field(min_length=10, max_length=2000)
    email: StrictEmail | None = None


# Flood guard for the public form. In-memory sliding window per client IP:
# fine for a single instance (current deployment); swap for a Redis-backed
# limiter if we ever scale out. Not a security boundary, an abuse damper:
# the goal is keeping a bot from filling the table and the team inbox.
_FR_WINDOW_SECONDS = 3600
_FR_MAX_PER_WINDOW = 5
_fr_hits: dict[str, list[float]] = defaultdict(list)


def _client_ip(request: Request) -> str:
    """Client IP behind Render's proxy: first hop of X-Forwarded-For, falling
    back to the socket address."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _feature_request_rate_ok(ip: str) -> bool:
    now = time.monotonic()
    hits = _fr_hits[ip]
    # Drop entries outside the window; also keeps the dict from growing
    # unboundedly for active IPs.
    hits[:] = [t for t in hits if now - t < _FR_WINDOW_SECONDS]
    if len(hits) >= _FR_MAX_PER_WINDOW:
        return False
    hits.append(now)
    return True


@router.post("/feature-requests", status_code=status.HTTP_204_NO_CONTENT)
def submit_feature_request(
    payload: FeatureRequestCreate,
    request: Request,
    db: Session = Depends(get_db),
) -> None:
    """Store a feature request and forward it to the team inbox. The email
    forward is best-effort: a mail hiccup must not lose the stored request
    or fail the submission."""
    if not _feature_request_rate_ok(_client_ip(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Try again in a while.",
        )
    fr = FeatureRequest(
        id=new_id("freq"),
        message=payload.message.strip(),
        email=payload.email,
    )
    db.add(fr)
    db.commit()
    try:
        email_service.send_feature_request_email(
            message=fr.message, reply_email=fr.email
        )
    except Exception:  # noqa: BLE001 — stored is what matters
        logger.exception("Feature request email forward failed (id=%s)", fr.id)


@router.get("/jobs/{slug}", response_model=PublicJobOut)
def get_job_for_signup(slug: str, db: Session = Depends(get_db)) -> PublicJobOut:
    """Slim view for the signup-form header (job name, date, location)."""
    job = participant_service.get_job_by_slug(db, slug=slug)
    return PublicJobOut(
        studio=_studio_block(db, job),
        name=job.name,
        client_name=job.client_name,
        shoot_date=job.shoot_date,
        shoot_dates=job.all_shoot_dates,
        location=job.location,
        shoot_mode=job.shoot_mode,
        branding=None,  # Account-level branding wired up in v0.2
        client_logo_url=_client_logo_url_for_job(db, job),
    )


@router.post(
    "/jobs/{slug}/signup",
    response_model=PublicSignupResult,
    status_code=status.HTTP_201_CREATED,
)
def signup(
    slug: str,
    payload: PublicParticipantSignup,
    db: Session = Depends(get_db),
) -> PublicSignupResult:
    # Compliance: explicit consent is required to process the participant's
    # data. The frontend blocks submission client-side; this is the server
    # backstop so a raw API call can't skip it.
    if not payload.consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must accept the privacy terms to sign up.",
        )
    p, created = participant_service.public_signup(
        db,
        slug=slug,
        name=payload.name,
        email=payload.email,
        title=payload.title,
    )
    # Only on a genuinely new signup. Re-submitting the form (same email)
    # is idempotent, and mailing again would look like a duplicate booking.
    if created:
        job = participant_service.get_job_by_slug(db, slug=slug)
        notify_service.participant_signed_up(db, job=job, participant=p)
    return PublicSignupResult(
        participant=ParticipantOut.model_validate(p),
        created=created,
    )


# --- HSD-55: time-slot booking ---------------------------------------------

@router.get("/jobs/{slug}/slots", response_model=SlotListOut)
def list_slots_for_signup(slug: str, db: Session = Depends(get_db)) -> SlotListOut:
    """All slots for a time-slot job with availability. Empty for queue mode."""
    job = participant_service.get_job_by_slug(db, slug=slug)
    return SlotListOut(
        slots=[SlotOut(**s) for s in slot_service.list_slots(db, job=job)]
    )


@router.post("/jobs/{slug}/book-slot", response_model=SlotOut)
def book_slot_public(
    slug: str,
    payload: PublicBookSlotRequest,
    db: Session = Depends(get_db),
) -> SlotOut:
    """Book (or rebook) a slot right after signup. The gallery token from the
    signup response proves the caller is that participant. 409 when the slot
    was just taken; the UI refreshes availability and asks again."""
    job = participant_service.get_job_by_slug(db, slug=slug)
    booking = slot_service.book_slot(
        db,
        job=job,
        gallery_token=payload.gallery_token,
        slot_start=payload.slot_start,
    )
    # The confirmation is the participant's only record of when to turn up.
    # notify_service swallows mail failures: the booking is already
    # committed and losing it over a Postmark blip would be far worse.
    notify_service.slot_confirmed(db, job=job, booking=booking)
    return SlotOut(start=booking.slot_start, end=booking.slot_end, available=False)


def _studio_block(db: Session, job) -> dict | None:  # type: ignore[no-untyped-def]
    """The photographer's public contact details for this job's account.

    Returns None when nothing has been filled in, so the frontend can skip
    the whole section rather than render an empty card.
    """
    from app.models import Account
    from app.schemas.studio import PublicStudioOut

    account = db.get(Account, job.account_id)
    if account is None:
        return None
    block = PublicStudioOut(
        name=account.name,
        website_url=account.website_url,
        contact_email=account.contact_email,
        contact_phone=account.contact_phone,
        links=account.links or [],
    ).model_dump()
    has_detail = any(
        [block["website_url"], block["contact_email"], block["contact_phone"], block["links"]]
    )
    return block if has_detail else None


# --- Referral links ---------------------------------------------------------

@router.get("/r/{code}", include_in_schema=False)
def follow_referral(code: str, request: Request, db: Session = Depends(get_db)):
    """Land a referral click, then send the person to the signup page.

    The click is recorded before the redirect, so a link that gets shared
    and ignored still shows up in the numbers. An unknown code redirects
    anyway rather than erroring: a mistyped link should still reach the
    site, it just won't be credited to anyone.
    """
    from fastapi.responses import RedirectResponse

    from app.config import settings
    from app.services import referral_service

    hit = referral_service.record_click(
        db,
        code=code,
        landing_path=str(request.url.path),
        referer=request.headers.get("referer"),
        ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    response = RedirectResponse(
        url=f"{settings.frontend_url}/signup?ref={code}", status_code=302
    )
    if hit is not None:
        # First-party, and only this. The click and the signup are usually
        # different sessions ("I'll do it tonight"), which is the whole
        # reason a cookie is involved at all.
        response.set_cookie(
            key=referral_service.REFERRAL_COOKIE,
            value=hit.code,
            max_age=referral_service.REFERRAL_COOKIE_DAYS * 24 * 3600,
            httponly=True,
            samesite="lax",
            secure=settings.env == "production",
        )
    return response


# --- Walk-up queue position -------------------------------------------------

class QueueStatusOut(BaseModel):
    """What a walk-up participant sees while they wait. Counts and their own
    name only: nothing about anyone else in the line."""
    name: str
    job_name: str
    status: str  # waiting | next | photographed | missed
    position: int | None
    people_ahead: int
    estimated_wait_minutes: int | None
    estimated_time: str | None
    # False while the estimate is still the conservative default, so the UI
    # can hedge its wording instead of implying a precision it doesn't have.
    pace_measured: bool
    queue_length: int


@router.get("/queue/{gallery_token}", response_model=QueueStatusOut)
def queue_status(gallery_token: str, db: Session = Depends(get_db)) -> QueueStatusOut:
    """Live position in a walk-up queue, polled by the participant's phone."""
    from app.services import queue_service

    return QueueStatusOut(**queue_service.queue_status(db, gallery_token=gallery_token))


# --- Signup QR code ---------------------------------------------------------

@router.get("/jobs/{slug}/qr.svg")
def signup_qr(slug: str, db: Session = Depends(get_db)):
    """QR code for the job's signup link, so the photographer can print a card
    and stand it next to the booth. Public because the thing it encodes is
    already a public URL, and because an <img src> can't carry an auth header.

    SVG rather than PNG: it prints crisply at any size, which matters when the
    same code goes on an A5 table card and an A4 poster.
    """
    from fastapi.responses import Response as FastAPIResponse

    from app.config import settings

    # 404 on unknown or archived jobs, same as the signup page itself.
    # Resolved before the QR library is touched so a missing dependency can
    # never turn a not-found into a 500.
    job = participant_service.get_job_by_slug(db, slug=slug)
    url = f"{settings.frontend_url}/s/{job.public_slug}"

    import segno

    buf = io.BytesIO()
    # Error correction "M" survives a coffee ring and a bit of glare without
    # bloating the code into something unreadable across a room.
    segno.make(url, error="m").save(buf, kind="svg", scale=10, border=2, xmldecl=False)
    return FastAPIResponse(
        content=buf.getvalue(),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


# --- HSD-36: client logo (public brand asset) --------------------------------

def _client_logo_url_for_job(db: Session, job) -> str | None:  # type: ignore[no-untyped-def]
    """Logo URL for a job's linked client, or None."""
    if not job.client_id:
        return None
    from app.models import Client
    from app.services import client_service

    client = db.get(Client, job.client_id)
    return client_service.logo_url(client) if client else None


@router.get("/client-logo/{client_id}")
def client_logo(client_id: str, db: Session = Depends(get_db)):
    """Serve a client's logo. Unauthenticated by design: logos appear on
    public signup pages, galleries, and inside emails. The client id is an
    unguessable ULID and the response is just a brand image."""
    import io as _io

    from fastapi.responses import StreamingResponse

    from app.services import client_service

    content, mime = client_service.read_logo(db, client_id=client_id)
    return StreamingResponse(
        _io.BytesIO(content),
        media_type=mime,
        # Logos change rarely; an hour of caching keeps emails + galleries
        # snappy without making logo swaps invisible for long.
        headers={"Cache-Control": "public, max-age=3600"},
    )


# --- HSD-67: client dashboard (photographer's client, token-only) -----------

class ClientParticipantOut(BaseModel):
    """One row for the client. Deliberately minimal: names only, no emails
    or gallery links — the client sees progress, not personal data."""
    name: str
    status: str  # signed_up | photographed | delivered
    slot_time: str | None  # "13:00" when a slot is booked


class ClientDashboardOut(BaseModel):
    job_name: str
    studio_name: str
    shoot_date: str | None
    location: str | None
    job_status: str
    participants_total: int
    photographed: int
    delivered: int
    no_shows: int
    photos_uploaded: int
    shoot_mode: str
    slots_total: int | None
    slots_booked: int | None
    participants: list[ClientParticipantOut]


@router.get("/client/{token}", response_model=ClientDashboardOut)
def client_dashboard(token: str, db: Session = Depends(get_db)) -> ClientDashboardOut:
    """Live shoot-progress view for the photographer's client (HR contact,
    event coordinator). Token-only, revocable from the job page. Read-only
    aggregate data; no participant emails or gallery links leak here."""
    from sqlalchemy import func as sa_func, select as sa_select

    from app.models import Account, File, Job, Participant

    job = db.scalar(sa_select(Job).where(Job.client_token == token))
    if job is None or not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard not found."
        )
    account = db.get(Account, job.account_id)

    participants = list(
        db.scalars(
            sa_select(Participant)
            .where(Participant.job_id == job.id)
            .order_by(Participant.created_at.asc())
        ).all()
    )
    # Ordering: on time-slot jobs the client is watching a running order,
    # so sort by booked time (unbooked last, then by name). Queue jobs keep
    # signup order. Applied after slot lookup below.
    photos = db.scalar(
        sa_select(sa_func.count())
        .select_from(File)
        .where(
            File.job_id == job.id,
            File.deleted_at.is_(None),
            File.variant == "original",
        )
    ) or 0

    slots_total: int | None = None
    slots_booked: int | None = None
    slot_by_participant: dict[str, str] = {}
    if job.shoot_mode == "time_slot":
        slots = slot_service.list_slots(db, job=job)
        slots_total = len(slots)
        slots_booked = sum(1 for s in slots if not s["available"])
        for e in slot_service.job_schedule(db, job=job):
            slot_by_participant[e["participant_id"]] = e[
                "slot_start"
            ].strftime("%H:%M")

    if job.shoot_mode == "time_slot":
        participants.sort(
            key=lambda p: (
                slot_by_participant.get(p.id) is None,  # unbooked last
                slot_by_participant.get(p.id) or "",
                p.name.lower(),
            )
        )

    def p_status(p: Participant) -> str:
        if p.gallery_sent_at is not None:
            return "delivered"
        if p.shot_at is not None:
            return "photographed"
        # The client asks about no-shows more than anything else, so it's a
        # first-class state here rather than an absence.
        if p.no_show_at is not None:
            return "no_show"
        return "signed_up"

    return ClientDashboardOut(
        job_name=job.name,
        studio_name=account.name if account else "HeadshotDesk",
        shoot_date=job.shoot_date.isoformat() if job.shoot_date else None,
        location=job.location,
        job_status=job.status,
        participants_total=len(participants),
        photographed=sum(1 for p in participants if p.shot_at is not None),
        delivered=sum(1 for p in participants if p.gallery_sent_at is not None),
        no_shows=sum(
            1
            for p in participants
            if p.no_show_at is not None and p.shot_at is None
        ),
        photos_uploaded=int(photos),
        shoot_mode=job.shoot_mode,
        slots_total=slots_total,
        slots_booked=slots_booked,
        participants=[
            ClientParticipantOut(
                name=p.name,
                status=p_status(p),
                slot_time=slot_by_participant.get(p.id),
            )
            for p in participants
        ],
    )

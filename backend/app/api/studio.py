"""
Studio profile API: the photographer's contact details, and the public
profile page at /p/{handle}.

Account-scoped, one row per account, so there's no id in the path.
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_account
from app.db import get_db
from app.models import Account
from app.schemas.studio import (
    PortfolioImage,
    StudioProfileIn,
    StudioProfileOut,
)
from app.services import profile_service

router = APIRouter()


def _serialise(account: Account) -> StudioProfileOut:
    """Build the response field by field.

    Not `model_validate(account)`: the stored portfolio rows carry storage
    keys and content types, not the public URL the schema wants, so
    validating the ORM object straight through fails the moment an account
    actually has an image. Listing the fields also means a private column
    added to Account later can't quietly appear in this payload.
    """
    return StudioProfileOut(
        name=account.name,
        website_url=account.website_url,
        contact_email=account.contact_email,
        contact_phone=account.contact_phone,
        links=account.links or [],
        handle=account.handle,
        tagline=account.tagline,
        about=account.about,
        city=account.city,
        country=account.country,
        profile_published=account.profile_published,
        portrait_url=profile_service.portrait_url(account),
        portfolio=[
            PortfolioImage(
                id=image["id"],
                url=profile_service.portfolio_image_url(account, image["id"]),
                caption=image.get("caption"),
            )
            for image in (account.portfolio or [])
        ],
        profile_url=profile_service.profile_url(account),
    )


@router.get("/studio", response_model=StudioProfileOut)
def get_studio(
    account: Account = Depends(get_current_account),
) -> StudioProfileOut:
    return _serialise(account)


@router.get("/studio/handle-suggestion")
def handle_suggestion(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """A free handle derived from the studio name.

    The editor prefills with this so the field is never blank. A blank slug
    field is where the intention to publish quietly dies.
    """
    if account.handle:
        return {"handle": account.handle}
    return {"handle": profile_service.suggest_handle(db, name=account.name)}


@router.patch("/studio", response_model=StudioProfileOut)
def update_studio(
    payload: StudioProfileIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    """Sparse update: only the keys sent are touched.

    Sending null clears a field, which is how the UI removes a phone number
    it no longer wants published.
    """
    fields = payload.model_dump(exclude_unset=True)

    # Handle first: it can 409, and failing before anything else is written
    # means a taken handle doesn't half-save the rest of the form.
    if "handle" in fields:
        if fields["handle"] is None:
            # Clearing the address takes the page down with it, otherwise
            # the profile becomes unreachable but still marked published.
            account.handle = None
            account.profile_published = False
        else:
            profile_service.set_handle(db, account=account, raw=fields["handle"])
        fields.pop("handle")

    if fields.get("profile_published") and not account.handle:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Choose a profile address before publishing.",
        )

    for key, value in fields.items():
        if key == "links" and value is not None:
            # Stored as plain dicts; the schema already validated the URLs.
            account.links = [
                {"label": link["label"], "url": link["url"]} for link in value
            ]
        elif key == "links":
            account.links = []
        elif key == "profile_published":
            account.profile_published = bool(value)
        else:
            account.__setattr__(key, value or None)

    db.commit()
    db.refresh(account)
    return _serialise(account)


# --- images ------------------------------------------------------------


@router.post("/studio/portrait", response_model=StudioProfileOut)
async def upload_portrait(
    file: UploadFile = File(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    content = await file.read()
    profile_service.set_portrait(
        db,
        account=account,
        content=content,
        content_type=file.content_type or "",
    )
    return _serialise(account)


@router.delete("/studio/portrait", response_model=StudioProfileOut)
def delete_portrait(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    profile_service.remove_portrait(db, account=account)
    return _serialise(account)


@router.post("/studio/portfolio", response_model=StudioProfileOut)
async def add_portfolio_image(
    file: UploadFile = File(...),
    caption: str | None = Form(default=None),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    content = await file.read()
    profile_service.add_portfolio_image(
        db,
        account=account,
        content=content,
        content_type=file.content_type or "",
        caption=caption,
    )
    return _serialise(account)


@router.delete("/studio/portfolio/{image_id}", response_model=StudioProfileOut)
def delete_portfolio_image(
    image_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    profile_service.remove_portfolio_image(db, account=account, image_id=image_id)
    return _serialise(account)


class PortfolioOrderIn(BaseModel):
    image_ids: list[str] = Field(max_length=50)


@router.patch("/studio/portfolio/order", response_model=StudioProfileOut)
def reorder_portfolio(
    payload: PortfolioOrderIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    profile_service.reorder_portfolio(
        db, account=account, image_ids=payload.image_ids
    )
    return _serialise(account)


class CaptionIn(BaseModel):
    caption: str | None = Field(default=None, max_length=120)


@router.patch("/studio/portfolio/{image_id}", response_model=StudioProfileOut)
def update_caption(
    image_id: str,
    payload: CaptionIn,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> StudioProfileOut:
    profile_service.set_caption(
        db, account=account, image_id=image_id, caption=payload.caption
    )
    return _serialise(account)

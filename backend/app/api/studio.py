"""
Studio profile API: the photographer's own contact details and links.

Account-scoped, one row per account, so there's no id in the path.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_account
from app.db import get_db
from app.models import Account
from app.schemas.studio import StudioProfileIn, StudioProfileOut

router = APIRouter()


@router.get("/studio", response_model=StudioProfileOut)
def get_studio(
    account: Account = Depends(get_current_account),
) -> StudioProfileOut:
    return StudioProfileOut.model_validate(account)


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
    for key, value in fields.items():
        if key == "links" and value is not None:
            # Stored as plain dicts; the schema already validated the URLs.
            account.links = [
                {"label": link["label"], "url": link["url"]} for link in value
            ]
        elif key == "links":
            account.links = []
        else:
            account.__setattr__(key, value or None)
    db.commit()
    db.refresh(account)
    return StudioProfileOut.model_validate(account)

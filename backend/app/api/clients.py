"""HSD-36 — Clients API. Account-scoped CRUD + logo upload."""
from datetime import datetime

from fastapi import APIRouter, Depends, File as FileParam, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_account
from app.db import get_db
from app.models import Account
from app.services import client_service

router = APIRouter()


class ClientOut(BaseModel):
    id: str
    name: str
    logo_url: str | None
    jobs_total: int
    created_at: datetime


class ClientList(BaseModel):
    items: list[ClientOut]


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ClientUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


def _out(db: Session, client) -> ClientOut:  # type: ignore[no-untyped-def]
    return ClientOut(
        id=client.id,
        name=client.name,
        logo_url=client_service.logo_url(client),
        jobs_total=client_service.job_count(db, client=client),
        created_at=client.created_at,
    )


@router.get("", response_model=ClientList)
def list_(
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ClientList:
    return ClientList(
        items=[_out(db, c) for c in client_service.list_clients(db, account=account)]
    )


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
def create(
    payload: ClientCreate,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ClientOut:
    client = client_service.create_client(db, account=account, name=payload.name)
    return _out(db, client)


@router.patch("/{client_id}", response_model=ClientOut)
def rename(
    client_id: str,
    payload: ClientUpdate,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ClientOut:
    client = client_service.rename_client(
        db, account=account, client_id=client_id, name=payload.name
    )
    return _out(db, client)


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(
    client_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> None:
    client_service.delete_client(db, account=account, client_id=client_id)


@router.post("/{client_id}/logo", response_model=ClientOut)
async def upload_logo(
    client_id: str,
    file: UploadFile = FileParam(...),
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ClientOut:
    content = await file.read()
    client = client_service.set_logo(
        db,
        account=account,
        client_id=client_id,
        content=content,
        content_type=file.content_type or "",
    )
    return _out(db, client)


@router.delete("/{client_id}/logo", response_model=ClientOut)
def remove_logo(
    client_id: str,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> ClientOut:
    client = client_service.remove_logo(db, account=account, client_id=client_id)
    return _out(db, client)

"""Participant lists arrive as CSV, Excel or Numbers — and often with times."""
import io
import secrets
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient


def _signup(client: TestClient) -> dict:
    payload = {
        "email": f"test_{secrets.token_hex(8)}@example.com",
        "password": "supersecret123",
        "name": "Test User",
        "account_name": f"Studio {secrets.token_hex(4)}",
    }
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _slot_job(client: TestClient, token: str) -> dict:
    r = client.post(
        "/api/v1/jobs",
        json={
            "name": "Import shoot",
            "shoot_date": (date.today() + timedelta(days=5)).isoformat(),
            "location": "HQ",
            "shoot_mode": "time_slot",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    job = r.json()
    r = client.patch(
        f"/api/v1/jobs/{job['id']}",
        json={
            "time_slot_config": {
                "start": "09:00",
                "end": "10:00",
                "slot_minutes": 10,
            }
        },
        headers=_auth(token),
    )
    assert r.status_code == 200, r.text
    return r.json()


def _upload(client: TestClient, token: str, job_id: str, filename: str, data: bytes):
    return client.post(
        f"/api/v1/jobs/{job_id}/participants/import",
        files={"file": (filename, data, "application/octet-stream")},
        headers=_auth(token),
    )


class TestSpreadsheetFormats:
    def test_xlsx_import(self, client: TestClient):
        openpyxl = pytest.importorskip("openpyxl")
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _slot_job(client, token)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["name", "email", "title"])
        ws.append(["Jane Doe", "jane@example.com", "CTO"])
        ws.append(["Bob Ross", "bob@example.com", ""])
        buf = io.BytesIO()
        wb.save(buf)

        r = _upload(client, token, job["id"], "team.xlsx", buf.getvalue())
        assert r.status_code == 200, r.text
        assert r.json()["created"] == 2

    def test_unsupported_format_explains_the_fix(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _slot_job(client, token)
        r = _upload(client, token, job["id"], "list.pages", b"not a spreadsheet")
        assert r.status_code == 400
        assert "CSV" in r.json()["detail"]


class TestTimeColumn:
    def test_times_book_slots(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _slot_job(client, token)

        csv_text = (
            "name,email,time\n"
            "Jane Doe,jane@example.com,09:00\n"
            "Bob Ross,bob@example.com,09:30\n"
            "No Time,none@example.com,\n"
        ).encode()
        r = _upload(client, token, job["id"], "team.csv", csv_text)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["created"] == 3
        assert body["slots_booked"] == 2

        entries = client.get(
            f"/api/v1/jobs/{job['id']}/schedule", headers=_auth(token)
        ).json()["entries"]
        assert [e["slot_start"][11:16] for e in entries] == ["09:00", "09:30"]

    def test_bad_and_taken_times_are_reported_per_row(self, client: TestClient):
        a = _signup(client)
        token = a["tokens"]["access_token"]
        job = _slot_job(client, token)

        csv_text = (
            "name,email,time\n"
            "First,first@example.com,09:00\n"
            "Clash,clash@example.com,09:00\n"   # same slot
            "Junk,junk@example.com,elevenish\n"  # unparseable
            "Offgrid,off@example.com,09:05\n"    # not on the grid
        ).encode()
        r = _upload(client, token, job["id"], "team.csv", csv_text)
        assert r.status_code == 200, r.text
        body = r.json()
        # Everyone is imported; only the bookings fail.
        assert body["created"] == 4
        assert body["slots_booked"] == 1
        assert len(body["errors"]) == 3
        assert any("elevenish" in e for e in body["errors"])

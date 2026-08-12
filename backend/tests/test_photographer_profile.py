"""
The public photographer profile at /p/{handle}.

Three things carry real risk and get most of the attention here.

1. The handle addresses a public URL, so uniqueness and the reserved list
   are correctness, not polish. A handle that collides with a route is a
   production-only routing bug.

2. Publishing is gated twice: the photographer has to opt in, and the
   account has to have confirmed its email. Both gates must 404 rather than
   403, so guessing handles reveals nothing about which accounts exist.

3. The public payload must never carry the login address. `contact_email`
   exists precisely so it doesn't.
"""
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _signup(client: TestClient) -> dict:
    return client.post(
        "/api/v1/auth/signup",
        json={
            "email": f"p{uuid.uuid4().hex[:8]}@example.com",
            "password": "correct horse battery staple",
            "name": "Pat Photographer",
            "account_name": f"Panther {uuid.uuid4().hex[:6]}",
        },
    ).json()


def _publish(client: TestClient, tok: str, handle: str) -> dict:
    r = client.patch(
        "/api/v1/studio",
        json={"handle": handle, "profile_published": True},
        headers=_auth(tok),
    )
    assert r.status_code == 200, r.text
    return r.json()


def _handle() -> str:
    return f"studio-{uuid.uuid4().hex[:8]}"


class TestHandles:
    def test_valid_handle_saves_and_lowercases(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        r = client.patch(
            "/api/v1/studio",
            json={"handle": "Panther-Studios-NL"},
            headers=_auth(tok),
        )
        assert r.status_code == 200, r.text
        assert r.json()["handle"] == "panther-studios-nl"

    def test_a_pasted_url_is_reduced_to_the_handle(self, client: TestClient):
        """Asked for the last part of a URL, people paste the whole URL."""
        a = _signup(client)
        h = _handle()
        r = client.patch(
            "/api/v1/studio",
            json={"handle": f"https://headshotdesk.com/p/{h}"},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.json()["handle"] == h

    @pytest.mark.parametrize(
        "bad",
        [
            "ab",  # too short
            "-leading",
            "trailing-",
            "double--hyphen",
            "Spaces Here",
            "unicode✨",
            "under_score",
        ],
    )
    def test_malformed_handles_rejected(self, client: TestClient, bad: str):
        a = _signup(client)
        r = client.patch(
            "/api/v1/studio",
            json={"handle": bad},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422, f"{bad!r} was accepted"

    @pytest.mark.parametrize("word", ["admin", "api", "settings", "login", "p"])
    def test_reserved_handles_rejected(self, client: TestClient, word: str):
        """A handle shadowing a real route is a bug that only shows up in
        production."""
        a = _signup(client)
        r = client.patch(
            "/api/v1/studio",
            json={"handle": word},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_handles_are_unique_across_accounts(self, client: TestClient):
        h = _handle()
        first = _signup(client)
        client.patch(
            "/api/v1/studio",
            json={"handle": h},
            headers=_auth(first["tokens"]["access_token"]),
        )

        second = _signup(client)
        r = client.patch(
            "/api/v1/studio",
            json={"handle": h},
            headers=_auth(second["tokens"]["access_token"]),
        )
        assert r.status_code == 409

    def test_uniqueness_ignores_case(self, client: TestClient):
        h = _handle()
        first = _signup(client)
        client.patch(
            "/api/v1/studio",
            json={"handle": h},
            headers=_auth(first["tokens"]["access_token"]),
        )
        second = _signup(client)
        r = client.patch(
            "/api/v1/studio",
            json={"handle": h.upper()},
            headers=_auth(second["tokens"]["access_token"]),
        )
        assert r.status_code == 409

    def test_resaving_your_own_handle_is_not_a_conflict(
        self, client: TestClient
    ):
        """Otherwise saving the form twice fails the second time."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        h = _handle()
        client.patch("/api/v1/studio", json={"handle": h}, headers=_auth(tok))
        r = client.patch(
            "/api/v1/studio",
            json={"handle": h, "tagline": "Second save"},
            headers=_auth(tok),
        )
        assert r.status_code == 200
        assert r.json()["tagline"] == "Second save"

    def test_suggestion_is_free_to_take(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        suggested = client.get(
            "/api/v1/studio/handle-suggestion", headers=_auth(tok)
        ).json()["handle"]

        r = client.patch(
            "/api/v1/studio", json={"handle": suggested}, headers=_auth(tok)
        )
        assert r.status_code == 200, r.text


class TestPublishing:
    def test_published_profile_is_readable(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        h = _handle()
        client.patch(
            "/api/v1/studio",
            json={
                "handle": h,
                "tagline": "Headshots without the ordeal",
                "about": "Twelve years of photographing people who hate it.",
                "city": "Amsterdam",
                "profile_published": True,
            },
            headers=_auth(tok),
        )

        r = client.get(f"/api/v1/public/profile/{h}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["tagline"] == "Headshots without the ordeal"
        assert body["city"] == "Amsterdam"

    def test_unpublished_profile_is_404_not_403(self, client: TestClient):
        """A stranger guessing handles should not learn which accounts
        exist."""
        a = _signup(client)
        h = _handle()
        client.patch(
            "/api/v1/studio",
            json={"handle": h},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert client.get(f"/api/v1/public/profile/{h}").status_code == 404

    def test_publishing_without_a_handle_is_refused(self, client: TestClient):
        a = _signup(client)
        r = client.patch(
            "/api/v1/studio",
            json={"profile_published": True},
            headers=_auth(a["tokens"]["access_token"]),
        )
        assert r.status_code == 422

    def test_clearing_the_handle_takes_the_page_down(self, client: TestClient):
        """Otherwise the profile stays flagged published but unreachable."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        h = _handle()
        _publish(client, tok, h)
        assert client.get(f"/api/v1/public/profile/{h}").status_code == 200

        r = client.patch(
            "/api/v1/studio", json={"handle": None}, headers=_auth(tok)
        )
        assert r.json()["profile_published"] is False
        assert client.get(f"/api/v1/public/profile/{h}").status_code == 404

    def test_unpublishing_hides_it_again(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        h = _handle()
        _publish(client, tok, h)

        client.patch(
            "/api/v1/studio",
            json={"profile_published": False},
            headers=_auth(tok),
        )
        assert client.get(f"/api/v1/public/profile/{h}").status_code == 404

    def test_profile_url_is_null_until_it_resolves(self, client: TestClient):
        """The UI links this directly, so a non-null value that 404s would
        be worse than no link."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        h = _handle()

        saved = client.patch(
            "/api/v1/studio", json={"handle": h}, headers=_auth(tok)
        ).json()
        assert saved["profile_url"] is None

        published = _publish(client, tok, h)
        assert published["profile_url"].endswith(f"/p/{h}")

    def test_unknown_handle_is_404(self, client: TestClient):
        assert client.get("/api/v1/public/profile/nobody-here").status_code == 404


class TestVerificationGate:
    @pytest.mark.unverified
    def test_an_unverified_account_has_no_public_page(
        self, client: TestClient, db_session
    ):
        """Anyone can start a trial. An indexable page hosting uploaded
        images, available before an address is even confirmed, is a spam
        magnet."""
        from sqlalchemy import select

        from app.models import Account, User

        a = _signup(client)
        user = db_session.scalar(
            select(User).where(User.account_id == a["account"]["id"])
        )
        assert user.email_verified_at is None

        # The API is gated on verification, so publish directly on the row.
        account = db_session.get(Account, a["account"]["id"])
        h = _handle()
        account.handle = h
        account.profile_published = True
        db_session.commit()

        assert client.get(f"/api/v1/public/profile/{h}").status_code == 404


class TestPrivacy:
    def test_login_email_is_never_published(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        h = _handle()
        _publish(client, tok, h)

        body = client.get(f"/api/v1/public/profile/{h}").text
        assert a["user"]["email"] not in body

    def test_profiles_are_account_scoped(self, client: TestClient):
        a1 = _signup(client)
        a2 = _signup(client)
        client.patch(
            "/api/v1/studio",
            json={"tagline": "Mine"},
            headers=_auth(a1["tokens"]["access_token"]),
        )
        other = client.get(
            "/api/v1/studio", headers=_auth(a2["tokens"]["access_token"])
        ).json()
        assert other["tagline"] is None


class TestPortfolio:
    # A 1x1 PNG. Small enough to inline, real enough that content-type
    # checks behave the way they will in production.
    PNG = bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000a49444154789c6360000002000100ffff0300000600"
        "0557bfabd40000000049454e44ae426082"
    )

    def _upload(self, client: TestClient, tok: str, mime: str = "image/png"):
        return client.post(
            "/api/v1/studio/portfolio",
            files={"file": ("shot.png", self.PNG, mime)},
            headers=_auth(tok),
        )

    def test_image_uploads_and_appears_on_the_profile(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        r = self._upload(client, tok)
        assert r.status_code == 200, r.text
        assert len(r.json()["portfolio"]) == 1

        h = _handle()
        _publish(client, tok, h)
        public = client.get(f"/api/v1/public/profile/{h}").json()
        assert len(public["portfolio"]) == 1
        assert public["portfolio"][0]["url"].startswith("http")

    def test_the_cap_holds(self, client: TestClient):
        """An unbounded public image host is a bandwidth bill and a
        moderation problem."""
        from app.services.profile_service import MAX_PORTFOLIO_IMAGES

        a = _signup(client)
        tok = a["tokens"]["access_token"]
        for _ in range(MAX_PORTFOLIO_IMAGES):
            assert self._upload(client, tok).status_code == 200
        assert self._upload(client, tok).status_code == 409

    def test_non_images_are_rejected(self, client: TestClient):
        a = _signup(client)
        r = client.post(
            "/api/v1/studio/portfolio",
            files={"file": ("payload.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
            headers=_auth(a["tokens"]["access_token"]),
        )
        # SVG is an executable document, not a photograph. It belongs
        # nowhere near a page strangers open from an email.
        assert r.status_code == 400

    def test_removing_an_image(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        image_id = self._upload(client, tok).json()["portfolio"][0]["id"]

        r = client.delete(
            f"/api/v1/studio/portfolio/{image_id}", headers=_auth(tok)
        )
        assert r.status_code == 200
        assert r.json()["portfolio"] == []

    def test_captions_round_trip(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        image_id = self._upload(client, tok).json()["portfolio"][0]["id"]

        r = client.patch(
            f"/api/v1/studio/portfolio/{image_id}",
            json={"caption": "Board portrait, natural light"},
            headers=_auth(tok),
        )
        assert r.json()["portfolio"][0]["caption"] == (
            "Board portrait, natural light"
        )

    def test_reorder_keeps_images_a_stale_client_omits(
        self, client: TestClient
    ):
        """A partial list must not silently delete work."""
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        first = self._upload(client, tok).json()["portfolio"][0]["id"]
        second = self._upload(client, tok).json()["portfolio"][1]["id"]

        r = client.patch(
            "/api/v1/studio/portfolio/order",
            json={"image_ids": [second]},
            headers=_auth(tok),
        )
        ids = [i["id"] for i in r.json()["portfolio"]]
        assert ids == [second, first]

    def test_portrait_upload_and_removal(self, client: TestClient):
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        r = client.post(
            "/api/v1/studio/portrait",
            files={"file": ("me.png", self.PNG, "image/png")},
            headers=_auth(tok),
        )
        assert r.status_code == 200, r.text
        assert r.json()["portrait_url"]

        r = client.delete("/api/v1/studio/portrait", headers=_auth(tok))
        assert r.json()["portrait_url"] is None


class TestEmailsLinkThePublishedProfile:
    """The confirmation signs off with the photographer's name. When they
    have a live page, that name should go somewhere."""

    def test_the_link_is_absent_until_the_profile_is_published(
        self, client: TestClient, monkeypatch
    ):
        sent: list[dict] = []
        monkeypatch.setattr(
            "app.services.email_service.send_signup_confirmation_email",
            lambda **kw: sent.append(kw),
        )
        a = _signup(client)
        tok = a["tokens"]["access_token"]
        job = client.post(
            "/api/v1/jobs",
            json={
                "name": "Acme",
                "shoot_date": (date.today() + timedelta(days=7)).isoformat(),
                "location": "Acme HQ",
            },
            headers=_auth(tok),
        ).json()
        client.patch(
            f"/api/v1/jobs/{job['id']}",
            json={"status": "open_for_signup"},
            headers=_auth(tok),
        )

        def sign_up() -> None:
            client.post(
                f"/api/v1/public/jobs/{job['public_slug']}/signup",
                json={
                    "name": "Jane Doe",
                    "email": f"j{uuid.uuid4().hex[:6]}@example.com",
                    "consent": True,
                },
            )

        sign_up()
        assert sent, "no confirmation was sent"
        assert sent[-1]["profile_url"] is None

        h = _handle()
        _publish(client, tok, h)
        sign_up()
        assert sent[-1]["profile_url"].endswith(f"/p/{h}")

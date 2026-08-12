"""
Studio profile: the photographer's own contact details and links, shown to
participants on signup pages and galleries.
"""
from pydantic import BaseModel, Field, field_validator

from app.schemas.types import StrictEmail

# A participant-facing list of links is a link farm waiting to happen if
# it's unbounded, and more than a handful stops being useful anyway.
MAX_LINKS = 5


class StudioLink(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    url: str = Field(min_length=1, max_length=500)

    @field_validator("url")
    @classmethod
    def _must_be_http(cls, v: str) -> str:
        """Reject anything that isn't a plain web link.

        These render as anchors on a public page, so `javascript:` and
        `data:` are an XSS vector, not a formatting quirk. A bare domain is
        accepted and upgraded, because that's how people type them.
        """
        v = v.strip()
        lowered = v.lower()
        if lowered.startswith(("javascript:", "data:", "vbscript:", "file:")):
            raise ValueError("Links must start with http:// or https://")
        if not lowered.startswith(("http://", "https://")):
            # "panther.studio" is what a photographer types; make it work.
            if "." not in v or " " in v:
                raise ValueError("That doesn't look like a web address.")
            return f"https://{v}"
        return v

    @field_validator("label")
    @classmethod
    def _tidy_label(cls, v: str) -> str:
        return v.strip()


# An "about" long enough to say who you are and short enough that someone
# waiting for their turn actually reads it.
MAX_ABOUT = 1200


class PortfolioImage(BaseModel):
    id: str
    url: str
    caption: str | None = None


class StudioProfileIn(BaseModel):
    """Sparse update. Only the keys sent are changed; null clears a field."""
    website_url: str | None = Field(default=None, max_length=500)
    contact_email: StrictEmail | None = None
    contact_phone: str | None = Field(default=None, max_length=40)
    links: list[StudioLink] | None = Field(default=None, max_length=MAX_LINKS)

    # Public profile.
    handle: str | None = Field(default=None, max_length=40)
    tagline: str | None = Field(default=None, max_length=120)
    about: str | None = Field(default=None, max_length=MAX_ABOUT)
    city: str | None = Field(default=None, max_length=80)
    country: str | None = Field(default=None, max_length=80)
    profile_published: bool | None = None

    @field_validator("website_url")
    @classmethod
    def _website_is_http(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        return StudioLink(label="x", url=v).url


class StudioProfileOut(BaseModel):
    name: str
    website_url: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    links: list[StudioLink] = []

    # Public profile. `profile_url` is null until it would actually resolve,
    # so the UI never offers a link that 404s.
    handle: str | None = None
    tagline: str | None = None
    about: str | None = None
    city: str | None = None
    country: str | None = None
    profile_published: bool = False
    portrait_url: str | None = None
    portfolio: list[PortfolioImage] = []
    profile_url: str | None = None

    model_config = {"from_attributes": True}


class PublicStudioOut(BaseModel):
    """What a participant sees on a signup page or gallery.

    Kept as its own model rather than reusing StudioProfileOut so that
    adding a private field to the photographer's view can't accidentally
    publish it to every participant.

    Deliberately narrower than the profile page: this is a sidebar on a page
    about something else. The bio and portfolio live behind `profile_url`
    for anyone curious enough to click.
    """
    name: str
    tagline: str | None = None
    city: str | None = None
    portrait_url: str | None = None
    profile_url: str | None = None
    website_url: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    links: list[StudioLink] = []


class PublicProfileOut(BaseModel):
    """The full profile page. Only ever built from `public_profile()`, which
    enforces published + verified."""
    handle: str
    name: str
    tagline: str | None = None
    about: str | None = None
    city: str | None = None
    country: str | None = None
    portrait_url: str | None = None
    portfolio: list[PortfolioImage] = []
    website_url: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    links: list[StudioLink] = []

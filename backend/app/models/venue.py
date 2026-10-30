"""Venue discovery models.

Demo venues are clearly labelled (`source="demo"`) and must never be presented
as verified real businesses. Prices are illustrative estimates in integer paise.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class VenueType(str, Enum):
    wedding_hall = "wedding_hall"
    banquet_hall = "banquet_hall"
    hotel = "hotel"
    outdoor_garden = "outdoor_garden"
    beach = "beach"
    community_hall = "community_hall"
    conference_hall = "conference_hall"
    other = "other"


class VenueSource(str, Enum):
    demo = "demo"            # illustrative sample data, NOT a real business
    user = "user"           # user-entered venue
    osm = "osm"             # real OpenStreetMap data (name/coords/address real)
    provider = "provider"   # verified data from another configured provider


class Venue(BaseModel):
    id: str
    name: str = Field(..., min_length=1, max_length=160)
    venue_type: VenueType = VenueType.other
    location: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=100)
    # Illustrative estimated price (integer paise). None => unknown.
    est_price_paise: Optional[int] = Field(default=None, ge=0)
    capacity: int = Field(default=0, ge=0)
    indoor: bool = True
    outdoor: bool = False
    amenities: list[str] = Field(default_factory=list)
    # Coordinates may be absent; never invented.
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    image_url: str = Field(default="", max_length=500)
    contact: str = Field(default="", max_length=200)
    source: VenueSource = VenueSource.demo
    notes: str = Field(default="", max_length=500)


class VenueCreate(BaseModel):
    """User-entered venue (manual workflow)."""

    name: str = Field(..., min_length=1, max_length=160)
    venue_type: VenueType = VenueType.other
    location: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=100)
    est_price_inr: Optional[float] = Field(default=None, ge=0)
    capacity: int = Field(default=0, ge=0)
    indoor: bool = True
    outdoor: bool = False
    amenities: list[str] = Field(default_factory=list)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    image_url: str = Field(default="", max_length=500)
    contact: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=500)


class VenueQuery(BaseModel):
    keyword: str = ""
    venue_type: Optional[VenueType] = None
    city: str = ""
    min_capacity: Optional[int] = Field(default=None, ge=0)
    max_capacity: Optional[int] = Field(default=None, ge=0)
    # Budget window. max_price_inr is the budget used for fit status.
    min_price_inr: Optional[float] = Field(default=None, ge=0)
    max_price_inr: Optional[float] = Field(default=None, ge=0)
    # How strictly to apply the budget (only when max_price_inr is set):
    #   fits_or_unknown: hide only venues outside budget (default)
    #   fits:            hide outside + price-unavailable venues
    #   within:          show only venues definitely within budget
    budget_match: Literal["fits_or_unknown", "fits", "within"] = "fits_or_unknown"
    indoor: Optional[bool] = None
    outdoor: Optional[bool] = None
    amenities: list[str] = Field(default_factory=list)
    # relevance | price | price_desc | capacity | fit
    sort: str = "relevance"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=12, ge=1, le=100)


# --------------------------------------------------------------------------
# Pricing: user quotes override estimates; estimates are never "verified".
# --------------------------------------------------------------------------
PriceScope = Literal["rental_only", "package"]


class VenueQuoteInput(BaseModel):
    """A price the user got from the venue. Rupees in, paise stored."""

    amount_inr: float = Field(..., gt=0, le=100_000_000)
    scope: PriceScope = "rental_only"
    # For packages: what the price covers (e.g. catering, decor, rooms).
    package_includes: list[str] = Field(default_factory=list)
    notes: str = Field(default="", max_length=500)
    # Snapshot so the quote stays readable even if the venue leaves results.
    venue_name: str = Field(default="", max_length=160)
    venue_type: Optional[VenueType] = None

    @field_validator("package_includes", mode="before")
    @classmethod
    def _clean(cls, v):
        if not v:
            return []
        out = [s.strip()[:60] for s in v if isinstance(s, str) and s.strip()]
        return list(dict.fromkeys(out))[:15]


class VenueQuote(BaseModel):
    venue_id: str
    amount_paise: int = Field(..., gt=0)
    scope: PriceScope = "rental_only"
    package_includes: list[str] = Field(default_factory=list)
    notes: str = ""
    venue_name: str = ""
    venue_type: Optional[VenueType] = None
    updated_at: datetime


class VenuePrice(BaseModel):
    """The price that applies to a venue, and how it compares to a budget.

    kind:
      quoted      — the user's own quote from the venue (overrides all else)
      listed      — a price on the venue record (demo sample or user-entered)
      estimated   — a DRAFT band by venue type ("Estimated — confirm with venue")
      unavailable — no valid quote or estimate ("Price unavailable")
    budget_status: within | possibly_within | outside | unknown
    """

    kind: Literal["quoted", "listed", "estimated", "unavailable"]
    label: str
    min_paise: Optional[int] = None
    max_paise: Optional[int] = None
    scope: Optional[PriceScope] = None
    scope_label: str = ""
    package_includes: list[str] = Field(default_factory=list)
    verified: bool = False          # true only for user quotes
    budget_paise: Optional[int] = None
    budget_status: Literal["within", "possibly_within", "outside", "unknown"] = "unknown"
    note: str = ""


class VenuePage(BaseModel):
    results: list[Venue]
    total: int
    page: int
    page_size: int
    total_pages: int
    source_mode: str          # "demo" | "provider"
    disclaimer: str
    # venue_id -> applicable price for results on this page.
    prices: dict[str, VenuePrice] = Field(default_factory=dict)


class SelectedVenue(BaseModel):
    """A venue chosen for an event, with budget comparison."""

    venue: Venue
    est_price_paise: Optional[int]
    venue_budget_paise: Optional[int]     # plan's venue allocation
    remaining_paise: Optional[int]
    overrun_paise: Optional[int]
    within_budget: Optional[bool]
    price: Optional[VenuePrice] = None

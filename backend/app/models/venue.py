"""Venue discovery models.

Demo venues are clearly labelled (`source="demo"`) and must never be presented
as verified real businesses. Prices are illustrative estimates in integer paise.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


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
    max_price_inr: Optional[float] = Field(default=None, ge=0)
    indoor: Optional[bool] = None
    outdoor: Optional[bool] = None
    amenities: list[str] = Field(default_factory=list)
    sort: str = "relevance"   # relevance | price | capacity
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=12, ge=1, le=100)


class VenuePage(BaseModel):
    results: list[Venue]
    total: int
    page: int
    page_size: int
    total_pages: int
    source_mode: str          # "demo" | "provider"
    disclaimer: str


class SelectedVenue(BaseModel):
    """A venue chosen for an event, with budget comparison."""

    venue: Venue
    est_price_paise: Optional[int]
    venue_budget_paise: Optional[int]     # plan's venue allocation
    remaining_paise: Optional[int]
    overrun_paise: Optional[int]
    within_budget: Optional[bool]

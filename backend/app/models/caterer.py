"""Caterer discovery, comparison, manual arrangements and booking models.

A *caterer record* is one catering option the user is considering or has
arranged. It can come from real provider discovery (OpenStreetMap) or be
entered manually for an arrangement made outside PlanWise.

Rules encoded here:
- Money is integer paise internally; API inputs are rupees and converted once.
- Booking status and payment status are separate. PlanWise never makes a
  booking: "confirmed" means the user told us it is confirmed.
- Prices are labelled by where they came from (published / estimated /
  quoted / quote needed). Discovery never supplies a price.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class FoodType(str, Enum):
    veg = "veg"
    nonveg = "nonveg"
    both = "both"


class MenuType(str, Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snacks = "snacks"
    custom = "custom"


class BookingStatus(str, Enum):
    not_booked = "not_booked"
    requested = "requested"
    confirmed = "confirmed"      # confirmed by the user (externally)
    cancelled = "cancelled"


class PaymentStatus(str, Enum):
    unpaid = "unpaid"
    partially_paid = "partially_paid"
    paid = "paid"
    refunded = "refunded"


class PriceSource(str, Enum):
    published = "published"
    estimated = "estimated"
    quoted = "quoted"
    quote_needed = "quote_needed"


class CatererSource(str, Enum):
    manual = "manual"   # entered by the user
    osm = "osm"         # discovered via OpenStreetMap


class MenuCourses(BaseModel):
    """Free-text menu by course. Optional — packages are often informal."""

    starters: str = Field(default="", max_length=500)
    mains: str = Field(default="", max_length=500)
    desserts: str = Field(default="", max_length=500)
    beverages: str = Field(default="", max_length=500)


def _clean_list(v, limit: int = 20, length: int = 80) -> list[str]:
    if v is None:
        return []
    out: list[str] = []
    for s in v:
        if isinstance(s, str) and s.strip():
            out.append(s.strip()[:length])
    # de-duplicate, keep order
    return list(dict.fromkeys(out))[:limit]


class CatererInput(BaseModel):
    """Create/update payload. Amounts in rupees (converted to paise once)."""

    name: str = Field(..., max_length=160)
    source: CatererSource = CatererSource.manual
    provider_id: Optional[str] = Field(default=None, max_length=80)
    kind: str = Field(default="", max_length=40)  # "caterer" | "restaurant"
    phone: str = Field(default="", max_length=60)
    email: str = Field(default="", max_length=120)
    website: str = Field(default="", max_length=300)
    address: str = Field(default="", max_length=300)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    distance_km: Optional[float] = Field(default=None, ge=0)

    menu_types: list[MenuType] = Field(default_factory=list)
    food_type: FoodType = FoodType.veg
    cuisines: list[str] = Field(default_factory=list)
    menu: MenuCourses = Field(default_factory=MenuCourses)
    inclusions: list[str] = Field(default_factory=list)

    # None => follow the event's catering headcount (recalculates live).
    guest_count: Optional[int] = Field(default=None, ge=1, le=100000)
    price_per_guest_inr: float = Field(default=0, ge=0, le=1_000_000)
    extras_inr: float = Field(default=0, ge=0, le=100_000_000)
    # Negotiated fixed-price package. Requires a reason.
    fixed_total_inr: Optional[float] = Field(default=None, ge=0, le=100_000_000)
    fixed_total_reason: str = Field(default="", max_length=300)
    advance_paid_inr: float = Field(default=0, ge=0, le=100_000_000)
    price_source: PriceSource = PriceSource.quote_needed

    min_guests: Optional[int] = Field(default=None, ge=1, le=100000)
    max_guests: Optional[int] = Field(default=None, ge=1, le=100000)

    booking_status: BookingStatus = BookingStatus.not_booked
    refunded: bool = False
    notes: str = Field(default="", max_length=1000)

    @field_validator("name")
    @classmethod
    def _name_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Caterer name or a short description is required")
        return v

    @field_validator("cuisines", "inclusions", mode="before")
    @classmethod
    def _lists(cls, v):
        return _clean_list(v)

    @field_validator("fixed_total_reason", "phone", "email", "website",
                     "address", "notes", "kind")
    @classmethod
    def _strip(cls, v: str) -> str:
        return (v or "").strip()


class CatererPatch(BaseModel):
    """Partial update: only fields that are sent are changed."""

    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    menu_types: Optional[list[MenuType]] = None
    food_type: Optional[FoodType] = None
    cuisines: Optional[list[str]] = None
    menu: Optional[MenuCourses] = None
    inclusions: Optional[list[str]] = None
    guest_count: Optional[int] = None
    price_per_guest_inr: Optional[float] = None
    extras_inr: Optional[float] = None
    fixed_total_inr: Optional[float] = None
    fixed_total_reason: Optional[str] = None
    advance_paid_inr: Optional[float] = None
    price_source: Optional[PriceSource] = None
    min_guests: Optional[int] = None
    max_guests: Optional[int] = None
    booking_status: Optional[BookingStatus] = None
    refunded: Optional[bool] = None
    notes: Optional[str] = None


class CatererRecord(BaseModel):
    """Stored form (integer paise)."""

    id: str
    name: str
    source: CatererSource = CatererSource.manual
    provider_id: Optional[str] = None
    kind: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    address: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    distance_km: Optional[float] = None

    menu_types: list[MenuType] = Field(default_factory=list)
    food_type: FoodType = FoodType.veg
    cuisines: list[str] = Field(default_factory=list)
    menu: MenuCourses = Field(default_factory=MenuCourses)
    inclusions: list[str] = Field(default_factory=list)

    guest_count: Optional[int] = None
    price_per_guest_paise: int = 0
    extras_paise: int = 0
    fixed_total_paise: Optional[int] = None
    fixed_total_reason: str = ""
    advance_paid_paise: int = 0
    price_source: PriceSource = PriceSource.quote_needed

    min_guests: Optional[int] = None
    max_guests: Optional[int] = None

    booking_status: BookingStatus = BookingStatus.not_booked
    refunded: bool = False
    notes: str = ""

    selected: bool = False
    # Budget integration bookkeeping (what was last written to the plan).
    applied_total_paise: Optional[int] = None
    applied_plan_version: Optional[int] = None

    created_at: datetime
    updated_at: datetime


class CatererSearchResult(BaseModel):
    """A real provider found via discovery. Never contains invented data."""

    provider_id: str
    name: str
    kind: str                     # "caterer" | "restaurant"
    address: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    distance_km: Optional[float] = None
    phone: str = ""
    email: str = ""
    website: str = ""
    cuisines: list[str] = Field(default_factory=list)
    # "pure_veg" | "veg_options" | "non_veg" | "unknown" — from OSM diet tags.
    diet: str = "unknown"
    opening_hours: str = ""
    source: str = "osm"
    osm_url: str = ""

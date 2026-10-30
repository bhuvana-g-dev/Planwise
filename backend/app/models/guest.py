"""Guest management models."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RsvpStatus(str, Enum):
    invited = "invited"
    confirmed = "confirmed"
    declined = "declined"
    tentative = "tentative"


class GuestCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    group: str = Field(default="", max_length=80)  # family, friends, colleagues…
    rsvp: RsvpStatus = RsvpStatus.invited
    plus_ones: int = Field(default=0, ge=0, le=50)
    dietary: list[str] = Field(default_factory=list)
    accessibility: list[str] = Field(default_factory=list)
    contact: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=500)


class Guest(GuestCreate):
    id: str


class GuestImportItem(BaseModel):
    """One contact chosen by the user for import (name + raw phone)."""

    name: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=200)


class GuestImportRequest(BaseModel):
    """Contacts the user explicitly selected in the import preview."""

    contacts: list[GuestImportItem] = Field(..., min_length=1, max_length=2000)
    group: str = Field(default="", max_length=80)
    source: str = Field(default="file", max_length=20)  # picker | csv | xlsx | vcf


class GuestSummary(BaseModel):
    """Deterministically computed guest/RSVP rollup."""

    total_guests: int            # rows in the list
    total_headcount: int         # confirmed + tentative heads incl. plus-ones
    confirmed_headcount: int     # confirmed heads incl. plus-ones
    by_status: dict[str, int]    # headcount per RSVP status
    by_group: dict[str, int]     # headcount per group
    dietary_counts: dict[str, int]
    accessibility_counts: dict[str, int]

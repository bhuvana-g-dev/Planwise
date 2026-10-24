"""Event domain models."""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class EventType(str, Enum):
    birthday = "birthday"
    wedding = "wedding"
    community = "community"


class Preference(BaseModel):
    """A ranked, negotiable preference. Lower `rank` = more important."""

    label: str = Field(..., min_length=1, max_length=120)
    rank: int = Field(..., ge=1, description="1 = highest priority")


class EventCreate(BaseModel):
    """Payload for creating an event."""

    name: str = Field(..., min_length=1, max_length=120)
    event_type: EventType
    event_date: date
    location: str = Field(..., min_length=1, max_length=160)
    guest_count: int = Field(..., ge=1, le=100000)
    # Budget supplied in whole rupees by the client; converted to paise server side.
    budget_inr: float = Field(..., gt=0)
    theme: str = Field(default="", max_length=160)
    style: str = Field(default="", max_length=160)
    dietary_requirements: list[str] = Field(default_factory=list)
    accessibility_requirements: list[str] = Field(default_factory=list)
    preferences: list[Preference] = Field(default_factory=list)
    # Hard constraints that must never be violated (free-text statements).
    hard_constraints: list[str] = Field(default_factory=list)
    # Flexible choices that may be changed during replanning.
    flexible_choices: list[str] = Field(default_factory=list)

    @field_validator("event_date")
    @classmethod
    def _date_not_in_past(cls, v: date) -> date:
        # Allow today or future; reject clearly invalid past planning dates.
        if v < date.today():
            raise ValueError("event_date must not be in the past")
        return v

    @field_validator("dietary_requirements", "accessibility_requirements",
                      "hard_constraints", "flexible_choices", mode="before")
    @classmethod
    def _strip_empty(cls, v):
        if v is None:
            return []
        return [s.strip() for s in v if isinstance(s, str) and s.strip()]


class Event(EventCreate):
    """Stored event. Budget is kept as integer paise internally."""

    id: str
    owner_id: Optional[str] = None
    budget_paise: int
    created_at: datetime
    updated_at: datetime

    # EventCreate.budget_inr is derived from budget_paise for responses; keep both.

    @classmethod
    def from_create(cls, event_id: str, data: EventCreate, owner_id: Optional[str],
                    budget_paise: int, now: datetime) -> "Event":
        return cls(
            id=event_id,
            owner_id=owner_id,
            budget_paise=budget_paise,
            created_at=now,
            updated_at=now,
            **data.model_dump(),
        )

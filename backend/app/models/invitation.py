"""Invitation design models (one saved design per event)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

InvitationTone = Literal["warm", "formal", "fun", "traditional"]


class InvitationDesign(BaseModel):
    """What the user sees on the card. Plain text only; rendering is client-side.

    Date, time and venue are free text so the user can phrase them their own way
    ("Sunday, 25 Dec · 7 PM onwards"), but the editor pre-fills them from the
    event record, never from the AI.
    """

    template_id: str = Field(default="", max_length=60)
    eyebrow: str = Field(default="", max_length=80)
    headline: str = Field(default="", max_length=90)
    hosts: str = Field(default="", max_length=120)
    message: str = Field(default="", max_length=400)
    date_text: str = Field(default="", max_length=80)
    time_text: str = Field(default="", max_length=60)
    venue_text: str = Field(default="", max_length=160)
    dress_code: str = Field(default="", max_length=80)
    rsvp_text: str = Field(default="", max_length=120)

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


class InvitationWordingRequest(BaseModel):
    tone: InvitationTone = "warm"
    # Optional facts from the user, e.g. "turning 30", "no gifts please".
    details: str = Field(default="", max_length=300)


class InvitationWording(BaseModel):
    headline: str
    message: str
    tone: InvitationTone
    generated_by: Literal["gemini", "deterministic"]

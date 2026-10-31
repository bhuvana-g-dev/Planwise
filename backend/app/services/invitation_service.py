"""Invitation designs and AI-assisted wording.

Gemini only writes the headline and the invitation message. It never supplies
the date, time, venue or RSVP details: those come from the event record and
the user's own edits, so the AI can't put a wrong date on a card. When Gemini
is unavailable or returns something unusable, curated wording per event type
and tone is used instead (generated_by="deterministic").

Suggestions are returned, never saved: the user reviews and saves explicitly.
"""
from __future__ import annotations

import re
from typing import Optional

from app.models.event import Event
from app.models.invitation import (
    InvitationDesign,
    InvitationTone,
    InvitationWording,
    InvitationWordingRequest,
)
from app.services import gemini_client
from app.services.gemini_client import GeminiError

HEADLINE_MAX = 90
MESSAGE_MAX = 400

# Curated fallback wording: event type -> tone -> (headline, message).
_FALLBACK: dict[str, dict[str, tuple[str, str]]] = {
    "wedding": {
        "warm": ("We're getting married",
                 "With joy in our hearts, we invite you to celebrate our "
                 "wedding with us. Your love and blessings would make our "
                 "day complete."),
        "formal": ("The honour of your presence",
                   "is requested at the marriage ceremony and the reception "
                   "that follows. We would be delighted to have you with us."),
        "fun": ("We said yes!",
                "Two hearts, one big party. Come eat, dance and celebrate "
                "with us as we tie the knot."),
        "traditional": ("Wedding invitation",
                        "With the blessings of the Almighty and our elders, we "
                        "cordially invite you and your family to grace the "
                        "auspicious wedding ceremony and bless the couple."),
    },
    "birthday": {
        "warm": ("Join us for a birthday celebration",
                 "Another year, another reason to celebrate. It would mean a "
                 "lot to have you there to share the cake and the smiles."),
        "formal": ("You are cordially invited",
                   "to a birthday celebration. Please join us for an evening "
                   "of good food and great company."),
        "fun": ("Let's party!",
                "Cake? Check. Music? Check. You? We hope so. Come celebrate "
                "and make it a birthday to remember."),
        "traditional": ("Birthday celebration",
                        "With the blessings of our family, we warmly invite "
                        "you to join us for the birthday celebration and "
                        "shower your blessings."),
    },
    "community": {
        "warm": ("You're invited",
                 "Come be part of something special. Meet neighbours, make "
                 "new friends and enjoy a day that brings us all together."),
        "formal": ("Invitation",
                   "We are pleased to invite you to this community gathering. "
                   "Your presence and participation will be greatly valued."),
        "fun": ("Everyone's welcome!",
                "Food, fun and friendly faces. Bring your family, bring your "
                "friends, and let's make it a day to remember."),
        "traditional": ("Cordial invitation",
                        "We humbly invite you and your family to join us for "
                        "this celebration of our community and its traditions."),
    },
}

# Things the AI must not put in the message (they live in dedicated fields).
_DATE_LIKE = re.compile(
    r"\b(\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)"
    r"|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}"
    r"|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}"
    r"|\d{1,2}(:\d{2})?\s?(am|pm))\b",
    re.IGNORECASE,
)


def _repo():
    # Late import so the conftest patch of event_service.get_repository applies.
    from app.services import event_service
    return event_service.get_repository()


def get_design(event_id: str, owner_id: Optional[str]) -> Optional[dict]:
    from app.services import event_service
    event_service.get_event(event_id, owner_id)  # existence + ownership
    raw = _repo().get_invitation(event_id)
    return InvitationDesign.model_validate(raw).model_dump() if raw else None


def save_design(event_id: str, design: InvitationDesign,
                owner_id: Optional[str]) -> dict:
    from app.services import event_service
    event_service.get_event(event_id, owner_id)
    data = design.model_dump()
    _repo().save_invitation(event_id, data)
    return data


def fallback_wording(event_type: str, tone: InvitationTone) -> tuple[str, str]:
    by_type = _FALLBACK.get(event_type, _FALLBACK["community"])
    return by_type.get(tone, by_type["warm"])


def _clean(text: object, limit: int) -> str:
    if not isinstance(text, str):
        return ""
    text = re.sub(r"\s+", " ", text).strip().strip('"').strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:-")
    return cut + "…"


def suggest_wording(event_id: str, req: InvitationWordingRequest,
                    owner_id: Optional[str]) -> dict:
    from app.services import event_service
    event = Event.model_validate(event_service.get_event(event_id, owner_id))
    etype = event.event_type.value

    try:
        data = gemini_client.generate_json(
            _prompt(event, req), system=_SYSTEM)
        if isinstance(data, dict):
            headline = _clean(data.get("headline"), HEADLINE_MAX)
            message = _clean(data.get("message"), MESSAGE_MAX)
            # Reject output that tries to state dates/times; those come from
            # the event record, not the model.
            if headline and message and not _DATE_LIKE.search(
                    f"{headline} {message}"):
                return InvitationWording(
                    headline=headline, message=message, tone=req.tone,
                    generated_by="gemini").model_dump()
    except GeminiError:
        pass

    headline, message = fallback_wording(etype, req.tone)
    return InvitationWording(headline=headline, message=message, tone=req.tone,
                             generated_by="deterministic").model_dump()


_SYSTEM = (
    "You write short, warm event invitation text. Return STRICT JSON only: "
    '{"headline": string, "message": string}. headline: at most 8 words. '
    "message: 1 to 3 sentences, at most 60 words. Do NOT include any date, "
    "day, time, venue, address, phone number or RSVP instructions; those are "
    "printed separately on the card. Do not invent names of people. Avoid "
    "emojis and hashtags. Match the requested tone and the event type."
)


def _prompt(event: Event, req: InvitationWordingRequest) -> str:
    return (
        f"Event type: {event.event_type.value}. "
        f"Event name: {event.name}. "
        f"Style: {event.style or 'not specified'}. "
        f"Theme: {event.theme or 'not specified'}. "
        f"Tone: {req.tone}. "
        f"Extra details from the host: {req.details or 'none'}."
    )
